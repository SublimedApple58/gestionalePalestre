import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text
} from "@react-email/components";

export type BirthdayReminderEntry = {
  firstName: string;
  lastName: string;
  /** Compleanno nel formato ISO `YYYY-MM-DD` o `Date`. Viene usato solo per visualizzazione. */
  birthday: Date | string;
};

type BirthdayReminderEmailProps = {
  entries: BirthdayReminderEntry[];
  /** Nome della palestra per personalizzazione. */
  gymName?: string;
  /** Data del giorno per cui sono inviati i promemoria (di solito "domani"). */
  targetDate: Date;
};

/**
 * Email giornaliera al proprietario della palestra con la lista degli iscritti
 * che compiono gli anni il giorno dopo. Il template è volutamente sobrio:
 * niente immagini esterne (rischio blocco dai client mail), stile inline per sicurezza.
 */
export function BirthdayReminderEmail({
  entries,
  gymName = "la tua palestra",
  targetDate
}: BirthdayReminderEmailProps) {
  const formattedDate = targetDate.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const first = entries[0];

  return (
    <Html lang="it">
      <Head />
      <Preview>
        {entries.length === 1 && first
          ? `Domani è il compleanno di ${first.firstName} ${first.lastName}`
          : `Domani ci sono ${entries.length} compleanni tra i tuoi iscritti`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading as="h1" style={headingStyle}>
            🎂 Compleanni di domani
          </Heading>
          <Text style={subheadingStyle}>
            Ecco gli iscritti a {gymName} che festeggiano il compleanno il{" "}
            <strong>{formattedDate}</strong>.
          </Text>

          <Section style={listSectionStyle}>
            {entries.map((entry, idx) => (
              <div key={`${entry.firstName}-${entry.lastName}-${idx}`} style={itemStyle}>
                <Text style={nameStyle}>
                  {entry.firstName} {entry.lastName}
                </Text>
                <Text style={metaStyle}>
                  Compie gli anni il{" "}
                  {new Date(entry.birthday).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "long"
                  })}
                </Text>
              </div>
            ))}
          </Section>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Un piccolo gesto di auguri fa sempre la differenza nel rapporto con gli iscritti.
            <br />
            Questo promemoria è stato generato automaticamente dal gestionale.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Stili inline (React Email — compatibilità client mail).
const bodyStyle = {
  backgroundColor: "#0f0f12",
  color: "#f5f5f7",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  padding: "24px 0"
};

const containerStyle = {
  maxWidth: "560px",
  margin: "0 auto",
  backgroundColor: "#17171c",
  borderRadius: "16px",
  padding: "32px",
  border: "1px solid rgba(255,255,255,0.08)"
};

const headingStyle = {
  color: "#ffffff",
  fontSize: "24px",
  margin: "0 0 8px",
  fontWeight: 700
};

const subheadingStyle = {
  color: "#c9c9d1",
  fontSize: "15px",
  lineHeight: "22px",
  margin: "0 0 24px"
};

const listSectionStyle = {
  backgroundColor: "#1e1e25",
  borderRadius: "12px",
  padding: "8px 16px",
  border: "1px solid rgba(255,255,255,0.05)"
};

const itemStyle = {
  padding: "12px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)"
};

const nameStyle = {
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: 600,
  margin: "0 0 4px"
};

const metaStyle = {
  color: "#9a9aa5",
  fontSize: "13px",
  margin: 0
};

const hrStyle = {
  borderColor: "rgba(255,255,255,0.08)",
  margin: "24px 0"
};

const footerStyle = {
  color: "#7a7a85",
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0
};

export default BirthdayReminderEmail;
