import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { listVisibleTrainers } from "@/lib/services/trainer-service";
import { toPublicTrainer } from "@/lib/trainers";

import { corsHeaders } from "./cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/public/trainers — pubblico, senza autenticazione.
 *
 * Lista UNICA dei personal trainer visibili, nell'ordine scelto dalla
 * reception. La usano l'app iscritti e il sito houseofmuscle.it.
 * 200: { trainers: PublicTrainer[] } — solo campi pubblici.
 * Cache CDN 5 minuti + stale-while-revalidate: una modifica in admin compare
 * entro ~5 minuti, e il DB non viene interrogato a ogni visita del sito.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const trainers = await listVisibleTrainers(db);
  return NextResponse.json(
    { trainers: trainers.map((t) => toPublicTrainer(t, origin)) },
    {
      headers: {
        ...corsHeaders(request),
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400"
      }
    }
  );
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
