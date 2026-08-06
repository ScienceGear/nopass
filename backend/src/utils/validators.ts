import { z } from "zod";

export const registerInitiateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Use an international phone number, for example +919876543210."),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20),
});

export const registerStatusSchema = z.object({
  email: z.string().email(),
});

export const registerOptionsSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
});

export const registerVerifySchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  credential: z.object({
    id: z.string().min(10),
    rawId: z.string().min(1),
    response: z.record(z.any()),
    type: z.literal("public-key"),
    clientExtensionResults: z.record(z.any()).optional(),
    authenticatorAttachment: z.string().optional(),
  }),
  deviceFingerprint: z.string().min(8).max(256),
  deviceInfo: z.string().min(1).max(512),
});

export const loginOptionsSchema = z.object({
  email: z.string().email(),
});

export const keystrokeSampleSchema = z
  .array(z.object({ prev: z.number(), curr: z.number(), delta: z.number() }))
  .max(600)
  .optional();

export const emailLoginRequestSchema = z.object({
  email: z.string().email(),
  deviceFingerprint: z.string().min(8).max(256),
  deviceInfo: z.string().min(1).max(512),
  keystrokes: keystrokeSampleSchema,
});

export const emailLoginVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  deviceFingerprint: z.string().min(8).max(256),
  deviceInfo: z.string().min(1).max(512),
  keystrokes: keystrokeSampleSchema,
});

export const recoveryLoginSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(16),
  deviceFingerprint: z.string().min(8).max(256),
  deviceInfo: z.string().min(1).max(512),
  keystrokes: keystrokeSampleSchema,
});

/** Password fallback policy — minimum 10 chars, with letters + digits. */
export const onboardingImageSequenceSchema = z.object({
  sequence: z
    .array(z.object({ imageKey: z.string().min(1), regionId: z.string().min(1) }))
    .min(2)
    .max(4),
});

export const loginVerifySchema = z.object({
  email: z.string().email(),
  credential: z.object({
    id: z.string().min(10),
    rawId: z.string().min(1),
    response: z.record(z.any()),
    type: z.literal("public-key"),
    clientExtensionResults: z.record(z.any()).optional(),
  }),
  keystrokes: keystrokeSampleSchema,
  deviceFingerprint: z.string().min(8).max(256),
  deviceInfo: z.string().min(1).max(512),
  pasted: z.boolean().optional(),
});

export const qrCreateSchema = z.object({
  deviceFingerprint: z.string().min(8).max(256),
  deviceInfo: z.string().min(1).max(512),
});

export const qrApproveSchema = z.object({
  token: z.string().min(8),
  decision: z.enum(["approve", "deny"]),
  credential: loginVerifySchema.shape.credential.optional(),
});

export const stepUpVerifySchema = z.object({
  method: z.enum(["otp_email", "passkey", "recovery_code", "image_challenge"]),
  email: z.string().email(),
  otp: z.string().length(6).optional(),
  code: z.string().min(4).optional(),
  credential: z.any().optional(),
  challengeToken: z.string().min(8).optional(),
  clicks: z
    .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
    .max(6)
    .optional(),
  deviceFingerprint: z.string().min(8).max(256),
  deviceInfo: z.string().min(1).max(512),
  keystrokes: keystrokeSampleSchema,
});

export const imageChallengeSetupSchema = z.object({
  email: z.string().email().optional(),
});

export const transferSchema = z.object({
  recipient: z.string().min(3).max(120),
  amount: z.coerce.number().positive().max(10_000_000),
  note: z.string().max(200).optional(),
  deviceFingerprint: z.string().min(8).max(256),
  deviceInfo: z.string().min(1).max(512),
  keystrokes: keystrokeSampleSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
