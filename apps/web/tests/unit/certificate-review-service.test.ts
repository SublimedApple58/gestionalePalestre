import { describe, expect, it } from "vitest";
import { DocumentStatus, DocumentType, UserRole } from "@gestionale/db";

import {
  countMedicalCertificatesToReview,
  listMedicalCertificatesToReview
} from "@/lib/services/document-service";

/**
 * "Certificati da controllare" = MEDICAL_CERTIFICATE APPROVED con reviewedAt null
 * di un SUBSCRIBER (caricato/ricaricato dall'iscritto, non ancora spuntato).
 */
describe("certificati medici da controllare", () => {
  it("listMedicalCertificatesToReview filtra e mappa correttamente", async () => {
    let captured: Record<string, unknown> | null = null;
    const prisma = {
      userDocument: {
        findMany: async (args: Record<string, unknown>) => {
          captured = args;
          return [
            {
              id: "doc1",
              uploadedAt: new Date("2026-10-10T09:00:00Z"),
              storageKey: "docs/u1/cert.pdf",
              medicalCertificateExpiresAt: new Date("2027-01-01T00:00:00Z"),
              user: { id: "u1", firstName: "Mara", lastName: "Rossi" }
            }
          ];
        }
      }
    };

    const rows = await listMedicalCertificatesToReview(prisma as never, { take: 50 });

    expect((captured as unknown as { where: Record<string, unknown> }).where).toMatchObject({
      type: DocumentType.MEDICAL_CERTIFICATE,
      status: DocumentStatus.APPROVED,
      reviewedAt: null,
      user: { role: UserRole.SUBSCRIBER }
    });
    expect((captured as unknown as { take: number }).take).toBe(50);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      documentId: "doc1",
      userId: "u1",
      firstName: "Mara",
      lastName: "Rossi",
      storageKey: "docs/u1/cert.pdf"
    });
  });

  it("countMedicalCertificatesToReview usa lo stesso filtro", async () => {
    let captured: Record<string, unknown> | null = null;
    const prisma = {
      userDocument: {
        count: async (args: Record<string, unknown>) => {
          captured = args;
          return 7;
        }
      }
    };

    const n = await countMedicalCertificatesToReview(prisma as never);

    expect(n).toBe(7);
    expect((captured as unknown as { where: Record<string, unknown> }).where).toMatchObject({
      type: DocumentType.MEDICAL_CERTIFICATE,
      status: DocumentStatus.APPROVED,
      reviewedAt: null,
      user: { role: UserRole.SUBSCRIBER }
    });
  });
});
