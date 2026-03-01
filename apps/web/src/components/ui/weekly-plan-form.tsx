import type { WorkoutPlan } from "@gestionale/db";

type WeeklyPlanFormProps = {
  action: (formData: FormData) => Promise<void>;
  plan: WorkoutPlan | null;
  title?: string;
};

const DAYS: Array<{ key: keyof WorkoutPlan; label: string; field: string }> = [
  { key: "monday", label: "Lunedi", field: "monday" },
  { key: "tuesday", label: "Martedi", field: "tuesday" },
  { key: "wednesday", label: "Mercoledi", field: "wednesday" },
  { key: "thursday", label: "Giovedi", field: "thursday" },
  { key: "friday", label: "Venerdi", field: "friday" },
  { key: "saturday", label: "Sabato", field: "saturday" },
  { key: "sunday", label: "Domenica", field: "sunday" }
];

export function WeeklyPlanForm({ action, plan, title = "Piano allenamento settimanale" }: WeeklyPlanFormProps) {
  return (
    <section className="panel">
      <div>
        <p className="panel-kicker">Allenamento</p>
        <h3 className="panel-title">{title}</h3>
      </div>

      <form action={action} className="grid-form">
        {DAYS.map((day) => (
          <label key={day.field} className="input-group">
            <span>{day.label}</span>
            <input
              type="text"
              name={day.field}
              placeholder="Es. Gambe"
              defaultValue={(plan?.[day.key] as string | null | undefined) ?? ""}
            />
          </label>
        ))}

        <button type="submit" className="button button-primary">
          Salva piano
        </button>
      </form>
    </section>
  );
}
