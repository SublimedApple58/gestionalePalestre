import { DocumentType } from "@gestionale/db";

import { DOC_AI_MIN_CONFIDENCE, DOC_AI_MODEL } from "@/lib/document-settings";

import { DomainError } from "./errors";

type ExtractInput = {
  type: DocumentType;
  frontBytes: Uint8Array;
  backBytes: Uint8Array;
  frontMimeType: string;
  backMimeType: string;
};

export type ExtractedDocumentData = {
  taxCode: string | null;
  identityNumber: string | null;
  confidence: number;
  frontMatchesBack: boolean;
};

const TAX_CODE_REGEX = /^[A-Z0-9]{16}$/;
const IDENTITY_NUMBER_REGEX = /^[A-Z0-9-]{5,20}$/;

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function normalizeUpper(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return false;
}

function toConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function validateExtraction(type: DocumentType, data: ExtractedDocumentData): ExtractedDocumentData {
  if (!data.frontMatchesBack) {
    throw new DomainError("AI_EXTRACTION_MISMATCH", "I due lati del documento non risultano coerenti.");
  }

  if (data.confidence < DOC_AI_MIN_CONFIDENCE) {
    throw new DomainError("AI_EXTRACTION_LOW_CONFIDENCE", "Confidenza AI insufficiente.");
  }

  if (type === DocumentType.TAX_CODE) {
    if (!data.taxCode || !TAX_CODE_REGEX.test(data.taxCode)) {
      throw new DomainError("AI_EXTRACTION_INVALID_TAX_CODE", "Codice fiscale non valido.");
    }
  }

  if (type === DocumentType.IDENTITY_DOCUMENT) {
    if (!data.identityNumber || !IDENTITY_NUMBER_REGEX.test(data.identityNumber)) {
      throw new DomainError("AI_EXTRACTION_INVALID_IDENTITY_NUMBER", "Numero documento non valido.");
    }
  }

  return data;
}

function extractJsonFromCompletion(payload: unknown): Record<string, unknown> {
  const choices =
    (payload as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    }).choices ?? [];

  const content = choices[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new DomainError("AI_EXTRACTION_EMPTY_RESPONSE", "Risposta AI vuota o non valida.");
  }

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new DomainError("AI_EXTRACTION_PARSE_ERROR", "Impossibile decodificare la risposta AI.");
  }
}

function buildPromptForType(type: DocumentType): string {
  if (type === DocumentType.TAX_CODE) {
    return [
      "Leggi il codice fiscale italiano dal fronte e dal retro della tessera sanitaria.",
      "Rispondi SOLO in JSON con queste chiavi:",
      "taxCode (string|null), identityNumber (null), confidence (number 0-1), frontMatchesBack (boolean).",
      "Nessun testo extra."
    ].join(" ");
  }

  return [
    "Leggi il numero del documento di identita' dal fronte e dal retro.",
    "Rispondi SOLO in JSON con queste chiavi:",
    "taxCode (null), identityNumber (string|null), confidence (number 0-1), frontMatchesBack (boolean).",
    "Nessun testo extra."
  ].join(" ");
}

export async function extractDocumentDataWithAi(input: ExtractInput): Promise<ExtractedDocumentData> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new DomainError(
      "AI_NOT_CONFIGURED",
      "OPENAI_API_KEY non configurata: impossibile elaborare i documenti."
    );
  }

  if (input.type !== DocumentType.TAX_CODE && input.type !== DocumentType.IDENTITY_DOCUMENT) {
    throw new DomainError("AI_EXTRACTION_UNSUPPORTED_TYPE", "Tipo documento non supportato dall'estrazione AI.");
  }

  const payload = {
    model: DOC_AI_MODEL,
    response_format: {
      type: "json_object"
    },
    messages: [
      {
        role: "system",
        content: "Estrattore OCR documentale. Restituisci esclusivamente JSON valido."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildPromptForType(input.type)
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${input.frontMimeType};base64,${toBase64(input.frontBytes)}`
            }
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${input.backMimeType};base64,${toBase64(input.backBytes)}`
            }
          }
        ]
      }
    ]
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(unreadable)");
    console.error(`[document-ai] OpenAI error ${response.status}:`, errorBody);
    throw new DomainError("AI_PROVIDER_ERROR", `OpenAI error ${response.status}: ${errorBody}`);
  }

  const completionPayload = (await response.json()) as unknown;
  const json = extractJsonFromCompletion(completionPayload);

  const extracted: ExtractedDocumentData = {
    taxCode: normalizeUpper(json.taxCode),
    identityNumber: normalizeUpper(json.identityNumber),
    confidence: toConfidence(json.confidence),
    frontMatchesBack: toBoolean(json.frontMatchesBack)
  };

  return validateExtraction(input.type, extracted);
}
