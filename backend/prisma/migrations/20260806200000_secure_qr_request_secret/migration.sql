-- Bind the QR approval result to the browser that created the request. The
-- plaintext secret never enters the QR image and is only retained in browser memory.
ALTER TABLE "QrSession"
ADD COLUMN "requestSecretHash" TEXT NOT NULL DEFAULT '';

ALTER TABLE "QrSession"
ALTER COLUMN "requestSecretHash" DROP DEFAULT;
