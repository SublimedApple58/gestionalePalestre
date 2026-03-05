import { DocumentSide, DocumentStatus, DocumentType, UserRole } from "@gestionale/db";

import {
  getMissingDocumentSlots,
  getMissingDocumentTypes,
  getMissingOverallDocumentTypes,
  hasRequiredDocuments
} from "@/lib/documents";

describe("document requirements", () => {
  it("richiede lato fronte/retro per codice fiscale e documento identita'", () => {
    const documents = [
      {
        type: DocumentType.TAX_CODE,
        side: DocumentSide.FRONT,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: null
      },
      {
        type: DocumentType.IDENTITY_DOCUMENT,
        side: DocumentSide.FRONT,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: null
      }
    ];

    const missingSlots = getMissingDocumentSlots(UserRole.SUBSCRIBER, documents);
    const missingTypes = getMissingDocumentTypes(UserRole.SUBSCRIBER, documents);

    expect(missingSlots).toEqual([
      { type: DocumentType.TAX_CODE, side: DocumentSide.BACK },
      { type: DocumentType.IDENTITY_DOCUMENT, side: DocumentSide.BACK },
      { type: DocumentType.MEDICAL_CERTIFICATE, side: DocumentSide.SINGLE }
    ]);

    expect(missingTypes).toEqual([
      DocumentType.TAX_CODE,
      DocumentType.IDENTITY_DOCUMENT,
      DocumentType.MEDICAL_CERTIFICATE
    ]);

    expect(hasRequiredDocuments(UserRole.SUBSCRIBER, documents)).toBe(false);
  });

  it("non vincola admin e istruttori", () => {
    expect(hasRequiredDocuments(UserRole.ADMIN, [])).toBe(true);
    expect(hasRequiredDocuments(UserRole.INSTRUCTOR, [])).toBe(true);
  });

  it("considera il certificato medico scaduto come mancante", () => {
    const documents = [
      {
        type: DocumentType.TAX_CODE,
        side: DocumentSide.FRONT,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: null
      },
      {
        type: DocumentType.TAX_CODE,
        side: DocumentSide.BACK,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: null
      },
      {
        type: DocumentType.IDENTITY_DOCUMENT,
        side: DocumentSide.FRONT,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: null
      },
      {
        type: DocumentType.IDENTITY_DOCUMENT,
        side: DocumentSide.BACK,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: null
      },
      {
        type: DocumentType.MEDICAL_CERTIFICATE,
        side: DocumentSide.SINGLE,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: new Date("2025-01-01T00:00:00.000Z")
      }
    ];

    const now = new Date("2026-03-01T00:00:00.000Z");

    expect(hasRequiredDocuments(UserRole.SUBSCRIBER, documents, now)).toBe(false);
    expect(getMissingDocumentTypes(UserRole.SUBSCRIBER, documents, now)).toEqual([
      DocumentType.MEDICAL_CERTIFICATE
    ]);
  });

  it("calcola i documenti core mancanti in generale", () => {
    const missing = getMissingOverallDocumentTypes([
      {
        type: DocumentType.TAX_CODE,
        side: DocumentSide.FRONT,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: null
      }
    ]);

    expect(missing).toEqual([DocumentType.IDENTITY_DOCUMENT, DocumentType.MEDICAL_CERTIFICATE]);
  });
});
