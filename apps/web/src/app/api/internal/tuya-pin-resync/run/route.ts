import { AuditAction, db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { generateAccessCode } from "@/lib/access-code";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { ensureTuyaUser, recreateTuyaMember } from "@/lib/services/tuya-pin-service";
import { shouldHaveDoorPin } from "@/lib/subscription";
import { TuyaBudgetError, tuyaCallsUsed, withTuyaBudget } from "@/lib/tuya/client";
import { enablePin, setUserPermanent } from "@/lib/tuya/access-control";
import { withTuyaLock } from "@/lib/tuya/lock";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  return bearer === expected || headerSecret === expected;
}

/**
 * OPERAZIONI MANUALI CHE SCRIVONO SULLA SERRATURA TUYA.
 * (Le letture stanno in /api/internal/tuya-diag/run, che non può scrivere.)
 *
 * Regole (incidente 24/11/2026: una chiamata senza parametri riconosciuti faceva
 * una risync completa → ~1.000 chiamate, 207 PIN riscritti, iscritti chiusi fuori):
 *  - `?mode=` obbligatorio, da una lista chiusa. Mode o parametri sconosciuti → 400.
 *  - DRY-RUN di default: dice chi tocca e quante chiamate costa, non chiama Tuya.
 *    Scrive solo con `&apply=1`.
 *  - Budget di chiamate per invocazione imposto dal client Tuya (si ferma da solo).
 *  - Lock condiviso con i cron notturni: mai due scritture insieme (409).
 *
 *   ?mode=recreate&code=<codice>[&newcode=1]  ricrea il member (stesso codice o nuovo)  ~6
 *   ?mode=permanent&code=<codice>             ri-invia la validità permanente          ~2
 *   ?mode=pin&code=<codice>                   riscrive PIN + permanente di un iscritto ~5
 *   ?mode=full&confirm=<AAAA-MM-GG>&budget=N[&from=<userId>]
 *        risync completa (strumento di RECUPERO, es. serratura che ha perso i codici).
 *        Richiede: confirm = data di oggi (Europe/Rome), budget esplicito, e un
 *        dry-run con gli stessi parametri negli ultimi 15 minuti. Va a blocchi:
 *        si ferma prima di esaurire budget/tempo e restituisce `nextFrom` per
 *        riprendere. Mai lanciarla in un ciclo automatico.
 */
const PER_USER_CALLS = { recreate: 6, permanent: 2, pin: 5 } as const;
const SINGLE_BUDGET = 12; // tetto per le modalità su un singolo iscritto
const FULL_MAX_BUDGET = 1500;
const FULL_DRYRUN_KEY = "tuya:full-dryrun";
const FULL_DRYRUN_TTL_MS = 15 * 60_000;
const FULL_TIME_LIMIT_MS = 240_000; // margine sul maxDuration
const FULL_DELAY_MS = 1500; // non saturare la serratura (errori 2328 "operation in progress")

const MODES: Record<string, string[]> = {
  recreate: ["code", "newcode", "apply"],
  permanent: ["code", "apply"],
  pin: ["code", "apply"],
  full: ["confirm", "budget", "from", "apply"],
};

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function todayRome(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

/** Codice a 6 cifre non usato da nessun altro utente (accessCode non è @unique). */
async function generateUniqueAccessCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateAccessCode();
    const taken = await db.user.findFirst({ where: { accessCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("impossibile generare un codice univoco");
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") ?? "";
  const allowed = MODES[mode];
  if (!allowed) return bad(`mode mancante o sconosciuto; validi: ${Object.keys(MODES).join(", ")}`);
  const unknown = [...params.keys()].filter((k) => k !== "mode" && !allowed.includes(k));
  if (unknown.length) return bad(`parametri sconosciuti per ${mode}: ${unknown.join(", ")}`);
  const apply = params.get("apply") === "1";

  if (mode === "full") return full(params, apply);
  return single(mode as keyof typeof PER_USER_CALLS, params, apply);
}

// ── Singolo iscritto ──────────────────────────────────────────────────────────

async function single(
  mode: keyof typeof PER_USER_CALLS,
  params: URLSearchParams,
  apply: boolean
): Promise<NextResponse> {
  const code = params.get("code")?.trim();
  if (!code) return bad("manca code");
  const matches = await db.user.findMany({
    where: { accessCode: code },
    select: { id: true, firstName: true, lastName: true, accessCode: true, tuyaUserId: true },
  });
  const u = matches[0];
  if (!u || matches.length !== 1) return bad(`codice ${code}: ${matches.length} utenti (serve esattamente 1)`);
  const user = `${u.firstName} ${u.lastName}`;
  if (mode === "permanent" && !u.tuyaUserId) return bad(`${user}: nessun member Tuya`);

  if (!apply) {
    return NextResponse.json({
      mode,
      dryRun: true,
      user,
      code: u.accessCode,
      tuyaUserId: u.tuyaUserId,
      membersTouched: 1,
      estimatedCalls: PER_USER_CALLS[mode],
      budget: SINGLE_BUDGET,
      next: "ripeti con &apply=1 per eseguire",
    });
  }

  const run = async (): Promise<Record<string, unknown>> => {
    if (mode === "permanent") return { result: await setUserPermanent(u.tuyaUserId!) };
    if (mode === "pin") {
      const tuyaUserId = await ensureTuyaUser(db, u.id);
      const unlockNo = await enablePin(tuyaUserId, u.accessCode);
      await setUserPermanent(tuyaUserId).catch(() => {});
      await db.user.update({
        where: { id: u.id },
        data: { tuyaPinUnlockNo: unlockNo, tuyaPinActive: true },
      });
      return { tuyaUserId };
    }
    const newAccessCode = params.get("newcode") === "1" ? await generateUniqueAccessCode() : undefined;
    const r = await recreateTuyaMember(db, u.id, { newAccessCode });
    if (newAccessCode) {
      await logAdminAction(db, {
        actorId: null,
        targetUserId: u.id,
        action: AuditAction.PROFILE_UPDATED,
        payload: { before: { accessCode: "******" }, after: { accessCode: "nuovo" }, source: "tuya-pin-resync recreate&newcode" },
      });
    }
    return r;
  };

  const locked = await withTuyaLock(db, `manual:${mode}:${code}`, () =>
    withTuyaBudget({ max: SINGLE_BUDGET }, async () => {
      try {
        return await run();
      } catch (err) {
        return { error: (err as Error).message };
      }
    })
  );
  if ("busy" in locked) {
    return NextResponse.json({ mode, error: "TUYA_LOCKED", heldBy: locked.busy }, { status: 409 });
  }
  const { result, tuyaCalls } = locked.result;
  console.log(`[tuya-pin-resync] mode=${mode} code=${code} tuyaCalls=${tuyaCalls}`);
  return NextResponse.json({ mode, user, tuyaCalls, ...result }, { status: "error" in result ? 502 : 200 });
}

// ── Risync completa (recupero) ────────────────────────────────────────────────

async function full(params: URLSearchParams, apply: boolean): Promise<NextResponse> {
  const confirm = params.get("confirm");
  if (confirm !== todayRome()) return bad(`confirm deve essere la data di oggi (${todayRome()})`);
  const budget = Number(params.get("budget"));
  if (!Number.isInteger(budget) || budget < PER_USER_CALLS.pin || budget > FULL_MAX_BUDGET) {
    return bad(`budget obbligatorio, intero tra ${PER_USER_CALLS.pin} e ${FULL_MAX_BUDGET}`);
  }
  const from = params.get("from")?.trim() || undefined;

  const users = await db.user.findMany({
    where: from ? { id: { gt: from } } : undefined,
    orderBy: { id: "asc" },
    select: {
      id: true,
      role: true,
      accessCode: true,
      firstName: true,
      lastName: true,
      subscription: { select: { startsAt: true, endsAt: true, deactivatedAt: true, autoRenew: true, arrearsSuspendedAt: true } },
      entryPackage: { select: { deactivatedAt: true, remainingEntries: true } },
    },
  });
  const eligible = users.filter((u) =>
    shouldHaveDoorPin({ role: u.role, subscription: u.subscription, entryPackage: u.entryPackage })
  );
  const perRun = Math.min(eligible.length, Math.floor(budget / PER_USER_CALLS.pin));
  const fingerprint = `${confirm}|${budget}|${from ?? ""}|${eligible.length}`;

  if (!apply) {
    const value = `${Date.now()}|${fingerprint}`;
    await db.appConfig.upsert({
      where: { key: FULL_DRYRUN_KEY },
      create: { key: FULL_DRYRUN_KEY, value },
      update: { value },
    });
    return NextResponse.json({
      mode: "full",
      dryRun: true,
      membersEligible: eligible.length,
      membersThisRun: perRun,
      estimatedCallsThisRun: perRun * PER_USER_CALLS.pin,
      estimatedCallsTotal: eligible.length * PER_USER_CALLS.pin,
      next: "ripeti con gli stessi parametri + &apply=1 entro 15 minuti",
    });
  }

  const dry = await db.appConfig.findUnique({ where: { key: FULL_DRYRUN_KEY } });
  const [dryAt, ...dryFp] = (dry?.value ?? "").split("|");
  if (!dry || Date.now() - Number(dryAt) > FULL_DRYRUN_TTL_MS || dryFp.join("|") !== fingerprint) {
    return bad("serve un dry-run con gli stessi parametri negli ultimi 15 minuti");
  }
  await db.appConfig.delete({ where: { key: FULL_DRYRUN_KEY } }); // un dry-run = un'esecuzione

  const started = Date.now();
  const summary = { resynced: 0, errors: [] as string[], nextFrom: null as string | null };
  const locked = await withTuyaLock(db, "manual:full", () =>
    withTuyaBudget({ max: budget }, async () => {
      for (const u of eligible) {
        // Mai iniziare un iscritto che non si può finire (budget o tempo).
        if (budget - tuyaCallsUsed() < PER_USER_CALLS.pin || Date.now() - started > FULL_TIME_LIMIT_MS) {
          summary.nextFrom = u.id;
          break;
        }
        try {
          const tuyaUserId = await ensureTuyaUser(db, u.id);
          const unlockNo = await enablePin(tuyaUserId, u.accessCode);
          await setUserPermanent(tuyaUserId).catch(() => {});
          await db.user.update({ where: { id: u.id }, data: { tuyaPinUnlockNo: unlockNo, tuyaPinActive: true } });
          summary.resynced++;
        } catch (err) {
          summary.errors.push(`${u.firstName} ${u.lastName} (${u.accessCode}): ${(err as Error).message}`);
          if (err instanceof TuyaBudgetError) {
            summary.nextFrom = u.id;
            break;
          }
        }
        await delay(FULL_DELAY_MS);
      }
    })
  );
  if ("busy" in locked) {
    return NextResponse.json({ mode: "full", error: "TUYA_LOCKED", heldBy: locked.busy }, { status: 409 });
  }
  const tuyaCalls = locked.result.tuyaCalls;
  console.log(
    `[tuya-pin-resync] mode=full tuyaCalls=${tuyaCalls} resynced=${summary.resynced} errors=${summary.errors.length} nextFrom=${summary.nextFrom}`
  );
  return NextResponse.json({ mode: "full", tuyaCalls, ...summary });
}
