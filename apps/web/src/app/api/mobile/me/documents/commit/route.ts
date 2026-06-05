import { createHash } from "node:crypto";

import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { commitUploadedDocument } from "@/lib/services/document-service";
import { readDocumentBytes } from "@/lib/services/document-storage-service";
import { DomainError } from "@/lib/services/errors";
import { mobileDocumentCommitSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toStatusCode(error: DomainError): number {
  switch (error.code) {
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "DOCUMENT_RATE_LIMIT":
      return 429;
    case "DOCUMENT_STORAGE_NOT_CONFIGURED":
      return 503;
    default:
      return 400;
  }
}

/**
 * POST /api/mobile/me/documents/commit
 * Auth: bearer access token (SUBSCRIBER)
 * Body: { type, side, storageKey, fileName, mimeType, fileSize }
 * 200: { slotStatus, jobEnqueued, remainingRetries }
 *
 * A differenza del web, il client mobile NON manda lo sha256: lo calcoliamo qui
 * lato server leggendo l'oggetto appena caricato su R2 (node:crypto). Così
 * evitiamo hashing on-device / dipendenze native. commitUploadedDocument fa poi
 * anche il magic-byte check (rete di sicurezza per HEIC mascherati da JPEG).
 *
 * Nota costo: una GET completa dell'oggetto per l'hash + una GET di 32 byte nel
 * service per i magic bytes. Accettabile per immagini <= 12 MB.
 */
export const POST = withMobileAuth(
  async (request, { user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileDocumentCommitSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { storageKey } = parsed.data;

    // Fail-fast: la storageKey deve appartenere all'utente loggato (il service
    // riasserisce comunque, ma così evitiamo una read R2 su chiave forgiata).
    if (!storageKey.startsWith(`users/${user.id}/documents/`)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    try {
      const bytes = await readDocumentBytes({ storageKey });
      const sha256 = createHash("sha256").update(bytes).digest("hex");

      const result = await commitUploadedDocument(db, {
        userId: user.id,
        type: parsed.data.type,
        side: parsed.data.side,
        storageKey,
        fileName: parsed.data.fileName,
        contentType: parsed.data.mimeType,
        sizeBytes: parsed.data.fileSize,
        sha256,
        medicalCertificateExpiresAt: parsed.data.medicalCertificateExpiresAt
          ? new Date(parsed.data.medicalCertificateExpiresAt)
          : null
      });

      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof DomainError) {
        return NextResponse.json(
          { error: error.code, message: error.message },
          { status: toStatusCode(error) }
        );
      }
      console.error("[mobile/documents/commit] failed:", error);
      return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
  },
  { allowedRoles: [UserRole.SUBSCRIBER] }
);
