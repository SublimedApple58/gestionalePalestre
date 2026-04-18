import { UserRole, type PrismaClient, type User } from "@gestionale/db";

import { BirthdayReminderEmail } from "@/lib/email/templates/birthday-reminder";
import { sendEmail } from "@/lib/email/send";

export type BirthdayReminderSummary = {
  processedAt: string;
  targetDate: string;
  birthdaysCount: number;
  adminEmailsCount: number;
  emailsSent: number;
};

type BirthdayUser = Pick<User, "id" | "firstName" | "lastName" | "dateOfBirth">;

/**
 * Trova utenti che compiono gli anni nella data indicata (match mese+giorno, non anno).
 * La query carica tutti gli utenti con `dateOfBirth` non null e filtra in memoria:
 * per un gestionale palestra l'ordine di grandezza (≤ qualche migliaio) lo rende accettabile
 * e semplifica la logica rispetto a query date_part su Postgres (che richiedono index dedicati).
 */
export async function findUsersBornOn(db: PrismaClient, target: Date): Promise<BirthdayUser[]> {
  const all = await db.user.findMany({
    where: { dateOfBirth: { not: null } },
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true }
  });

  const targetMonth = target.getUTCMonth();
  const targetDay = target.getUTCDate();

  return all.filter((u) => {
    if (!u.dateOfBirth) return false;
    const d = new Date(u.dateOfBirth);
    return d.getUTCMonth() === targetMonth && d.getUTCDate() === targetDay;
  });
}

/**
 * Job principale: trova compleanni di *domani* e invia una mail agli admin con la lista.
 * Non solleva eccezioni al caller: loggare & raccogliere counter è sufficiente per un cron.
 */
export async function runBirthdayRemindersJob(db: PrismaClient): Promise<BirthdayReminderSummary> {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

  const birthdayUsers = await findUsersBornOn(db, tomorrow);

  if (birthdayUsers.length === 0) {
    return {
      processedAt: now.toISOString(),
      targetDate: tomorrow.toISOString(),
      birthdaysCount: 0,
      adminEmailsCount: 0,
      emailsSent: 0
    };
  }

  const admins = await db.user.findMany({
    where: { role: UserRole.ADMIN },
    select: { email: true }
  });

  const recipients = admins.map((a) => a.email).filter((e): e is string => Boolean(e));

  if (recipients.length === 0) {
    console.warn("[birthday-reminders] Nessun admin con email trovato — skip invio.");
    return {
      processedAt: now.toISOString(),
      targetDate: tomorrow.toISOString(),
      birthdaysCount: birthdayUsers.length,
      adminEmailsCount: 0,
      emailsSent: 0
    };
  }

  const result = await sendEmail({
    to: recipients,
    subject: `🎂 ${birthdayUsers.length} compleann${birthdayUsers.length === 1 ? "o" : "i"} domani`,
    react: BirthdayReminderEmail({
      targetDate: tomorrow,
      entries: birthdayUsers.map((u) => ({
        firstName: u.firstName,
        lastName: u.lastName,
        birthday: u.dateOfBirth ?? tomorrow
      }))
    })
  });

  return {
    processedAt: now.toISOString(),
    targetDate: tomorrow.toISOString(),
    birthdaysCount: birthdayUsers.length,
    adminEmailsCount: recipients.length,
    emailsSent: result.sent ? recipients.length : 0
  };
}
