import { DocumentType, UserRole } from "@gestionale/db";

import { getMissingDocumentTypes, hasRequiredDocuments } from "@/lib/documents";

describe("document requirements", () => {
  it("richiede tutti i documenti per un iscritto", () => {
    const missing = getMissingDocumentTypes(UserRole.SUBSCRIBER, [
      { type: DocumentType.TAX_CODE },
      { type: DocumentType.IDENTITY_DOCUMENT }
    ]);

    expect(missing).toEqual([DocumentType.MEDICAL_CERTIFICATE]);
    expect(
      hasRequiredDocuments(UserRole.SUBSCRIBER, [
        { type: DocumentType.TAX_CODE },
        { type: DocumentType.IDENTITY_DOCUMENT }
      ])
    ).toBe(false);
  });

  it("non vincola admin e istruttori", () => {
    expect(hasRequiredDocuments(UserRole.ADMIN, [])).toBe(true);
    expect(hasRequiredDocuments(UserRole.INSTRUCTOR, [])).toBe(true);
  });
});
