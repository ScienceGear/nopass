-- A persisted state machine prevents accounts from skipping setup after email
-- verification. Existing usable accounts are preserved as complete.
ALTER TABLE "User"
ADD COLUMN "onboardingStep" TEXT NOT NULL DEFAULT 'email_pending';

UPDATE "User"
SET "onboardingStep" = 'complete'
WHERE "passwordHash" IS NOT NULL
   OR EXISTS (
     SELECT 1
     FROM "Credential"
     WHERE "Credential"."userId" = "User"."id"
   );
