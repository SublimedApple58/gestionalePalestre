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

type PasswordResetCodeEmailProps = {
  /** Codice OTP a 6 cifre. */
  code: string;
  /** Nome dell'utente per personalizzazione (opzionale). */
  firstName?: string;
};

/**
 * Email col codice a 6 cifre per reimpostare la password (web + mobile).
 * Stile sobrio coerente con gli altri template: niente immagini esterne,
 * CSS inline per compatibilità coi client mail.
 */
export function PasswordResetCodeEmail({ code, firstName }: PasswordResetCodeEmailProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>Il tuo codice per reimpostare la password: {code}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading as="h1" style={headingStyle}>
            🔐 Reimposta la password
          </Heading>
          <Text style={subheadingStyle}>
            {firstName ? `Ciao ${firstName}, ` : ""}usa questo codice per impostare una
            nuova password. È valido per <strong>15 minuti</strong>.
          </Text>

          <Section style={codeBoxStyle}>
            <Text style={codeStyle}>{code}</Text>
          </Section>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Se non hai richiesto tu il reset della password, ignora questa email: il tuo
            account è al sicuro e la password non verrà modificata.
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

const codeBoxStyle = {
  backgroundColor: "#1e1e25",
  borderRadius: "12px",
  padding: "20px",
  textAlign: "center" as const,
  border: "1px solid rgba(255,255,255,0.05)"
};

const codeStyle = {
  color: "#ffffff",
  fontSize: "36px",
  fontWeight: 700,
  letterSpacing: "10px",
  margin: 0,
  fontFamily: "'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace"
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

export default PasswordResetCodeEmail;
