-- AlterTable
ALTER TABLE "User" ADD COLUMN "dateOfBirth" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserDocument" ADD COLUMN "extractedDateOfBirth" TIMESTAMP(3);
