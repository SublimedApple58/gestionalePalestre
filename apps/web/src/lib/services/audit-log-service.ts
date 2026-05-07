import { type AuditAction, type Prisma, type PrismaClient } from "@gestionale/db";

/**
 * Crea un record di audit log per un'azione admin.
 *
 * Throw-safe: se la scrittura del log fallisce, l'errore viene swallowed e
 * il caller prosegue. Un audit log mancante non deve mai bloccare un'azione
 * legittima dell'admin (preferiamo gap nei log a downtime per i clienti).
 *
 * Il payload Json e' libero ma per le mutazioni di valore usiamo la convenzione
 *   { before: <valore precedente>, after: <valore nuovo> }
 * dove `before`/`after` sono oggetti anche minimali (es. { role: "..." }).
 */
export async function logAdminAction(
  prisma: PrismaClient,
  input: {
    actorId: string | null;
    targetUserId: string;
    action: AuditAction;
    payload?: Prisma.InputJsonValue;
  }
): Promise<void> {
  try {
    // Snapshot leggero dell'identita' del target — sopravvive alla cancellazione
    // dell'utente (FK SET NULL) e permette di mostrare il nome nei log storici.
    const target = await prisma.user
      .findUnique({
        where: { id: input.targetUserId },
        select: { firstName: true, lastName: true, email: true }
      })
      .catch(() => null);

    await prisma.userAuditLog.create({
      data: {
        actorId: input.actorId,
        targetUserId: input.targetUserId,
        action: input.action,
        payload: input.payload,
        targetSnapshot: target
          ? {
              firstName: target.firstName,
              lastName: target.lastName,
              email: target.email
            }
          : undefined
      }
    });
  } catch (e) {
    console.warn("[audit-log] failed to write entry:", {
      action: input.action,
      targetUserId: input.targetUserId,
      error: e instanceof Error ? e.message : String(e)
    });
  }
}

export type AuditLogRow = {
  id: string;
  action: AuditAction;
  payload: unknown;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string } | null;
  targetSnapshot: { firstName: string; lastName: string; email: string } | null;
};

/**
 * Legge gli audit log per un singolo utente, ordinati DESC. Cursor-based.
 */
export async function listAuditLogsForUser(
  prisma: PrismaClient,
  targetUserId: string,
  options: { cursor?: string; limit?: number } = {}
): Promise<{ items: AuditLogRow[]; nextCursor: string | null }> {
  const limit = options.limit ?? 30;

  const rows = await prisma.userAuditLog.findMany({
    where: { targetUserId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      payload: true,
      targetSnapshot: true,
      createdAt: true,
      actor: { select: { id: true, firstName: true, lastName: true } }
    }
  });

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: sliced.map((r) => ({
      id: r.id,
      action: r.action,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
      targetSnapshot: r.targetSnapshot as AuditLogRow["targetSnapshot"],
      actor: r.actor
        ? { id: r.actor.id, firstName: r.actor.firstName, lastName: r.actor.lastName }
        : null
    })),
    nextCursor: hasMore ? sliced[sliced.length - 1]!.id : null
  };
}
