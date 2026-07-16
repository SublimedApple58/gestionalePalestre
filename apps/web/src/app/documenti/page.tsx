import { db, DocumentStatus, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { DocumentReviewTable } from "@/components/dashboard/document-review-table";
import { FullListShell } from "@/components/dashboard/full-list-shell";
import {
  createDocumentDownloadUrl,
  isDocumentStorageConfigured
} from "@/lib/services/document-storage-service";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DocumentiPage() {
  const sessionUser = await requireRole([UserRole.ADMIN]);

  const [currentUser, reviewDocumentsRaw] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: { firstName: true, role: true }
    }),
    db.userDocument.findMany({
      where: { status: { in: [DocumentStatus.PENDING_ADMIN_REVIEW] } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } }
      },
      orderBy: { uploadedAt: "desc" },
      take: 500
    })
  ]);

  if (!currentUser) redirect("/login");

  const storageConfigured = isDocumentStorageConfigured();
  const reviewDocuments = await Promise.all(
    reviewDocumentsRaw.map(async (document) => ({
      ...document,
      previewUrl: storageConfigured
        ? await createDocumentDownloadUrl({
            storageKey: document.storageKey,
            expiresInSeconds: 300
          }).catch(() => null)
        : null
    }))
  );

  return (
    <FullListShell user={currentUser}>
      <DocumentReviewTable documents={reviewDocuments} />
    </FullListShell>
  );
}
