import { type PrismaClient } from "@gestionale/db";

import { type WeeklyWorkoutPlanInput } from "@/lib/workout-plan";

export async function saveWorkoutPlan(
  prisma: PrismaClient,
  userId: string,
  input: WeeklyWorkoutPlanInput
): Promise<void> {
  await prisma.workoutPlan.upsert({
    where: { userId },
    create: {
      userId,
      ...input
    },
    update: {
      ...input
    }
  });
}
