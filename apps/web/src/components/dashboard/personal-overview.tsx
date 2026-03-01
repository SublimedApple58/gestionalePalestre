import { DocumentType, SubscriptionTier, UserRole, type UserDocument } from "@gestionale/db";

import { updatePersonalInfoAction, uploadMyDocumentAction } from "@/app/actions/dashboard-actions";
import {
  ALL_DOCUMENT_TYPES,
  documentTypeLabel,
  getMissingDocumentTypes,
  hasRequiredDocuments
} from "@/lib/documents";
import { roleLabel } from "@/lib/roles";
import { isSubscriptionActive, tierLabel } from "@/lib/subscription";

import { CustomSelect } from "../ui/custom-select";

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

function getDocumentByType(documents: UserDocument[], type: DocumentType): UserDocument | null {
  return documents.find((document) => document.type === type) ?? null;
}

export function PersonalOverview({ user }: PersonalOverviewProps) {
  const missingDocuments = getMissingDocumentTypes(user.role, user.documents);
  const documentsReady = hasRequiredDocuments(user.role, user.documents);
  const subscriptionActive = isSubscriptionActive(user.subscription);
  const documentOptions = ALL_DOCUMENT_TYPES.map((documentType) => ({
    value: documentType,
    label: documentTypeLabel(documentType)
  }));

  return (
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
                : `Mancano ${missingDocuments.length}`
              : "Non vincolanti per il tuo ruolo"}
          </strong>
          {missingDocuments.length > 0 ? (
            <p className="status-badge missing">
              {missingDocuments.map((type) => documentTypeLabel(type)).join(", ")}
            </p>
          ) : null}
        </div>
      </div>

      <form action={updatePersonalInfoAction} className="grid-form compact">
        <label className="input-group">
          <span>Aggiorna cellulare</span>
          <input type="text" name="phoneNumber" placeholder="Es. +39 333 123 4567" defaultValue={user.phoneNumber ?? ""} />
        </label>

        <button type="submit" className="button button-ghost">
          Salva dati personali
        </button>
      </form>

      <div className="documents-summary">
        <p className="panel-kicker">Documenti caricati (stato backend)</p>
        <ul className="event-list">
          {ALL_DOCUMENT_TYPES.map((documentType) => {
            const uploaded = getDocumentByType(user.documents, documentType);
            return (
              <li key={documentType}>
                <strong>{documentTypeLabel(documentType)}</strong>
                {uploaded ? (
                  <p>{`Presente (${uploaded.fileLabel}) - ${new Date(uploaded.uploadedAt).toLocaleDateString("it-IT")}`}</p>
                ) : (
                  <p className="status-badge missing">Non caricato</p>
                )}
              </li>
            );
          })}
        </ul>

        <form action={uploadMyDocumentAction} className="grid-form compact">
          <CustomSelect
            name="type"
            label="Tipo documento"
            options={documentOptions}
            defaultValue={DocumentType.TAX_CODE}
            required
          />

          <label className="input-group">
            <span>Nome file (mock)</span>
            <input type="text" name="fileLabel" required placeholder="es. certificato_medico_mario_rossi.pdf" />
          </label>

          <button type="submit" className="button button-primary">
            Carica documento (mock)
          </button>
        </form>
      </div>
    </section>
  );
}
