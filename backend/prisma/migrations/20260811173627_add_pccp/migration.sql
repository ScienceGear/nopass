-- CreateTable
CREATE TABLE "PccpConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageIds" TEXT[],
    "orderSeed" INTEGER NOT NULL,
    "enrolled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PccpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PccpClickpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "sequencePosition" INTEGER NOT NULL,
    "gridCellX" INTEGER NOT NULL,
    "gridCellY" INTEGER NOT NULL,
    "salt" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PccpClickpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PccpBehaviorBaseline" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceClass" TEXT NOT NULL,
    "sequencePosition" INTEGER NOT NULL,
    "meanTimeToClick" DOUBLE PRECISION NOT NULL,
    "stddevTimeToClick" DOUBLE PRECISION NOT NULL,
    "meanInterClick" DOUBLE PRECISION NOT NULL,
    "stddevInterClick" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "recentTimeToClick" DOUBLE PRECISION[],
    "recentInterClick" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PccpBehaviorBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PccpLockout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PccpLockout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PccpConfig_userId_key" ON "PccpConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PccpClickpoint_userId_imageId_key" ON "PccpClickpoint"("userId", "imageId");

-- CreateIndex
CREATE UNIQUE INDEX "PccpBehaviorBaseline_userId_deviceClass_sequencePosition_key" ON "PccpBehaviorBaseline"("userId", "deviceClass", "sequencePosition");

-- CreateIndex
CREATE UNIQUE INDEX "PccpLockout_userId_key" ON "PccpLockout"("userId");

-- AddForeignKey
ALTER TABLE "PccpConfig" ADD CONSTRAINT "PccpConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PccpClickpoint" ADD CONSTRAINT "PccpClickpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PccpBehaviorBaseline" ADD CONSTRAINT "PccpBehaviorBaseline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PccpLockout" ADD CONSTRAINT "PccpLockout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
