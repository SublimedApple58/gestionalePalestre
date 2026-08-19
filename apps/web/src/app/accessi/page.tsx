import { db, Prisma, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { AccessLogFilter } from "@/components/dashboard/access-log-filter";
import { AccessLogList } from "@/components/dashboard/access-log-list";
import { FullListShell } from "@/components/dashboard/full-list-shell";
import { romeDayEndExclusiveUtc, romeDayStartUtc } from "@/lib/datetime";
import { getProfilePhotoUrls } from "@/lib/profile-photo";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default async function AccessiPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sessionUser = await requireRole([UserRole.ADMIN]);
  const { from, to } = await searchParams;

  const fromValid = typeof from === "string" && YMD.test(from) ? from : null;
  const toValid = typeof to === "string" && YMD.test(to) ? to : null;
  const filtered = Boolean(fromValid || toValid);

  // Confini "giorno italiano" (Europe/Rome) → istanti UTC per la colonna occurredAt.
  const occurredAt: Prisma.DateTimeFilter = {};
  if (fromValid) occurredAt.gte = romeDayStartUtc(fromValid);
  if (toValid) occurredAt.lt = romeDayEndExclusiveUtc(toValid);

  const [currentUser, accessLogs] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: { firstName: true, role: true }
    }),
    db.accessEvent.findMany({
      where: filtered ? { occurredAt } : undefined,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } }
      },
      orderBy: { occurredAt: "desc" },
      take: filtered ? 1000 : 200
    })
  ]);

  if (!currentUser) redirect("/login");

  const photoUrlMap = await getProfilePhotoUrls(
    Array.from(new Set(accessLogs.map((l) => l.user.id)))
  );

  return (
    <FullListShell user={currentUser}>
      <AccessLogFilter from={fromValid} to={toValid} />
      {accessLogs.length === 0 ? (
        <div className="empty-state">Nessun ingresso nel periodo selezionato.</div>
      ) : (
        <AccessLogList logs={accessLogs} profilePhotoUrls={Object.fromEntries(photoUrlMap)} />
      )}
    </FullListShell>
  );
}
