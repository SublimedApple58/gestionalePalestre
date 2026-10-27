"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Input } from "antd";
import { DocumentType, type UserDocument } from "@gestionale/db";
import { KeyRound, PencilLine } from "lucide-react";

import { type ActionResult, updateUserProfileActionState } from "@/app/actions/dashboard-actions";
import { useToast } from "@/components/ui/toast-provider";

export type ProfileUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  address: string | null;
  dateOfBirth: Date | null;
  documents: UserDocument[];
};

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  address: string;
  dateOfBirth: string;
  taxCode: string;
};

/** Date di nascita a mezzanotte UTC → "YYYY-MM-DD" (mai il fuso locale). */
function toYmdUtc(date: Date | null): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

function formatBirth(ymd: string): string | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function initialState(user: ProfileUser, taxCode: string | null): FormState {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber ?? "",
    address: user.address ?? "",
    dateOfBirth: toYmdUtc(user.dateOfBirth),
    taxCode: taxCode ?? ""
  };
}

function Value({ children }: { children: string | null }) {
  return children ? (
    <dd className="profile-value">{children}</dd>
  ) : (
    <dd className="profile-value profile-value--empty">Non inserito</dd>
  );
}

/**
 * Anagrafica dell'iscritto nella scheda /utenti: lettura compatta, e con
 * "Modifica" gli stessi campi diventano editabili sul posto. Un solo
 * salvataggio per tutti i campi (audit before/after sui soli campi cambiati).
 */
export function UserProfileSection({ user }: { user: ProfileUser }) {
  const { addToast } = useToast();
  const [result, action, pending] = useActionState<ActionResult, FormData>(
    updateUserProfileActionState,
    null
  );
  const taxDocs = user.documents.filter((d) => d.type === DocumentType.TAX_CODE);
  const taxCode = taxDocs.find((d) => d.extractedTaxCode)?.extractedTaxCode ?? null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialState(user, taxCode));

  // Salvataggio riuscito → si torna alla lettura (aggiustamento in render,
  // non in un effect).
  const [handledResult, setHandledResult] = useState<ActionResult>(null);
  if (result !== handledResult) {
    setHandledResult(result);
    if (result?.ok) setEditing(false);
  }

  useEffect(() => {
    if (!result) return;
    addToast(result.message, !result.ok ? "error" : result.warning ? "warning" : "success");
  }, [result, addToast]);

  const startEditing = () => {
    setForm(initialState(user, taxCode));
    setEditing(true);
  };

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const emailChanged = form.email.trim().toLowerCase() !== user.email.toLowerCase();

  if (!editing) {
    return (
      <section className="user-drawer-section profile-section">
        <div className="user-drawer-section-head">
          <h4 className="user-drawer-section-title">Anagrafica</h4>
          <button type="button" className="profile-edit-btn" onClick={startEditing}>
            <PencilLine size={13} strokeWidth={2.2} />
            Modifica
          </button>
        </div>
        <dl className="profile-grid">
          <div className="profile-cell">
            <dt>Nome</dt>
            <Value>{user.firstName}</Value>
          </div>
          <div className="profile-cell">
            <dt>Cognome</dt>
            <Value>{user.lastName}</Value>
          </div>
          <div className="profile-cell profile-cell--wide">
            <dt>
              Email <span className="profile-login-tag">login</span>
            </dt>
            <Value>{user.email}</Value>
          </div>
          <div className="profile-cell">
            <dt>Telefono</dt>
            <Value>{user.phoneNumber}</Value>
          </div>
          <div className="profile-cell">
            <dt>Data di nascita</dt>
            <Value>{formatBirth(toYmdUtc(user.dateOfBirth))}</Value>
          </div>
          <div className="profile-cell profile-cell--wide">
            <dt>Codice fiscale</dt>
            <dd className={`profile-value profile-mono${taxCode ? "" : " profile-value--empty"}`}>
              {taxCode ?? (taxDocs.length ? "Non letto dalla tessera" : "Tessera non caricata")}
            </dd>
          </div>
          <div className="profile-cell profile-cell--wide">
            <dt>Indirizzo</dt>
            <Value>{user.address}</Value>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className="user-drawer-section profile-section profile-section--editing">
      <div className="user-drawer-section-head">
        <h4 className="user-drawer-section-title">Modifica anagrafica</h4>
      </div>
      <form action={action} className="profile-form">
        <input type="hidden" name="targetUserId" value={user.id} />
        <div className="profile-grid">
          <label className="profile-cell">
            <span className="profile-label">Nome</span>
            <Input name="firstName" value={form.firstName} onChange={set("firstName")} className="dark-input" required autoComplete="off" />
          </label>
          <label className="profile-cell">
            <span className="profile-label">Cognome</span>
            <Input name="lastName" value={form.lastName} onChange={set("lastName")} className="dark-input" required autoComplete="off" />
          </label>
          <label className="profile-cell profile-cell--wide">
            <span className="profile-label">
              Email <span className="profile-login-tag">login</span>
            </span>
            <Input name="email" type="email" value={form.email} onChange={set("email")} className="dark-input" required autoComplete="off" />
            {emailChanged ? (
              <span className="profile-note profile-note--warn">
                <KeyRound size={13} strokeWidth={2.2} />
                <span>
                  È l&apos;email di accesso: da ora l&apos;iscritto entra con questa, scritta esattamente così
                  (maiuscole comprese). La password non cambia e chi è già collegato resta dentro.
                </span>
              </span>
            ) : null}
          </label>
          <label className="profile-cell">
            <span className="profile-label">Telefono</span>
            <Input name="phoneNumber" type="tel" value={form.phoneNumber} onChange={set("phoneNumber")} className="dark-input" placeholder="+39 333 123 4567" autoComplete="off" />
          </label>
          <label className="profile-cell">
            <span className="profile-label">Data di nascita</span>
            <Input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} className="dark-input profile-date" max={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="profile-cell profile-cell--wide">
            <span className="profile-label">Codice fiscale</span>
            <Input
              name="taxCode"
              value={form.taxCode}
              onChange={(e) => setForm((prev) => ({ ...prev, taxCode: e.target.value.toUpperCase() }))}
              className="dark-input profile-mono"
              maxLength={16}
              disabled={taxDocs.length === 0}
              placeholder={taxDocs.length === 0 ? "Carica prima la tessera sanitaria" : "RSSMRA80A01H501U"}
              autoComplete="off"
            />
            {taxDocs.length === 0 ? (
              <span className="profile-note">Il codice fiscale si salva sulla tessera: caricala dalla scheda Documenti.</span>
            ) : null}
          </label>
          <label className="profile-cell profile-cell--wide">
            <span className="profile-label">Indirizzo</span>
            <Input name="address" value={form.address} onChange={set("address")} className="dark-input" placeholder="Via Roma 1, 20100 Milano" autoComplete="off" />
          </label>
        </div>
        <div className="profile-actions">
          <Button size="small" onClick={() => setEditing(false)} disabled={pending}>
            Annulla
          </Button>
          <Button type="primary" htmlType="submit" size="small" loading={pending}>
            Salva anagrafica
          </Button>
        </div>
      </form>
    </section>
  );
}
