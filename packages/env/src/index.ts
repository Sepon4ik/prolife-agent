import { z } from "zod";

// ── Global env shared across all apps ──
const globalEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type GlobalEnv = z.infer<typeof globalEnvSchema>;

export function validateGlobalEnv(): GlobalEnv {
  return globalEnvSchema.parse(process.env);
}

// ── ProLife-specific env ──
const prolifeEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SES_ACCESS_KEY_ID: z.string().optional(),
  SES_SECRET_ACCESS_KEY: z.string().optional(),
  SES_REGION: z.string().default("eu-west-1"),
  STRIPE_PUBLIC_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  PROXY_URLS: z.string().optional(),
});

export type ProlifeEnv = z.infer<typeof prolifeEnvSchema>;

export function validateProlifeEnv(): GlobalEnv & ProlifeEnv {
  return {
    ...validateGlobalEnv(),
    ...prolifeEnvSchema.parse(process.env),
  };
}

export { z };
