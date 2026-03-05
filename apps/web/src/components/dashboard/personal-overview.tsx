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
      <section className="panel panel-full">
        <p className="panel-kicker">Profilo personale</p>
        <h3 className="panel-title">Le tue informazioni</h3>

        <div className="overview-grid">
          <div className="overview-item">
            <small>Nome e cognome</small>
            <strong>{`${user.firstName} ${user.lastName}`}</strong>
          </div>

          <div className="overview-item">
            <small>Email</small>
            <strong>{user.email}</strong>
          </div>

          <div className="overview-item">
            <small>Ruolo</small>
            <strong>{roleLabel(user.role)}</strong>
          </div>

          <div className="overview-item">
            <small>Cellulare</small>
            <strong>{user.phoneNumber || "Non impostato"}</strong>
          </div>

          <div className="overview-item">
            <small>Abbonamento</small>
            <strong>
              {user.subscription
                ? `${tierLabel(user.subscription.tier)} - scade ${new Date(user.subscription.endsAt).toLocaleDateString("it-IT")}`
                : "Non assegnato"}
            </strong>
            {user.subscription ? (
              <p className={`status-badge ${subscriptionActive ? "ok" : "missing"}`}>
                {subscriptionActive ? "Attivo" : "Non attivo"}
              </p>
            ) : null}
          </div>

          <div className="overview-item">
            <small>Documenti obbligatori</small>
            <strong>
              {user.role === UserRole.SUBSCRIBER
                ? documentsReady
                  ? "Completati"
                  : `Mancano ${missingSlots.length} slot`
                : "Non vincolanti per il tuo ruolo"}
            </strong>
            {missingSlots.length > 0 ? (
              <p className="status-badge missing">
                {missingSlots.map((slot) => `${documentTypeLabel(slot.type)} (${documentSideLabel(slot.side)})`).join(", ")}
              </p>
            ) : null}
          </div>
        </div>

        <form action={updatePersonalInfoAction} className="grid-form compact">
          <label className="input-group">
            <span>Aggiorna cellulare</span>
            <input
              type="text"
              name="phoneNumber"
              placeholder="Es. +39 333 123 4567"
              defaultValue={user.phoneNumber ?? ""}
            />
          </label>

          <button type="submit" className="button button-ghost">
            Salva dati personali
          </button>
        </form>
      </section>

      <section className="panel panel-full">
        <p className="panel-kicker">Documenti personali</p>
        <h3 className="panel-title">Upload documenti</h3>
        {user.role === UserRole.SUBSCRIBER ? (
          <p className="subtitle">
            Per sbloccare l&apos;ingresso serve abbonamento attivo + approvazione di codice fiscale fronte/retro,
            documento identita&apos; fronte/retro e certificato medico valido.
          </p>
        ) : null}

        <div className="documents-slots-grid">
          {CORE_DOCUMENT_TYPES.map((type) => (
            <DocumentUploadCard key={type} type={type} documents={user.documents} />
          ))}
        </div>

        {requiredSlots.length === 0 ? (
          <p className="subtitle">Per il tuo ruolo questi documenti non sono bloccanti, ma puoi comunque caricarli.</p>
        ) : null}
      </section>

      <ProfilePhotoUploader document={profilePhoto} />
    </>
  );
}
