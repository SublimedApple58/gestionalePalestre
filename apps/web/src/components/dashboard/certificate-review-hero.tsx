import { FileSearch, ExternalLink, Check } from "lucide-react";

import { approveDocumentAction } from "@/app/actions/dashboard-actions";

export type CertReviewRow = {
  documentId: string;
  userId: string;
  firstName: string;
  lastName: string;
  uploadedAt: Date;
  medicalCertificateExpiresAt: Date | null;
  previewUrl: string | null;
  photoUrl: string | null;
};

/** Quanti iscritti mostrare nel riquadro prima del "e altri N". */
const HERO_LIMIT = 4;

/** Scadenze salvate a mezzanotte UTC → "YYYY-MM-DD" per l'input data. */
function toYmd(date: Date | null): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/**
 * Riquadro in CIMA alla dashboard admin: SALTA all'occhio quando ci sono
 * certificati medici (ri)caricati dagli iscritti e non ancora controllati.
 * Se non c'è nulla da controllare non viene renderizzato (sparisce).
 *
 * Per ogni iscritto: foto, nome, data di caricamento, scadenza, "Apri
 * certificato" (anteprima firmata) e "Segna come controllato" (riusa
 * `approveDocumentAction`: stampa reviewedAt mantenendo lo stato APPROVED).
 * Come sul mobile, nello stesso gesto si salva la data di scadenza letta sul
 * certificato (precompilata se gia' nota; vuota = resta quella attuale): e'
 * quella che alimenta "Certificati in scadenza".
 */
export function CertificateReviewHero({
  items,
  total
}: {
  items: CertReviewRow[];
  /** Totale reale da controllare (può superare la lista, cap-ata per il render). */
  total?: number;
}) {
  if (items.length === 0) return null;

  const count = typeof total === "number" && total >= items.length ? total : items.length;
  const visible = items.slice(0, HERO_LIMIT);
  const extra = count - visible.length;

  return (
    <section className="cert-hero" aria-label="Certificati medici da controllare">
      <div className="cert-hero-head">
        <div className="cert-hero-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </div>
        <div className="cert-hero-headtext">
          <p className="cert-hero-kicker">
            <FileSearch size={13} className="cert-hero-kicker-icon" />
            Richiede un controllo
          </p>
          <h2 className="cert-hero-title">
            {count === 1
              ? "1 certificato medico da controllare"
              : `${count} certificati medici da controllare`}
          </h2>
          <p className="cert-hero-sub">
            Un iscritto ha caricato o aggiornato il certificato. Aprilo e segnalo come controllato.
          </p>
        </div>
      </div>

      <ul className="cert-hero-list">
        {visible.map((c) => (
          <li key={c.documentId} className="cert-hero-row">
            <span className="cert-hero-avatar" aria-hidden="true">
              {c.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.photoUrl} alt="" className="cert-hero-avatar-img" />
              ) : (
                <span className="cert-hero-avatar-fallback">{initials(c.firstName, c.lastName)}</span>
              )}
            </span>

            <div className="cert-hero-person">
              <span className="cert-hero-name">
                {c.firstName} {c.lastName}
              </span>
              <span className="cert-hero-meta">
                Caricato il {new Date(c.uploadedAt).toLocaleDateString("it-IT")}
                {c.medicalCertificateExpiresAt
                  ? ` · scade il ${new Date(c.medicalCertificateExpiresAt).toLocaleDateString("it-IT")}`
                  : " · senza scadenza"}
              </span>
            </div>

            <div className="cert-hero-actions">
              {c.previewUrl ? (
                <a
                  href={c.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button button-ghost cert-hero-open"
                >
                  <ExternalLink size={15} />
                  Apri certificato
                </a>
              ) : (
                <span className="button button-ghost cert-hero-open" aria-disabled="true" style={{ opacity: 0.5 }}>
                  <ExternalLink size={15} />
                  Apri certificato
                </span>
              )}
              <form action={approveDocumentAction} className="cert-hero-verify">
                <input type="hidden" name="documentId" value={c.documentId} />
                <label className="cert-hero-expiry">
                  <span className="cert-hero-expiry-label">Scadenza</span>
                  <input
                    type="date"
                    name="medicalCertificateExpiresAt"
                    defaultValue={toYmd(c.medicalCertificateExpiresAt)}
                    className="cert-hero-expiry-input"
                    aria-label={`Scadenza certificato di ${c.firstName} ${c.lastName}`}
                  />
                </label>
                <button type="submit" className="button button-primary cert-hero-check">
                  <Check size={15} />
                  Segna come controllato
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      {extra > 0 && (
        <p className="cert-hero-more">
          e altri {extra} {extra === 1 ? "iscritto" : "iscritti"} in attesa di controllo
        </p>
      )}
    </section>
  );
}
