import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { verifyPhoneOtp } from "../services/smsService.js";
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
