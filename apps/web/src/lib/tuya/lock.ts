import { type PrismaClient } from "@gestionale/db";

/**
 * Lock unico per le operazioni Tuya che SCRIVONO (cron notturni + route manuali):
 * mai due esecuzioni insieme sulla serratura. Una riga in `AppConfig`
 * (`tuya:lock` = "<scadenza ms>|<owner>") invece di un advisory lock Postgres,
 * che dietro il pooler di Neon (transaction mode) non è affidabile.
 * Il TTL copre il maxDuration delle route (300s): un lock orfano (funzione
 * uccisa dal timeout) scade da solo.
 */
const LOCK_KEY = "tuya:lock";
const DEFAULT_TTL_MS = 310_000;

export type TuyaLock = { value: string; owner: string };

export async function acquireTuyaLock(
  prisma: PrismaClient,
  owner: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<TuyaLock | { heldBy: string }> {
  const value = `${Date.now() + ttlMs}|${owner}`;
  try {
    await prisma.appConfig.create({ data: { key: LOCK_KEY, value } });
    return { value, owner };
  } catch {
    // Esiste già: lo prendiamo solo se è scaduto (compare-and-swap sul valore letto).
  }
  const current = await prisma.appConfig.findUnique({ where: { key: LOCK_KEY } });
  if (current) {
    const [expiresAt, heldBy = "?"] = current.value.split("|");
    if (Number(expiresAt) > Date.now()) return { heldBy };
    const swapped = await prisma.appConfig.updateMany({
      where: { key: LOCK_KEY, value: current.value },
      data: { value },
    });
    if (swapped.count === 1) return { value, owner };
    return { heldBy: "?" };
  }
  // Rilasciato tra create e findUnique: un solo nuovo tentativo.
  try {
    await prisma.appConfig.create({ data: { key: LOCK_KEY, value } });
    return { value, owner };
  } catch {
    return { heldBy: "?" };
  }
}

export async function releaseTuyaLock(prisma: PrismaClient, lock: TuyaLock): Promise<void> {
  await prisma.appConfig.deleteMany({ where: { key: LOCK_KEY, value: lock.value } });
}

/** Esegue `fn` sotto lock; se è già preso restituisce `{ busy: owner }` senza eseguire. */
export async function withTuyaLock<T>(
  prisma: PrismaClient,
  owner: string,
  fn: () => Promise<T>
): Promise<{ busy: string } | { result: T }> {
  const lock = await acquireTuyaLock(prisma, owner);
  if ("heldBy" in lock) return { busy: lock.heldBy };
  try {
    return { result: await fn() };
  } finally {
    await releaseTuyaLock(prisma, lock).catch(() => {});
  }
}
