import { db, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { TrainerAdmin, type AdminTrainer } from "@/components/dashboard/trainers/trainer-admin";
import {
  createDocumentDownloadUrl,
  isDocumentStorageConfigured
} from "@/lib/services/document-storage-service";
import { listTrainersForAdmin } from "@/lib/services/trainer-service";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TrainerPage() {
  const sessionUser = await requireRole([UserRole.ADMIN]);

  const [currentUser, trainers] = await Promise.all([
    db.user.findUnique({ where: { id: sessionUser.id }, select: { firstName: true, role: true } }),
    listTrainersForAdmin(db)
  ]);
  if (!currentUser) redirect("/login");

  // Anteprime admin via URL firmati: funzionano anche per i trainer nascosti
  // (l'endpoint pubblico delle foto serve solo i visibili).
  const storage = isDocumentStorageConfigured();
  const items: AdminTrainer[] = await Promise.all(
    trainers.map(async (t) => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      bio: t.bio,
      whatsappNumber: t.whatsappNumber,
      isVisible: t.isVisible,
      photoUrl:
        storage && t.photoStorageKey
          ? await createDocumentDownloadUrl({ storageKey: t.photoStorageKey, expiresInSeconds: 3600 }).catch(() => null)
          : null
    }))
  );

  return (
    <AuthenticatedShell currentPath="/trainer" user={currentUser}>
      <TrainerAdmin trainers={items} />
    </AuthenticatedShell>
  );
}
