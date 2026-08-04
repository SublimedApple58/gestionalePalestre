import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/app-config
 * PUBBLICO (nessuna auth): il client lo chiama all'avvio, anche prima del login,
 * per decidere se mostrare il gate "forza aggiornamento".
 *
 * Ritorna:
 *  - minSupportedVersion: versione minima dell'app mobile ancora supportata.
 *    Se l'app corrente e' piu' vecchia, il client mostra un gate bloccante.
 *  - storeUrl.ios / storeUrl.android: link alle schede store per aggiornare.
 *
 * Fail-open: se il DB non risponde o le chiavi mancano, ritorna un minimo "0.0.0"
 * che NON blocca nessuno — mai bloccare l'app per un errore infrastrutturale.
 */

// Default sicuri (fail-open). "0.0.0" <= qualsiasi versione reale → gate spento.
const FALLBACK_MIN_VERSION = "0.0.0";
const FALLBACK_IOS_STORE_URL = "https://apps.apple.com/app/house-of-muscle";
const FALLBACK_ANDROID_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.houseofmuscle.gestionale";

export async function GET() {
  let minSupportedVersion = FALLBACK_MIN_VERSION;
  let iosStoreUrl = FALLBACK_IOS_STORE_URL;
  let androidStoreUrl = FALLBACK_ANDROID_STORE_URL;

  try {
    const rows = await db.appConfig.findMany({
      where: { key: { in: ["minSupportedVersion", "iosStoreUrl", "androidStoreUrl"] } },
      select: { key: true, value: true }
    });
    for (const row of rows) {
      if (row.key === "minSupportedVersion" && row.value) minSupportedVersion = row.value;
      if (row.key === "iosStoreUrl" && row.value) iosStoreUrl = row.value;
      if (row.key === "androidStoreUrl" && row.value) androidStoreUrl = row.value;
    }
  } catch (e) {
    console.error("[mobile/app-config] DB read failed, failing open:", e);
  }

  return NextResponse.json({
    minSupportedVersion,
    storeUrl: { ios: iosStoreUrl, android: androidStoreUrl }
  });
}
