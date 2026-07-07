"use server";

import { db } from "@gestionale/db";

import { getSessionUser } from "@/lib/session";
import { getPendingPolicies, getPolicyByKey, type PolicyDefinition } from "@/lib/policies";

/**
 * Ritorna le policy obbligatorie che l'utente loggato non ha ancora accettato.
 * Role-agnostico: vale per TUTTI gli utenti. Array vuoto se non loggato o se ha
 * già accettato tutto → il gate non si mostra.
 */
export async function getPendingPoliciesAction(): Promise<PolicyDefinition[]> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return [];
  return getPendingPolicies(db, sessionUser.id);
}

/**
 * Registra l'accettazione di una policy per l'utente loggato, alla versione
 * corrente. Idempotente: ri-accettare aggiorna versione + timestamp.
 */
export async function acceptPolicyAction(key: string): Promise<void> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return;

  const policy = getPolicyByKey(key);
  if (!policy) return;

  await db.policyAcceptance.upsert({
    where: { userId_policyKey: { userId: sessionUser.id, policyKey: policy.key } },
    create: { userId: sessionUser.id, policyKey: policy.key, version: policy.version },
    update: { version: policy.version, acceptedAt: new Date() }
  });
}
