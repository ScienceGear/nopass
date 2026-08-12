import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { randomBytes } from "node:crypto";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { getRedis } from "../config/redis.js";
import { AppError } from "../middleware/errorHandler.js";

const CHALLENGE_TTL = 300; // seconds

export interface UserCredentialRecord {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
}

const rpID = env.WEBAUTHN_RP_ID;
const origins = env.WEBAUTHN_ORIGIN.split(",").map((o) => o.trim());

type StoredChallenge =
  | { type: "registration"; email: string; name: string }
  | { type: "authentication"; email: string };

async function saveChallenge(challenge: string, data: StoredChallenge) {
  await getRedis().set(`webauthn:challenge:${challenge}`, JSON.stringify(data), "EX", CHALLENGE_TTL);
}

/** Read the stored challenge WITHOUT deleting it yet. Caller must call deleteChallenge() after successful verification. */
async function peekChallenge(echoedChallenge: string, expectedType: StoredChallenge["type"]): Promise<StoredChallenge> {
  const raw = await getRedis().get(`webauthn:challenge:${echoedChallenge}`);
  if (!raw) throw new AppError(400, "Challenge expired \u2014 please try again.");
  const stored = JSON.parse(raw) as StoredChallenge;
  if (stored.type !== expectedType) throw new AppError(400, "Challenge mismatch.");
  return stored;
}

async function deleteChallenge(challenge: string) {
  await getRedis().del(`webauthn:challenge:${challenge}`);
}

/** @deprecated Use peekChallenge + deleteChallenge instead. */
async function takeChallenge(echoedChallenge: string, expectedType: StoredChallenge["type"]): Promise<StoredChallenge> {
  const stored = await peekChallenge(echoedChallenge, expectedType);
  await deleteChallenge(echoedChallenge);
  return stored;
}

/** Extract the challenge string that was signed, from clientDataJSON. */
function challengeFromClientData(clientDataJSON: string): string {
  const decoded = Buffer.from(clientDataJSON, "base64url").toString("utf-8");
  return (JSON.parse(decoded) as { challenge: string }).challenge;
}

// ---------------------------------------------------------------------------
// REGISTRATION
// ---------------------------------------------------------------------------

export async function buildRegistrationOptions(email: string, name: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { credentials: true },
  });
  // A pending (email-verified but passkey-less) user is fine here; the
  // registerOptions route has already gated on the verification token.
  if (existing?.credentials.length) throw new AppError(409, "Account already registered  try logging in.");

  const opts = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID,
    userName: email,
    userDisplayName: name,
    userID: randomBytes(16),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
    supportedAlgorithmIDs: [-7, -257],
  });

  await saveChallenge(opts.challenge, { type: "registration", email, name });
  return opts;
}

export interface RegistrationResult {
  email: string;
  name: string;
  credential: UserCredentialRecord;
  deviceType: string;
  backedUp: boolean;
}

/** Registration options for ADDING a passkey to an already-registered account. */
export async function buildAdditionalRegistrationOptions(
  user: { id: string; email: string; name: string; credentials: UserCredentialRecord[] },
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const opts = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: randomBytes(16),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
    excludeCredentials: user.credentials.map((c) => ({ id: c.id, transports: c.transports })),
    supportedAlgorithmIDs: [-7, -257],
  });

  await saveChallenge(opts.challenge, { type: "registration", email: user.email, name: user.name });
  return opts;
}

export async function verifyRegistrationResponseCredential(email: string, response: RegistrationResponseJSON): Promise<RegistrationResult> {
  const echoedChallenge = challengeFromClientData(response.response.clientDataJSON);
  const stored = await peekChallenge(echoedChallenge, "registration");
  if (stored.type !== "registration") throw new AppError(400, "Challenge mismatch.");
  if (stored.email !== email) throw new AppError(400, "Email does not match the registration request.");

  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge: echoedChallenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!verified || !registrationInfo) throw new AppError(400, "WebAuthn registration failed verification.");

  // Only consume the challenge after successful verification to allow a single retry on transient failures.
  await deleteChallenge(echoedChallenge);

  return {
    email: stored.email,
    name: stored.name,
    credential: {
      id: registrationInfo.credential.id,
      publicKey: registrationInfo.credential.publicKey,
      counter: registrationInfo.credential.counter,
      transports: registrationInfo.credential.transports ?? [],
    },
    deviceType: registrationInfo.credentialDeviceType,
    backedUp: registrationInfo.credentialBackedUp,
  };
}

// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------

export async function buildAuthenticationOptions(
  user: { id: string; email: string; credentials: UserCredentialRecord[] },
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const opts = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: user.credentials.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
  });

  await saveChallenge(opts.challenge, { type: "authentication", email: user.email });
  return opts;
}

export interface AuthenticationResult {
  email: string;
  credentialId: string;
  newCounter: number;
}

export async function verifyAuthenticationResponseCredential(
  email: string,
  response: AuthenticationResponseJSON,
  credential: UserCredentialRecord,
): Promise<AuthenticationResult> {
  const echoedChallenge = challengeFromClientData(response.response.clientDataJSON);
  const stored = await peekChallenge(echoedChallenge, "authentication");
  if (stored.email !== email) throw new AppError(400, "Email does not match the authentication request.");

  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge: echoedChallenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    credential,
    requireUserVerification: false,
  });
  if (!verified) throw new AppError(400, "WebAuthn authentication failed verification.");

  // Only consume the challenge after successful verification.
  await deleteChallenge(echoedChallenge);

  return {
    email,
    credentialId: credential.id,
    newCounter: authenticationInfo.newCounter,
  };
}

// ---------------------------------------------------------------------------
// Pending user / account linking helpers
// ---------------------------------------------------------------------------

export function buildUserCredentialsFromDb(
  dbCredentials: {
    id: string;
    credentialId: string;
    publicKey: Uint8Array;
    counter: number;
    transports: string[];
  }[],
): UserCredentialRecord[] {
  return dbCredentials.map((c) => ({
    id: c.credentialId,
    publicKey: c.publicKey,
    counter: c.counter,
    transports: c.transports as AuthenticatorTransportFuture[],
  }));
}
