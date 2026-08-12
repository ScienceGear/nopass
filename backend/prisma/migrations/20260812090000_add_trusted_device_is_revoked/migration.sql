-- The TrustedDevice.isRevoked field was added to schema.prisma (commit
-- "Update schema.prisma add isRevoked to TrustedDevices") but no migration was
-- ever generated for it. The Prisma client SELECTs this column, so any
-- findUnique/findMany/upsert on TrustedDevice throws
-- `column "TrustedDevice.isRevoked" does not exist` against databases that
-- were provisioned purely from the migration history.
--
-- Guarded so `prisma migrate deploy` succeeds even on databases where the
-- column was added ad-hoc (e.g. via `prisma db push`); those get a no-op and
-- the migration is still recorded as applied.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'TrustedDevice' AND column_name = 'isRevoked'
  ) THEN
    ALTER TABLE "TrustedDevice" ADD COLUMN "isRevoked" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
