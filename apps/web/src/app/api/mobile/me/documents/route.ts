import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { DOC_AI_MAX_RETRIES } from "@/lib/document-settings";
import {
  countRemainingAiAttempts,
  getMissingSubmissionSlots,
  hasRequiredDocumentSubmissions
} from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/me/documents
 * Auth: bearer access token (SUBSCRIBER)
 *
 * Ritorna i documenti dell'utente loggato + lo stato di onboarding usato dal
 * gate bloccante mobile (parità col web). `requiredComplete` = tutti gli slot
 * obbligatori sono *inviati* (status != REJECTED/NEEDS_REUPLOAD).
 */
export const GET = withMobileAuth(
  async (_request, { user }) => {
    const docs = await db.userDocument.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        type: true,
        side: true,
        status: true,
        fileName: true,
        uploadedAt: true,
        rejectionReason: true,
        aiAttempts: true
      },
      orderBy: { uploadedAt: "desc" }
    });

    const requiredComplete = hasRequiredDocumentSubmissions(UserRole.SUBSCRIBER, docs);
    const missingSlots = getMissingSubmissionSlots(UserRole.SUBSCRIBER, docs).map((slot) => ({
      type: slot.type,
      side: slot.side
    }));

    return NextResponse.json({
      documents: docs.map((d) => ({
        id: d.id,
        type: d.type,
        side: d.side,
        status: d.status,
        fileName: d.fileName,
        uploadedAt: d.uploadedAt.toISOString(),
        rejectionReason: d.rejectionReason,
        aiAttempts: d.aiAttempts,
        remainingRetries: countRemainingAiAttempts({ aiAttempts: d.aiAttempts }, DOC_AI_MAX_RETRIES)
      })),
      requiredComplete,
      missingSlots
    });
  },
  { allowedRoles: [UserRole.SUBSCRIBER] }
);
