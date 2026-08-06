import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export interface TokenPayload {
  sub: string; // user id
  email: string;
}

/** Argon2id verify for opaque one-time secrets (recovery codes, OTPs). */
export async function verifyPassword(hash: string, value: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, value);
  } catch {
    return false;
  }
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

/** Generate N recovery codes. Returns plaintext codes + their argon2 hashes. */
export async function generateRecoveryCodes(count = 10): Promise<{ codes: string[]; hashes: string[] }> {
  const codes: string[] = [];
  const hashes: string[] = [];
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    const part = Array.from(bytes)
      .map((b) => alphabet[b % alphabet.length])
      .join("")
      .slice(0, 8);
    const code = `${part.slice(0, 4)}-${part.slice(4)}`;
    codes.push(code);
    hashes.push(await argon2.hash(code, { type: argon2.argon2id }));
  }
  return { codes, hashes };
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return argon2.hash(code, { type: argon2.argon2id });
}

export function randomToken(prefix: string, bytes = 16): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}
