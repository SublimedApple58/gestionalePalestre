import type { WorkoutPlan } from "@gestionale/db";

type WeeklyPlanFormProps = {
  action: (formData: FormData) => Promise<void>;
  plan: WorkoutPlan | null;
  title?: string;
};

const DAYS: Array<{ key: keyof WorkoutPlan; label: string; field: string; badge: string; full?: boolean }> = [
  { key: "monday",    label: "Lunedì",    field: "monday",    badge: "LUN" },
  { key: "tuesday",   label: "Martedì",   field: "tuesday",   badge: "MAR" },
  { key: "wednesday", label: "Mercoledì", field: "wednesday", badge: "MER" },
  { key: "thursday",  label: "Giovedì",   field: "thursday",  badge: "GIO" },
  { key: "friday",    label: "Venerdì",   field: "friday",    badge: "VEN" },
  { key: "saturday",  label: "Sabato",    field: "saturday",  badge: "SAB" },
  { key: "sunday",    label: "Domenica",  field: "sunday",    badge: "DOM", full: true }
];

export function WeeklyPlanForm({ action, plan, title = "Piano allenamento settimanale" }: WeeklyPlanFormProps) {
  return (
    <section className="panel panel-full">
      <div>
        <p className="panel-kicker">Allenamento</p>
        <h3 className="panel-title">{title}</h3>
      </div>

      <form action={action} className="plan-grid">
        {DAYS.map((day) => (
          <label
            key={day.field}
            className={`plan-day${day.full ? " plan-day-full" : ""}`}
          >
            <span className="plan-day-badge">{day.badge} · {day.label}</span>
            <input
              type="text"
              name={day.field}
              className="plan-day-input"
              placeholder="Es. Gambe, Petto…"
              defaultValue={(plan?.[day.key] as string | null | undefined) ?? ""}
            />
          </label>
        ))}

        <button type="submit" className="button button-primary plan-save">
          Salva piano
        </button>
      </form>
    </section>
  );
}
