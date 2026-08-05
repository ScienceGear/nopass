import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../config/db.js";
import { getRedis } from "../config/redis.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { sendOtp, verifyOtp } from "../services/emailService.js";
import { verifyPassword } from "../utils/crypto.js";
import { transferSchema, activityQuerySchema, passwordSchema } from "../utils/validators.js";
import { logger } from "../utils/logger.js";

const TRANSFER_TOKEN_TTL = 15 * 60; // seconds
const STEP_UP_THRESHOLD = 50_000; // ₹

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------

export const summary: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");

  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { transactions: true } });
  if (!user) throw new AppError(404, "User not found.");

  const transactions = user.transactions
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  const completed = user.transactions.filter((t) => t.status === "completed");
  const spent = completed.reduce((acc, t) => acc + Number(t.amount), 0);

  res.json({
    balance: user.balance.toString(),
    currency: "INR",
    stats: {
      totalTransactions: completed.length,
      totalSpent: spent.toFixed(2),
      lastLogin: null,
    },
    recentTransactions: transactions.map((t) => ({
      id: t.id,
      recipient: t.recipient,
      amount: t.amount.toString(),
      note: t.note,
      status: t.status,
      createdAt: t.createdAt,
    })),
    riskLevel: "low",
  });
});

// ---------------------------------------------------------------------------
// TRANSACTIONS LIST
// ---------------------------------------------------------------------------

export const transactions: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const { limit, offset } = activityQuerySchema.parse(req.query);

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.transaction.count({ where: { userId: req.userId } }),
  ]);

  res.json({
    transactions: rows.map((t) => ({
      id: t.id,
      recipient: t.recipient,
      amount: t.amount.toString(),
      note: t.note,
      status: t.status,
      createdAt: t.createdAt,
    })),
    total,
    limit,
    offset,
  });
});

// ---------------------------------------------------------------------------
// TRANSFER (with amount-based step-up)
// ---------------------------------------------------------------------------

export const transferCreate: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const { recipient, amount, note } = transferSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new AppError(404, "User not found.");
  if (Number(user.balance) < amount) throw new AppError(400, "Insufficient balance.");

  const transferToken = `tf_${randomUUID()}`;
  const payload = JSON.stringify({ userId: req.userId, recipient, amount, note: note ?? null });
  await getRedis().set(`transfer:${transferToken}`, payload, "EX", TRANSFER_TOKEN_TTL);

  const needsStepUp = amount > STEP_UP_THRESHOLD;

  if (!needsStepUp) {
    const tx = await executeTransfer(req.userId, recipient, amount, note);
    await getRedis().del(`transfer:${transferToken}`);
    return res.json({ executed: true, transaction: tx });
  }

  const otp = await sendOtp(user.email, "transfer_approval");
  logger.info(`Transfer ${amount} needs step-up for ${user.email}`);

  return res.json({
    executed: false,
    stepUpRequired: true,
    method: "otp_email",
    transferToken,
    amount: amount.toString(),
    recipient,
    hasPassword: user.passwordHash != null,
    devOtp: process.env.NODE_ENV !== "production" ? otp : undefined,
  });
});

export const transferConfirm: RequestHandler = asyncHandler(async (req, res) => {
  const { transferToken, otp, password, method } = req.body as {
    transferToken?: string;
    otp?: string;
    password?: string;
    method?: "otp_email" | "password";
  };
  if (!transferToken) throw new AppError(400, "Transfer token required.");
  if (method !== "password" && !otp) throw new AppError(400, "Transfer token and OTP required.");
  if (method === "password") {
    passwordSchema.parse(password);
    if (!password) throw new AppError(400, "Password required.");
  }

  const raw = await getRedis().get(`transfer:${transferToken}`);
  if (!raw) throw new AppError(410, "Transfer request expired or already executed.");
  const data = JSON.parse(raw) as { userId: string; recipient: string; amount: number; note: string | null };

  const user = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!user) throw new AppError(404, "User not found.");

  let ok = false;
  if (method === "password") {
    if (user.passwordHash) ok = await verifyPassword(user.passwordHash, password ?? "");
  } else {
    ok = await verifyOtp(user.email, otp ?? "", "transfer_approval");
  }
  if (!ok) throw new AppError(401, "Invalid or expired confirmation.");

  const tx = await executeTransfer(data.userId, data.recipient, data.amount, data.note);
  await getRedis().del(`transfer:${transferToken}`);
  res.json({ executed: true, transaction: tx });
});

async function executeTransfer(userId: string, recipient: string, amount: number, note?: string | null) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || Number(user.balance) < amount) throw new AppError(400, "Insufficient balance.");

    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });

    const transaction = await tx.transaction.create({
      data: {
        userId,
        recipient,
        amount,
        note: note ?? null,
        status: "completed",
      },
    });

    await tx.loginHistory.create({
      data: {
        userId,
        eventType: "transfer",
        deviceInfo: "NovaBank Web",
        ipAddress: "local",
        riskScore: 0,
        riskAction: "allow",
        details: JSON.stringify({ recipient, amount }),
      },
    });

    return {
      id: transaction.id,
      recipient: transaction.recipient,
      amount: transaction.amount.toString(),
      note: transaction.note,
      status: transaction.status,
      createdAt: transaction.createdAt,
    };
  });
}
