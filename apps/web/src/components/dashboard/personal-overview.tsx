import { Camera, CreditCard, FileText, Mail, MapPin, Phone, ShieldCheck, User } from "lucide-react";
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

import { UserAvatar } from "../ui/user-avatar";
import { DocumentUploadCard } from "./document-upload-card";
import { ProfilePhotoUploadButton } from "./profile-photo-upload-button";

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
  profilePhotoUrl?: string | null;
};

export function PersonalOverview({ user, profilePhotoUrl }: PersonalOverviewProps) {
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
      {/* ── Header card: avatar + identity ────────────────────────── */}
      <div className="profilo-header-card">
        <div className="profilo-header-top">
          {/* Avatar con overlay upload */}
          <div className="profilo-avatar-wrap">
            <UserAvatar
              firstName={user.firstName}
              profilePhotoUrl={profilePhotoUrl}
              size="lg"
            />
            <ProfilePhotoUploadButton document={profilePhoto}>
              <span className="profilo-avatar-upload-overlay" aria-label="Cambia foto profilo">
                <Camera size={16} />
              </span>
            </ProfilePhotoUploadButton>
          </div>

          {/* Identity text */}
          <div className="profilo-header-info">
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
        </div>

        {/* Stats row */}
        <div className="profilo-header-stats">
          <div className="profilo-header-stat">
            <span className="profilo-stat-label">Abbonamento</span>
            <span className="profilo-stat-value">
              {user.subscription ? tierLabel(user.subscription.tier) : "—"}
            </span>
          </div>

          {user.subscription && (
            <div className="profilo-header-stat">
              <span className="profilo-stat-label">Scadenza</span>
              <span className="profilo-stat-value">
                {new Date(user.subscription.endsAt).toLocaleDateString("it-IT")}
              </span>
            </div>
          )}

          {user.role === UserRole.SUBSCRIBER && (
            <div className="profilo-header-stat">
              <span className="profilo-stat-label">Documenti</span>
              <span className={`status-badge ${documentsReady ? "ok" : "missing"}`}>
                {documentsReady ? "Completi" : `${missingSlots.length} mancanti`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Informazioni + Modifica (unified card) ────────────────── */}
      <div className="profilo-info-card">
        <div className="profilo-section-header">
          <p className="panel-kicker">Profilo personale</p>
          <h3 className="panel-title">Informazioni e dati personali</h3>
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

        {/* Inline edit form */}
        <div className="profilo-edit-divider" />

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
    </>
  );
}
