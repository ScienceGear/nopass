-- CreateTable
CREATE TABLE "UserSecuritySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertNewDevice" BOOLEAN NOT NULL DEFAULT true,
    "alertLargeTransfer" BOOLEAN NOT NULL DEFAULT true,
    "alertBlockedSignIn" BOOLEAN NOT NULL DEFAULT true,
    "alertProductUpdates" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSecuritySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSecuritySettings_userId_key" ON "UserSecuritySettings"("userId");

-- AddForeignKey
ALTER TABLE "UserSecuritySettings" ADD CONSTRAINT "UserSecuritySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
