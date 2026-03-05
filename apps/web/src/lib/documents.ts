import {
  DocumentSide,
  DocumentStatus,
  DocumentType,
  UserRole,
  type UserDocument
} from "@gestionale/db";

export type DocumentSlot = {
  type: DocumentType;
  side: DocumentSide;
};

export const REQUIRED_DOCUMENT_SLOTS_FOR_SUBSCRIBER: DocumentSlot[] = [
  { type: DocumentType.TAX_CODE, side: DocumentSide.FRONT },
  { type: DocumentType.TAX_CODE, side: DocumentSide.BACK },
  { type: DocumentType.IDENTITY_DOCUMENT, side: DocumentSide.FRONT },
  { type: DocumentType.IDENTITY_DOCUMENT, side: DocumentSide.BACK },
  { type: DocumentType.MEDICAL_CERTIFICATE, side: DocumentSide.SINGLE }
];

export const OPTIONAL_DOCUMENT_SLOTS: DocumentSlot[] = [
  { type: DocumentType.PROFILE_PHOTO, side: DocumentSide.SINGLE }
];

export const ALL_DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.TAX_CODE,
  DocumentType.IDENTITY_DOCUMENT,
  DocumentType.MEDICAL_CERTIFICATE,
  DocumentType.PROFILE_PHOTO
];

export const CORE_DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.TAX_CODE,
  DocumentType.IDENTITY_DOCUMENT,
  DocumentType.MEDICAL_CERTIFICATE
];

const SLOT_KEY_SEPARATOR = "::";

function buildSlotKey(type: DocumentType, side: DocumentSide): string {
  return `${type}${SLOT_KEY_SEPARATOR}${side}`;
}

function isDocumentApproved(document: Pick<UserDocument, "status">): boolean {
  return document.status === DocumentStatus.APPROVED;
}

function isMedicalCertificateExpired(
  document: Pick<UserDocument, "type" | "medicalCertificateExpiresAt">,
  now: Date
): boolean {
  if (document.type !== DocumentType.MEDICAL_CERTIFICATE) {
    return false;
  }

  if (!document.medicalCertificateExpiresAt) {
    return true;
  }

  return now > document.medicalCertificateExpiresAt;
}

export function documentTypeLabel(type: DocumentType): string {
  switch (type) {
    case DocumentType.TAX_CODE:
      return "Codice fiscale";
    case DocumentType.IDENTITY_DOCUMENT:
      return "Documento identita'";
    case DocumentType.MEDICAL_CERTIFICATE:
      return "Certificato medico";
    case DocumentType.PROFILE_PHOTO:
      return "Foto profilo";
    default:
      return type;
  }
}

export function documentSideLabel(side: DocumentSide): string {
  switch (side) {
    case DocumentSide.FRONT:
      return "Fronte";
    case DocumentSide.BACK:
      return "Retro";
    case DocumentSide.SINGLE:
      return "Singolo";
    default:
      return side;
  }
}

export function documentStatusLabel(status: DocumentStatus): string {
  switch (status) {
    case DocumentStatus.UPLOADED:
      return "Caricato";
    case DocumentStatus.AI_PROCESSING:
      return "In analisi";
    case DocumentStatus.NEEDS_REUPLOAD:
      return "Da rifare";
    case DocumentStatus.PENDING_ADMIN_REVIEW:
      return "In revisione admin";
    case DocumentStatus.APPROVED:
      return "Approvato";
    case DocumentStatus.REJECTED:
      return "Rifiutato";
    default:
      return status;
  }
}

export function getUploadSlotsForType(type: DocumentType): DocumentSide[] {
  switch (type) {
    case DocumentType.TAX_CODE:
    case DocumentType.IDENTITY_DOCUMENT:
      return [DocumentSide.FRONT, DocumentSide.BACK];
    case DocumentType.MEDICAL_CERTIFICATE:
    case DocumentType.PROFILE_PHOTO:
      return [DocumentSide.SINGLE];
    default:
      return [DocumentSide.SINGLE];
  }
}

export function getRequiredDocumentSlots(role: UserRole): DocumentSlot[] {
  if (role === UserRole.SUBSCRIBER) {
    return REQUIRED_DOCUMENT_SLOTS_FOR_SUBSCRIBER;
  }

  return [];
}

export function hasRequiredDocuments(
  role: UserRole,
  documents: Array<Pick<UserDocument, "type" | "side" | "status" | "medicalCertificateExpiresAt">>,
  now: Date = new Date()
): boolean {
  return getMissingDocumentSlots(role, documents, now).length === 0;
}

export function getMissingDocumentSlots(
  role: UserRole,
  documents: Array<Pick<UserDocument, "type" | "side" | "status" | "medicalCertificateExpiresAt">>,
  now: Date = new Date()
): DocumentSlot[] {
  const required = getRequiredDocumentSlots(role);

  if (required.length === 0) {
    return [];
  }

  const approvedBySlot = new Set(
    documents
      .filter((document) => isDocumentApproved(document) && !isMedicalCertificateExpired(document, now))
      .map((document) => buildSlotKey(document.type, document.side))
  );

  return required.filter((slot) => !approvedBySlot.has(buildSlotKey(slot.type, slot.side)));
}

export function getMissingDocumentTypes(
  role: UserRole,
  documents: Array<Pick<UserDocument, "type" | "side" | "status" | "medicalCertificateExpiresAt">>,
  now: Date = new Date()
): DocumentType[] {
  const missingSlots = getMissingDocumentSlots(role, documents, now);
  return Array.from(new Set(missingSlots.map((slot) => slot.type)));
}

export function getMissingOverallDocumentTypes(
  documents: Array<Pick<UserDocument, "type" | "side" | "status" | "medicalCertificateExpiresAt">>,
  now: Date = new Date()
): DocumentType[] {
  const presentAndApproved = new Set(
    documents
      .filter((document) => isDocumentApproved(document) && !isMedicalCertificateExpired(document, now))
      .map((document) => document.type)
  );

  return CORE_DOCUMENT_TYPES.filter((type) => !presentAndApproved.has(type));
}

export function getDocumentSlot<T extends Pick<UserDocument, "type" | "side">>(
  documents: T[],
  slot: DocumentSlot
): T | null {
  return documents.find((document) => document.type === slot.type && document.side === slot.side) ?? null;
}

export function countRemainingAiAttempts(
  document: Pick<UserDocument, "aiAttempts">,
  maxAttempts: number
): number {
  return Math.max(maxAttempts - document.aiAttempts, 0);
}
