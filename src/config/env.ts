import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),

  // Baserow (replaces Airtable)
  BASEROW_API_TOKEN: z.string().min(1, "Baserow API Token is required"),

  // Auth
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").default("dev_secret_change_before_launch_xxxxxxxxxxxxx"),

  // SMS — "dev" logs OTP to console, no real SMS sent
  SMS_PROVIDER: z.enum(["dev", "fast2sms", "twilio"]).default("dev"),
  FAST2SMS_API_KEY:    z.string().optional(),
  TWILIO_ACCOUNT_SID:  z.string().optional(),
  TWILIO_AUTH_TOKEN:   z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Email (SMTP) — stub until credentials are provided
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default("587"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Cron
  CRON_ENABLED: z.enum(["true", "false"]).default("false"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:");
  console.error(_env.error.format());
  process.exit(1);
}

export const env = _env.data;
