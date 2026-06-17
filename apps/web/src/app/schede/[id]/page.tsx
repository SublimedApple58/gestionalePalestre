import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { db, UserRole } from "@gestionale/db";

import { MemberSchedaDetail } from "@/components/dashboard/member-scheda-detail";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { requireRole } from "@/lib/session";
import {
  getTemplateDetail,
  type WorkoutTemplateDetail
} from "@/lib/services/workout-template-service";
import {
  createDocumentDownloadUrl,
  isDocumentStorageConfigured
} from "@/lib/services/document-storage-service";

export const dynamic = "force-dynamic";

// Le foto esercizio non sono sensibili e cambiano di rado: TTL lungo.
const EXERCISE_PHOTO_URL_TTL_SECONDS = 24 * 60 * 60;

/** Genera la mappa exerciseId → URL presigned per le foto degli esercizi della scheda. */
async function buildPhotoMap(
  detail: WorkoutTemplateDetail
): Promise<Record<string, string>> {
  if (!isDocumentStorageConfigured()) {
    return {};
  }

  const exerciseIds = Array.from(
    new Set(
      detail.sessions.flatMap((session) =>
        session.exercises.map((exercise) => exercise.exerciseId)
      )
    )
  );

  if (exerciseIds.length === 0) {
    return {};
  }

  const exercises = await db.exercise.findMany({
    where: { id: { in: exerciseIds }, photoStorageKey: { not: null } },
    select: { id: true, photoStorageKey: true }
  });

  const map: Record<string, string> = {};
  await Promise.all(
    exercises.map(async (exercise) => {
      if (!exercise.photoStorageKey) {
        return;
      }
      const url = await createDocumentDownloadUrl({
        storageKey: exercise.photoStorageKey,
        expiresInSeconds: EXERCISE_PHOTO_URL_TTL_SECONDS
      }).catch(() => null);
      if (url) {
        map[exercise.id] = url;
      }
    })
  );

  return map;
}

export default async function SchedaDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole([UserRole.SUBSCRIBER]);
  const { id } = await params;

  let detail: WorkoutTemplateDetail;
  try {
    // getTemplateDetail applica già il controllo accessi: una scheda non
    // assegnata all'iscritto lancia FORBIDDEN → 404.
    detail = await getTemplateDetail(db, id, user.id);
  } catch {
    notFound();
  }

  const photoByExerciseId = await buildPhotoMap(detail);

  return (
    <AuthenticatedShell
      currentPath="/schede"
      user={{ firstName: user.name.split(" ")[0] ?? user.name, role: user.role }}
    >
      <main className="profile-shell">
        <Link href="/schede" className="scheda-back-link">
          <ChevronLeft size={16} aria-hidden="true" />
          Le mie schede
        </Link>

        <MemberSchedaDetail detail={detail} photoByExerciseId={photoByExerciseId} />
      </main>
    </AuthenticatedShell>
  );
}
