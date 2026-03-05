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
};

export function DocumentReviewTable({ documents }: DocumentReviewTableProps) {
  return (
    <section className="panel panel-full">
      <p className="panel-kicker">Revisione documenti</p>
      <h3 className="panel-title">In attesa di validazione admin</h3>

      {documents.length === 0 ? (
        <p>Nessun documento in revisione.</p>
      ) : (
        <div className="table-wrapper">
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
                  <td>
                    <strong>{`${document.user.firstName} ${document.user.lastName}`}</strong>
                    <p>{document.user.email}</p>
                  </td>
                  <td>
                    <p>{`${documentTypeLabel(document.type)} - ${documentSideLabel(document.side)}`}</p>
                    <small>{document.fileName}</small>
                    {document.type === DocumentType.MEDICAL_CERTIFICATE ? (
                      <p>
                        Scadenza:{" "}
                        {document.medicalCertificateExpiresAt
                          ? new Date(document.medicalCertificateExpiresAt).toLocaleDateString("it-IT")
                          : "non impostata"}
                      </p>
                    ) : null}
                  </td>
                  <td>
                    <p className="status-badge warning">{documentStatusLabel(document.status)}</p>
                  </td>
                  <td>
                    <p>{`CF: ${document.extractedTaxCode ?? "-"}`}</p>
                    <p>{`Doc ID: ${document.extractedIdentityNumber ?? "-"}`}</p>
                    <p>{`Confidenza: ${document.aiConfidence ? document.aiConfidence.toFixed(2) : "-"}`}</p>
                  </td>
                  <td>
                    {document.previewUrl ? (
                      <a href={document.previewUrl} target="_blank" rel="noreferrer" className="button button-ghost small">
                        Apri file
                      </a>
                    ) : (
                      <small>Preview non disponibile</small>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <form action={approveDocumentAction} className="grid-form">
                        <input type="hidden" name="documentId" value={document.id} />
                        {document.type === DocumentType.MEDICAL_CERTIFICATE ? (
                          <label className="input-group">
                            <span>Scadenza certificato</span>
                            <input
                              type="date"
                              name="medicalCertificateExpiresAt"
                              defaultValue={
                                document.medicalCertificateExpiresAt
                                  ? new Date(document.medicalCertificateExpiresAt).toISOString().slice(0, 10)
                                  : ""
                              }
                              required
                            />
                          </label>
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
                          <input type="text" name="reason" placeholder="Immagine sfocata o incompleta" minLength={4} maxLength={400} />
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
    </section>
  );
}
