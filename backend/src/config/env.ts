import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  PORT: z.coerce.number().default(3001),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  WEBAUTHN_RP_NAME: z.string().default("NovaBank"),
  WEBAUTHN_RP_ID: z.string().default("localhost"),
  WEBAUTHN_ORIGIN: z.string().default("http://localhost:5173"),
  CORS_ORIGINS: z.string().default(""),
  EMAIL_HOST: z.string().default("smtp.ethereal.email"),
  EMAIL_PORT: z.coerce.number().default(587),
  EMAIL_USER: z.string().default(""),
  EMAIL_PASS: z.string().default(""),
  EMAIL_FROM_NAME: z.string().default("NovaBank Security"),
  EMAIL_FROM_ADDRESS: z.string().default("security@novabank.local"),
  // Resend HTTP API key. When set, email is sent via the Resend HTTPS API
  // instead of SMTP (required on Render, which blocks outbound port 587/465).
  RESEND_API_KEY: z.string().default(""),
  HIBP_API_KEY: z.string().default(""),
  // TextBee SMS delivery for phone verification. Leave TEXTBEE_API_KEY empty in
  // dev to log OTPs to the console instead of sending real SMS.
  TEXTBEE_API_KEY: z.string().default(""),
  TEXTBEE_DEVICE_ID: z.string().default(""),
  TEXTBEE_BASE_URL: z.string().default("https://api.textbee.dev/api/v1"),
  ADMIN_EMAILS: z.string().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Proxy hop count for Express `trust proxy` (default: 1 in production). */
  TRUST_PROXY: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";

/** Clean and return the application origin URL (no quotes, trailing slashes, or missing protocol). */
export function getAppOrigin(): string {
  const raw = env.WEBAUTHN_ORIGIN || "http://localhost:5173";
  let cleaned = raw.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned;
}
