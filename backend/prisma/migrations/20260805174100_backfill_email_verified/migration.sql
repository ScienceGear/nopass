-- Existing accounts that already completed passkey registration are trusted:
-- mark them verified so they keep working after the signup gate ships.
UPDATE "User"
SET "emailVerified" = true
WHERE "emailVerified" = false
  AND EXISTS (SELECT 1 FROM "Credential" WHERE "Credential"."userId" = "User"."id");
