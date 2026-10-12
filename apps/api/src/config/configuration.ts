import { z } from 'zod';

/**
 * Environment is validated once at boot. A missing or malformed variable should
 * stop the process, not surface as a confusing runtime failure in a request.
 */

const durationSchema = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, 'Use a duration like 15m, 30d or 900s');

const booleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PREFIX: z.string().default('api/v1'),
  CORS_ORIGINS: z.string().default('*'),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

  DATABASE_URL: z.string().url(),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  /** 0 disables in-process workers, for when the worker runs as its own service. */
  QUEUE_CONCURRENCY: z.coerce.number().int().min(0).max(32).default(2),

  /** Baseline requests per minute per client. */
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(300),
  THROTTLE_TTL_MS: z.coerce.number().int().min(1000).default(60_000),

  JWT_ACCESS_SECRET: z.string().min(32, 'Use at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'Use at least 32 characters'),
  JWT_ACCESS_TTL: durationSchema.default('15m'),
  JWT_REFRESH_TTL: durationSchema.default('30d'),

  S3_ENDPOINT: z.string().url(),
  /**
   * Host devices use to reach storage, baked into presigned URLs. Defaults to
   * S3_ENDPOINT; set it when the API reaches storage on a different address than
   * the phone does (e.g. http://10.0.2.2:9000 for the Android emulator).
   */
  S3_PUBLIC_ENDPOINT: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_EVIDENCE: z.string().min(1),
  S3_BUCKET_REPORTS: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanSchema.default(true),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: booleanSchema.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Ahlan HSE <no-reply@ahlan.local>'),

  PDF_CHROMIUM_PATH: z.string().optional(),
  PDF_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(600_000).default(60_000),

  /** `local` runs a deterministic offline generator - no key, no egress. */
  AI_PROVIDER: z.enum(['local', 'anthropic']).default('local'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5'),
  AI_PROMPT_VERSION: z.string().default('2026-10-01'),

  PUBLIC_APP_URL: z.string().url().default('http://localhost:8081'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }

  const env = parsed.data;
  if (env.AI_PROVIDER === 'anthropic' && !env.AI_API_KEY) {
    throw new Error('AI_PROVIDER=anthropic requires AI_API_KEY');
  }
  if (env.NODE_ENV === 'production') {
    if (env.JWT_ACCESS_SECRET.includes('dev-only') || env.JWT_REFRESH_SECRET.includes('dev-only')) {
      throw new Error('Refusing to start in production with the development JWT secrets');
    }
    if (env.CORS_ORIGINS === '*') {
      throw new Error('Refusing to start in production with CORS_ORIGINS=*');
    }
  }
  return env;
}

/** Structured view of the environment, injected as `ConfigService<AppConfig>`. */
export interface AppConfig {
  env: Env['NODE_ENV'];
  port: number;
  apiPrefix: string;
  corsOrigins: string[] | true;
  logLevel: Env['LOG_LEVEL'];
  publicAppUrl: string;
  database: { url: string };
  redis: { host: string; port: number; password?: string; concurrency: number };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  storage: {
    endpoint: string;
    /** Address phones use for presigned URLs; defaults to `endpoint`. */
    publicEndpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    evidenceBucket: string;
    reportsBucket: string;
    forcePathStyle: boolean;
    presignTtlSeconds: number;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  };
  pdf: { chromiumPath?: string; timeoutMs: number };
  throttle: { enabled: boolean; limit: number; ttl: number };
  ai: { provider: Env['AI_PROVIDER']; apiKey?: string; model: string; promptVersion: string };
}

export function buildConfig(raw: Record<string, unknown>): AppConfig {
  const env = validateEnv(raw);
  const origins = env.CORS_ORIGINS.trim();
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    corsOrigins:
      origins === '*' ? true : origins.split(',').map((value) => value.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL,
    publicAppUrl: env.PUBLIC_APP_URL,
    database: { url: env.DATABASE_URL },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      concurrency: env.QUEUE_CONCURRENCY,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    storage: {
      endpoint: env.S3_ENDPOINT,
      publicEndpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      evidenceBucket: env.S3_BUCKET_EVIDENCE,
      reportsBucket: env.S3_BUCKET_REPORTS,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      presignTtlSeconds: env.S3_PRESIGN_TTL_SECONDS,
    },
    mail: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER || undefined,
      password: env.SMTP_PASSWORD || undefined,
      from: env.MAIL_FROM,
    },
    pdf: { chromiumPath: env.PDF_CHROMIUM_PATH || undefined, timeoutMs: env.PDF_TIMEOUT_MS },
    throttle: {
      // Off in tests: the e2e suite signs in dozens of times a minute, which
      // would trip the deliberately tight login limit and fail on 429 instead
      // of on what it set out to assert.
      enabled: env.NODE_ENV !== 'test',
      limit: env.THROTTLE_LIMIT,
      ttl: env.THROTTLE_TTL_MS,
    },
    ai: {
      provider: env.AI_PROVIDER,
      apiKey: env.AI_API_KEY || undefined,
      model: env.AI_MODEL,
      promptVersion: env.AI_PROMPT_VERSION,
    },
  };
}

/** `configuration()` is what `ConfigModule.forRoot({ load: [...] })` consumes. */
export default function configuration(): AppConfig {
  return buildConfig(process.env);
}
