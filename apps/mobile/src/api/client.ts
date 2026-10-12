import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@ahlan/shared';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000').replace(/\/$/, '');
const PREFIX = process.env.EXPO_PUBLIC_API_PREFIX ?? '/api/v1';
const DEBUG = process.env.EXPO_PUBLIC_DEBUG === '1';

/** Long enough for a slow stadium connection, short enough to fail usefully. */
const TIMEOUT_MS = 20_000;

export interface FieldError {
  path: string;
  message: string;
  code: string;
}

/**
 * Every failure the app has to react to. `code` is the API's stable error code,
 * which maps straight onto `errors.<CODE>` in the translation files - the app
 * never shows a server sentence to a user.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK' | 'STORAGE_REJECTED' | 'UNKNOWN',
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request never reached the server, so the work is not lost. */
  get isOffline(): boolean {
    return this.code === 'NETWORK';
  }

  get isAuthError(): boolean {
    return (
      this.code === ERROR_CODES.UNAUTHENTICATED ||
      this.code === ERROR_CODES.TOKEN_EXPIRED ||
      this.code === ERROR_CODES.TOKEN_REVOKED
    );
  }

  /** Per-field messages, for rendering under the inputs that failed. */
  get fieldErrors(): FieldError[] {
    return Array.isArray(this.details) ? (this.details as FieldError[]) : [];
  }

  /** i18n key the UI should show. */
  get translationKey(): string {
    return `errors.${this.code}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Auth wiring                                                                */
/* -------------------------------------------------------------------------- */

interface AuthHandlers {
  getAccessToken: () => string | null;
  refresh: () => Promise<boolean>;
  onUnauthenticated: () => void;
}

let handlers: AuthHandlers = {
  getAccessToken: () => null,
  refresh: async () => false,
  onUnauthenticated: () => undefined,
};

/**
 * The auth store registers itself here at startup.
 *
 * Done this way round rather than importing the store, so the client stays a
 * leaf module: the store imports the client, never the reverse.
 */
export function registerAuthHandlers(next: AuthHandlers): void {
  handlers = next;
}

/* -------------------------------------------------------------------------- */
/* Request                                                                    */
/* -------------------------------------------------------------------------- */

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Skips the Authorization header, for login and registration. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${BASE_URL}${PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

/** Shared by `request` and the refresh call, which must not recurse. */
async function send(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // An external signal (React Query cancelling a query) must also abort.
  options.signal?.addEventListener('abort', () => controller.abort());

  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // A proxy or a crash can return HTML; the status is all we have.
  }

  return new ApiError(
    body?.code ?? 'UNKNOWN',
    body?.message ?? `Request failed with status ${response.status}`,
    response.status,
    body?.details,
  );
}

/**
 * One request, with a single transparent token refresh.
 *
 * On a 401 the refresh token is rotated once and the request replayed. If that
 * also fails the session is cleared and the app returns to sign-in - retrying
 * forever would just lock the user in a spinner.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const attempt = async (token: string | null): Promise<Response> => {
    try {
      return await send(path, options, token);
    } catch (error) {
      const aborted = (error as Error).name === 'AbortError';
      throw new ApiError(
        'NETWORK',
        aborted ? 'The request timed out' : 'Could not reach the server',
        0,
      );
    }
  };

  let response = await attempt(options.anonymous ? null : handlers.getAccessToken());

  if (response.status === 401 && !options.anonymous) {
    const refreshed = await handlers.refresh();
    if (refreshed) {
      response = await attempt(handlers.getAccessToken());
    }
    if (response.status === 401) {
      handlers.onUnauthenticated();
      throw await toApiError(response);
    }
  }

  if (!response.ok) {
    const error = await toApiError(response);
    if (DEBUG) {
      console.warn(`[api] ${options.method ?? 'GET'} ${path} -> ${error.status} ${error.code}`);
    }
    throw error;
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** A photo PUT gets longer than a JSON call, but never forever. */
export const UPLOAD_TIMEOUT_MS = 90_000;

/** What object storage said when it refused a PUT, parsed from its XML body. */
export interface StorageErrorDetails {
  storageCode: string | null;
  storageMessage: string | null;
}

/**
 * Uploads a photo straight to object storage with a presigned PUT. It does not
 * go through `request`: the URL is absolute, it carries no bearer token, and
 * the body is bytes rather than JSON.
 *
 * Failures are always an `ApiError`:
 *   - `NETWORK` (status 0): storage was never reached, or the PUT timed out
 *   - `STORAGE_REJECTED` (the HTTP status): storage answered and said no -
 *     an expired signature, a size mismatch, a full disk - with storage's own
 *     code and message in `details`
 */
export async function uploadToPresignedUrl(input: {
  uploadUrl: string;
  headers: Record<string, string>;
  body: Blob | ArrayBuffer | Uint8Array;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? UPLOAD_TIMEOUT_MS);
  input.signal?.addEventListener('abort', () => controller.abort());

  let response: Response;
  try {
    response = await fetch(input.uploadUrl, {
      method: 'PUT',
      headers: input.headers,
      body: input.body as BodyInit,
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = (error as Error).name === 'AbortError';
    throw new ApiError(
      'NETWORK',
      aborted ? 'The photo upload timed out' : 'Could not reach photo storage',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const details: StorageErrorDetails = {
      storageCode: xmlTag(body, 'Code'),
      storageMessage: xmlTag(body, 'Message'),
    };
    if (DEBUG) {
      console.warn(`[upload] PUT -> ${response.status} ${details.storageCode ?? ''}`);
    }
    throw new ApiError(
      'STORAGE_REJECTED',
      `Photo storage refused the upload (${response.status}${
        details.storageCode ? ` ${details.storageCode}` : ''
      })`,
      response.status,
      details,
    );
  }
}

function xmlTag(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return match?.[1] ?? null;
}

export const apiBaseUrl = `${BASE_URL}${PREFIX}`;
