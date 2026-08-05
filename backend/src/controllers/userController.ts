import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
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
      balance: user.balance.toString(),
      createdAt: user.createdAt,
      hasPassword: user.passwordHash != null,
      passkeys: user.credentials,
    },
  });
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
});

export const updateProfile: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const { name } = updateProfileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { ...(name ? { name } : {}) },
  });
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});
