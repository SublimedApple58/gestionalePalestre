import { DocumentType, type PrismaClient } from "@gestionale/db";

import { DomainError } from "./errors";

type UploadDocumentInput = {
  userId: string;
  uploadedById: string;
  type: DocumentType;
  fileLabel: string;
};

export async function uploadUserDocument(prisma: PrismaClient, input: UploadDocumentInput): Promise<void> {
  const targetUser = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true }
  });

  if (!targetUser) {
    throw new DomainError("NOT_FOUND", "Utente non trovato.");
  }

  await prisma.userDocument.upsert({
    where: {
      userId_type: {
        userId: input.userId,
        type: input.type
      }
    },
    create: {
      userId: input.userId,
      uploadedById: input.uploadedById,
      type: input.type,
      fileLabel: input.fileLabel,
      uploadedAt: new Date()
    },
    update: {
      uploadedById: input.uploadedById,
      fileLabel: input.fileLabel,
      uploadedAt: new Date()
    }
  });
}
