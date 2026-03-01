import { DocumentType, UserRole, type UserDocument } from "@gestionale/db";

export const REQUIRED_DOCUMENTS_FOR_SUBSCRIBER: DocumentType[] = [
  DocumentType.TAX_CODE,
  DocumentType.IDENTITY_DOCUMENT,
  DocumentType.MEDICAL_CERTIFICATE
];

export const ALL_DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.TAX_CODE,
  DocumentType.IDENTITY_DOCUMENT,
  DocumentType.MEDICAL_CERTIFICATE
];

export function documentTypeLabel(type: DocumentType): string {
  switch (type) {
    case DocumentType.TAX_CODE:
      return "Codice fiscale";
    case DocumentType.IDENTITY_DOCUMENT:
      return "Documento identita'";
    case DocumentType.MEDICAL_CERTIFICATE:
      return "Certificato medico";
    default:
      return type;
  }
}

export function getRequiredDocumentTypes(role: UserRole): DocumentType[] {
  if (role === UserRole.SUBSCRIBER) {
    return REQUIRED_DOCUMENTS_FOR_SUBSCRIBER;
  }

  return [];
}

export function getMissingDocumentTypes(
  role: UserRole,
  documents: Array<Pick<UserDocument, "type">>
): DocumentType[] {
  const required = getRequiredDocumentTypes(role);
  const uploaded = new Set(documents.map((document) => document.type));

  return required.filter((documentType) => !uploaded.has(documentType));
}

export function hasRequiredDocuments(role: UserRole, documents: Array<Pick<UserDocument, "type">>): boolean {
  return getMissingDocumentTypes(role, documents).length === 0;
}

export function getMissingOverallDocumentTypes(
  documents: Array<Pick<UserDocument, "type">>
): DocumentType[] {
  const uploaded = new Set(documents.map((document) => document.type));

  return ALL_DOCUMENT_TYPES.filter((documentType) => !uploaded.has(documentType));
}
