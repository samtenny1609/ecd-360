"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "staging", "production", "test"]).default("development"),
    PORT: zod_1.z.string().default("3000"),
    // Baserow (replaces Airtable)
    BASEROW_API_TOKEN: zod_1.z.string().min(1, "Baserow API Token is required"),
    // Auth
    JWT_SECRET: zod_1.z.string().min(32, "JWT_SECRET must be at least 32 characters").default("dev_secret_change_before_launch_xxxxxxxxxxxxx"),
    // SMS — "dev" logs OTP to console, no real SMS sent
    SMS_PROVIDER: zod_1.z.enum(["dev", "fast2sms", "twilio"]).default("dev"),
    FAST2SMS_API_KEY: zod_1.z.string().optional(),
    TWILIO_ACCOUNT_SID: zod_1.z.string().optional(),
    TWILIO_AUTH_TOKEN: zod_1.z.string().optional(),
    TWILIO_PHONE_NUMBER: zod_1.z.string().optional(),
    // Email (SMTP) — stub until credentials are provided
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.string().default("587"),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASS: zod_1.z.string().optional(),
    SMTP_FROM: zod_1.z.string().optional(),
    // Cron
    CRON_ENABLED: zod_1.z.enum(["true", "false"]).default("false"),
});
const _env = envSchema.safeParse(process.env);
if (!_env.success) {
    console.error("❌ Invalid environment variables:");
    console.error(_env.error.format());
    process.exit(1);
}
exports.env = _env.data;
