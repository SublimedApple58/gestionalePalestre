export const metadata = {
  title: "Informativa Privacy — House of Muscle",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-content">
        <h1>Informativa sulla Privacy</h1>
        <p className="legal-updated">Ultimo aggiornamento: maggio 2026</p>

        <p>
          La presente informativa descrive come <strong>House of Muscle</strong> ("noi", "il Titolare")
          raccoglie, utilizza e protegge i dati personali degli utenti della piattaforma,
          in conformita' al Regolamento (UE) 2016/679 (GDPR) e al D.Lgs. 196/2003
          (Codice Privacy) come modificato dal D.Lgs. 101/2018.
        </p>

        <h2>1. Titolare del Trattamento</h2>
        <p>
          Il Titolare del trattamento e' <strong>HOUSE OF MUSCLE SSD ARL</strong>,
          P. IVA 02225020672, con sede in Via Amerigo Vespucci SNC.
          Per esercitare i tuoi diritti o per informazioni sul trattamento dei dati,
          puoi contattarci tramite i recapiti disponibili sulla Piattaforma o presso la struttura.
        </p>

        <h2>2. Dati Raccolti</h2>
        <p>Raccogliamo le seguenti categorie di dati personali:</p>
        <ul>
          <li><strong>Dati identificativi:</strong> nome, cognome, email, numero di telefono, indirizzo di residenza, data di nascita;</li>
          <li><strong>Credenziali:</strong> password (conservata in forma crittografata, mai in chiaro);</li>
          <li><strong>Documenti:</strong> codice fiscale, documento di identita', certificato medico, foto profilo;</li>
          <li><strong>Dati di abbonamento:</strong> tipo di abbonamento, date di inizio/fine, stato, storico pagamenti;</li>
          <li><strong>Dati di accesso:</strong> codice PIN, log degli accessi alla struttura, timestamp;</li>
          <li><strong>Dati di allenamento:</strong> schede, esercizi, serie, pesi e ripetizioni (conservati localmente sul dispositivo);</li>
          <li><strong>Dati tecnici:</strong> indirizzo IP, tipo di dispositivo, sistema operativo (raccolti automaticamente).</li>
        </ul>

        <h2>3. Finalita' e Base Giuridica</h2>
        <table className="legal-table">
          <thead>
            <tr><th>Finalita'</th><th>Base giuridica</th></tr>
          </thead>
          <tbody>
            <tr><td>Gestione account e accesso alla struttura</td><td>Esecuzione del contratto</td></tr>
            <tr><td>Elaborazione pagamenti e abbonamenti</td><td>Esecuzione del contratto</td></tr>
            <tr><td>Verifica documenti (identita', certificato medico)</td><td>Obbligo legale / Esecuzione del contratto</td></tr>
            <tr><td>Invio comunicazioni di servizio</td><td>Esecuzione del contratto</td></tr>
            <tr><td>Gestione schede di allenamento</td><td>Esecuzione del contratto</td></tr>
            <tr><td>Sicurezza e prevenzione frodi</td><td>Legittimo interesse</td></tr>
            <tr><td>Adempimenti fiscali e contabili</td><td>Obbligo legale</td></tr>
          </tbody>
        </table>

        <h2>4. Modalita' di Trattamento</h2>
        <p>
          I dati sono trattati con strumenti informatici e telematici, con logiche strettamente
          connesse alle finalita' indicate, e comunque in modo da garantire la sicurezza e la
          riservatezza dei dati. Adottiamo misure tecniche e organizzative adeguate per
          proteggere i dati da accessi non autorizzati, perdita o distruzione.
        </p>

        <h2>5. Destinatari dei Dati</h2>
        <p>I dati personali possono essere comunicati a:</p>
        <ul>
          <li><strong>Fornitori di servizi di pagamento</strong> (Revolut) per l'elaborazione delle transazioni;</li>
          <li><strong>Fornitori di infrastruttura cloud</strong> (Vercel, Neon, AWS S3) per l'hosting e l'archiviazione;</li>
          <li><strong>Fornitori di servizi IoT</strong> (Tuya) per la gestione degli accessi alla struttura;</li>
          <li><strong>Professionisti e consulenti</strong> (commercialista, legale) per adempimenti obbligatori.</li>
        </ul>
        <p>
          Non vendiamo, cediamo o condividiamo i tuoi dati personali con terzi per finalita'
          di marketing.
        </p>

        <h2>6. Trasferimento Extra-UE</h2>
        <p>
          Alcuni dei nostri fornitori di servizi potrebbero trattare i dati al di fuori dello
          Spazio Economico Europeo. In tal caso, ci assicuriamo che il trasferimento avvenga
          sulla base di garanzie adeguate, quali le Clausole Contrattuali Standard approvate
          dalla Commissione Europea.
        </p>

        <h2>7. Conservazione dei Dati</h2>
        <ul>
          <li><strong>Dati dell'account:</strong> conservati per tutta la durata dell'iscrizione e per 10 anni dopo la cancellazione (obblighi fiscali);</li>
          <li><strong>Log degli accessi:</strong> conservati per 12 mesi;</li>
          <li><strong>Documenti:</strong> conservati per la durata della loro validita' e per 12 mesi successivi;</li>
          <li><strong>Dati di pagamento:</strong> conservati per 10 anni (obblighi fiscali e contabili);</li>
          <li><strong>Dati di allenamento locali:</strong> conservati esclusivamente sul dispositivo dell'utente.</li>
        </ul>

        <h2>8. Diritti dell'Interessato</h2>
        <p>Ai sensi degli articoli 15-22 del GDPR, hai diritto di:</p>
        <ul>
          <li><strong>Accesso:</strong> ottenere conferma del trattamento e copia dei tuoi dati;</li>
          <li><strong>Rettifica:</strong> correggere dati inesatti o incompleti;</li>
          <li><strong>Cancellazione:</strong> richiedere la cancellazione dei dati (diritto all'oblio);</li>
          <li><strong>Limitazione:</strong> richiedere la limitazione del trattamento;</li>
          <li><strong>Portabilita':</strong> ricevere i tuoi dati in formato strutturato;</li>
          <li><strong>Opposizione:</strong> opporti al trattamento basato sul legittimo interesse;</li>
          <li><strong>Reclamo:</strong> presentare reclamo al Garante per la Protezione dei Dati Personali
            (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">www.garanteprivacy.it</a>).</li>
        </ul>
        <p>
          Per esercitare i tuoi diritti, contattaci tramite i recapiti disponibili sulla
          Piattaforma o presso la struttura.
        </p>

        <h2>9. Cookie</h2>
        <p>
          La Piattaforma utilizza esclusivamente cookie tecnici necessari al funzionamento
          del servizio (sessione, autenticazione). Non utilizziamo cookie di profilazione
          o di terze parti per finalita' di marketing.
        </p>

        <h2>10. Modifiche all'Informativa</h2>
        <p>
          Ci riserviamo il diritto di aggiornare la presente informativa. Le modifiche
          saranno pubblicate su questa pagina con indicazione della data di ultimo aggiornamento.
        </p>
      </article>
    </main>
  );
}
