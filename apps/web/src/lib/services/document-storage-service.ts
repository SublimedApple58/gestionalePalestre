import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DocumentSide, DocumentType } from "@gestionale/db";

import { DOC_PRESIGN_TTL_SECONDS, DOCUMENT_ALLOWED_MIME_TYPES } from "@/lib/document-settings";

import { DomainError } from "./errors";

const asciiDecoder = new TextDecoder("ascii");

type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

function readConfig(): R2Config | null {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT;

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    return null;
  }

  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint
  };
}

const globalForStorage = globalThis as unknown as {
  r2S3Client?: S3Client;
};

function getClient(config: R2Config): S3Client {
  if (globalForStorage.r2S3Client) {
    return globalForStorage.r2S3Client;
  }

  globalForStorage.r2S3Client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  return globalForStorage.r2S3Client;
}

function assertStorageConfigured(): R2Config {
  const config = readConfig();

  if (!config) {
    throw new DomainError(
      "DOCUMENT_STORAGE_NOT_CONFIGURED",
      "Storage documenti non configurato: manca configurazione R2."
    );
  }

  return config;
}

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");

  if (!sanitized) {
    throw new DomainError("INVALID_DOCUMENT_FILE", "Nome file non valido.");
  }

  return sanitized;
}

export function isDocumentStorageConfigured(): boolean {
  return readConfig() !== null;
}

export function buildDocumentStorageKey(
  userId: string,
  type: DocumentType,
  side: DocumentSide,
  fileName: string
): string {
  const safeFileName = sanitizeFileName(fileName);
  return `users/${userId}/documents/${type}/${side}/${Date.now()}-${safeFileName}`;
}

export async function createDocumentUploadUrl(input: {
  storageKey: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const config = assertStorageConfigured();
  const client = getClient(config);

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    ContentType: input.contentType
  });

  return getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? DOC_PRESIGN_TTL_SECONDS
  });
}

export async function createDocumentDownloadUrl(input: {
  storageKey: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const config = assertStorageConfigured();
  const client = getClient(config);

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: input.storageKey
  });

  return getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? DOC_PRESIGN_TTL_SECONDS
  });
}

export async function readDocumentBytes(input: {
  storageKey: string;
  byteRange?: string;
}): Promise<Uint8Array> {
  const config = assertStorageConfigured();
  const client = getClient(config);

  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: input.storageKey,
      Range: input.byteRange
    })
  );

  if (!response.Body) {
    throw new DomainError("DOCUMENT_STORAGE_READ_FAILED", "Impossibile leggere il file caricato.");
  }

  return response.Body.transformToByteArray();
}

function isPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isPngMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isJpegMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebpMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false;
  }

  const riff = asciiDecoder.decode(bytes.subarray(0, 4));
  const webp = asciiDecoder.decode(bytes.subarray(8, 12));

  return riff === "RIFF" && webp === "WEBP";
}

export function assertSupportedDocumentMimeType(mimeType: string): void {
  if (!DOCUMENT_ALLOWED_MIME_TYPES.includes(mimeType as (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number])) {
    throw new DomainError("INVALID_DOCUMENT_MIME", "Formato file non supportato.");
  }
}

export function assertMagicBytesMatchMimeType(mimeType: string, bytes: Uint8Array): void {
  if (mimeType === "application/pdf" && !isPdfMagic(bytes)) {
    throw new DomainError("INVALID_DOCUMENT_MAGIC_BYTES", "Il file non sembra un PDF valido.");
  }

  if ((mimeType === "image/jpeg" || mimeType === "image/jpg") && !isJpegMagic(bytes)) {
    throw new DomainError("INVALID_DOCUMENT_MAGIC_BYTES", "Il file non sembra un JPEG valido.");
  }

  if (mimeType === "image/png" && !isPngMagic(bytes)) {
    throw new DomainError("INVALID_DOCUMENT_MAGIC_BYTES", "Il file non sembra un PNG valido.");
  }

  if (mimeType === "image/webp" && !isWebpMagic(bytes)) {
    throw new DomainError("INVALID_DOCUMENT_MAGIC_BYTES", "Il file non sembra un WEBP valido.");
  }
}
