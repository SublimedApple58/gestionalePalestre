"use client";

import {
  DocumentSide,
  DocumentStatus,
  DocumentType,
  type UserDocument
} from "@gestionale/db";
import { useMemo, useState } from "react";
import { Modal, Typography } from "antd";

import {
  countRemainingAiAttempts,
  documentStatusLabel,
  documentTypeLabel,
  getDocumentSlot,
  getUploadSlotsForType
} from "@/lib/documents";

import { DocumentUploadSlot } from "./document-upload-slot";

const { Text } = Typography;

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

      {/* Antd Modal */}
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title={
          <div>
            <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "#f09ca3", display: "block" }}>
              Gestione documento
            </Text>
            <Text style={{ fontSize: 18, fontWeight: 700, color: "white" }}>
              {documentTypeLabel(type)}
            </Text>
          </div>
        }
        centered
        width={720}
        className="dark-modal"
        style={{
          background:
            "radial-gradient(circle at 18% -26%, rgba(223,37,49,0.24), transparent 40%), linear-gradient(180deg, rgba(20,20,28,0.98), rgba(11,11,16,0.98))",
          border: "1px solid rgba(223,37,49,0.34)",
          boxShadow: "0 24px 52px rgba(0,0,0,0.55)"
        }}
        styles={{
          header: {
            background: "transparent",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            paddingBottom: 16
          },
          body: {
            padding: "16px 24px 24px"
          }
        }}
      >
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
              maxAttempts={maxAttempts}
            />
          ))}
        </div>
      </Modal>
    </>
  );
}
