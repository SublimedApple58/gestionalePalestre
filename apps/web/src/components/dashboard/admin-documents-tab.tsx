"use client";

import { Button, Tag } from "antd";
import { ExternalLink, Trash2, Upload } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  DocumentSide,
  DocumentStatus,
  DocumentType,
  type UserDocument
} from "@gestionale/db";

import { updateMedicalCertificateExpiryActionState } from "@/app/actions/dashboard-actions";
import { CustomCalendar } from "@/components/ui/custom-calendar";
import { useToast } from "@/components/ui/toast-provider";
import { daysUntil } from "@/lib/association";
import { MEDICAL_CERT_EXPIRY_THRESHOLD_DAYS } from "@/lib/medical-certificate";

function toYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function MedicalCertExpiryBadge({ expiresAt }: { expiresAt: Date | null }) {
  if (!expiresAt) return <Tag color="default">Scadenza da impostare</Tag>;
  const days = daysUntil(new Date(expiresAt));
  if (days < 0) return <Tag color="error">Certificato scaduto</Tag>;
  if (days <= MEDICAL_CERT_EXPIRY_THRESHOLD_DAYS) return <Tag color="warning">{`Scade tra ${days} gg`}</Tag>;
  return <Tag color="success">Valido</Tag>;
}

/**
 * Editor della scadenza del certificato medico, mostrato sotto la voce del
 * certificato nel tab Documenti. Scrive sul documento tramite la server action
 * e aggiorna il badge in modo ottimistico dopo il salvataggio.
 */
function MedicalCertExpiryEditor({ userId, doc }: { userId: string; doc: UserDocument }) {
  const { addToast } = useToast();
  const [result, action, pending] = useActionState(updateMedicalCertificateExpiryActionState, null);
  const [expiry, setExpiry] = useState<Date | null>(
    doc.medicalCertificateExpiresAt ? new Date(doc.medicalCertificateExpiresAt) : null
  );

  useEffect(() => {
    if (result) addToast(result.message, result.ok ? "success" : "error");
  }, [result, addToast]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        // Aggiorna il badge in modo ottimistico dalla data appena scelta:
        // la scrittura va quasi sempre a buon fine (il certificato esiste e la
        // data è validata dal calendario). In caso di errore il toast avvisa.
        const value = new FormData(e.currentTarget).get("medicalCertificateExpiresAt");
        if (typeof value === "string" && value.trim()) setExpiry(new Date(value));
      }}
      className="user-drawer-form"
      style={{ marginTop: 4, gap: 8 }}
    >
      <input type="hidden" name="targetUserId" value={userId} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Scadenza</span>
        <MedicalCertExpiryBadge expiresAt={expiry} />
      </div>
      <CustomCalendar
        name="medicalCertificateExpiresAt"
        label="Scadenza certificato"
        hideLabel
        defaultValue={expiry ? toYmd(new Date(expiry)) : undefined}
      />
      <Button type="primary" htmlType="submit" loading={pending} size="small">
        Salva scadenza
      </Button>
    </form>
  );
}

const SLOTS: { type: DocumentType; side: DocumentSide; label: string }[] = [
  { type: DocumentType.TAX_CODE, side: DocumentSide.FRONT, label: "Tessera sanitaria · Fronte" },
  { type: DocumentType.TAX_CODE, side: DocumentSide.BACK, label: "Tessera sanitaria · Retro" },
  { type: DocumentType.IDENTITY_DOCUMENT, side: DocumentSide.FRONT, label: "Documento d'identità · Fronte" },
  { type: DocumentType.IDENTITY_DOCUMENT, side: DocumentSide.BACK, label: "Documento d'identità · Retro" },
  { type: DocumentType.MEDICAL_CERTIFICATE, side: DocumentSide.SINGLE, label: "Certificato medico" }
];

function StatusTag({ status }: { status: DocumentStatus | undefined }) {
  if (!status) return <Tag color="default">Non caricato</Tag>;
  switch (status) {
    case DocumentStatus.APPROVED:
      return <Tag color="success">Approvato</Tag>;
    case DocumentStatus.PENDING_ADMIN_REVIEW:
      return <Tag color="warning">In revisione</Tag>;
    case DocumentStatus.AI_PROCESSING:
      return <Tag color="warning">In elaborazione</Tag>;
    case DocumentStatus.UPLOADED:
      return <Tag color="processing">Caricato</Tag>;
    case DocumentStatus.REJECTED:
      return <Tag color="error">Rifiutato</Tag>;
    case DocumentStatus.NEEDS_REUPLOAD:
      return <Tag color="orange">Da ricaricare</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function AdminDocumentsTab({
  userId,
  documents
}: {
  userId: string;
  documents: UserDocument[];
}) {
  const { addToast } = useToast();
  const [docs, setDocs] = useState<UserDocument[]>(documents);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const slotKey = (type: DocumentType, side: DocumentSide) => `${type}-${side}`;
  const findDoc = (type: DocumentType, side: DocumentSide) =>
    docs.find((d) => d.type === type && d.side === side);

  async function openDoc(id: string) {
    try {
      const res = await fetch(`/api/documents/view?documentId=${id}`);
      if (!res.ok) throw new Error();
      const { url } = (await res.json()) as { url: string };
      window.open(url, "_blank", "noreferrer");
    } catch {
      addToast("Impossibile aprire il documento.", "error");
    }
  }

  async function replace(slot: (typeof SLOTS)[number], file: File) {
    const key = slotKey(slot.type, slot.side);
    setBusyKey(key);
    try {
      const presignRes = await fetch("/api/documents/admin/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: userId,
          type: slot.type,
          side: slot.side,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size
        })
      });
      if (!presignRes.ok) throw new Error("presign");
      const { uploadUrl, storageKey } = (await presignRes.json()) as {
        uploadUrl: string;
        storageKey: string;
      };

      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type }
      });
      if (!put.ok) throw new Error("upload");

      const sha256 = await sha256Hex(file);

      const commitRes = await fetch("/api/documents/admin/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: userId,
          type: slot.type,
          side: slot.side,
          storageKey,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          sha256
        })
      });
      if (!commitRes.ok) throw new Error("commit");
      const data = (await commitRes.json()) as { id: string; status: DocumentStatus };

      setDocs((prev) => {
        const others = prev.filter((d) => !(d.type === slot.type && d.side === slot.side));
        const base = findDoc(slot.type, slot.side);
        const updated = {
          ...(base ?? ({} as UserDocument)),
          id: data.id,
          userId,
          type: slot.type,
          side: slot.side,
          status: data.status ?? DocumentStatus.APPROVED,
          storageKey,
          fileName: file.name
        } as UserDocument;
        return [...others, updated];
      });
      addToast("Documento caricato.", "success");
    } catch {
      addToast("Errore durante il caricamento.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function remove(doc: UserDocument) {
    if (!window.confirm("Rimuovere definitivamente questo documento?")) return;
    const key = slotKey(doc.type, doc.side);
    setBusyKey(key);
    try {
      const res = await fetch("/api/documents/admin/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: doc.id })
      });
      if (!res.ok) throw new Error();
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      addToast("Documento rimosso.", "success");
    } catch {
      addToast("Errore durante la rimozione.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="drawer-tab-content">
      <section className="user-drawer-section">
        <h4 className="user-drawer-section-title">Documenti</h4>
        <ul className="user-drawer-doc-list">
          {SLOTS.map((slot) => {
            const doc = findDoc(slot.type, slot.side);
            const key = slotKey(slot.type, slot.side);
            const busy = busyKey === key;
            return (
              <li
                key={key}
                className="user-drawer-doc-row"
                style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="user-drawer-doc-label">{slot.label}</span>
                  <StatusTag status={doc?.status} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {doc?.storageKey ? (
                    <Button
                      size="small"
                      type="text"
                      icon={<ExternalLink size={12} />}
                      onClick={() => void openDoc(doc.id)}
                      disabled={busy}
                    >
                      Apri
                    </Button>
                  ) : null}
                  <input
                    ref={(el) => {
                      fileInputs.current[key] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void replace(slot, f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="small"
                    icon={<Upload size={12} />}
                    onClick={() => fileInputs.current[key]?.click()}
                    loading={busy}
                  >
                    {doc ? "Sostituisci" : "Carica"}
                  </Button>
                  {doc ? (
                    <Button
                      size="small"
                      danger
                      type="text"
                      icon={<Trash2 size={12} />}
                      onClick={() => void remove(doc)}
                      disabled={busy}
                    >
                      Rimuovi
                    </Button>
                  ) : null}
                </div>
                {slot.type === DocumentType.MEDICAL_CERTIFICATE && doc ? (
                  <MedicalCertExpiryEditor key={`exp-${doc.id}`} userId={userId} doc={doc} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
