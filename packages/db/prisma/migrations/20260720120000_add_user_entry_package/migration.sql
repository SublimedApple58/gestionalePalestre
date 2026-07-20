-- AlterEnum: azioni di audit per il pacchetto ingressi (admin-only)
ALTER TYPE "AuditAction" ADD VALUE 'ENTRY_PACKAGE_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'ENTRY_PACKAGE_REMOVED';

-- CreateTable
CREATE TABLE "UserEntryPackage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalEntries" INTEGER NOT NULL,
    "remainingEntries" INTEGER NOT NULL,
    "assignedById" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEntryPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserEntryPackage_userId_key" ON "UserEntryPackage"("userId");

-- CreateIndex
CREATE INDEX "UserEntryPackage_assignedById_idx" ON "UserEntryPackage"("assignedById");

-- AddForeignKey
ALTER TABLE "UserEntryPackage" ADD CONSTRAINT "UserEntryPackage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEntryPackage" ADD CONSTRAINT "UserEntryPackage_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
