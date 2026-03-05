export const DEFAULT_DOC_AI_MODEL = "gpt-4.1-mini";
const DEFAULT_DOC_AI_MIN_CONFIDENCE = 0.85;
const DEFAULT_DOC_AI_MAX_RETRIES = 3;
const DEFAULT_DOC_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
const DEFAULT_DOC_PRESIGN_TTL_SECONDS = 300;
const DEFAULT_DOC_JOB_BATCH_SIZE = 10;
const DEFAULT_DOC_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_DOC_RATE_LIMIT_MAX_REQUESTS = 30;

function readInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readFloat(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const DOC_AI_MODEL = process.env.OPENAI_DOCS_MODEL ?? DEFAULT_DOC_AI_MODEL;
export const DOC_AI_MIN_CONFIDENCE = readFloat(
  process.env.DOC_AI_MIN_CONFIDENCE,
  DEFAULT_DOC_AI_MIN_CONFIDENCE
);
export const DOC_AI_MAX_RETRIES = readInt(process.env.DOC_AI_MAX_RETRIES, DEFAULT_DOC_AI_MAX_RETRIES);
export const DOC_UPLOAD_MAX_BYTES = readInt(process.env.DOC_UPLOAD_MAX_BYTES, DEFAULT_DOC_UPLOAD_MAX_BYTES);
export const DOC_PRESIGN_TTL_SECONDS = readInt(
  process.env.DOC_PRESIGN_TTL_SECONDS,
  DEFAULT_DOC_PRESIGN_TTL_SECONDS
);
export const DOC_JOB_BATCH_SIZE = readInt(process.env.DOC_JOB_BATCH_SIZE, DEFAULT_DOC_JOB_BATCH_SIZE);
export const DOC_RATE_LIMIT_WINDOW_MS = readInt(
  process.env.DOC_RATE_LIMIT_WINDOW_MS,
  DEFAULT_DOC_RATE_LIMIT_WINDOW_MS
);
export const DOC_RATE_LIMIT_MAX_REQUESTS = readInt(
  process.env.DOC_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_DOC_RATE_LIMIT_MAX_REQUESTS
);

export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
] as const;

export type AllowedDocumentMimeType = (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number];
