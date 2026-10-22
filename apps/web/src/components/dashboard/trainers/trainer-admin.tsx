"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, Input, Popconfirm, Switch } from "antd";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Pencil, Plus, UserRound } from "lucide-react";

import {
  createTrainerPhotoUploadUrlAction,
  deleteTrainerAction,
  moveTrainerAction,
  saveTrainerAction,
  setTrainerVisibilityAction,
  type TrainerActionResult
} from "@/app/actions/trainer-actions";
import { useToast } from "@/components/ui/toast-provider";
import {
  bioPlainText,
  formatItalianMobile,
  normalizeItalianMobile,
  TRAINER_BIO_MAX_LENGTH,
  TRAINER_PHOTO_MAX_BYTES,
  TRAINER_PHOTO_MIME_TYPES,
  whatsappLink
} from "@/lib/trainers";

import { TrainerBio } from "./trainer-bio";

export type AdminTrainer = {
  id: string;
  firstName: string;
  lastName: string;
  bio: string;
  whatsappNumber: string;
  isVisible: boolean;
  photoUrl: string | null;
};

type Draft = {
  id: string | null;
  firstName: string;
  lastName: string;
  bio: string;
  whatsappNumber: string;
  isVisible: boolean;
  photoUrl: string | null;
  newPhoto: { storageKey: string; mimeType: string } | null;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  firstName: "",
  lastName: "",
  bio: "",
  whatsappNumber: "",
  isVisible: true,
  photoUrl: null,
  newPhoto: null
};

export function TrainerAdmin({ trainers }: { trainers: AdminTrainer[] }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<TrainerActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      const result = await action();
      addToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        onOk?.();
        router.refresh();
      }
    });

  const openEdit = (t: AdminTrainer) => setDraft({ ...t, whatsappNumber: formatItalianMobile(t.whatsappNumber), newPhoto: null });

  return (
    <main className="dashboard-shell">
    <section className="trainers-admin">
      <header className="trainers-admin-head">
        <div>
          <span className="trainers-admin-eyebrow">Vetrina · app iscritti e sito</span>
          <h1 className="trainers-admin-title">Personal trainer</h1>
          <p className="trainers-admin-lead">
            L&apos;ordine e la visibilità qui valgono sia per l&apos;app sia per houseofmuscle.it (aggiornamento entro ~5 minuti).
          </p>
        </div>
        <button type="button" className="button button-primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <Plus size={16} /> Nuovo trainer
        </button>
      </header>

      {trainers.length === 0 ? (
        <div className="trainers-admin-empty">
          Nessun trainer. Aggiungine uno: comparirà nell&apos;app degli iscritti e sul sito.
        </div>
      ) : (
        <ol className="trainers-admin-list">
          {trainers.map((t, index) => (
            <li key={t.id} className={`trainers-admin-row${t.isVisible ? "" : " is-hidden"}`}>
              <div className="trainers-admin-order">
                <button
                  type="button"
                  aria-label={`Sposta ${t.firstName} su`}
                  disabled={pending || index === 0}
                  onClick={() => run(() => moveTrainerAction(t.id, -1))}
                >
                  <ArrowUp size={14} />
                </button>
                <span>{index + 1}</span>
                <button
                  type="button"
                  aria-label={`Sposta ${t.firstName} giù`}
                  disabled={pending || index === trainers.length - 1}
                  onClick={() => run(() => moveTrainerAction(t.id, 1))}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
              {t.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="trainers-admin-thumb" src={t.photoUrl} alt="" />
              ) : (
                <span className="trainers-admin-thumb is-empty">
                  <UserRound size={22} />
                </span>
              )}
              <div className="trainers-admin-main">
                <div className="trainers-admin-name">
                  {t.firstName} {t.lastName}
                </div>
                <div className="trainers-admin-excerpt">{bioPlainText(t.bio)}</div>
              </div>
              <div className="trainers-admin-phone">{formatItalianMobile(t.whatsappNumber)}</div>
              <label className="trainers-admin-visible">
                <Switch
                  size="small"
                  checked={t.isVisible}
                  disabled={pending}
                  onChange={(checked) => run(() => setTrainerVisibilityAction(t.id, checked))}
                />
                <span>{t.isVisible ? "Visibile" : "Nascosto"}</span>
              </label>
              <button type="button" className="trainers-admin-edit" aria-label={`Modifica ${t.firstName}`} onClick={() => openEdit(t)}>
                <Pencil size={15} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <TrainerDrawer
        draft={draft}
        pending={pending}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSave={(d) =>
          run(
            () =>
              saveTrainerAction({
                id: d.id,
                firstName: d.firstName,
                lastName: d.lastName,
                bio: d.bio,
                whatsappNumber: d.whatsappNumber,
                isVisible: d.isVisible,
                newPhoto: d.newPhoto
              }),
            () => setDraft(null)
          )
        }
        onDelete={(id) => run(() => deleteTrainerAction(id), () => setDraft(null))}
      />
    </section>
    </main>
  );
}

function TrainerDrawer({
  draft,
  pending,
  onChange,
  onClose,
  onSave,
  onDelete
}: {
  draft: Draft | null;
  pending: boolean;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: (d: Draft) => void;
  onDelete: (id: string) => void;
}) {
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Libera l'anteprima locale (object URL) quando cambia o si chiude il drawer.
  const localPreview = draft?.newPhoto ? draft.photoUrl : null;
  useEffect(() => {
    return () => {
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  if (!draft) return <Drawer open={false} />;

  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const phone = normalizeItalianMobile(draft.whatsappNumber);
  const canSave =
    draft.firstName.trim() && draft.lastName.trim() && draft.bio.trim() && phone && !uploading && !pending;

  async function onPickPhoto(file: File | undefined) {
    if (!file || !draft) return;
    if (!(TRAINER_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      addToast("Formato non supportato: usa JPG, PNG o WEBP.", "error");
      return;
    }
    if (file.size > TRAINER_PHOTO_MAX_BYTES) {
      addToast("La foto deve pesare al massimo 5 MB.", "error");
      return;
    }
    setUploading(true);
    try {
      const res = await createTrainerPhotoUploadUrlAction({ fileName: file.name, mimeType: file.type, fileSize: file.size });
      if (!res.ok) {
        addToast(res.message, "error");
        return;
      }
      const put = await fetch(res.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) {
        addToast("Caricamento della foto non riuscito, riprova.", "error");
        return;
      }
      onChange({ ...draft, newPhoto: { storageKey: res.storageKey, mimeType: file.type }, photoUrl: URL.createObjectURL(file) });
    } catch {
      addToast("Caricamento della foto non riuscito, riprova.", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      placement="right"
      width={480}
      title={draft.id ? "Modifica trainer" : "Nuovo trainer"}
      className="dark-drawer"
      styles={{
        content: {
          background:
            "radial-gradient(ellipse at 100% 0%, rgba(223,37,49,0.1), transparent 50%), linear-gradient(180deg,rgba(18,18,26,0.99) 0%,rgba(10,10,16,1) 100%)",
          borderLeft: "1px solid rgba(223,37,49,0.22)"
        }
      }}
      footer={
        <div className="trainers-drawer-footer">
          {draft.id ? (
            <Popconfirm
              title="Eliminare il trainer?"
              description="Sparisce da app e sito. Per toglierlo solo temporaneamente usa “Visibile”."
              okText="Elimina"
              cancelText="Annulla"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(draft.id as string)}
            >
              <Button danger disabled={pending}>
                Elimina
              </Button>
            </Popconfirm>
          ) : (
            <span />
          )}
          <div className="trainers-drawer-footer-actions">
            <Button onClick={onClose}>Annulla</Button>
            <Button type="primary" disabled={!canSave} loading={pending} onClick={() => onSave(draft)}>
              Salva
            </Button>
          </div>
        </div>
      }
    >
      <div className="trainers-drawer">
        <div className="trainers-drawer-photo">
          {draft.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.photoUrl} alt="" />
          ) : (
            <span className="is-empty">
              <UserRound size={34} />
            </span>
          )}
          <div>
            <Button icon={<ImagePlus size={15} />} loading={uploading} onClick={() => fileRef.current?.click()}>
              {draft.photoUrl ? "Cambia foto" : "Carica foto"}
            </Button>
            <p className="trainers-drawer-hint">
              JPG, PNG o WEBP, max 5 MB.
              <br />
              Viene mostrata verticale (4:5): meglio una foto a mezzo busto.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept={TRAINER_PHOTO_MIME_TYPES.join(",")}
              hidden
              onChange={(e) => onPickPhoto(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="trainers-drawer-two">
          <label className="trainers-drawer-field">
            <span>Nome</span>
            <Input value={draft.firstName} maxLength={60} onChange={(e) => set({ firstName: e.target.value })} />
          </label>
          <label className="trainers-drawer-field">
            <span>Cognome</span>
            <Input value={draft.lastName} maxLength={60} onChange={(e) => set({ lastName: e.target.value })} />
          </label>
        </div>

        <label className="trainers-drawer-field">
          <span>WhatsApp</span>
          <div className="trainers-drawer-phone">
            <Input
              prefix="+39"
              inputMode="tel"
              placeholder="338 123 4567"
              value={draft.whatsappNumber}
              status={draft.whatsappNumber && !phone ? "error" : undefined}
              onChange={(e) => set({ whatsappNumber: e.target.value })}
            />
            <Button
              icon={<ExternalLink size={14} />}
              disabled={!phone}
              href={phone ? whatsappLink(phone) : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              Prova link
            </Button>
          </div>
          {draft.whatsappNumber && !phone ? (
            <small className="trainers-drawer-error">Serve un cellulare italiano (es. 338 123 4567).</small>
          ) : null}
        </label>

        <label className="trainers-drawer-field">
          <span>
            Bio <em>· **testo** = grassetto · ==testo== = rosso · riga che inizia con “• ” = elenco</em>
          </span>
          <Input.TextArea
            value={draft.bio}
            autoSize={{ minRows: 6, maxRows: 14 }}
            maxLength={TRAINER_BIO_MAX_LENGTH}
            showCount
            onChange={(e) => set({ bio: e.target.value })}
          />
        </label>

        {draft.bio.trim() ? (
          <div className="trainers-drawer-preview">
            <span className="trainers-admin-eyebrow">Anteprima</span>
            <TrainerBio bio={draft.bio} />
          </div>
        ) : null}

        <label className="trainers-drawer-visible">
          <div>
            <strong>Visibile</strong>
            <small>In app e sul sito</small>
          </div>
          <Switch checked={draft.isVisible} onChange={(checked) => set({ isVisible: checked })} />
        </label>
      </div>
    </Drawer>
  );
}
