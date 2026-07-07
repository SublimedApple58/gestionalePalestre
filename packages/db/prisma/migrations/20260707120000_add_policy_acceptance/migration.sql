-- CreateTable
CREATE TABLE "PolicyAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyAcceptance_userId_idx" ON "PolicyAcceptance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcceptance_userId_policyKey_key" ON "PolicyAcceptance"("userId", "policyKey");

-- AddForeignKey
ALTER TABLE "PolicyAcceptance" ADD CONSTRAINT "PolicyAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
