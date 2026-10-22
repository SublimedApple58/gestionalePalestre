// Caricamento iniziale dei 4 Personal Trainer (lista unica app + sito).
// Testi approvati da Tiziano il 22/10/2026 (trascritti dalle locandine, refuso
// "corprorea" corretto). Foto: già ritagliate in hom2/public/trainers/.
//
// Regole (vedi scripts/README.md):
//  - DRY-RUN di default: solo letture, stampa cosa farebbe;
//  - `--apply`: carica le foto su R2 (`trainers/<uuid>/photo-<ts>.jpg`) e crea
//    i trainer; idempotente: salta chi esiste già (stesso nome e cognome);
//  - mai modifiche/cancellazioni di trainer esistenti.
//
// Env: DATABASE_URL (default: packages/db/.env), R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT (obbligatorie con --apply,
// salvo `--skip-photos` per prove in locale).
// Uso (da packages/db): node scripts/seed-personal-trainers.mjs [--apply] [--skip-photos]
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const SKIP_PHOTOS = process.argv.includes("--skip-photos");
const PHOTOS_DIR = process.env.TRAINER_PHOTOS_DIR ?? `${homedir()}/Developer/hom2/public/trainers`;

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const envVal = (n) => process.env[n] ?? envText.match(new RegExp(`^${n}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
const dbUrl = envVal("DATABASE_URL");
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TRAINERS = [
  {
    firstName: "Simone",
    lastName: "Calandrini",
    whatsappNumber: "3388646144",
    photo: "simone-calandrini.jpg",
    bio: [
      "Personal Trainer specializzato in:",
      "• **dimagrimento e tonificazione** donna,",
      "• **dimagrimento e tonificazione** uomo,",
      "• **aumento della massa muscolare e forza,**",
      "• preparazione per **sport agonistici** (individuali e di squadra).",
      "",
      "Appassionato di fitness e allenamento, crea **percorsi completamente personalizzati** in base alle esigenze e al livello di partenza di ogni persona.",
      "",
      "L'obiettivo è aiutarti a raggiungere **risultati concreti** con costanza, forza e motivazione, senza mai perdere di vista il benessere e la salute."
    ].join("\n")
  },
  {
    firstName: "Valentina",
    lastName: "Palantrani",
    whatsappNumber: "3289453025",
    photo: "valentina-palantrani.jpg",
    bio: [
      "Personal Trainer certificata **Project Invictus**, specializzata nell'**allenamento al femminile**, con particolare attenzione alle esigenze e alle caratteristiche della donna.",
      "",
      "Competenze specifiche nel **Booty Training** e nell'**allenamento Posturale**, con un lavoro orientato a postura, mobilità e qualità del movimento."
    ].join("\n")
  },
  {
    firstName: "Alessandro",
    lastName: "Di Francesco",
    whatsappNumber: "3663430272",
    photo: "alessandro-di-francesco.jpg",
    bio: [
      "Sono un Personal Trainer certificato **Project Invictus,** specializzato in **ricomposizione corporea, aumento della massa muscolare** e **bodybuilding.**",
      "",
      "Parto dal tuo obiettivo e lo trasformo in un percorso concreto, individuando le **strategie più adatte, i tempi realistici e il lavoro necessario** per avvicinarti alla forma fisica che vuoi costruire.",
      "",
      "==Niente schede standard:== **il percorso deve adattarsi a te, non il contrario.**"
    ].join("\n")
  },
  {
    firstName: "Jacopo",
    lastName: "Di Giacomo",
    whatsappNumber: "3398378245",
    photo: "jacopo-di-giacomo.jpg",
    bio: [
      "Personal Trainer certificato **Project Invictus**, con **oltre 10 anni di esperienza** nell'allenamento con i **pesi** e specializzato in **ipertrofia** e **ricomposizione corporea**.",
      "",
      "Si occupa di percorsi finalizzati allo sviluppo della **massa muscolare** e **della forza**, attraverso un lavoro strutturato e progressivo."
    ].join("\n")
  }
];

async function uploadPhoto(fileName) {
  const r2 = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"].map((n) => process.env[n]);
  if (r2.some((v) => !v)) throw new Error("Variabili R2_* mancanti: servono per caricare le foto (o usa --skip-photos).");
  const [accessKeyId, secretAccessKey, bucket, endpoint] = r2;
  // L'SDK S3 è una dipendenza della web app: lo risolviamo da lì.
  const req = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
  const { S3Client, PutObjectCommand } = req("@aws-sdk/client-s3");
  const client = new S3Client({ region: "auto", endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  const key = `trainers/${randomUUID()}/photo-${Date.now()}.jpg`;
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(`${PHOTOS_DIR}/${fileName}`), ContentType: "image/jpeg" })
  );
  return key;
}

try {
  console.log(`DB: ${dbUrl?.replace(/^.*@([^/:]+).*$/, "$1")} · ${APPLY ? "APPLY" : "DRY-RUN"}${SKIP_PHOTOS ? " · senza foto" : ""}`);
  const existing = await prisma.personalTrainer.findMany({ select: { firstName: true, lastName: true, sortOrder: true } });
  const key = (t) => `${t.firstName} ${t.lastName}`.toLowerCase();
  const present = new Set(existing.map(key));
  let nextOrder = existing.reduce((max, t) => Math.max(max, t.sortOrder + 1), 0);

  for (const t of TRAINERS) {
    if (present.has(key(t))) {
      console.log(`= ${t.firstName} ${t.lastName}: esiste già, salto`);
      continue;
    }
    if (!SKIP_PHOTOS && !existsSync(`${PHOTOS_DIR}/${t.photo}`)) throw new Error(`Foto mancante: ${PHOTOS_DIR}/${t.photo}`);
    if (!APPLY) {
      console.log(`+ ${t.firstName} ${t.lastName} (ordine ${nextOrder++}, wa.me/39${t.whatsappNumber}, foto ${t.photo})`);
      continue;
    }
    const photoStorageKey = SKIP_PHOTOS ? null : await uploadPhoto(t.photo);
    const row = await prisma.personalTrainer.create({
      data: {
        firstName: t.firstName,
        lastName: t.lastName,
        bio: t.bio,
        whatsappNumber: t.whatsappNumber,
        photoStorageKey,
        sortOrder: nextOrder++,
        isVisible: true
      }
    });
    console.log(`+ creato ${row.firstName} ${row.lastName} (${row.id})${photoStorageKey ? ` foto ${photoStorageKey}` : ""}`);
  }
  if (!APPLY) console.log("DRY-RUN: nessuna scrittura. Rilancia con --apply.");
} finally {
  await prisma.$disconnect();
}
