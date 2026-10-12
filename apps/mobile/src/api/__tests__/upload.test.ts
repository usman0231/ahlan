import { ApiError, uploadToPresignedUrl } from '../client';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  jest.useRealTimers();
});

const input = {
  uploadUrl: 'http://storage.test/put',
  headers: { 'Content-Type': 'image/jpeg' },
  body: new Uint8Array(3),
};

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected a rejection');
}

describe('uploadToPresignedUrl', () => {
  it('resolves on 2xx', async () => {
    globalThis.fetch = jest.fn(async () => new Response(null, { status: 200 })) as typeof fetch;
    await expect(uploadToPresignedUrl(input)).resolves.toBeUndefined();
  });

  it('reports a storage refusal as STORAGE_REJECTED with the S3 code, not as offline', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(
          '<?xml version="1.0"?><Error><Code>SignatureDoesNotMatch</Code><Message>bad sig</Message></Error>',
          { status: 403 },
        ),
    ) as typeof fetch;

    const error = await failure(uploadToPresignedUrl(input));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('STORAGE_REJECTED');
    expect(error.status).toBe(403);
    expect(error.isOffline).toBe(false);
    expect(error.details).toEqual({
      storageCode: 'SignatureDoesNotMatch',
      storageMessage: 'bad sig',
    });
  });

  it('wraps a fetch TypeError as an ApiError NETWORK', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch;

    const error = await failure(uploadToPresignedUrl(input));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NETWORK');
    expect(error.isOffline).toBe(true);
  });

  it('times out a hung PUT instead of waiting forever', async () => {
    globalThis.fetch = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abort = new Error('aborted');
            abort.name = 'AbortError';
            reject(abort);
          });
        }),
    ) as typeof fetch;

    const error = await failure(uploadToPresignedUrl({ ...input, timeoutMs: 20 }));

    expect(error.code).toBe('NETWORK');
    expect(error.message).toMatch(/timed out/);
  });
});
