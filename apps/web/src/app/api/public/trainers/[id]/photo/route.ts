import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { isDocumentStorageConfigured, readDocumentBytes } from "@/lib/services/document-storage-service";

import { corsHeaders } from "../../cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * GET /api/public/trainers/:id/photo?v=<updatedAt> — pubblico.
 *
 * Le foto stanno nel bucket R2 privato: qui le serviamo lato server con cache
 * lunga. `v` cambia a ogni modifica del trainer, quindi l'URL versionato è
 * immutabile e una foto nuova non resta mai nascosta da una cache vecchia.
 * Solo trainer visibili.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainer = await db.personalTrainer.findFirst({
    where: { id, isVisible: true },
    select: { photoStorageKey: true }
  });
  if (!trainer?.photoStorageKey || !isDocumentStorageConfigured()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: corsHeaders(request) });
  }

  const bytes = await readDocumentBytes({ storageKey: trainer.photoStorageKey }).catch(() => null);
  if (!bytes) {
    return NextResponse.json({ error: "PHOTO_UNAVAILABLE" }, { status: 502, headers: corsHeaders(request) });
  }

  const ext = trainer.photoStorageKey.split(".").pop()?.toLowerCase() ?? "";
  const versioned = new URL(request.url).searchParams.has("v");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      ...corsHeaders(request),
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300, s-maxage=3600"
    }
  });
}
