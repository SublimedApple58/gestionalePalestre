import { WorkoutSetType } from "@gestionale/db";

/** Etichette tipo-set, coerenti con la `SetTypeChip` del mobile. */
const SET_TYPE_LABELS: Record<WorkoutSetType, string> = {
  NORMAL: "Normale",
  WARMUP: "Warm-up",
  DROPSET: "Dropset",
  CLUSTERSET: "Cluster",
  REST_PAUSE: "Rest-pause",
  AMRAP: "AMRAP",
  FAILURE: "A cedimento"
};

export function workoutSetTypeLabel(type: WorkoutSetType): string {
  return SET_TYPE_LABELS[type] ?? "Normale";
}

/** Formatta il recupero (secondi) in stringa breve: 90 → "1m 30s", 60 → "1m", 45 → "45s". */
export function formatRestSeconds(rest: number): string {
  if (rest <= 0) {
    return "0s";
  }
  const minutes = Math.floor(rest / 60);
  const seconds = rest % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  if (seconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}
