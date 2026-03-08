"use client";

import { DocumentSide, DocumentType, type UserDocument } from "@gestionale/db";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Typography } from "antd";

import { DocumentUploadSlot } from "./document-upload-slot";

const { Text } = Typography;

type ProfilePhotoUploadButtonProps = {
  document: Pick<
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
  children: React.ReactNode;
};

export function ProfilePhotoUploadButton({ document, children }: ProfilePhotoUploadButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="profilo-avatar-upload-btn"
        onClick={() => setOpen(true)}
        aria-label="Cambia foto profilo"
      >
        {children}
      </button>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title={
          <div>
            <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "#f09ca3", display: "block" }}>
              Foto profilo
            </Text>
            <Text style={{ fontSize: 18, fontWeight: 700, color: "white" }}>
              Carica o aggiorna la tua foto
            </Text>
          </div>
        }
        centered
        width={480}
        className="dark-modal"
        style={{
          background:
            "radial-gradient(ellipse at 20% -10%, rgba(223,37,49,0.18), transparent 45%), radial-gradient(ellipse at 80% 110%, rgba(80,10,20,0.15), transparent 40%), linear-gradient(180deg, rgba(22,22,30,0.99), rgba(10,10,16,0.99))",
          border: "1px solid rgba(223,37,49,0.28)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.06) inset, 0 24px 56px rgba(0,0,0,0.6)"
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
        <DocumentUploadSlot
          type={DocumentType.PROFILE_PHOTO}
          side={DocumentSide.SINGLE}
          current={document}
          slotTitle="Foto profilo"
        />
      </Modal>
    </>
  );
}
