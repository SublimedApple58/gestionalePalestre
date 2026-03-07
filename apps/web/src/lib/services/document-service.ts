import {
  DocumentJobStatus,
  DocumentSide,
  DocumentStatus,
  DocumentType,
  type PrismaClient,
  UserRole
} from "@gestionale/db";

import {
  DOC_AI_MAX_RETRIES,
  DOC_JOB_BATCH_SIZE,
  DOC_PRESIGN_TTL_SECONDS,
  DOC_RATE_LIMIT_MAX_REQUESTS,
  DOC_RATE_LIMIT_WINDOW_MS,
  DOC_UPLOAD_MAX_BYTES
} from "@/lib/document-settings";
import { getUploadSlotsForType } from "@/lib/documents";
import { consumeRateLimit } from "@/lib/rate-limit";

import { extractDocumentDataWithAi } from "./document-ai-service";
import {
  assertMagicBytesMatchMimeType,
  assertSupportedDocumentMimeType,
  buildDocumentStorageKey,
  createDocumentUploadUrl,
  readDocumentBytes
} from "./document-storage-service";
import { DomainError } from "./errors";

type PresignDocumentInput = {
  userId: string;
  type: DocumentType;
  side: DocumentSide;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

type CommitDocumentInput = {
  userId: string;
  type: DocumentType;
  side: DocumentSide;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  medicalCertificateExpiresAt?: Date | null;
};

type AdminReviewDocumentInput = {
  documentId: string;
  medicalCertificateExpiresAt?: Date | null;
};

type AdminRejectDocumentInput = {
  documentId: string;
  rejectionReason: string;
};

type AdminRequestReuploadInput = {
  documentId: string;
  reason?: string | null;
};

export type PresignDocumentResult = {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
};

export type CommitDocumentResult = {
  slotStatus: DocumentStatus;
  jobEnqueued: boolean;
  remainingRetries: number;
};

export type DocumentJobRunSummary = {
  queued: number;
  succeeded: number;
  failed: number;
  escalated: number;
};

const TAX_CODE_REGEX = /^[A-Z0-9]{16}$/;
const IDENTITY_NUMBER_REGEX = /^[A-Z0-9-]{5,20}$/;

function assertAdminRole(actorRole: UserRole): void {
  if (actorRole !== UserRole.ADMIN) {
    throw new DomainError("FORBIDDEN", "Solo un admin puo' eseguire questa azione.");
  }
}

function assertSlotIsAllowed(type: DocumentType, side: DocumentSide): void {
  const allowedSides = getUploadSlotsForType(type);

  if (!allowedSides.includes(side)) {
    throw new DomainError("INVALID_DOCUMENT_SIDE", "Lato documento non valido per il tipo selezionato.");
  }
}

function assertFileSizeWithinLimit(sizeBytes: number): void {
  if (sizeBytes <= 0 || sizeBytes > DOC_UPLOAD_MAX_BYTES) {
    throw new DomainError("INVALID_DOCUMENT_SIZE", "Dimensione file non valida o oltre il limite consentito.");
  }
}

function normalizeSha256(sha256: string): string {
  const normalized = sha256.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new DomainError("INVALID_DOCUMENT_HASH", "SHA256 documento non valido.");
  }

  return normalized;
}

function assertStorageOwnership(userId: string, storageKey: string): void {
  if (!storageKey.startsWith(`users/${userId}/documents/`)) {
    throw new DomainError("FORBIDDEN", "Storage key non autorizzata per questo utente.");
  }
}

function getRateLimitKey(kind: "presign" | "commit", userId: string): string {
  return `doc:${kind}:${userId}`;
}

function requireRateLimit(kind: "presign" | "commit", userId: string): void {
  const allowed = consumeRateLimit(
    getRateLimitKey(kind, userId),
    DOC_RATE_LIMIT_MAX_REQUESTS,
    DOC_RATE_LIMIT_WINDOW_MS
  );

  if (!allowed) {
    throw new DomainError("DOCUMENT_RATE_LIMIT", "Troppi tentativi di upload. Riprova tra poco.");
  }
}

function shouldProcessWithAi(type: DocumentType): boolean {
  return type === DocumentType.TAX_CODE || type === DocumentType.IDENTITY_DOCUMENT;
}

function initialStatusByType(type: DocumentType): DocumentStatus {
  if (type === DocumentType.PROFILE_PHOTO) {
    return DocumentStatus.APPROVED;
  }

  if (type === DocumentType.MEDICAL_CERTIFICATE) {
    return DocumentStatus.PENDING_ADMIN_REVIEW;
  }

  return DocumentStatus.UPLOADED;
}

async function assertUploadObjectMatchesMime(storageKey: string, mimeType: string): Promise<void> {
  const sample = await readDocumentBytes({
    storageKey,
    byteRange: "bytes=0-32"
  });

  assertMagicBytesMatchMimeType(mimeType, sample);
}

async function enqueueDocumentJobIfNeeded(
  prisma: PrismaClient,
  userId: string,
  type: DocumentType,
  maxAttempts: number = DOC_AI_MAX_RETRIES
): Promise<boolean> {
  if (!shouldProcessWithAi(type)) {
    return false;
  }

  const [front, back] = await Promise.all([
    prisma.userDocument.findUnique({
      where: {
        userId_type_side: {
          userId,
          type,
          side: DocumentSide.FRONT
        }
      },
      select: {
        id: true,
        aiAttempts: true
      }
    }),
    prisma.userDocument.findUnique({
      where: {
        userId_type_side: {
          userId,
          type,
          side: DocumentSide.BACK
        }
      },
      select: {
        id: true,
        aiAttempts: true
      }
    })
  ]);

  if (!front || !back) {
    return false;
  }

  const existingInProgress = await prisma.documentProcessingJob.findFirst({
    where: {
      userId,
      type,
      status: {
        in: [DocumentJobStatus.QUEUED, DocumentJobStatus.RUNNING]
      }
    },
    select: {
      id: true
    }
  });

  await prisma.userDocument.updateMany({
    where: {
      userId,
      type,
      side: {
        in: [DocumentSide.FRONT, DocumentSide.BACK]
      }
    },
    data: {
      status: DocumentStatus.AI_PROCESSING,
      aiLastError: null,
      rejectionReason: null
    }
  });

  if (existingInProgress) {
    return false;
  }

  await prisma.documentProcessingJob.create({
    data: {
      userId,
      type,
      status: DocumentJobStatus.QUEUED,
      attemptCount: 0,
      maxAttempts,
      nextRunAt: new Date(),
      payload: {
        trigger: "commit"
      }
    }
  });

  return true;
}

function getHighestAiAttempts(aiAttempts: number[]): number {
  if (aiAttempts.length === 0) {
    return 0;
  }

  return Math.max(...aiAttempts);
}

export async function createDocumentUploadPresign(
  input: PresignDocumentInput
): Promise<PresignDocumentResult> {
  assertSlotIsAllowed(input.type, input.side);
  assertSupportedDocumentMimeType(input.contentType);
  assertFileSizeWithinLimit(input.sizeBytes);
  requireRateLimit("presign", input.userId);

  const storageKey = buildDocumentStorageKey(input.userId, input.type, input.side, input.fileName);
  const uploadUrl = await createDocumentUploadUrl({
    storageKey,
    contentType: input.contentType,
    expiresInSeconds: DOC_PRESIGN_TTL_SECONDS
  });

  return {
    uploadUrl,
    storageKey,
    expiresIn: DOC_PRESIGN_TTL_SECONDS
  };
}

export async function commitUploadedDocument(
  prisma: PrismaClient,
  input: CommitDocumentInput
): Promise<CommitDocumentResult> {
  assertSlotIsAllowed(input.type, input.side);
  assertSupportedDocumentMimeType(input.contentType);
  assertFileSizeWithinLimit(input.sizeBytes);
  requireRateLimit("commit", input.userId);
  assertStorageOwnership(input.userId, input.storageKey);

  const normalizedSha = normalizeSha256(input.sha256);

  await assertUploadObjectMatchesMime(input.storageKey, input.contentType);

  if (
    input.type === DocumentType.MEDICAL_CERTIFICATE &&
    (!input.medicalCertificateExpiresAt || Number.isNaN(input.medicalCertificateExpiresAt.valueOf()))
  ) {
    throw new DomainError(
      "INVALID_MEDICAL_CERTIFICATE_EXPIRY",
      "Per il certificato medico e' obbligatoria la data di scadenza."
    );
  }

  if (
    input.type === DocumentType.MEDICAL_CERTIFICATE &&
    input.medicalCertificateExpiresAt &&
    input.medicalCertificateExpiresAt <= new Date()
  ) {
    throw new DomainError(
      "INVALID_MEDICAL_CERTIFICATE_EXPIRY",
      "La scadenza del certificato medico deve essere futura."
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true }
  });

  if (!user) {
    throw new DomainError("NOT_FOUND", "Utente non trovato.");
  }

  const status = initialStatusByType(input.type);

  const upserted = await prisma.userDocument.upsert({
    where: {
      userId_type_side: {
        userId: input.userId,
        type: input.type,
        side: input.side
      }
    },
    create: {
      userId: input.userId,
      uploadedById: input.userId,
      type: input.type,
      side: input.side,
      status,
      storageKey: input.storageKey,
      fileName: input.fileName,
      fileLabel: input.fileName,
      mimeType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: normalizedSha,
      uploadedAt: new Date(),
      aiLastError: null,
      rejectionReason: null,
      medicalCertificateExpiresAt:
        input.type === DocumentType.MEDICAL_CERTIFICATE ? input.medicalCertificateExpiresAt ?? null : null
    },
    update: {
      uploadedById: input.userId,
      status,
      storageKey: input.storageKey,
      fileName: input.fileName,
      fileLabel: input.fileName,
      mimeType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: normalizedSha,
      uploadedAt: new Date(),
      aiLastError: null,
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
      medicalCertificateExpiresAt:
        input.type === DocumentType.MEDICAL_CERTIFICATE ? input.medicalCertificateExpiresAt ?? null : null
    },
    select: {
      status: true,
      aiAttempts: true
    }
  });

  const jobEnqueued = await enqueueDocumentJobIfNeeded(prisma, input.userId, input.type, DOC_AI_MAX_RETRIES);

  const aiAttemptsForType = shouldProcessWithAi(input.type)
    ? await prisma.userDocument.findMany({
        where: {
          userId: input.userId,
          type: input.type,
          side: {
            in: [DocumentSide.FRONT, DocumentSide.BACK]
          }
        },
        select: {
          aiAttempts: true,
          status: true
        }
      })
    : [];

  const highestAttempts = getHighestAiAttempts(aiAttemptsForType.map((item) => item.aiAttempts));

  const statusForSlot = aiAttemptsForType.some((item) => item.status === DocumentStatus.AI_PROCESSING)
    ? DocumentStatus.AI_PROCESSING
    : upserted.status;

  return {
    slotStatus: statusForSlot,
    jobEnqueued,
    remainingRetries: Math.max(DOC_AI_MAX_RETRIES - highestAttempts, 0)
  };
}

export async function approveDocumentByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  actorId: string,
  input: AdminReviewDocumentInput
): Promise<void> {
  assertAdminRole(actorRole);

  const document = await prisma.userDocument.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      type: true,
      medicalCertificateExpiresAt: true
    }
  });

  if (!document) {
    throw new DomainError("NOT_FOUND", "Documento non trovato.");
  }

  if (
    document.type === DocumentType.MEDICAL_CERTIFICATE &&
    !input.medicalCertificateExpiresAt &&
    !document.medicalCertificateExpiresAt
  ) {
    throw new DomainError(
      "INVALID_MEDICAL_CERTIFICATE_EXPIRY",
      "Inserisci la data di scadenza del certificato medico prima dell'approvazione."
    );
  }

  if (
    document.type === DocumentType.MEDICAL_CERTIFICATE &&
    input.medicalCertificateExpiresAt &&
    input.medicalCertificateExpiresAt <= new Date()
  ) {
    throw new DomainError(
      "INVALID_MEDICAL_CERTIFICATE_EXPIRY",
      "La scadenza del certificato medico deve essere futura."
    );
  }

  await prisma.userDocument.update({
    where: { id: document.id },
    data: {
      status: DocumentStatus.APPROVED,
      reviewedById: actorId,
      reviewedAt: new Date(),
      rejectionReason: null,
      aiLastError: null,
      medicalCertificateExpiresAt:
        document.type === DocumentType.MEDICAL_CERTIFICATE
          ? input.medicalCertificateExpiresAt ?? document.medicalCertificateExpiresAt
          : document.medicalCertificateExpiresAt
    }
  });
}

export async function rejectDocumentByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  actorId: string,
  input: AdminRejectDocumentInput
): Promise<void> {
  assertAdminRole(actorRole);

  const reason = input.rejectionReason.trim();

  if (reason.length < 4) {
    throw new DomainError("INVALID_REJECTION_REASON", "Motivazione rifiuto troppo breve.");
  }

  await prisma.userDocument.update({
    where: { id: input.documentId },
    data: {
      status: DocumentStatus.REJECTED,
      reviewedById: actorId,
      reviewedAt: new Date(),
      rejectionReason: reason
    }
  });
}

export async function requestDocumentReuploadByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  actorId: string,
  input: AdminRequestReuploadInput
): Promise<void> {
  assertAdminRole(actorRole);

  await prisma.userDocument.update({
    where: { id: input.documentId },
    data: {
      status: DocumentStatus.NEEDS_REUPLOAD,
      reviewedById: actorId,
      reviewedAt: new Date(),
      rejectionReason: input.reason?.trim() || "Serve un nuovo caricamento, immagine non leggibile."
    }
  });
}

async function markJobStatus(prisma: PrismaClient, jobId: string, status: DocumentJobStatus, lastError?: string) {
  await prisma.documentProcessingJob.update({
    where: { id: jobId },
    data: {
      status,
      lastError: lastError ?? null,
      updatedAt: new Date()
    }
  });
}

function isExtractionCodeValid(type: DocumentType, value: string | null): boolean {
  if (type === DocumentType.TAX_CODE) {
    return !!value && TAX_CODE_REGEX.test(value);
  }

  if (type === DocumentType.IDENTITY_DOCUMENT) {
    return !!value && IDENTITY_NUMBER_REGEX.test(value);
  }

  return false;
}

function toSafeErrorCode(error: unknown): string {
  if (error instanceof DomainError) {
    return error.code;
  }

  return "UNKNOWN_ERROR";
}

async function processDocumentJob(prisma: PrismaClient, jobId: string): Promise<"succeeded" | "failed" | "escalated"> {
  const job = await prisma.documentProcessingJob.update({
    where: { id: jobId },
    data: {
      status: DocumentJobStatus.RUNNING,
      attemptCount: {
        increment: 1
      }
    },
    select: {
      id: true,
      userId: true,
      type: true,
      maxAttempts: true
    }
  });

  try {
    if (!shouldProcessWithAi(job.type)) {
      await markJobStatus(prisma, job.id, DocumentJobStatus.FAILED, "UNSUPPORTED_TYPE");
      return "failed";
    }

    const [front, back] = await Promise.all([
      prisma.userDocument.findUnique({
        where: {
          userId_type_side: {
            userId: job.userId,
            type: job.type,
            side: DocumentSide.FRONT
          }
        }
      }),
      prisma.userDocument.findUnique({
        where: {
          userId_type_side: {
            userId: job.userId,
            type: job.type,
            side: DocumentSide.BACK
          }
        }
      })
    ]);

    if (!front || !back) {
      await markJobStatus(prisma, job.id, DocumentJobStatus.FAILED, "MISSING_SIDES");
      return "failed";
    }

    const [frontBytes, backBytes] = await Promise.all([
      readDocumentBytes({ storageKey: front.storageKey }),
      readDocumentBytes({ storageKey: back.storageKey })
    ]);

    const extraction = await extractDocumentDataWithAi({
      type: job.type,
      frontBytes,
      backBytes,
      frontMimeType: front.mimeType,
      backMimeType: back.mimeType
    });

    const extractedValue =
      job.type === DocumentType.TAX_CODE ? extraction.taxCode : extraction.identityNumber;

    if (!isExtractionCodeValid(job.type, extractedValue)) {
      throw new DomainError("AI_EXTRACTION_INVALID_FORMAT", "Formato campo estratto non valido.");
    }

    await prisma.userDocument.updateMany({
      where: {
        userId: job.userId,
        type: job.type,
        side: {
          in: [DocumentSide.FRONT, DocumentSide.BACK]
        }
      },
      data: {
        status: DocumentStatus.APPROVED,
        aiConfidence: extraction.confidence,
        aiLastError: null,
        rejectionReason: null,
        reviewedById: null,
        reviewedAt: null,
        extractedTaxCode: extraction.taxCode,
        extractedIdentityNumber: extraction.identityNumber,
        extractedDateOfBirth: extraction.dateOfBirth
      }
    });

    if (extraction.dateOfBirth) {
      await prisma.user.update({
        where: { id: job.userId },
        data: { dateOfBirth: extraction.dateOfBirth }
      });
    }

    await markJobStatus(prisma, job.id, DocumentJobStatus.SUCCEEDED);
    return "succeeded";
  } catch (error) {
    const errorCode = toSafeErrorCode(error);

    const updatedDocuments = await prisma.$transaction(async (tx) => {
      await tx.userDocument.updateMany({
        where: {
          userId: job.userId,
          type: job.type,
          side: {
            in: [DocumentSide.FRONT, DocumentSide.BACK]
          }
        },
        data: {
          aiAttempts: {
            increment: 1
          },
          aiLastError: errorCode
        }
      });

      return tx.userDocument.findMany({
        where: {
          userId: job.userId,
          type: job.type,
          side: {
            in: [DocumentSide.FRONT, DocumentSide.BACK]
          }
        },
        select: {
          id: true,
          aiAttempts: true
        }
      });
    });

    const highestAttempts = getHighestAiAttempts(updatedDocuments.map((doc) => doc.aiAttempts));

    if (highestAttempts >= job.maxAttempts) {
      await prisma.userDocument.updateMany({
        where: {
          userId: job.userId,
          type: job.type,
          side: {
            in: [DocumentSide.FRONT, DocumentSide.BACK]
          }
        },
        data: {
          status: DocumentStatus.PENDING_ADMIN_REVIEW,
          rejectionReason: "Analisi automatica non conclusiva dopo i tentativi disponibili."
        }
      });

      await markJobStatus(prisma, job.id, DocumentJobStatus.ESCALATED, errorCode);
      return "escalated";
    }

    await prisma.userDocument.updateMany({
      where: {
        userId: job.userId,
        type: job.type,
        side: {
          in: [DocumentSide.FRONT, DocumentSide.BACK]
        }
      },
      data: {
        status: DocumentStatus.NEEDS_REUPLOAD,
        rejectionReason: "Documento non leggibile. Carica nuovamente fronte e retro."
      }
    });

    await markJobStatus(prisma, job.id, DocumentJobStatus.FAILED, errorCode);
    return "failed";
  }
}

export async function runDocumentProcessingJobs(
  prisma: PrismaClient,
  batchSize: number = DOC_JOB_BATCH_SIZE
): Promise<DocumentJobRunSummary> {
  const queuedJobs = await prisma.documentProcessingJob.findMany({
    where: {
      status: DocumentJobStatus.QUEUED,
      nextRunAt: {
        lte: new Date()
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    },
    take: Math.max(batchSize, 1)
  });

  const summary: DocumentJobRunSummary = {
    queued: queuedJobs.length,
    succeeded: 0,
    failed: 0,
    escalated: 0
  };

  for (const job of queuedJobs) {
    const result = await processDocumentJob(prisma, job.id);

    if (result === "succeeded") {
      summary.succeeded += 1;
    }

    if (result === "failed") {
      summary.failed += 1;
    }

    if (result === "escalated") {
      summary.escalated += 1;
    }
  }

  return summary;
}
