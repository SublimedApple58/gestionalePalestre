import { type PersonalTrainer, type PrismaClient } from "@gestionale/db";

import {
  normalizeItalianMobile,
  TRAINER_BIO_MAX_LENGTH,
  TRAINER_PHOTO_PREFIX
} from "@/lib/trainers";

import { DomainError } from "./errors";

export type TrainerInput = {
  firstName: string;
  lastName: string;
  bio: string;
  whatsappNumber: string;
  isVisible: boolean;
  /** undefined = invariata, null = rimuovi, string = nuova chiave R2. */
  photoStorageKey?: string | null;
};

function validate(input: TrainerInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const bio = input.bio.trim();
  if (!firstName || firstName.length > 60) throw new DomainError("INVALID_NAME", "Nome obbligatorio (max 60 caratteri).");
  if (!lastName || lastName.length > 60) throw new DomainError("INVALID_NAME", "Cognome obbligatorio (max 60 caratteri).");
  if (!bio) throw new DomainError("INVALID_BIO", "La bio è obbligatoria.");
  if (bio.length > TRAINER_BIO_MAX_LENGTH) {
    throw new DomainError("INVALID_BIO", `La bio può avere al massimo ${TRAINER_BIO_MAX_LENGTH} caratteri.`);
  }
  const whatsappNumber = normalizeItalianMobile(input.whatsappNumber);
  if (!whatsappNumber) {
    throw new DomainError("INVALID_PHONE", "Numero WhatsApp non valido: serve un cellulare italiano (es. 338 123 4567).");
  }
  if (input.photoStorageKey && !input.photoStorageKey.startsWith(TRAINER_PHOTO_PREFIX)) {
    throw new DomainError("INVALID_PHOTO", "Foto non valida.");
  }
  return { firstName, lastName, bio, whatsappNumber };
}

export function listTrainersForAdmin(prisma: PrismaClient): Promise<PersonalTrainer[]> {
  return prisma.personalTrainer.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

export function listVisibleTrainers(prisma: PrismaClient): Promise<PersonalTrainer[]> {
  return prisma.personalTrainer.findMany({
    where: { isVisible: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
}

/**
 * Crea o aggiorna un trainer. Ritorna anche la chiave della foto sostituita
 * (da cancellare su R2 dopo il commit, best effort).
 */
export async function saveTrainer(
  prisma: PrismaClient,
  actorId: string,
  id: string | null,
  input: TrainerInput
): Promise<{ trainer: PersonalTrainer; replacedPhotoKey: string | null }> {
  const data = validate(input);

  if (!id) {
    const last = await prisma.personalTrainer.aggregate({ _max: { sortOrder: true } });
    const trainer = await prisma.personalTrainer.create({
      data: {
        ...data,
        isVisible: input.isVisible,
        photoStorageKey: input.photoStorageKey ?? null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        updatedById: actorId
      }
    });
    return { trainer, replacedPhotoKey: null };
  }

  const existing = await prisma.personalTrainer.findUnique({ where: { id } });
  if (!existing) throw new DomainError("TRAINER_NOT_FOUND", "Trainer non trovato.");

  const trainer = await prisma.personalTrainer.update({
    where: { id },
    data: {
      ...data,
      isVisible: input.isVisible,
      ...(input.photoStorageKey !== undefined ? { photoStorageKey: input.photoStorageKey } : {}),
      updatedById: actorId
    }
  });
  const replacedPhotoKey =
    input.photoStorageKey !== undefined &&
    existing.photoStorageKey &&
    existing.photoStorageKey !== input.photoStorageKey
      ? existing.photoStorageKey
      : null;
  return { trainer, replacedPhotoKey };
}

export async function setTrainerVisibility(
  prisma: PrismaClient,
  actorId: string,
  id: string,
  isVisible: boolean
): Promise<void> {
  await prisma.personalTrainer.update({ where: { id }, data: { isVisible, updatedById: actorId } });
}

/** Sposta di una posizione (su = -1, giù = +1) e rinumera 0..n-1. */
export async function moveTrainer(
  prisma: PrismaClient,
  actorId: string,
  id: string,
  direction: -1 | 1
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const all = await tx.personalTrainer.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, sortOrder: true }
    });
    const from = all.findIndex((t) => t.id === id);
    if (from < 0) throw new DomainError("TRAINER_NOT_FOUND", "Trainer non trovato.");
    const to = from + direction;
    if (to < 0 || to >= all.length) return;
    const ordered = [...all];
    const moving = ordered[from]!;
    ordered[from] = ordered[to]!;
    ordered[to] = moving;
    for (const [index, t] of ordered.entries()) {
      if (t.sortOrder !== index || t.id === id) {
        await tx.personalTrainer.update({
          where: { id: t.id },
          data: { sortOrder: index, ...(t.id === id ? { updatedById: actorId } : {}) }
        });
      }
    }
  });
}

/** Elimina il trainer; ritorna la chiave foto da cancellare su R2. */
export async function deleteTrainer(prisma: PrismaClient, id: string): Promise<string | null> {
  const existing = await prisma.personalTrainer.findUnique({ where: { id }, select: { photoStorageKey: true } });
  if (!existing) throw new DomainError("TRAINER_NOT_FOUND", "Trainer non trovato.");
  await prisma.personalTrainer.delete({ where: { id } });
  return existing.photoStorageKey;
}
