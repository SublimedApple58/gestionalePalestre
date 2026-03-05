"use client";

import {
  DocumentSide,
  DocumentStatus,
  DocumentType,
  type UserDocument
} from "@gestionale/db";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  countRemainingAiAttempts,
  documentSideLabel,
  documentStatusLabel,
  documentTypeLabel
} from "@/lib/documents";
import { CustomCalendar } from "@/components/ui/custom-calendar";
import { CustomFilePicker } from "@/components/ui/custom-file-picker";

type DocumentUploadSlotProps = {
  type: DocumentType;
  side: DocumentSide;
  slotTitle?: string;
  current: Pick<
    UserDocument,
    | "id"
    | "type"
    | "side"
    | "status"
    | "fileName"
    | "uploadedAt"
    | "aiAttempts"
    | "rejectionReason"
    | "medicalCertificateExpiresAt"
  > | null;
  medicalCertificateRequired?: boolean;
  maxAttempts?: number;
};

type PresignResponse = {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
};

type CommitResponse = {
  slotStatus: string;
  jobEnqueued: boolean;
  remainingRetries: number;
};

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function DocumentUploadSlot({
  type,
  side,
  slotTitle,
  current,
  medicalCertificateRequired = false,
  maxAttempts = 3
}: DocumentUploadSlotProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(current?.fileName ?? null);
  const [medicalExpiry, setMedicalExpiry] = useState<string>(
    current?.medicalCertificateExpiresAt ? new Date(current.medicalCertificateExpiresAt).toISOString().slice(0, 10) : ""
  );
  const todayYmd = new Date().toISOString().slice(0, 10);

  const remainingAttempts = useMemo(() => {
    if (!current) {
      return maxAttempts;
    }

    return countRemainingAiAttempts({ aiAttempts: current.aiAttempts }, maxAttempts);
  }, [current, maxAttempts]);

  function statusTone(status?: DocumentStatus): "ok" | "warning" | "missing" {
    if (!status) {
      return "missing";
    }

    if (status === DocumentStatus.APPROVED) {
      return "ok";
    }

    if (status === DocumentStatus.REJECTED || status === DocumentStatus.NEEDS_REUPLOAD) {
      return "missing";
    }

    return "warning";
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const presignRequest = {
        type,
        side,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size
      };

      const presignResponse = await fetch("/api/documents/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(presignRequest)
      });

      const presignJson = (await presignResponse.json()) as PresignResponse & {
        error?: string;
        message?: string;
      };

      if (!presignResponse.ok) {
        throw new Error(presignJson.message ?? presignJson.error ?? "Errore presign upload");
      }

      const uploadResponse = await fetch(presignJson.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": presignRequest.contentType
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload file fallito.");
      }

      const hash = await sha256Hex(file);

      const commitPayload: Record<string, unknown> = {
        type,
        side,
        storageKey: presignJson.storageKey,
        fileName: file.name,
        contentType: presignRequest.contentType,
        sizeBytes: presignRequest.sizeBytes,
        sha256: hash
      };

      if (medicalCertificateRequired) {
        if (!medicalExpiry) {
          throw new Error("Inserisci la data di scadenza del certificato medico.");
        }

        commitPayload.medicalCertificateExpiresAt = medicalExpiry;
      }

      const commitResponse = await fetch("/api/documents/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(commitPayload)
      });

      const commitJson = (await commitResponse.json()) as CommitResponse & {
        error?: string;
        message?: string;
      };

      if (!commitResponse.ok) {
        throw new Error(commitJson.message ?? commitJson.error ?? "Errore commit documento");
      }

      setSuccess(
        commitJson.jobEnqueued
          ? "Documento caricato. Analisi automatica avviata."
          : "Documento caricato con successo."
      );
      setSelectedFileName(file.name);

      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Errore durante upload documento.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="upload-slot">
      <div className="upload-slot-header">
        <strong>{slotTitle ?? `${documentTypeLabel(type)} - ${documentSideLabel(side)}`}</strong>
        <span className={`status-badge ${statusTone(current?.status)}`}>
          {current ? documentStatusLabel(current.status) : "Mancante"}
        </span>
      </div>

      {current ? (
        <p className="upload-slot-meta">
          {`Ultimo file: ${current.fileName} (${new Date(current.uploadedAt).toLocaleDateString("it-IT")})`}
        </p>
      ) : (
        <p className="upload-slot-meta">Nessun file caricato.</p>
      )}

      {type === DocumentType.TAX_CODE || type === DocumentType.IDENTITY_DOCUMENT ? (
        <p className="upload-slot-meta">{`Tentativi AI residui: ${remainingAttempts}`}</p>
      ) : null}

      {current?.rejectionReason ? <p className="status-badge missing">{current.rejectionReason}</p> : null}

      {medicalCertificateRequired ? (
        <CustomCalendar
          label="Scadenza certificato medico"
          value={medicalExpiry}
          onChange={setMedicalExpiry}
          min={todayYmd}
          required
        />
      ) : null}

      <CustomFilePicker
        label="Carica documento"
        accept=".pdf,image/jpeg,image/jpg,image/png,image/webp"
        disabled={uploading}
        selectedFileName={selectedFileName}
        hint="Dimensione massima consigliata: 12 MB"
        onPickFile={(file) => {
          setSelectedFileName(file.name);
          void handleUpload(file);
        }}
      />

      {error ? <p className="error-banner">{error}</p> : null}
      {success ? <p className="status-badge ok">{success}</p> : null}
      {uploading ? <p className="status-badge warning">Caricamento in corso...</p> : null}
    </div>
  );
}
