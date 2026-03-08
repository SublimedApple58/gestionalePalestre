import { db, DocumentSide, DocumentStatus, DocumentType } from "@gestionale/db";

import { createDocumentDownloadUrl, isDocumentStorageConfigured } from "./services/document-storage-service";

/**
 * Get profile photo presigned URL for a single user.
 * Returns null if no photo available or storage not configured.
 */
export async function getProfilePhotoUrl(userId: string): Promise<string | null> {
  if (!isDocumentStorageConfigured()) {
    return null;
  }

  const document = await db.userDocument.findFirst({
    where: {
      userId,
      type: DocumentType.PROFILE_PHOTO,
      side: DocumentSide.SINGLE,
      status: { in: [DocumentStatus.APPROVED, DocumentStatus.UPLOADED] },
      storageKey: { not: "" }
    },
    select: { storageKey: true },
    orderBy: { uploadedAt: "desc" }
  });

  if (!document?.storageKey) {
    return null;
  }

  try {
    return await createDocumentDownloadUrl({
      storageKey: document.storageKey,
      expiresInSeconds: 3600
    });
  } catch {
    return null;
  }
}

/**
 * Get profile photo presigned URLs for multiple users.
 * Returns a Map<userId, url>.
 */
export async function getProfilePhotoUrls(userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  if (!isDocumentStorageConfigured() || userIds.length === 0) {
    return result;
  }

  const documents = await db.userDocument.findMany({
    where: {
      userId: { in: userIds },
      type: DocumentType.PROFILE_PHOTO,
      side: DocumentSide.SINGLE,
      status: { in: [DocumentStatus.APPROVED, DocumentStatus.UPLOADED] },
      storageKey: { not: "" }
    },
    select: { userId: true, storageKey: true, uploadedAt: true },
    orderBy: { uploadedAt: "desc" }
  });

  // Deduplicate: take the most recent per user
  const latestByUser = new Map<string, string>();
  for (const doc of documents) {
    if (!latestByUser.has(doc.userId)) {
      latestByUser.set(doc.userId, doc.storageKey);
    }
  }

  // Generate presigned URLs in parallel
  const entries = Array.from(latestByUser.entries());
  const urls = await Promise.all(
    entries.map(async ([userId, storageKey]) => {
      try {
        const url = await createDocumentDownloadUrl({
          storageKey,
          expiresInSeconds: 3600
        });
        return [userId, url] as const;
      } catch {
        return [userId, null] as const;
      }
    })
  );

  for (const [userId, url] of urls) {
    if (url) {
      result.set(userId, url);
    }
  }

  return result;
}
