import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { randomInt } from "node:crypto";
import { prisma } from "../config/db.js";
import { env, isProduction } from "../config/env.js";
import { hashRecoveryCode, verifyPassword } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";

let transporter: Transporter | null = null;

/** Real SMTP is only used when the operator configures credentials in .env. */
const SMTP_CONFIGURED = Boolean(env.EMAIL_USER && env.EMAIL_PASS);

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_PORT === 465,
      auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
    });
  }
  return transporter;
}

const FROM = `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`;

export function generateOtp(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += String(randomInt(0, 10));
  return code;
}

/* ── Themed templates (inline-styled, table layout for client compatibility) ── */

const BRAND = {
  bg: "#0b0d14",
  card: "#141824",
  ink: "#f4f5fa",
  muted: "#9aa1b5",
  lime: "#c5f25e",
  limeSoft: "rgba(197,242,94,0.10)",
  hairline: "rgba(244,245,250,0.08)",
};

const OTP_PURPOSE: Record<string, string> = {
  login_step_up: "Your NovaBank sign-in code",
  recovery: "Your NovaBank recovery code",
  login_email: "Your NovaBank sign-in link",
  transfer_approval: "Approve your NovaBank transfer",
};

function layout(preheader: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:${BRAND.bg};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;">
            <tr>
              <td style="padding-bottom:20px;text-align:center;">
                <span style="color:${BRAND.ink};font-family:Inter,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:0.02em;">Nova<span style="color:${BRAND.lime};">Bank</span></span>
              </td>
            </tr>
            <tr>
              <td style="background:${BRAND.card};border:1px solid ${BRAND.hairline};border-radius:20px;padding:36px 32px;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding-top:20px;text-align:center;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.7;">
                NovaBank · A demo passkey bank<br/>Not a licensed bank · no real accounts
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function codeBlock(code: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <span style="display:inline-block;background:${BRAND.limeSoft};border:1px dashed ${BRAND.lime};border-radius:14px;padding:16px 28px;color:${BRAND.ink};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;font-weight:700;letter-spacing:0.18em;">${code}</span>
        </td>
      </tr>
    </table>`;
}

function renderOtpEmail(args: { code: string; purpose: "login_step_up" | "recovery" | "login_email" | "transfer_approval"; expiresMinutes: number }): {
  subject: string;
  html: string;
  text: string;
} {
  const label = OTP_PURPOSE[args.purpose];
  const hint =
    args.purpose === "login_step_up"
      ? "to confirm it's really you on this device."
      : args.purpose === "transfer_approval"
        ? "to approve this transfer. If you didn't start a transfer, ignore this email."
        : args.purpose === "login_email"
          ? "to sign in without a passkey. If you didn't request a link, ignore this email."
          : "to reset your sign-in. If you didn't request recovery, ignore this email.";
  const content = `
    <p style="margin:0;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;">Security code</p>
    <h1 style="margin:10px 0 0;color:${BRAND.ink};font-family:Inter,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.35;">${label}</h1>
    <p style="margin:14px 0 0;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.7;">Use the code below ${hint}</p>
    ${codeBlock(args.code)}
    <p style="margin:0;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.7;">This code expires in <strong style="color:${BRAND.ink};">${args.expiresMinutes} minutes</strong>. Never share it with anyone — NovaBank will never ask for it.</p>`;
  return {
    subject: label,
    html: layout(`${label} — ${args.code}`, content),
    text: `${label}\n\nUse code ${args.code} ${hint.replace(/\.$/, ".")}\nIt expires in ${args.expiresMinutes} minutes. Never share it.`,
  };
}

function renderAlertEmail(args: { title: string; body: string }): { subject: string; html: string; text: string } {
  const content = `
    <p style="margin:0;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;">Security alert</p>
    <h1 style="margin:10px 0 0;color:${BRAND.ink};font-family:Inter,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.35;">${args.title}</h1>
    <p style="margin:14px 0 0;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.7;white-space:pre-line;">${args.body}</p>`;
  return {
    subject: args.title,
    html: layout(args.title, content),
    text: `${args.title}\n\n${args.body}`,
  };
}

function renderVerifyEmail(args: { name: string; link: string }): { subject: string; html: string; text: string } {
  const content = `
    <p style="margin:0;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;">Verify your email</p>
    <h1 style="margin:10px 0 0;color:${BRAND.ink};font-family:Inter,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.35;">Welcome to NovaBank, ${args.name}</h1>
    <p style="margin:14px 0 0;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.7;">Tap the button below to confirm this email and create your passkey. The link expires in <strong style="color:${BRAND.ink};">15 minutes</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td align="center">
        <a href="${args.link}" style="display:inline-block;background:${BRAND.lime};color:#0b0d14;text-decoration:none;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:700;padding:14px 28px;border-radius:14px;">Verify my email</a>
      </td></tr>
    </table>
    <p style="margin:0;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.7;">If the button doesn't work, paste this link into your browser:<br/><span style="color:${BRAND.ink};word-break:break-all;">${args.link}</span></p>
    <p style="margin:14px 0 0;color:${BRAND.muted};font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.7;">If you didn't start an account with this email, you can ignore this message.</p>`;
  return {
    subject: "Verify your NovaBank email",
    html: layout(`Confirm your email and finish creating your NovaBank account.`, content),
    text: `Welcome to NovaBank, ${args.name}.\n\nConfirm your email by opening:\n${args.link}\n\nThe link expires in 15 minutes. If you didn't start this account, ignore this email.`,
  };
}

/* ── Delivery ─────────────────────────────────────────────────────────── */

async function deliver(email: string, mail: { subject: string; html: string; text: string }) {
  if (!SMTP_CONFIGURED) {
    logger.info(`[email:dev] ${mail.subject} → ${email}\n${mail.text}`);
    if (isProduction) {
      logger.warn(
        "No SMTP credentials configured in production — emails will NOT be delivered. Set EMAIL_USER/EMAIL_PASS.",
      );
    }
    return;
  }
  try {
    await getTransporter().sendMail({ from: FROM, to: email, subject: mail.subject, text: mail.text, html: mail.html });
    logger.info(`[email] sent "${mail.subject}" → ${email}`);
  } catch (err) {
    logger.warn("Email send failed", err instanceof Error ? err.message : String(err));
  }
}

/** Create + deliver an OTP. Returns the plaintext (for dev surfacing only). */
export async function sendOtp(
  email: string,
  purpose: "login_step_up" | "recovery" | "login_email" | "transfer_approval",
): Promise<string> {
  const code = generateOtp();
  const codeHash = await hashRecoveryCode(code);

  const user = await prisma.user.findUnique({ where: { email } });
  await prisma.otpCode.create({
    data: {
      userId: user?.id ?? "",
      code: codeHash,
      purpose,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const mail = renderOtpEmail({ code, purpose, expiresMinutes: 10 });
  await deliver(email, mail);

  if (!isProduction) logger.info(`[dev] OTP for ${email}: ${code}`);
  return code;
}

export async function verifyOtp(email: string, code: string, purpose: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return false;

  const records = await prisma.otpCode.findMany({
    where: { userId: user.id, purpose, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  for (const rec of records) {
    if (await verifyPassword(rec.code, code)) {
      await prisma.otpCode.update({ where: { id: rec.id }, data: { used: true } });
      return true;
    }
  }
  return false;
}

export async function sendAlertEmail(email: string, subject: string, body: string) {
  const mail = renderAlertEmail({ title: subject, body });
  await deliver(email, mail);
}

export async function sendVerificationEmail(email: string, name: string, link: string) {
  const mail = renderVerifyEmail({ name, link });
  await deliver(email, mail);
}
