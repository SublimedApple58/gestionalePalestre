/**
 * Helper puri dei Personal Trainer (lista unica app iscritti + sito pubblico).
 * Nessun accesso al DB: testabili e condivisi tra admin, API pubblica e seed.
 */

export const TRAINER_PHOTO_PREFIX = "trainers/";
export const TRAINER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const TRAINER_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const TRAINER_BIO_MAX_LENGTH = 2000;

/**
 * Normalizza un numero di cellulare italiano in sole cifre senza prefisso.
 * Accetta spazi, trattini, "+39", "0039". Ritorna null se non è un cellulare
 * italiano plausibile (3xx, 9-10 cifre).
 */
export function normalizeItalianMobile(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+39")) digits = digits.slice(3);
  else if (digits.startsWith("0039")) digits = digits.slice(4);
  digits = digits.replace(/\D/g, "");
  if (!/^3\d{8,9}$/.test(digits)) return null;
  return digits;
}

export function whatsappLink(number: string): string {
  return `https://wa.me/39${number}`;
}

/** "3388646144" → "338 864 6144" (solo display). */
export function formatItalianMobile(number: string): string {
  return number.replace(/^(\d{3})(\d{3})(\d+)$/, "$1 $2 $3");
}

/** `accent` = evidenziato in rosso brand (sempre anche grassetto). */
export type BioSegment = { text: string; bold: boolean; accent?: boolean };
export type BioBlock = { kind: "paragraph" | "bullet"; segments: BioSegment[] };

/**
 * `**testo**` → grassetto, `==testo==` → evidenziato rosso (e grassetto).
 * Marcatori spaiati restano testo.
 */
export function parseBioInline(line: string): BioSegment[] {
  const segments: BioSegment[] = [];
  const re = /\*\*(.+?)\*\*|==(.+?)==/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) segments.push({ text: line.slice(last, m.index), bold: false });
    if (m[2] !== undefined) segments.push({ text: m[2], bold: true, accent: true });
    else segments.push({ text: m[1] ?? "", bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) segments.push({ text: line.slice(last), bold: false });
  return segments;
}

/**
 * Bio → blocchi: righe vuote separano i paragrafi, righe che iniziano con
 * "•", "-" o "*" (seguiti da spazio) diventano voci di elenco.
 */
export function parseBio(bio: string): BioBlock[] {
  const blocks: BioBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", segments: parseBioInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  for (const raw of bio.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(/^(?:•|-|\*)\s+(.*)$/);
    if (bullet && !line.startsWith("**")) {
      flush();
      blocks.push({ kind: "bullet", segments: parseBioInline(bullet[1] ?? "") });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Testo semplice (senza markup) per anteprime e descrizioni. */
export function bioPlainText(bio: string): string {
  return parseBio(bio)
    .map((b) => b.segments.map((s) => s.text).join(""))
    .join(" ");
}

export type PublicTrainer = {
  id: string;
  firstName: string;
  lastName: string;
  bio: string;
  whatsappUrl: string;
  photoUrl: string | null;
};

export function toPublicTrainer(
  t: {
    id: string;
    firstName: string;
    lastName: string;
    bio: string;
    whatsappNumber: string;
    photoStorageKey: string | null;
    updatedAt: Date;
  },
  origin: string
): PublicTrainer {
  return {
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    bio: t.bio,
    whatsappUrl: whatsappLink(t.whatsappNumber),
    photoUrl: t.photoStorageKey
      ? `${origin}/api/public/trainers/${t.id}/photo?v=${t.updatedAt.getTime()}`
      : null
  };
}
