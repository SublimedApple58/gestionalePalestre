import { type PrismaClient } from "@gestionale/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Personal trainer: lista UNICA gestita dalla reception (ADMIN) e letta da
 * app iscritti e sito houseofmuscle.it tramite l'API pubblica.
 */

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  bio: string;
  whatsappNumber: string;
  photoStorageKey: string | null;
  sortOrder: number;
  isVisible: boolean;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const ctl = vi.hoisted(() => {
  const state = { rows: [] as Row[], seq: 0 };
  const sorted = () => [...state.rows].sort((a, b) => a.sortOrder - b.sortOrder || +a.createdAt - +b.createdAt);
  const table = {
    findMany: async ({ where }: { where?: { isVisible?: boolean } } = {}) =>
      sorted()
        .filter((r) => where?.isVisible === undefined || r.isVisible === where.isVisible)
        .map((r) => ({ ...r })),
    findUnique: async ({ where }: { where: { id: string } }) => {
      const r = state.rows.find((x) => x.id === where.id);
      return r ? { ...r } : null;
    },
    findFirst: async ({ where }: { where: { id: string; isVisible?: boolean } }) => {
      const r = state.rows.find((x) => x.id === where.id && (where.isVisible === undefined || x.isVisible === where.isVisible));
      return r ? { ...r } : null;
    },
    aggregate: async () => ({ _max: { sortOrder: state.rows.length ? Math.max(...state.rows.map((r) => r.sortOrder)) : null } }),
    create: async ({ data }: { data: Partial<Row> }) => {
      const now = new Date(Date.UTC(2026, 9, 23, 9, 0, state.seq));
      const row = { id: `t${++state.seq}`, photoStorageKey: null, updatedById: null, createdAt: now, updatedAt: now, ...data } as Row;
      state.rows.push(row);
      return { ...row };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const r = state.rows.find((x) => x.id === where.id);
      if (!r) throw new Error("not found");
      Object.assign(r, data, { updatedAt: new Date(+r.updatedAt + 1000) });
      return { ...r };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      state.rows = state.rows.filter((x) => x.id !== where.id);
    }
  };
  const db = {
    personalTrainer: table,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ personalTrainer: table })
  };
  return { state, db };
});

vi.mock("@gestionale/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gestionale/db")>()),
  db: ctl.db
}));

vi.mock("@/lib/services/document-storage-service", () => ({
  isDocumentStorageConfigured: () => true,
  readDocumentBytes: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
}));

import { GET as getTrainers, OPTIONS as optionsTrainers } from "@/app/api/public/trainers/route";
import { GET as getPhoto } from "@/app/api/public/trainers/[id]/photo/route";
import { getAppNavigationItems } from "@/lib/navigation";
import { moveTrainer, saveTrainer, deleteTrainer, listVisibleTrainers } from "@/lib/services/trainer-service";
import {
  bioPlainText,
  formatItalianMobile,
  normalizeItalianMobile,
  parseBio,
  parseBioInline,
  toPublicTrainer,
  whatsappLink
} from "@/lib/trainers";
import { UserRole } from "@gestionale/db";

const prisma = ctl.db as unknown as PrismaClient;

const base = { bio: "Bio **forte**.", whatsappNumber: "338 864 6144", isVisible: true };

beforeEach(() => {
  ctl.state.rows = [];
  ctl.state.seq = 0;
});

describe("helper trainer", () => {
  it("normalizza i cellulari italiani e scarta il resto", () => {
    expect(normalizeItalianMobile("338 864 6144")).toBe("3388646144");
    expect(normalizeItalianMobile("+39 328-945-3025")).toBe("3289453025");
    expect(normalizeItalianMobile("0039 3663430272")).toBe("3663430272");
    expect(normalizeItalianMobile("06 1234567")).toBeNull();
    expect(normalizeItalianMobile("338")).toBeNull();
    expect(normalizeItalianMobile("")).toBeNull();
  });

  it("costruisce il link WhatsApp e il formato leggibile", () => {
    expect(whatsappLink("3398378245")).toBe("https://wa.me/393398378245");
    expect(formatItalianMobile("3398378245")).toBe("339 837 8245");
  });

  it("interpreta grassetti, paragrafi ed elenchi della bio", () => {
    const blocks = parseBio(
      "Personal Trainer specializzato in:\n• **dimagrimento** donna,\n• preparazione per **sport agonistici**\n\nObiettivo: **risultati concreti**."
    );
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "bullet", "bullet", "paragraph"]);
    expect(blocks[1]!.segments).toEqual([
      { text: "dimagrimento", bold: true },
      { text: " donna,", bold: false }
    ]);
    // Una riga che inizia in grassetto NON è un elenco.
    expect(parseBio("**Niente schede standard:** il percorso")[0]!.kind).toBe("paragraph");
    expect(bioPlainText("Ciao **mondo**")).toBe("Ciao mondo");
    expect(parseBioInline("==Niente schede standard:== **il percorso**")).toEqual([
      { text: "Niente schede standard:", bold: true, accent: true },
      { text: " ", bold: false },
      { text: "il percorso", bold: true }
    ]);
  });

  it("espone solo i campi pubblici, con foto versionata", () => {
    const pub = toPublicTrainer(
      {
        id: "t1",
        firstName: "Simone",
        lastName: "Calandrini",
        bio: "x",
        whatsappNumber: "3388646144",
        photoStorageKey: "trainers/a/photo.jpg",
        updatedAt: new Date(1000)
      },
      "https://app.houseofmuscle.it"
    );
    expect(pub).toEqual({
      id: "t1",
      firstName: "Simone",
      lastName: "Calandrini",
      bio: "x",
      whatsappUrl: "https://wa.me/393388646144",
      photoUrl: "https://app.houseofmuscle.it/api/public/trainers/t1/photo?v=1000"
    });
    expect(pub).not.toHaveProperty("whatsappNumber");
  });
});

describe("trainer service", () => {
  it("crea in coda, valida numero e salva il numero normalizzato", async () => {
    const a = await saveTrainer(prisma, "admin1", null, { ...base, firstName: "Simone", lastName: "Calandrini" });
    const b = await saveTrainer(prisma, "admin1", null, { ...base, firstName: "Valentina", lastName: "Palantrani" });
    expect(a.trainer.sortOrder).toBe(0);
    expect(b.trainer.sortOrder).toBe(1);
    expect(a.trainer.whatsappNumber).toBe("3388646144");
    expect(a.trainer.updatedById).toBe("admin1");
    await expect(
      saveTrainer(prisma, "admin1", null, { ...base, whatsappNumber: "06 123", firstName: "X", lastName: "Y" })
    ).rejects.toMatchObject({ code: "INVALID_PHONE" });
    await expect(
      saveTrainer(prisma, "admin1", null, { ...base, bio: "  ", firstName: "X", lastName: "Y" })
    ).rejects.toMatchObject({ code: "INVALID_BIO" });
  });

  it("sostituendo la foto ritorna la vecchia chiave da cancellare; senza foto nuova la lascia", async () => {
    const { trainer } = await saveTrainer(prisma, "a", null, {
      ...base,
      firstName: "S",
      lastName: "C",
      photoStorageKey: "trainers/old/photo.jpg"
    });
    const keep = await saveTrainer(prisma, "a", trainer.id, { ...base, firstName: "S", lastName: "C" });
    expect(keep.replacedPhotoKey).toBeNull();
    expect(keep.trainer.photoStorageKey).toBe("trainers/old/photo.jpg");
    const swap = await saveTrainer(prisma, "a", trainer.id, {
      ...base,
      firstName: "S",
      lastName: "C",
      photoStorageKey: "trainers/new/photo.jpg"
    });
    expect(swap.replacedPhotoKey).toBe("trainers/old/photo.jpg");
    await expect(
      saveTrainer(prisma, "a", trainer.id, { ...base, firstName: "S", lastName: "C", photoStorageKey: "users/x/doc.jpg" })
    ).rejects.toMatchObject({ code: "INVALID_PHOTO" });
  });

  it("riordina su/giù e ignora gli spostamenti oltre i bordi", async () => {
    for (const n of ["A", "B", "C"]) await saveTrainer(prisma, "a", null, { ...base, firstName: n, lastName: n });
    const [a, , c] = ctl.state.rows as [Row, Row, Row];
    await moveTrainer(prisma, "a", c.id, -1);
    expect((await listVisibleTrainers(prisma)).map((t) => t.firstName)).toEqual(["A", "C", "B"]);
    await moveTrainer(prisma, "a", a.id, -1);
    expect((await listVisibleTrainers(prisma)).map((t) => t.firstName)).toEqual(["A", "C", "B"]);
  });

  it("eliminando ritorna la foto da cancellare", async () => {
    const { trainer } = await saveTrainer(prisma, "a", null, { ...base, firstName: "S", lastName: "C", photoStorageKey: "trainers/x/p.jpg" });
    expect(await deleteTrainer(prisma, trainer.id)).toBe("trainers/x/p.jpg");
    expect(ctl.state.rows).toHaveLength(0);
  });
});

describe("API pubblica /api/public/trainers", () => {
  it("restituisce solo i visibili, in ordine, con CORS per il sito e cache CDN", async () => {
    await saveTrainer(prisma, "a", null, { ...base, firstName: "Simone", lastName: "C", photoStorageKey: "trainers/s/p.jpg" });
    await saveTrainer(prisma, "a", null, { ...base, firstName: "Nascosto", lastName: "N", isVisible: false });
    await saveTrainer(prisma, "a", null, { ...base, firstName: "Jacopo", lastName: "D" });

    const res = await getTrainers(
      new Request("https://app.houseofmuscle.it/api/public/trainers", { headers: { origin: "https://houseofmuscle.it" } })
    );
    const body = await res.json();
    expect(body.trainers.map((t: { firstName: string }) => t.firstName)).toEqual(["Simone", "Jacopo"]);
    expect(body.trainers[0].photoUrl).toMatch(/^https:\/\/app\.houseofmuscle\.it\/api\/public\/trainers\/t1\/photo\?v=\d+$/);
    expect(body.trainers[1].photoUrl).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBe("https://houseofmuscle.it");
    expect(res.headers.get("cache-control")).toContain("s-maxage=300");
  });

  it("non concede CORS a domini estranei", async () => {
    const res = await optionsTrainers(
      new Request("https://app.houseofmuscle.it/api/public/trainers", { headers: { origin: "https://evil.example" } })
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serve la foto dei visibili con cache immutabile e 404 per i nascosti", async () => {
    const vis = await saveTrainer(prisma, "a", null, { ...base, firstName: "S", lastName: "C", photoStorageKey: "trainers/s/p.jpg" });
    const hid = await saveTrainer(prisma, "a", null, { ...base, firstName: "H", lastName: "H", isVisible: false, photoStorageKey: "trainers/h/p.jpg" });

    const ok = await getPhoto(new Request(`https://app.houseofmuscle.it/api/public/trainers/${vis.trainer.id}/photo?v=1`), {
      params: Promise.resolve({ id: vis.trainer.id })
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect(ok.headers.get("cache-control")).toContain("immutable");

    const no = await getPhoto(new Request(`https://app.houseofmuscle.it/api/public/trainers/${hid.trainer.id}/photo`), {
      params: Promise.resolve({ id: hid.trainer.id })
    });
    expect(no.status).toBe(404);
  });
});

describe("navigazione", () => {
  it("la voce Personal trainer c'è solo per ADMIN", () => {
    expect(getAppNavigationItems("/trainer", UserRole.ADMIN).find((i) => i.href === "/trainer")).toMatchObject({
      label: "Personal trainer",
      active: true
    });
    expect(getAppNavigationItems("/dashboard", UserRole.SUBSCRIBER).some((i) => i.href === "/trainer")).toBe(false);
    expect(getAppNavigationItems("/dashboard", UserRole.INSTRUCTOR).some((i) => i.href === "/trainer")).toBe(false);
  });
});
