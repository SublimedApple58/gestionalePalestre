"use client";

import {
  DocumentSide,
  DocumentStatus,
  DocumentType,
  type UserDocument
} from "@gestionale/db";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  countRemainingAiAttempts,
  documentStatusLabel,
  documentTypeLabel,
  getDocumentSlot,
  getUploadSlotsForType
} from "@/lib/documents";

import { DocumentUploadSlot } from "./document-upload-slot";

type UploadDocument = Pick<
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
>;

type DocumentUploadCardProps = {
  type: DocumentType;
  documents: UploadDocument[];
  maxAttempts?: number;
};

type AggregateStatus = DocumentStatus | "MISSING" | "PARTIAL";

function resolveAggregateStatus(slots: Array<UploadDocument | null>): AggregateStatus {
  if (slots.length > 0 && slots.every((slot) => slot?.status === DocumentStatus.APPROVED)) {
    return DocumentStatus.APPROVED;
  }

  if (slots.some((slot) => slot?.status === DocumentStatus.REJECTED)) {
    return DocumentStatus.REJECTED;
  }

  if (slots.some((slot) => slot?.status === DocumentStatus.NEEDS_REUPLOAD)) {
    return DocumentStatus.NEEDS_REUPLOAD;
  }

  if (slots.some((slot) => slot?.status === DocumentStatus.PENDING_ADMIN_REVIEW)) {
    return DocumentStatus.PENDING_ADMIN_REVIEW;
  }

  if (slots.some((slot) => slot?.status === DocumentStatus.AI_PROCESSING)) {
    return DocumentStatus.AI_PROCESSING;
  }

  if (slots.some((slot) => slot?.status === DocumentStatus.UPLOADED)) {
    return DocumentStatus.UPLOADED;
  }

  if (slots.some((slot) => slot !== null)) {
    return "PARTIAL";
  }

  return "MISSING";
}

function aggregateStatusLabel(status: AggregateStatus): string {
  if (status === "MISSING") {
    return "Mancante";
  }

  if (status === "PARTIAL") {
    return "Parziale";
  }

  return documentStatusLabel(status);
}

function aggregateStatusTone(status: AggregateStatus): "ok" | "warning" | "missing" {
  if (status === DocumentStatus.APPROVED) {
    return "ok";
  }

  if (
    status === "MISSING" ||
    status === "PARTIAL" ||
    status === DocumentStatus.REJECTED ||
    status === DocumentStatus.NEEDS_REUPLOAD
  ) {
    return "missing";
  }

  return "warning";
}

export function DocumentUploadCard({
  type,
  documents,
  maxAttempts = 3
}: DocumentUploadCardProps) {
  const [open, setOpen] = useState(false);

  const sides = useMemo(() => getUploadSlotsForType(type), [type]);

  const slots = useMemo(
    () =>
      sides.map((side) => ({
        side,
        current: getDocumentSlot(documents, { type, side })
      })),
    [documents, sides, type]
  );

  const aggregateStatus = useMemo(
    () => resolveAggregateStatus(slots.map((slot) => slot.current)),
    [slots]
  );

  const uploadedCount = slots.filter((slot) => slot.current !== null).length;

  const attemptsSummary = useMemo(() => {
    if (
      type !== DocumentType.TAX_CODE &&
      type !== DocumentType.IDENTITY_DOCUMENT
    ) {
      return null;
    }

    const remainingBySide = slots.map((slot) => ({
      side: slot.side,
      remaining: slot.current
        ? countRemainingAiAttempts({ aiAttempts: slot.current.aiAttempts }, maxAttempts)
        : maxAttempts
    }));

    return remainingBySide;
  }, [maxAttempts, slots, type]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="document-type-card"
        onClick={() => setOpen(true)}
      >
        <div className="document-type-card-header">
          <strong>{documentTypeLabel(type)}</strong>
          <span className={`status-badge ${aggregateStatusTone(aggregateStatus)}`}>
            {aggregateStatusLabel(aggregateStatus)}
          </span>
        </div>

        <p className="document-type-card-meta">
          {sides.length > 1
            ? `${uploadedCount}/${sides.length} lati caricati`
            : uploadedCount > 0
            ? "File caricato"
            : "File mancante"}
        </p>

        {attemptsSummary ? (
          <p className="document-type-card-meta">
            {attemptsSummary
              .map((entry) => `${entry.side === DocumentSide.FRONT ? "Fronte" : "Retro"}: ${entry.remaining}`)
              .join(" · ")}
          </p>
        ) : null}

        <p className="document-type-card-action">Apri gestione documento</p>
      </button>

      {open ? (
        <div
          className="document-modal-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <section
            className="document-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Gestione ${documentTypeLabel(type)}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="document-modal-header">
              <div>
                <p className="panel-kicker">Gestione documento</p>
                <h4 className="document-modal-title">{documentTypeLabel(type)}</h4>
              </div>

              <button
                type="button"
                className="document-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className={`document-modal-grid ${slots.length > 1 ? "double" : "single"}`}>
              {slots.map((slot) => (
                <DocumentUploadSlot
                  key={`${type}-${slot.side}`}
                  type={type}
                  side={slot.side}
                  slotTitle={
                    slot.side === DocumentSide.SINGLE
                      ? documentTypeLabel(type)
                      : slot.side === DocumentSide.FRONT
                      ? "Fronte"
                      : "Retro"
                  }
                  current={slot.current}
                  medicalCertificateRequired={type === DocumentType.MEDICAL_CERTIFICATE}
                  maxAttempts={maxAttempts}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
