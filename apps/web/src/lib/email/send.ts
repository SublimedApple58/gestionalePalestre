import type { ReactElement } from "react";

import { getResend } from "./client";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  react: ReactElement;
  /** Opzionale override del mittente (di default usa EMAIL_FROM). */
  from?: string;
  replyTo?: string;
};

type SendEmailResult = {
  sent: boolean;
  id?: string;
  skippedReason?: "no-api-key" | "no-recipients";
};

/**
 * Wrapper unico per invio email. Responsabilità:
 *  - fallback a `console.log` se Resend non è configurato (dev).
 *  - validazione destinatari (non spediamo se l'array è vuoto).
 *  - non lanciare mai eccezioni che blocchino il caller: logga e torna `sent:false`.
 *
 * Il caller è responsabile di decidere se proseguire o meno in caso di invio fallito
 * (es. un cron reminder compleanni dovrebbe loggare l'errore ma non bloccare).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  const validRecipients = recipients.filter((r) => typeof r === "string" && r.trim().length > 0);

  if (validRecipients.length === 0) {
    console.warn("[email] sendEmail: nessun destinatario valido, skip.");
    return { sent: false, skippedReason: "no-recipients" };
  }

  const resend = getResend();
  const from = input.from ?? process.env.EMAIL_FROM ?? "noreply@gestionalepalestre.it";

  if (!resend) {
    console.info("[email] (DEV) send skipped — subject:", input.subject, "to:", validRecipients);
    return { sent: false, skippedReason: "no-api-key" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: validRecipients,
      subject: input.subject,
      react: input.react,
      replyTo: input.replyTo
    });

    if (error) {
      console.error("[email] Resend ha restituito errore:", error);
      return { sent: false };
    }

    return { sent: true, id: data?.id };
  } catch (err) {
    console.error("[email] sendEmail fallita:", err);
    return { sent: false };
  }
}
