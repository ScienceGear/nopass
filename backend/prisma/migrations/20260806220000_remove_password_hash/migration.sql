-- Remove the password fallback entirely: NovaBank is passwordless by design.
-- The onboarding state machine no longer has a "password_set" step, so accounts
-- that only set a backup password (no passkey) are re-based onto email_pending
-- and must complete passkey setup before being marked complete.
ALTER TABLE "User" DROP COLUMN "passwordHash";

UPDATE "User"
SET "onboardingStep" = 'email_pending'
WHERE "onboardingStep" = 'password_set';
