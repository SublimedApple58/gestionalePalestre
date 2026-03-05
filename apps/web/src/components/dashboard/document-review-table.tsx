import { DocumentType, type UserDocument } from "@gestionale/db";

import {
  approveDocumentAction,
  rejectDocumentAction,
  requestReuploadAction
} from "@/app/actions/dashboard-actions";
import {
  documentSideLabel,
  documentStatusLabel,
  documentTypeLabel
} from "@/lib/documents";
import { CustomCalendar } from "@/components/ui/custom-calendar";

type ReviewDocumentRow = UserDocument & {
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  previewUrl: string | null;
};

type DocumentReviewTableProps = {
  documents: ReviewDocumentRow[];
  /** Render senza wrapper panel (es. quando già dentro un panel) */
  embedded?: boolean;
};

export function DocumentReviewTable({ documents, embedded }: DocumentReviewTableProps) {
  const inner = (
    <>
      {documents.length === 0 ? (
        <div className="empty-state">Nessun documento in revisione.</div>
      ) : (
        <div className="table-wrapper responsive-table">
          <table>
            <thead>
              <tr>
                <th>Utente</th>
                <th>Documento</th>
                <th>Stato</th>
                <th>Dati estratti</th>
                <th>Preview</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td data-label="Utente">
                    <div>
                      <strong>{`${document.user.firstName} ${document.user.lastName}`}</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                        {document.user.email}
                      </p>
                    </div>
                  </td>

                  <td data-label="Documento">
                    <div>
                      <p style={{ margin: 0 }}>{`${documentTypeLabel(document.type)} — ${documentSideLabel(document.side)}`}</p>
                      <small style={{ color: "var(--text-muted)" }}>{document.fileName}</small>
                      {document.type === DocumentType.MEDICAL_CERTIFICATE ? (
                        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                          {`Scadenza: ${
                            document.medicalCertificateExpiresAt
                              ? new Date(document.medicalCertificateExpiresAt).toLocaleDateString("it-IT")
                              : "non impostata"
                          }`}
                        </p>
                      ) : null}
                    </div>
                  </td>

                  <td data-label="Stato">
                    <span className="status-badge warning">{documentStatusLabel(document.status)}</span>
                  </td>

                  <td data-label="Dati AI">
                    <div style={{ display: "grid", gap: "2px", fontSize: "13px" }}>
                      <span>{`CF: ${document.extractedTaxCode ?? "—"}`}</span>
                      <span>{`Doc ID: ${document.extractedIdentityNumber ?? "—"}`}</span>
                      <span>{`Confidenza: ${document.aiConfidence ? document.aiConfidence.toFixed(2) : "—"}`}</span>
                    </div>
                  </td>

                  <td data-label="Preview">
                    {document.previewUrl ? (
                      <a href={document.previewUrl} target="_blank" rel="noreferrer" className="button button-ghost small">
                        Apri file
                      </a>
                    ) : (
                      <small style={{ color: "var(--text-muted)" }}>Non disponibile</small>
                    )}
                  </td>

                  <td data-label="Azioni" className="td-actions">
                    <div className="row-actions">
                      <form action={approveDocumentAction} className="grid-form">
                        <input type="hidden" name="documentId" value={document.id} />
                        {document.type === DocumentType.MEDICAL_CERTIFICATE ? (
                          <CustomCalendar
                            name="medicalCertificateExpiresAt"
                            label="Scadenza certificato"
                            defaultValue={
                              document.medicalCertificateExpiresAt
                                ? new Date(document.medicalCertificateExpiresAt).toISOString().slice(0, 10)
                                : undefined
                            }
                            required
                          />
                        ) : null}
                        <button type="submit" className="button button-primary small">
                          Approva
                        </button>
                      </form>

                      <form action={rejectDocumentAction} className="grid-form">
                        <input type="hidden" name="documentId" value={document.id} />
                        <label className="input-group">
                          <span>Motivo rifiuto</span>
                          <input type="text" name="rejectionReason" required minLength={4} maxLength={400} />
                        </label>
                        <button type="submit" className="button button-danger small">
                          Rifiuta
                        </button>
                      </form>

                      <form action={requestReuploadAction} className="grid-form">
                        <input type="hidden" name="documentId" value={document.id} />
                        <label className="input-group">
                          <span>Richiedi reupload</span>
                          <input
                            type="text"
                            name="reason"
                            placeholder="Immagine sfocata o incompleta"
                            minLength={4}
                            maxLength={400}
                          />
                        </label>
                        <button type="submit" className="button button-ghost small">
                          Da rifare
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  if (embedded) {
    return inner;
  }

  return (
    <section className="panel panel-full">
      <div>
        <p className="panel-kicker">Revisione documenti</p>
        <h3 className="panel-title">In attesa di validazione admin</h3>
      </div>
      {inner}
    </section>
  );
}
