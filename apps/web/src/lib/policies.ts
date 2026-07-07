import type { PrismaClient } from "@gestionale/db";

/**
 * Sistema generico di policy/regolamenti obbligatori.
 *
 * Il BACKEND è la fonte unica: qui si definiscono le policy richieste (chiave,
 * versione, contenuto strutturato a blocchi). Il gate bloccante generico (web +
 * mobile) mostra come step tutte le policy che l'utente non ha ancora accettato
 * alla versione corrente, con contatore "Passaggio X di Y". Per aggiungere una
 * nuova policy obbligatoria basta aggiungere una voce a REQUIRED_POLICIES: il
 * gate la mostrerà automaticamente a tutti gli utenti. Alzare `version` forza la
 * ri-accettazione.
 *
 * I tipi sono puri (nessun import server-only) così sono condivisibili con i
 * client. La versione mobile ridefinisce gli stessi tipi in `regloApi`/`api.ts`.
 */

export type PolicyBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; intro?: string; items: string[] }
  | { type: "callout"; text: string; highlight?: string };

export type PolicyDefinition = {
  key: string;
  version: number;
  title: string;
  eyebrow?: string;
  blocks: PolicyBlock[];
};

export const REQUIRED_POLICIES: PolicyDefinition[] = [
  {
    key: "H24_LIABILITY",
    version: 1,
    title: "Dichiarazione di responsabilità — Accesso H24",
    eyebrow: "Regolamento · obbligatorio",
    blocks: [
      {
        type: "paragraph",
        text: "Il sottoscritto dichiara di utilizzare la palestra in piena autonomia e sotto la propria esclusiva responsabilità, impegnandosi ad allenarsi nel rispetto delle proprie condizioni fisiche e di salute."
      },
      {
        type: "paragraph",
        text: "Nelle fasce orarie non presidiate dal personale, l'utente è consapevole che l'accesso avviene senza assistenza diretta e si impegna a utilizzare le attrezzature in modo corretto e prudente."
      },
      {
        type: "list",
        intro: "La struttura è dotata di:",
        items: [
          "Sistema di videosorveglianza attivo",
          "Defibrillatore (DAE) regolarmente disponibile",
          "Cartellonistica con le procedure e i numeri da contattare in caso di emergenza"
        ]
      },
      {
        type: "callout",
        highlight: "112",
        text: "In caso di malore, infortunio o altra situazione di emergenza, l'utente è tenuto ad attivare tempestivamente i soccorsi tramite il Numero Unico di Emergenza 112, seguendo le indicazioni riportate nella cartellonistica presente all'interno della struttura."
      },
      {
        type: "paragraph",
        text: "Con l'accesso alla palestra, l'utente dichiara di aver preso visione del presente regolamento e di accettarne integralmente il contenuto."
      }
    ]
  }
];

export function getPolicyByKey(key: string): PolicyDefinition | undefined {
  return REQUIRED_POLICIES.find((p) => p.key === key);
}

/**
 * Ritorna le policy che l'utente deve ancora accettare (nessuna accettazione,
 * oppure accettata a una versione precedente). Ordine = REQUIRED_POLICIES.
 */
export async function getPendingPolicies(
  prisma: PrismaClient,
  userId: string
): Promise<PolicyDefinition[]> {
  try {
    const accepted = await prisma.policyAcceptance.findMany({
      where: { userId },
      select: { policyKey: true, version: true }
    });
    const acceptedVersion = new Map(accepted.map((a) => [a.policyKey, a.version]));
    return REQUIRED_POLICIES.filter((p) => (acceptedVersion.get(p.key) ?? -1) < p.version);
  } catch (e) {
    // Fail-open: se la tabella non esiste ancora (migrazione non applicata) o la
    // query fallisce, non blocchiamo l'app (e non facciamo 500 su /me). Il gate
    // ricomparirà appena la query torna a funzionare.
    console.error("[policies] getPendingPolicies fallita:", e);
    return [];
  }
}
