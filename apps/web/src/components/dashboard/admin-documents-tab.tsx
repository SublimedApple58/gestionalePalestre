"use client";

import { Button, Tag } from "antd";
import { ExternalLink, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  DocumentSide,
  DocumentStatus,
  DocumentType,
  type UserDocument
} from "@gestionale/db";

import { useToast } from "@/components/ui/toast-provider";

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
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
