export type WeeklyWorkoutPlanInput = {
  monday?: string | null;
  tuesday?: string | null;
  wednesday?: string | null;
  thursday?: string | null;
  friday?: string | null;
  saturday?: string | null;
  sunday?: string | null;
};

export const DEFAULT_WEEKLY_WORKOUT_PLAN: Required<WeeklyWorkoutPlanInput> = {
  monday: "",
  tuesday: "",
  wednesday: "",
  thursday: "",
  friday: "",
  saturday: "",
  sunday: ""
};

export function normalizeWorkoutField(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

export function buildWorkoutPlanFromFormData(formData: FormData): WeeklyWorkoutPlanInput {
  return {
    monday: normalizeWorkoutField(formData.get("monday")?.toString()),
    tuesday: normalizeWorkoutField(formData.get("tuesday")?.toString()),
    wednesday: normalizeWorkoutField(formData.get("wednesday")?.toString()),
    thursday: normalizeWorkoutField(formData.get("thursday")?.toString()),
    friday: normalizeWorkoutField(formData.get("friday")?.toString()),
    saturday: normalizeWorkoutField(formData.get("saturday")?.toString()),
    sunday: normalizeWorkoutField(formData.get("sunday")?.toString())
  };
}
