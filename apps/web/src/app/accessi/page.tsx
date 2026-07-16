import { db, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { AccessLogList } from "@/components/dashboard/access-log-list";
import { FullListShell } from "@/components/dashboard/full-list-shell";
import { getProfilePhotoUrls } from "@/lib/profile-photo";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AccessiPage() {
  const sessionUser = await requireRole([UserRole.ADMIN]);

  const [currentUser, accessLogs] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: { firstName: true, role: true }
    }),
    db.accessEvent.findMany({
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } }
      },
      orderBy: { occurredAt: "desc" },
      take: 200
    })
  ]);

  if (!currentUser) redirect("/login");

  const photoUrlMap = await getProfilePhotoUrls(
    Array.from(new Set(accessLogs.map((l) => l.user.id)))
  );

  return (
    <FullListShell user={currentUser}>
      <AccessLogList logs={accessLogs} profilePhotoUrls={Object.fromEntries(photoUrlMap)} />
    </FullListShell>
  );
}
