import { type PrismaClient } from "@gestionale/db";

import { shouldHaveDoorPin } from "@/lib/subscription";
import { setUserPermanent } from "@/lib/tuya/access-control";

export type PermanentReassertResult = {
  total: number; // member idonei con tuyaUserId processati
  ok: number; // setUserPermanent riusciti
  orphans: number; // [1109]/param illegal = tuyaUserId ORFANO (device non ha l'utente)
  errors: string[];
};

// Spaziatura tra chiamate: il device applica le operazioni in modo asincrono e
// la quota Tuya è limitata. 250ms tiene ~165 member ben entro i 300s di funzione.
const DELAY_MS = 250;

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Safety-net PERIODICO (settimanale): ri-afferma la validità PERMANENTE su tutti
 * i member idonei del tastierino.
 *
 * PERCHÉ SERVE: su questo device consumer i member possono restare/tornare con
 * una validità LIMITATA (codici OK di giorno, KO di notte). `assertUserPermanent`
 * alla (ri)attivazione del PIN è best-effort (un fallimento transitorio lascia il
 * member limitato in silenzio) e il reconcile notturno `runTuyaPinSyncJob` SALTA
 * i member già `tuyaPinActive` e presenti sul device → un limitato-silenzioso non
 * si auto-guarisce mai. Questo giro lo cura entro una settimana. È il "reassert-all
 * settimanale" previsto come rete di sicurezza per questa recidiva.
 *
 * CHEAP e SICURO: chiama SOLO `setUserPermanent` (schedule del member), NON tocca
 * le password → nessun rischio di corrompere un PIN funzionante. Idempotente:
 * ri-affermare "permanente" su chi lo è già è un no-op innocuo.
 *
 * Un `[1109] param is illegal` = tuyaUserId ORFANO (il device non ha più
 * quell'utente): qui viene solo CONTATO. Va risanato a parte con il resync
 * `?only=<code>&fresh=1` (ricrea member + PIN da zero); non lo facciamo qui per
 * tenere il giro cheap e senza riscrivere PIN.
 */
export async function runTuyaPermanentReassertJob(
  prisma: PrismaClient
): Promise<PermanentReassertResult> {
  const result: PermanentReassertResult = {
    total: 0,
    ok: 0,
    orphans: 0,
    errors: [],
  };

  const users = await prisma.user.findMany({
    where: { tuyaUserId: { not: null } },
    select: {
      firstName: true,
      lastName: true,
      accessCode: true,
      tuyaUserId: true,
      role: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true, autoRenew: true, arrearsSuspendedAt: true },
      },
      entryPackage: { select: { deactivatedAt: true, remainingEntries: true } },
    },
  });

  const eligible = users.filter((u) =>
    shouldHaveDoorPin({
      role: u.role,
      subscription: u.subscription,
      entryPackage: u.entryPackage,
    })
  );
  result.total = eligible.length;

  for (const u of eligible) {
    try {
      await setUserPermanent(u.tuyaUserId!);
      result.ok++;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("1109") || msg.toLowerCase().includes("param is illegal")) {
        // tuyaUserId orfano: il device non ha l'utente → serve `fresh` (resync route).
        result.orphans++;
      } else {
        result.errors.push(`${u.firstName} ${u.lastName} (${u.accessCode}): ${msg}`);
      }
    }
    await delay(DELAY_MS);
  }

  return result;
}
