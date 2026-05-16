import {
  AuditAction,
  UserRole,
  WorkoutSetType,
  WorkoutTemplateVisibility,
  type PrismaClient
} from "@gestionale/db";

import { logAdminAction } from "./audit-log-service";
import { DomainError } from "./errors";

/* ─── Tipi I/O ─────────────────────────────────────────────────────────── */

export type TemplateSetInput = {
  type: WorkoutSetType;
  reps: string;
  rir?: number | null;
  rest?: number | null;
  notes?: string | null;
};

export type TemplateExerciseInput = {
  exerciseId: string;
  notes?: string | null;
  sets: TemplateSetInput[];
};

export type TemplateSessionInput = {
  name: string;
  exercises: TemplateExerciseInput[];
};

export type CreateTemplateInput = {
  creatorId: string;
  name: string;
  description?: string | null;
  daysPerWeek: number;
  visibility?: WorkoutTemplateVisibility;
  sessions: TemplateSessionInput[];
};

export type UpdateTemplateInput = {
  templateId: string;
  actorId: string;
  name: string;
  description?: string | null;
  daysPerWeek: number;
  sessions: TemplateSessionInput[];
};

export type WorkoutTemplateDetail = {
  id: string;
  name: string;
  description: string | null;
  daysPerWeek: number;
  visibility: WorkoutTemplateVisibility;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
  sessions: Array<{
    id: string;
    order: number;
    name: string;
    exercises: Array<{
      id: string;
      order: number;
      exerciseId: string;
      exerciseName: string;
      notes: string | null;
      sets: Array<{
        id: string;
        order: number;
        type: WorkoutSetType;
        reps: string;
        rir: number | null;
        rest: number | null;
        notes: string | null;
      }>;
    }>;
  }>;
  assigneeIds: string[];
};

export type WorkoutTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  daysPerWeek: number;
  visibility: WorkoutTemplateVisibility;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
  assigneeCount: number;
  isAssignedToMe: boolean;
};

/* ─── Helpers di validazione ─────────────────────────────────────────── */

function assertCanCreateTemplates(role: UserRole): void {
  if (role !== UserRole.ADMIN && role !== UserRole.INSTRUCTOR) {
    throw new DomainError(
      "FORBIDDEN",
      "Solo admin e istruttori possono creare schede assegnabili."
    );
  }
}

function assertSessionsShape(sessions: TemplateSessionInput[]): void {
  if (sessions.length === 0) {
    throw new DomainError("INVALID", "La scheda deve avere almeno una seduta.");
  }
  for (const s of sessions) {
    if (!s.name?.trim()) {
      throw new DomainError("INVALID", "Ogni seduta deve avere un nome.");
    }
    if (s.exercises.length === 0) {
      throw new DomainError(
        "INVALID",
        `La seduta "${s.name}" deve avere almeno un esercizio.`
      );
    }
    for (const ex of s.exercises) {
      if (!ex.exerciseId) {
        throw new DomainError("INVALID", "Esercizio senza id catalogo.");
      }
      if (ex.sets.length === 0) {
        throw new DomainError(
          "INVALID",
          "Ogni esercizio deve avere almeno una serie."
        );
      }
      for (const set of ex.sets) {
        if (!set.reps?.trim()) {
          throw new DomainError("INVALID", "Ogni serie deve avere reps.");
        }
      }
    }
  }
}

/* ─── Catalogo esercizi ──────────────────────────────────────────────── */

export async function listExerciseCatalog(
  prisma: PrismaClient
): Promise<
  Array<{
    id: string;
    name: string;
    muscleGroup: string | null;
    equipment: string | null;
    isCustom: boolean;
  }>
> {
  const rows = await prisma.exercise.findMany({
    orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      muscleGroup: true,
      equipment: true,
      isCustom: true
    }
  });
  return rows;
}

export async function createCustomExercise(
  prisma: PrismaClient,
  input: {
    creatorId: string;
    name: string;
    muscleGroup?: string | null;
    equipment?: string | null;
    notes?: string | null;
  }
): Promise<{ id: string; name: string }> {
  const name = input.name.trim();
  if (name.length < 2) {
    throw new DomainError("INVALID", "Nome esercizio troppo corto.");
  }

  // Case-insensitive uniqueness: se esiste gia' uno con stesso nome (anche
  // case diverso), riusiamo.
  const existing = await prisma.exercise.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true }
  });
  if (existing) return existing;

  const created = await prisma.exercise.create({
    data: {
      name,
      muscleGroup: input.muscleGroup?.trim() || null,
      equipment: input.equipment?.trim() || null,
      notes: input.notes?.trim() || null,
      isCustom: true,
      createdById: input.creatorId
    },
    select: { id: true, name: true }
  });
  return created;
}

/**
 * Conta in quante schede (WorkoutTemplate) l'esercizio è referenziato,
 * con i nomi delle prime 20 schede impattate. Usato per la preview di
 * eliminazione: l'UI mostra "Esercizio in uso in N schede" e la lista
 * dei nomi, l'utente conferma e poi cascadiamo.
 */
export async function getExerciseUsage(
  prisma: PrismaClient,
  exerciseId: string
): Promise<{ count: number; templates: Array<{ id: string; name: string }> }> {
  // WorkoutTemplateExercise → WorkoutTemplateSession → WorkoutTemplate.
  // Conto le schede DISTINCT (un esercizio potrebbe comparire in più sedute
  // della stessa scheda — la conto una volta sola).
  const rows = await prisma.workoutTemplateExercise.findMany({
    where: { exerciseId },
    select: {
      session: { select: { template: { select: { id: true, name: true } } } }
    }
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.session.template.id, r.session.template.name);
  }
  const templates = [...map.entries()].map(([id, name]) => ({ id, name })).slice(0, 20);
  return { count: map.size, templates };
}

/**
 * Elimina un esercizio dal catalogo.
 *
 *  - Se `force=false` (default) e l'esercizio è in uso in almeno 1 scheda,
 *    NON elimina e ritorna `{ deleted: false, usage }` — il chiamante mostra
 *    la preview e chiede conferma.
 *  - Se `force=true` OR usage.count==0, esegue cascade transaction:
 *    DELETE WorkoutTemplateExercise (cascade sui set) → DELETE Exercise.
 *
 * Nota: lo schema ha `onDelete: Restrict` sulla FK, quindi serve la
 * cascade manuale nella transaction.
 */
export async function deleteExercise(
  prisma: PrismaClient,
  exerciseId: string,
  opts: { force?: boolean } = {}
): Promise<
  | { deleted: true }
  | { deleted: false; usage: { count: number; templates: Array<{ id: string; name: string }> } }
> {
  const usage = await getExerciseUsage(prisma, exerciseId);
  if (usage.count > 0 && !opts.force) {
    return { deleted: false, usage };
  }

  await prisma.$transaction(async (tx) => {
    if (usage.count > 0) {
      // Rimuovo tutte le occorrenze nelle schede (cascade a WorkoutTemplateSet).
      await tx.workoutTemplateExercise.deleteMany({ where: { exerciseId } });
    }
    await tx.exercise.delete({ where: { id: exerciseId } });
  });

  return { deleted: true };
}

/* ─── CRUD template ──────────────────────────────────────────────────── */

export async function createTemplate(
  prisma: PrismaClient,
  input: CreateTemplateInput,
  actorRole: UserRole
): Promise<{ id: string }> {
  assertCanCreateTemplates(actorRole);
  if (input.daysPerWeek < 1 || input.daysPerWeek > 7) {
    throw new DomainError("INVALID", "daysPerWeek deve essere tra 1 e 7.");
  }
  if (!input.name?.trim()) {
    throw new DomainError("INVALID", "Nome scheda obbligatorio.");
  }
  assertSessionsShape(input.sessions);

  // Pre-calcolo nomi esercizi (snapshot)
  const exerciseIds = Array.from(
    new Set(
      input.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))
    )
  );
  const exercises = await prisma.exercise.findMany({
    where: { id: { in: exerciseIds } },
    select: { id: true, name: true }
  });
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));
  for (const id of exerciseIds) {
    if (!nameById.has(id)) {
      throw new DomainError("INVALID", `Esercizio ${id} non trovato in catalogo.`);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const template = await tx.workoutTemplate.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        daysPerWeek: input.daysPerWeek,
        visibility: input.visibility ?? WorkoutTemplateVisibility.ASSIGNABLE,
        createdById: input.creatorId,
        sessions: {
          create: input.sessions.map((s, sIdx) => ({
            order: sIdx,
            name: s.name.trim(),
            exercises: {
              create: s.exercises.map((ex, eIdx) => ({
                order: eIdx,
                exerciseId: ex.exerciseId,
                exerciseName: nameById.get(ex.exerciseId)!,
                notes: ex.notes?.trim() || null,
                sets: {
                  create: ex.sets.map((set, setIdx) => ({
                    order: setIdx,
                    type: set.type,
                    reps: set.reps.trim(),
                    rir: set.rir ?? null,
                    rest: set.rest ?? null,
                    notes: set.notes?.trim() || null
                  }))
                }
              }))
            }
          }))
        }
      },
      select: { id: true }
    });
    return template;
  });

  return { id: result.id };
}

export async function updateTemplate(
  prisma: PrismaClient,
  input: UpdateTemplateInput
): Promise<void> {
  if (input.daysPerWeek < 1 || input.daysPerWeek > 7) {
    throw new DomainError("INVALID", "daysPerWeek deve essere tra 1 e 7.");
  }
  if (!input.name?.trim()) {
    throw new DomainError("INVALID", "Nome scheda obbligatorio.");
  }
  assertSessionsShape(input.sessions);

  const existing = await prisma.workoutTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, createdById: true }
  });
  if (!existing) {
    throw new DomainError("NOT_FOUND", "Scheda non trovata.");
  }
  if (existing.createdById !== input.actorId) {
    throw new DomainError(
      "FORBIDDEN",
      "Solo il creatore puo' modificare la scheda."
    );
  }

  const exerciseIds = Array.from(
    new Set(
      input.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))
    )
  );
  const exercises = await prisma.exercise.findMany({
    where: { id: { in: exerciseIds } },
    select: { id: true, name: true }
  });
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));
  for (const id of exerciseIds) {
    if (!nameById.has(id)) {
      throw new DomainError("INVALID", `Esercizio ${id} non trovato in catalogo.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    // Replace pattern: cancello le sessions vecchie (cascade su exercises/sets)
    // e ricreo da zero. Piu' semplice di un diff strutturato e i template
    // sono entita' piccole.
    await tx.workoutTemplateSession.deleteMany({
      where: { templateId: input.templateId }
    });

    await tx.workoutTemplate.update({
      where: { id: input.templateId },
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        daysPerWeek: input.daysPerWeek,
        sessions: {
          create: input.sessions.map((s, sIdx) => ({
            order: sIdx,
            name: s.name.trim(),
            exercises: {
              create: s.exercises.map((ex, eIdx) => ({
                order: eIdx,
                exerciseId: ex.exerciseId,
                exerciseName: nameById.get(ex.exerciseId)!,
                notes: ex.notes?.trim() || null,
                sets: {
                  create: ex.sets.map((set, setIdx) => ({
                    order: setIdx,
                    type: set.type,
                    reps: set.reps.trim(),
                    rir: set.rir ?? null,
                    rest: set.rest ?? null,
                    notes: set.notes?.trim() || null
                  }))
                }
              }))
            }
          }))
        }
      }
    });
  });
}

export async function deleteTemplate(
  prisma: PrismaClient,
  templateId: string,
  actorId: string
): Promise<void> {
  const existing = await prisma.workoutTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, createdById: true }
  });
  if (!existing) {
    throw new DomainError("NOT_FOUND", "Scheda non trovata.");
  }
  if (existing.createdById !== actorId) {
    throw new DomainError(
      "FORBIDDEN",
      "Solo il creatore puo' eliminare la scheda."
    );
  }
  // Cascade: rimuove sessions, exercises, sets, assignments.
  await prisma.workoutTemplate.delete({ where: { id: templateId } });
}

/* ─── Liste ──────────────────────────────────────────────────────────── */

/**
 * Lista template visibili all'utente in un colpo solo:
 * - se admin/instructor: schede da lui create + schede a lui assegnate
 * - se subscriber: solo schede a lui assegnate
 */
export async function listTemplatesForUser(
  prisma: PrismaClient,
  userId: string
): Promise<WorkoutTemplateSummary[]> {
  const rows = await prisma.workoutTemplate.findMany({
    where: {
      OR: [
        { createdById: userId },
        { assignments: { some: { userId } } }
      ]
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      daysPerWeek: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      createdBy: {
        select: { id: true, firstName: true, lastName: true, role: true }
      },
      assignments: {
        select: { userId: true }
      }
    }
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    daysPerWeek: r.daysPerWeek,
    visibility: r.visibility,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy,
    assigneeCount: r.assignments.length,
    isAssignedToMe: r.assignments.some((a) => a.userId === userId)
  }));
}

export async function getTemplateDetail(
  prisma: PrismaClient,
  templateId: string,
  requesterId: string
): Promise<WorkoutTemplateDetail> {
  const t = await prisma.workoutTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      name: true,
      description: true,
      daysPerWeek: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      createdBy: {
        select: { id: true, firstName: true, lastName: true, role: true }
      },
      assignments: { select: { userId: true } },
      sessions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          name: true,
          exercises: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              exerciseId: true,
              exerciseName: true,
              notes: true,
              sets: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  order: true,
                  type: true,
                  reps: true,
                  rir: true,
                  rest: true,
                  notes: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!t) {
    throw new DomainError("NOT_FOUND", "Scheda non trovata.");
  }

  const isCreator = t.createdById === requesterId;
  const isAssignee = t.assignments.some((a) => a.userId === requesterId);
  if (!isCreator && !isAssignee) {
    throw new DomainError("FORBIDDEN", "Non hai accesso a questa scheda.");
  }

  return {
    id: t.id,
    name: t.name,
    description: t.description,
    daysPerWeek: t.daysPerWeek,
    visibility: t.visibility,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    createdBy: t.createdBy,
    assigneeIds: t.assignments.map((a) => a.userId),
    sessions: t.sessions.map((s) => ({
      id: s.id,
      order: s.order,
      name: s.name,
      exercises: s.exercises.map((ex) => ({
        id: ex.id,
        order: ex.order,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        notes: ex.notes,
        sets: ex.sets.map((set) => ({
          id: set.id,
          order: set.order,
          type: set.type,
          reps: set.reps,
          rir: set.rir,
          rest: set.rest,
          notes: set.notes
        }))
      }))
    }))
  };
}

/* ─── Assegnazioni ───────────────────────────────────────────────────── */

export async function assignTemplate(
  prisma: PrismaClient,
  input: { templateId: string; userIds: string[]; actorId: string; actorRole: UserRole }
): Promise<{ assigned: string[]; alreadyAssigned: string[] }> {
  assertCanCreateTemplates(input.actorRole);
  if (input.userIds.length === 0) return { assigned: [], alreadyAssigned: [] };

  const template = await prisma.workoutTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, createdById: true, visibility: true }
  });
  if (!template) {
    throw new DomainError("NOT_FOUND", "Scheda non trovata.");
  }
  if (template.visibility !== WorkoutTemplateVisibility.ASSIGNABLE) {
    throw new DomainError(
      "INVALID",
      "Questa scheda non e' assegnabile."
    );
  }
  if (template.createdById !== input.actorId && input.actorRole !== UserRole.ADMIN) {
    throw new DomainError(
      "FORBIDDEN",
      "Solo il creatore o un admin puo' assegnare la scheda."
    );
  }

  // Per istruttori: solo i loro allievi
  if (input.actorRole === UserRole.INSTRUCTOR) {
    const validStudents = await prisma.user.findMany({
      where: {
        id: { in: input.userIds },
        assignedInstructorId: input.actorId
      },
      select: { id: true }
    });
    const validIds = new Set(validStudents.map((s) => s.id));
    const invalidIds = input.userIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new DomainError(
        "FORBIDDEN",
        "Puoi assegnare schede solo ai tuoi allievi."
      );
    }
  }

  const existing = await prisma.workoutAssignment.findMany({
    where: { templateId: input.templateId, userId: { in: input.userIds } },
    select: { userId: true }
  });
  const alreadyAssigned = new Set(existing.map((e) => e.userId));
  const toAssign = input.userIds.filter((id) => !alreadyAssigned.has(id));

  if (toAssign.length > 0) {
    await prisma.workoutAssignment.createMany({
      data: toAssign.map((userId) => ({
        templateId: input.templateId,
        userId,
        assignedById: input.actorId
      })),
      skipDuplicates: true
    });

    // Audit log per ogni assegnazione (utile in cronologia iscritto)
    for (const userId of toAssign) {
      await logAdminAction(prisma, {
        actorId: input.actorId,
        targetUserId: userId,
        action: AuditAction.WORKOUT_TEMPLATE_ASSIGNED,
        payload: { templateId: input.templateId }
      });
    }
  }

  return { assigned: toAssign, alreadyAssigned: Array.from(alreadyAssigned) };
}

export async function unassignTemplate(
  prisma: PrismaClient,
  input: { templateId: string; userIds: string[]; actorId: string; actorRole: UserRole }
): Promise<{ removed: string[] }> {
  assertCanCreateTemplates(input.actorRole);
  if (input.userIds.length === 0) return { removed: [] };

  const template = await prisma.workoutTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, createdById: true }
  });
  if (!template) {
    throw new DomainError("NOT_FOUND", "Scheda non trovata.");
  }
  if (template.createdById !== input.actorId && input.actorRole !== UserRole.ADMIN) {
    throw new DomainError(
      "FORBIDDEN",
      "Solo il creatore o un admin puo' rimuovere assegnazioni."
    );
  }

  const result = await prisma.workoutAssignment.deleteMany({
    where: { templateId: input.templateId, userId: { in: input.userIds } }
  });

  for (const userId of input.userIds) {
    await logAdminAction(prisma, {
      actorId: input.actorId,
      targetUserId: userId,
      action: AuditAction.WORKOUT_TEMPLATE_UNASSIGNED,
      payload: { templateId: input.templateId }
    });
  }

  return { removed: input.userIds.slice(0, result.count) };
}

/**
 * Lista utenti assegnabili dal punto di vista di actor:
 * - admin: tutti gli utenti tranne se stesso
 * - instructor: solo i suoi allievi (subscriber con assignedInstructorId === actorId)
 */
export async function listAssignableUsers(
  prisma: PrismaClient,
  actorId: string,
  actorRole: UserRole
): Promise<
  Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
  }>
> {
  if (actorRole === UserRole.ADMIN) {
    return await prisma.user.findMany({
      where: { id: { not: actorId } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, role: true }
    });
  }
  if (actorRole === UserRole.INSTRUCTOR) {
    return await prisma.user.findMany({
      where: { assignedInstructorId: actorId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, role: true }
    });
  }
  throw new DomainError("FORBIDDEN", "Ruolo non autorizzato.");
}
