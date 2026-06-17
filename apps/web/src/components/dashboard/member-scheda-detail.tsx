"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { CalendarDays, Dumbbell, User, X } from "lucide-react";

import type { WorkoutTemplateDetail } from "@/lib/services/workout-template-service";
import { formatRestSeconds, workoutSetTypeLabel } from "@/lib/workouts";

type ZoomTarget = { uri: string; alt: string } | null;

type MemberSchedaDetailProps = {
  detail: WorkoutTemplateDetail;
  /** exerciseId → URL presigned della foto (o assente se nessuna foto). */
  photoByExerciseId: Record<string, string>;
};

function daysLabel(days: number): string {
  return days === 1 ? "1 giorno a settimana" : `${days} giorni a settimana`;
}

export function MemberSchedaDetail({ detail, photoByExerciseId }: MemberSchedaDetailProps) {
  const [zoom, setZoom] = useState<ZoomTarget>(null);

  useEffect(() => {
    if (!zoom) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setZoom(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);

  const sessionCount = detail.sessions.length;

  return (
    <div className="scheda-detail">
      <header className="scheda-detail-head">
        <p className="eyebrow">Scheda di allenamento</p>
        <h1 className="scheda-detail-title">{detail.name}</h1>
        {detail.description ? (
          <p className="scheda-detail-desc">{detail.description}</p>
        ) : null}
        <div className="scheda-detail-meta">
          <span className="scheda-detail-meta-item">
            <CalendarDays size={14} aria-hidden="true" />
            {daysLabel(detail.daysPerWeek)}
          </span>
          <span className="scheda-detail-meta-item">
            <Dumbbell size={14} aria-hidden="true" />
            {sessionCount === 1 ? "1 sessione" : `${sessionCount} sessioni`}
          </span>
          <span className="scheda-detail-meta-item">
            <User size={14} aria-hidden="true" />
            {`${detail.createdBy.firstName} ${detail.createdBy.lastName}`}
          </span>
        </div>
      </header>

      <div className="scheda-sessions">
        {detail.sessions.map((session, sessionIdx) => (
          <section
            key={session.id}
            className="scheda-session"
            style={{ "--i": sessionIdx } as CSSProperties}
          >
            <div className="scheda-session-head">
              <span className="scheda-session-index" aria-hidden="true">
                {sessionIdx + 1}
              </span>
              <div>
                <h2 className="scheda-session-name">{session.name}</h2>
                <p className="scheda-session-count">
                  {session.exercises.length === 1
                    ? "1 esercizio"
                    : `${session.exercises.length} esercizi`}
                </p>
              </div>
            </div>

            <ul className="scheda-exercise-list" role="list">
              {session.exercises.map((exercise) => {
                const photoUrl = photoByExerciseId[exercise.exerciseId];
                return (
                  <li key={exercise.id} className="scheda-exercise">
                    <div className="scheda-exercise-head">
                      {photoUrl ? (
                        <button
                          type="button"
                          className="scheda-exercise-thumb"
                          onClick={() =>
                            setZoom({ uri: photoUrl, alt: exercise.exerciseName })
                          }
                          aria-label={`Ingrandisci foto ${exercise.exerciseName}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl} alt="" loading="lazy" />
                        </button>
                      ) : (
                        <span className="scheda-exercise-thumb scheda-exercise-thumb--empty" aria-hidden="true">
                          <Dumbbell size={18} />
                        </span>
                      )}
                      <span className="scheda-exercise-name">{exercise.exerciseName}</span>
                    </div>

                    <ul className="scheda-set-list" role="list">
                      {exercise.sets.map((set, setIdx) => (
                        <li key={set.id} className="scheda-set">
                          <span className={`set-type-chip set-type-${set.type.toLowerCase()}`}>
                            {workoutSetTypeLabel(set.type)}
                          </span>
                          <span className="scheda-set-detail">
                            <span className="scheda-set-reps">{`${setIdx + 1}. ${set.reps} reps`}</span>
                            {set.rir != null ? (
                              <span className="scheda-set-extra">{`RIR ${set.rir}`}</span>
                            ) : null}
                            {set.rest != null ? (
                              <span className="scheda-set-extra">{`rec. ${formatRestSeconds(set.rest)}`}</span>
                            ) : null}
                          </span>
                          {set.notes ? (
                            <span className="scheda-set-note">{set.notes}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>

                    {exercise.notes ? (
                      <p className="scheda-exercise-note">Nota: {exercise.notes}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {zoom ? (
        <div
          className="scheda-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${zoom.alt}`}
          onClick={() => setZoom(null)}
        >
          <button
            type="button"
            className="scheda-lightbox-close"
            onClick={() => setZoom(null)}
            aria-label="Chiudi"
          >
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.uri} alt={zoom.alt} onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}
