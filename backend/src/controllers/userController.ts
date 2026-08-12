import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { verifyPhoneOtp } from "../services/smsService.js";
import { verifyOtp } from "../services/emailService.js";
import { z } from "zod";

export const getProfile: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: {
      credentials: { select: { id: true, nickname: true, createdAt: true } },
    },
  });
  if (!user) throw new AppError(404, "User not found.");
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      balance: user.balance.toString(),
      scheduledForDeletionAt: user.scheduledForDeletionAt,
      deletionRequestedAt: user.deletionRequestedAt,
      createdAt: user.createdAt,
      passkeys: user.credentials,
    },
  });
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  /** Required when the phone number is changing — proves ownership of the new number. */
  phoneOtp: z.string().length(6).optional(),
});

export const updateProfile: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const { name, phone, phoneOtp } = updateProfileSchema.parse(req.body);
  const current = await prisma.user.findUnique({ where: { id: req.userId }, select: { phone: true } });
  if (!current) throw new AppError(404, "User not found.");

  const data: {
    name?: string;
    phone?: string;
    phoneVerified?: boolean;
    phoneVerifiedAt?: Date;
  } = {};
  if (name) data.name = name;

  if (phone && phone !== current.phone) {
    if (!phoneOtp || !(await verifyPhoneOtp(phone, phoneOtp, "phone_change"))) {
      throw new AppError(400, "Verify the new number with the code we texted you before saving.", {
        code: "PHONE_OTP_REQUIRED",
      });
    }
    data.phone = phone;
    data.phoneVerified = true;
    data.phoneVerifiedAt = new Date();
  }

  const user = await prisma.user.update({ where: { id: req.userId }, data });
  res.json({ user: { id: user.id, email: user.email, name: user.name, phone: user.phone } });
});

const requestDeletionSchema = z.object({
  emailOtp: z.string().length(6),
  phoneOtp: z.string().length(6),
});

/** User self account deletion (requires Dual OTP verification, 24h grace period). */
export const requestDeletion: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const { emailOtp, phoneOtp } = requestDeletionSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new AppError(404, "User not found.");

  const emailOk = await verifyOtp(user.email, emailOtp, "account_deletion");
  if (!emailOk) throw new AppError(400, "Invalid or expired Email OTP code.");

  if (user.phone) {
    const phoneOk = await verifyPhoneOtp(user.phone, phoneOtp, "verify");
    if (!phoneOk) throw new AppError(400, "Invalid or expired Phone OTP code.");
  }

  const scheduledTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data: { scheduledForDeletionAt: scheduledTime, deletionRequestedAt: new Date() },
  });

  res.json({ ok: true, scheduledForDeletionAt: scheduledTime });
});

export const cancelDeletion: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  await prisma.user.update({
    where: { id: req.userId },
    data: { scheduledForDeletionAt: null, deletionRequestedAt: null },
  });
  res.json({ ok: true });
});
