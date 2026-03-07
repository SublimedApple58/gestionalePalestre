import { CreditCard, FileText, Mail, MapPin, Phone, ShieldCheck, User } from "lucide-react";
import { DocumentSide, DocumentType, SubscriptionTier, UserRole, type UserDocument } from "@gestionale/db";

import { updatePersonalInfoAction } from "@/app/actions/dashboard-actions";
import {
  CORE_DOCUMENT_TYPES,
  documentSideLabel,
  documentTypeLabel,
  getDocumentSlot,
  getMissingDocumentSlots,
  getRequiredDocumentSlots,
  hasRequiredDocuments
} from "@/lib/documents";
import { roleLabel } from "@/lib/roles";
import { isSubscriptionActive, tierLabel } from "@/lib/subscription";

import { DocumentUploadCard } from "./document-upload-card";
import { ProfilePhotoUploader } from "./profile-photo-uploader";

type PersonalOverviewProps = {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string | null;
    address: string | null;
    role: UserRole;
    documents: UserDocument[];
    subscription: {
      tier: SubscriptionTier;
      startsAt: Date;
      endsAt: Date;
    } | null;
  };
};

export function PersonalOverview({ user }: PersonalOverviewProps) {
  const missingSlots = getMissingDocumentSlots(user.role, user.documents);
  const documentsReady = hasRequiredDocuments(user.role, user.documents);
  const subscriptionActive = isSubscriptionActive(user.subscription);
  const requiredSlots = getRequiredDocumentSlots(user.role);

  const profilePhoto = getDocumentSlot(user.documents, {
    type: DocumentType.PROFILE_PHOTO,
    side: DocumentSide.SINGLE
  });

  return (
    <>
      {/* ── Layout principale: identity card + informazioni ─────── */}
      <div className="profilo-layout">

        {/* ── Colonna sinistra: identity card ─────────────────────── */}
        <div className="profilo-identity-card">
          <div className="profilo-identity-avatar">
            {user.firstName.charAt(0).toUpperCase()}
          </div>

          <div className="profilo-identity-text">
            <div className="profilo-identity-name">
              {`${user.firstName} ${user.lastName}`}
            </div>
            <div className="profilo-identity-email">{user.email}</div>
            <div className="profilo-identity-badges">
              <span className="td-role-badge" data-role={user.role}>
                {roleLabel(user.role)}
              </span>
              {user.subscription && (
                <span className={`status-badge ${subscriptionActive ? "ok" : "missing"}`}>
                  {subscriptionActive ? "Attivo" : "Scaduto"}
                </span>
              )}
            </div>
          </div>

          <div className="profilo-identity-divider" />

          <div className="profilo-identity-stats">
            <div className="profilo-stat-row">
              <span className="profilo-stat-label">Abbonamento</span>
              <span className="profilo-stat-value">
                {user.subscription ? tierLabel(user.subscription.tier) : "—"}
              </span>
            </div>

            {user.subscription && (
              <div className="profilo-stat-row">
                <span className="profilo-stat-label">Scadenza</span>
                <span className="profilo-stat-value">
                  {new Date(user.subscription.endsAt).toLocaleDateString("it-IT")}
                </span>
              </div>
            )}

            <div className="profilo-stat-row">
              <span className="profilo-stat-label">Documenti</span>
              {user.role === UserRole.SUBSCRIBER ? (
                <span className={`status-badge ${documentsReady ? "ok" : "missing"}`}>
                  {documentsReady ? "Completi" : `${missingSlots.length} mancanti`}
                </span>
              ) : (
                <span className="profilo-stat-value">—</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Colonna destra: info + form ──────────────────────────── */}
        <div className="profilo-right-col">

          {/* Scheda informazioni */}
          <div className="profilo-info-card">
            <div className="profilo-section-header">
              <p className="panel-kicker">Profilo personale</p>
              <h3 className="panel-title">Le tue informazioni</h3>
            </div>

            <ul className="profilo-info-list">
              <li className="profilo-info-row">
                <span className="profilo-info-label">
                  <User size={12} className="profilo-info-label-icon" aria-hidden="true" />
                  Nome e cognome
                </span>
                <span className="profilo-info-value">
                  {`${user.firstName} ${user.lastName}`}
                </span>
              </li>

              <li className="profilo-info-row">
                <span className="profilo-info-label">
                  <Mail size={12} className="profilo-info-label-icon" aria-hidden="true" />
                  Email
                </span>
                <span className="profilo-info-value">{user.email}</span>
              </li>

              <li className="profilo-info-row">
                <span className="profilo-info-label">
                  <Phone size={12} className="profilo-info-label-icon" aria-hidden="true" />
                  Cellulare
                </span>
                <span className="profilo-info-value">
                  {user.phoneNumber
                    ? user.phoneNumber
                    : <span className="profilo-info-empty">Non impostato</span>}
                </span>
              </li>

              <li className="profilo-info-row">
                <span className="profilo-info-label">
                  <MapPin size={12} className="profilo-info-label-icon" aria-hidden="true" />
                  Indirizzo
                </span>
                <span className="profilo-info-value">
                  {user.address
                    ? user.address
                    : <span className="profilo-info-empty">Non impostato</span>}
                </span>
              </li>

              <li className="profilo-info-row">
                <span className="profilo-info-label">
                  <CreditCard size={12} className="profilo-info-label-icon" aria-hidden="true" />
                  Abbonamento
                </span>
                <span className="profilo-info-value">
                  {user.subscription ? (
                    <>
                      <span>{tierLabel(user.subscription.tier)}</span>
                      <span className="profilo-info-sub">
                        Scade il {new Date(user.subscription.endsAt).toLocaleDateString("it-IT")}
                      </span>
                    </>
                  ) : (
                    <span className="profilo-info-empty">Non assegnato</span>
                  )}
                </span>
              </li>

              {user.role === UserRole.SUBSCRIBER && (
                <li className="profilo-info-row">
                  <span className="profilo-info-label">
                    <FileText size={12} className="profilo-info-label-icon" aria-hidden="true" />
                    Documenti
                  </span>
                  <span className="profilo-info-value">
                    {documentsReady ? (
                      <span className="status-badge ok">Completi</span>
                    ) : (
                      <>
                        <span className="status-badge missing">
                          {missingSlots.length} slot mancanti
                        </span>
                        {missingSlots.length > 0 && (
                          <span className="profilo-info-sub profilo-info-missing-list">
                            {missingSlots
                              .slice(0, 3)
                              .map((s) => `${documentTypeLabel(s.type)} (${documentSideLabel(s.side)})`)
                              .join(", ")}
                            {missingSlots.length > 3 ? ` +${missingSlots.length - 3}` : ""}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </li>
              )}

              <li className="profilo-info-row">
                <span className="profilo-info-label">
                  <ShieldCheck size={12} className="profilo-info-label-icon" aria-hidden="true" />
                  Ruolo
                </span>
                <span className="profilo-info-value">
                  <span className="td-role-badge" data-role={user.role}>
                    {roleLabel(user.role)}
                  </span>
                </span>
              </li>
            </ul>
          </div>

          {/* Scheda modifica */}
          <div className="profilo-edit-card">
            <div className="profilo-section-header">
              <p className="panel-kicker">Aggiorna</p>
              <h3 className="panel-title">Modifica dati personali</h3>
            </div>

            <form action={updatePersonalInfoAction} className="profilo-edit-form">
              <div className="profilo-edit-grid">
                <label className="input-group">
                  <span>Cellulare</span>
                  <input
                    type="tel"
                    name="phoneNumber"
                    placeholder="Es. +39 333 123 4567"
                    defaultValue={user.phoneNumber ?? ""}
                    autoComplete="tel"
                  />
                </label>

                <label className="input-group">
                  <span>Indirizzo di residenza</span>
                  <input
                    type="text"
                    name="address"
                    placeholder="Es. Via Roma 1, 20100 Milano"
                    defaultValue={user.address ?? ""}
                    autoComplete="street-address"
                  />
                </label>
              </div>

              <div className="profilo-edit-actions">
                <button type="submit" className="button button-primary">
                  Salva modifiche
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>

      {/* ── Documenti personali ──────────────────────────────────── */}
      <section className="panel panel-full">
        <div>
          <p className="panel-kicker">Documenti personali</p>
          <h3 className="panel-title">Upload documenti</h3>
          {user.role === UserRole.SUBSCRIBER ? (
            <p className="subtitle">
              Per sbloccare l&apos;ingresso servono abbonamento attivo + approvazione di codice
              fiscale fronte/retro, documento identità fronte/retro e certificato medico valido.
            </p>
          ) : null}
        </div>

        <div className="documents-slots-grid">
          {CORE_DOCUMENT_TYPES.map((type) => (
            <DocumentUploadCard key={type} type={type} documents={user.documents} />
          ))}
        </div>

        {requiredSlots.length === 0 ? (
          <p className="subtitle">
            Per il tuo ruolo questi documenti non sono bloccanti, ma puoi comunque caricarli.
          </p>
        ) : null}
      </section>

      {/* ── Foto profilo ─────────────────────────────────────────── */}
      <ProfilePhotoUploader document={profilePhoto} />
    </>
  );
}
