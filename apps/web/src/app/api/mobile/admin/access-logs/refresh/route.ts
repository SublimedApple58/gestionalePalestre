import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { runTuyaAccessLogSyncJob } from "@/lib/services/tuya-access-log-sync-job";

export const runtime = "nodejs";
// Incremental pull (small windows): a minute is plenty.
export const maxDuration = 60;

/**
 * POST /api/mobile/admin/access-logs/refresh
 * 200: { ok: true, created: number }
 *
 * Sincronizza on-demand gli ingressi dal tastierino (Tuya) e li salva come
 * AccessEvent. Chiamato dal pulsante "Aggiorna" dell'app admin: sostituisce il
 * vecchio cron: le chiamate a Tuya avvengono solo quando un admin aggiorna.
 * Il client, dopo il 200, ricarica la lista con la GET paginata.
 */
export const POST = withMobileAuth(
  async () => {
    const result = await runTuyaAccessLogSyncJob(db);
    return NextResponse.json({ ok: true, created: result.created });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
