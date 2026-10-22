"use server";

import { randomUUID } from "node:crypto";

import { db, UserRole } from "@gestionale/db";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/session";
import {
  assertMagicBytesMatchMimeType,
  createDocumentUploadUrl,
  deleteDocumentObject,
  isDocumentStorageConfigured,
  readDocumentBytes
} from "@/lib/services/document-storage-service";
import { DomainError } from "@/lib/services/errors";
import {
  deleteTrainer,
  moveTrainer,
  saveTrainer,
  setTrainerVisibility,
  type TrainerInput
} from "@/lib/services/trainer-service";
import {
  TRAINER_PHOTO_MAX_BYTES,
  TRAINER_PHOTO_MIME_TYPES,
  TRAINER_PHOTO_PREFIX
} from "@/lib/trainers";

export type TrainerActionResult = { ok: true; message: string } | { ok: false; message: string };

const PAGE = "/trainer";

function failure(e: unknown, context: string): { ok: false; message: string } {
  if (e instanceof DomainError) return { ok: false, message: e.message };
  console.error(`[trainer-actions] ${context}`, e);
  return { ok: false, message: "Errore imprevisto, riprova." };
}

/** Elimina un oggetto R2 senza mai far fallire l'azione (best effort). */
async function deletePhotoQuietly(storageKey: string | null): Promise<void> {
  if (!storageKey || !isDocumentStorageConfigured()) return;
  await deleteDocumentObject({ storageKey }).catch((e) =>
    console.warn("[trainer-actions] foto non cancellata da R2", storageKey, e)
  );
}

/**
 * URL presigned (PUT) per caricare la foto direttamente su R2 dal browser.
 * La chiave non dipende dal trainer: così funziona anche per uno nuovo, non
 * ancora salvato. Il collegamento avviene in `saveTrainerAction`.
 */
export async function createTrainerPhotoUploadUrlAction(input: {
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<{ ok: true; uploadUrl: string; storageKey: string } | { ok: false; message: string }> {
  await requireRole([UserRole.ADMIN]);
  try {
    if (!isDocumentStorageConfigured()) return { ok: false, message: "Storage foto non configurato." };
    if (!(TRAINER_PHOTO_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
      return { ok: false, message: "Formato non supportato: usa JPG, PNG o WEBP." };
    }
    if (!(input.fileSize > 0) || input.fileSize > TRAINER_PHOTO_MAX_BYTES) {
      return { ok: false, message: "La foto deve pesare al massimo 5 MB." };
    }
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[input.mimeType];
    const storageKey = `${TRAINER_PHOTO_PREFIX}${randomUUID()}/photo-${Date.now()}.${ext}`;
    const uploadUrl = await createDocumentUploadUrl({
      storageKey,
      contentType: input.mimeType,
      expiresInSeconds: 300
    });
    return { ok: true, uploadUrl, storageKey };
  } catch (e) {
    return failure(e, "upload-url");
  }
}

export async function saveTrainerAction(input: {
  id: string | null;
  firstName: string;
  lastName: string;
  bio: string;
  whatsappNumber: string;
  isVisible: boolean;
  /** Presente solo se è stata caricata una nuova foto. */
  newPhoto?: { storageKey: string; mimeType: string } | null;
}): Promise<TrainerActionResult> {
  const admin = await requireRole([UserRole.ADMIN]);
  try {

    const data: TrainerInput = {
      firstName: input.firstName,
      lastName: input.lastName,
      bio: input.bio,
      whatsappNumber: input.whatsappNumber,
      isVisible: input.isVisible
    };

    if (input.newPhoto) {
      const { storageKey, mimeType } = input.newPhoto;
      if (!storageKey.startsWith(TRAINER_PHOTO_PREFIX)) return { ok: false, message: "Foto non valida." };
      // Il file è arrivato davvero ed è l'immagine dichiarata?
      const head = await readDocumentBytes({ storageKey, byteRange: "bytes=0-15" }).catch(() => null);
      if (!head) return { ok: false, message: "Foto non trovata: ricaricala." };
      assertMagicBytesMatchMimeType(mimeType, head);
      data.photoStorageKey = storageKey;
    }

    const { replacedPhotoKey } = await saveTrainer(db, admin.id, input.id, data);
    await deletePhotoQuietly(replacedPhotoKey);

    revalidatePath(PAGE);
    return { ok: true, message: input.id ? "Trainer aggiornato." : "Trainer aggiunto." };
  } catch (e) {
    return failure(e, "save");
  }
}

export async function setTrainerVisibilityAction(id: string, isVisible: boolean): Promise<TrainerActionResult> {
  const admin = await requireRole([UserRole.ADMIN]);
  try {
    await setTrainerVisibility(db, admin.id, id, isVisible);
    revalidatePath(PAGE);
    return { ok: true, message: isVisible ? "Trainer visibile in app e sul sito." : "Trainer nascosto." };
  } catch (e) {
    return failure(e, "visibility");
  }
}

export async function moveTrainerAction(id: string, direction: -1 | 1): Promise<TrainerActionResult> {
  const admin = await requireRole([UserRole.ADMIN]);
  try {
    await moveTrainer(db, admin.id, id, direction);
    revalidatePath(PAGE);
    return { ok: true, message: "Ordine aggiornato." };
  } catch (e) {
    return failure(e, "move");
  }
}

export async function deleteTrainerAction(id: string): Promise<TrainerActionResult> {
  await requireRole([UserRole.ADMIN]);
  try {
    const photoKey = await deleteTrainer(db, id);
    await deletePhotoQuietly(photoKey);
    revalidatePath(PAGE);
    return { ok: true, message: "Trainer eliminato." };
  } catch (e) {
    return failure(e, "delete");
  }
}
