import { z } from "zod";

export const APP_ENV_VALUES = ["local", "test", "demo", "preview", "production"] as const;

export const serverEnvSchema = z.object({
  APP_ENV: z.enum(APP_ENV_VALUES),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  APP_URL: z.url(),
  EMAIL_FROM: z.email(),
  EMAIL_PROVIDER_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.url().optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
  SENTRY_ORG: z.string().min(1).optional(),
  SENTRY_PROJECT: z.string().min(1).optional(),
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  SENTRY_RELEASE: z.string().min(1).optional(),
});

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

// Field descriptions only, never the offending value: env validation errors
// can surface in CLI/CI output, so raw DATABASE_URL/secret values must never
// be interpolated here (SEC-08).
const fieldDescriptions: Record<string, string> = {
  APP_ENV: `expected ${APP_ENV_VALUES.join(" | ")}`,
  DATABASE_URL: "invalid URL",
  BETTER_AUTH_SECRET: "must not be empty",
  BETTER_AUTH_URL: "invalid URL",
  APP_URL: "invalid URL",
  EMAIL_FROM: "invalid email address",
  EMAIL_PROVIDER_API_KEY: "must not be empty",
  SENTRY_DSN: "invalid URL",
  SENTRY_AUTH_TOKEN: "must not be empty",
  SENTRY_ORG: "must not be empty",
  SENTRY_PROJECT: "must not be empty",
  SENTRY_ENVIRONMENT: "must not be empty",
  SENTRY_RELEASE: "must not be empty",
  NEXT_PUBLIC_SENTRY_DSN: "invalid URL",
};

export function formatEnvError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const field = String(issue.path[0] ?? "unknown");
    const description = fieldDescriptions[field] ?? "invalid value";
    return `- ${field}: ${description}`;
  });
  return ["Invalid environment configuration:", ...lines].join("\n");
}

type EnvSource = Record<string, string | undefined>;

export function parseServerEnv(source: EnvSource = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }
  return result.data;
}

export function parseClientEnv(source: EnvSource = process.env): ClientEnv {
  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SENTRY_DSN: source.NEXT_PUBLIC_SENTRY_DSN,
  });
  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }
  return result.data;
}

export const env = parseServerEnv();
export const clientEnv = parseClientEnv();
