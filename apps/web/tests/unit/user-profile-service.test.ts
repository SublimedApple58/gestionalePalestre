import { DocumentType, UserRole, type PrismaClient } from "@gestionale/db";
import { describe, expect, it, vi } from "vitest";

import { updateUserProfileByAdmin } from "@/lib/services/user-profile-service";
import { adminUpdateProfileSchema, type AdminUpdateProfileInput } from "@/lib/validators/forms";

const current = {
  firstName: "Mario",
  lastName: "Rossi",
  email: "mario@example.com",
  phoneNumber: "3331234567",
  address: null,
  dateOfBirth: new Date("1990-05-04T00:00:00.000Z"),
  tuyaUserId: "tuya-1",
  documents: [{ extractedTaxCode: "RSSMRA90E04H501X" }]
};

const unchanged: AdminUpdateProfileInput = {
  targetUserId: "u1",
  firstName: "Mario",
  lastName: "Rossi",
  email: "mario@example.com",
  phoneNumber: "3331234567",
  address: null,
  dateOfBirth: "1990-05-04",
  taxCode: "RSSMRA90E04H501X"
};

function mockPrisma(user: unknown = current, clash: unknown = null) {
  const update = vi.fn().mockReturnValue("user-update");
  const updateMany = vi.fn().mockReturnValue("doc-update");
  const transaction = vi.fn().mockResolvedValue([]);
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      findFirst: vi.fn().mockResolvedValue(clash),
      update
    },
    userDocument: { updateMany },
    $transaction: transaction
  } as unknown as PrismaClient;
  return { prisma, update, updateMany, transaction };
}

describe("anagrafica modificata dall'admin", () => {
  it("solo un admin puo' modificare", async () => {
    const { prisma } = mockPrisma();
    await expect(updateUserProfileByAdmin(prisma, UserRole.INSTRUCTOR, unchanged)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  it("nessun campo cambiato → nessuna scrittura", async () => {
    const { prisma, transaction } = mockPrisma();
    const result = await updateUserProfileByAdmin(prisma, UserRole.ADMIN, unchanged);
    expect(result.changed).toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("scrive solo i campi cambiati e riporta before/after", async () => {
    const { prisma, update } = mockPrisma();
    const result = await updateUserProfileByAdmin(prisma, UserRole.ADMIN, {
      ...unchanged,
      lastName: "Bianchi",
      dateOfBirth: "1991-01-31"
    });
    expect(result.changed).toEqual(["lastName", "dateOfBirth"]);
    expect(result.before).toEqual({ lastName: "Rossi", dateOfBirth: "1990-05-04" });
    expect(result.after).toEqual({ lastName: "Bianchi", dateOfBirth: "1991-01-31" });
    expect(result.tuyaUserId).toBe("tuya-1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { lastName: "Bianchi", dateOfBirth: new Date("1991-01-31T00:00:00.000Z") }
    });
  });

  it("email gia' usata da un altro account (anche con maiuscole diverse) → errore", async () => {
    const { prisma, transaction } = mockPrisma(current, { id: "u2" });
    await expect(
      updateUserProfileByAdmin(prisma, UserRole.ADMIN, { ...unchanged, email: "Luca@Example.com" })
    ).rejects.toMatchObject({ code: "EMAIL_EXISTS" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: { not: "u1" }, email: { equals: "Luca@Example.com", mode: "insensitive" } },
      select: { id: true }
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("il codice fiscale si corregge sui documenti TAX_CODE", async () => {
    const { prisma, updateMany } = mockPrisma();
    await updateUserProfileByAdmin(prisma, UserRole.ADMIN, { ...unchanged, taxCode: "RSSMRA90E04H501Y" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", type: DocumentType.TAX_CODE },
      data: { extractedTaxCode: "RSSMRA90E04H501Y" }
    });
  });

  it("codice fiscale senza tessera caricata → errore chiaro", async () => {
    const { prisma } = mockPrisma({ ...current, documents: [] });
    await expect(
      updateUserProfileByAdmin(prisma, UserRole.ADMIN, { ...unchanged, taxCode: "RSSMRA90E04H501Y" })
    ).rejects.toMatchObject({ code: "TAX_CODE_NO_DOCUMENT" });
  });

  it("validazione: vuoti → null, CF normalizzato, data e telefono controllati", () => {
    const parsed = adminUpdateProfileSchema.parse({
      targetUserId: "u1",
      firstName: " Mario ",
      lastName: "Rossi",
      email: "mario@example.com",
      phoneNumber: "",
      address: "  ",
      dateOfBirth: "",
      taxCode: "rssmra 90e04 h501x"
    });
    expect(parsed).toMatchObject({
      firstName: "Mario",
      phoneNumber: null,
      address: null,
      dateOfBirth: null,
      taxCode: "RSSMRA90E04H501X"
    });
    expect(adminUpdateProfileSchema.safeParse({ ...unchanged, taxCode: "ABC" }).success).toBe(false);
    expect(adminUpdateProfileSchema.safeParse({ ...unchanged, dateOfBirth: "04/05/1990" }).success).toBe(false);
    expect(adminUpdateProfileSchema.safeParse({ ...unchanged, phoneNumber: "abc" }).success).toBe(false);
    expect(adminUpdateProfileSchema.safeParse({ ...unchanged, email: "non-una-email" }).success).toBe(false);
  });
});
