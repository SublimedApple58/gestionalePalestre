import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seed idempotente del catalogo esercizi base. Eseguibile sia in locale
 * sia in prod (idempotente via upsert su `name`). Aggiungere nuovi
 * esercizi qui mantiene il seed allineato.
 *
 * Ogni esercizio ha:
 *  - name (canonico)
 *  - muscleGroup (gruppo muscolare primario)
 *  - equipment (attrezzatura)
 *  - isCustom: false (gli esercizi del seed non sono custom)
 */

const SEED_EXERCISES = [
  // Petto
  { name: "Panca piana", muscleGroup: "Petto", equipment: "Bilanciere" },
  { name: "Panca inclinata con bilanciere", muscleGroup: "Petto", equipment: "Bilanciere" },
  { name: "Panca inclinata con manubri", muscleGroup: "Petto", equipment: "Manubri" },
  { name: "Panca declinata", muscleGroup: "Petto", equipment: "Bilanciere" },
  { name: "Croci con manubri", muscleGroup: "Petto", equipment: "Manubri" },
  { name: "Croci ai cavi", muscleGroup: "Petto", equipment: "Cavi" },
  { name: "Pectoral machine", muscleGroup: "Petto", equipment: "Macchina" },
  { name: "Push-up", muscleGroup: "Petto", equipment: "Corpo libero" },
  { name: "Dips", muscleGroup: "Petto", equipment: "Parallele" },

  // Schiena
  { name: "Stacco da terra", muscleGroup: "Schiena", equipment: "Bilanciere" },
  { name: "Stacco rumeno", muscleGroup: "Schiena", equipment: "Bilanciere" },
  { name: "Trazioni alla sbarra", muscleGroup: "Schiena", equipment: "Sbarra" },
  { name: "Lat machine avanti", muscleGroup: "Schiena", equipment: "Macchina" },
  { name: "Lat machine presa stretta", muscleGroup: "Schiena", equipment: "Macchina" },
  { name: "Rematore con bilanciere", muscleGroup: "Schiena", equipment: "Bilanciere" },
  { name: "Rematore con manubri", muscleGroup: "Schiena", equipment: "Manubri" },
  { name: "Rematore T-bar", muscleGroup: "Schiena", equipment: "Bilanciere" },
  { name: "Pulley basso", muscleGroup: "Schiena", equipment: "Macchina" },
  { name: "Hyperextensions", muscleGroup: "Schiena", equipment: "Panca lombare" },
  { name: "Pullover", muscleGroup: "Schiena", equipment: "Manubrio" },

  // Gambe
  { name: "Squat", muscleGroup: "Gambe", equipment: "Bilanciere" },
  { name: "Squat frontale (Front squat)", muscleGroup: "Gambe", equipment: "Bilanciere" },
  { name: "Squat bulgaro", muscleGroup: "Gambe", equipment: "Manubri" },
  { name: "Leg press", muscleGroup: "Gambe", equipment: "Macchina" },
  { name: "Affondi", muscleGroup: "Gambe", equipment: "Manubri" },
  { name: "Affondi camminati", muscleGroup: "Gambe", equipment: "Manubri" },
  { name: "Leg curl", muscleGroup: "Gambe", equipment: "Macchina" },
  { name: "Leg extension", muscleGroup: "Gambe", equipment: "Macchina" },
  { name: "Stacchi a gambe tese", muscleGroup: "Gambe", equipment: "Bilanciere" },
  { name: "Hip thrust", muscleGroup: "Gambe", equipment: "Bilanciere" },
  { name: "Calf raise in piedi", muscleGroup: "Gambe", equipment: "Macchina" },
  { name: "Calf raise seduto", muscleGroup: "Gambe", equipment: "Macchina" },
  { name: "Adduttori macchina", muscleGroup: "Gambe", equipment: "Macchina" },
  { name: "Abduttori macchina", muscleGroup: "Gambe", equipment: "Macchina" },

  // Spalle
  { name: "Military press", muscleGroup: "Spalle", equipment: "Bilanciere" },
  { name: "Lento avanti seduto", muscleGroup: "Spalle", equipment: "Bilanciere" },
  { name: "Spinte con manubri seduto", muscleGroup: "Spalle", equipment: "Manubri" },
  { name: "Arnold press", muscleGroup: "Spalle", equipment: "Manubri" },
  { name: "Alzate laterali con manubri", muscleGroup: "Spalle", equipment: "Manubri" },
  { name: "Alzate laterali ai cavi", muscleGroup: "Spalle", equipment: "Cavi" },
  { name: "Alzate frontali", muscleGroup: "Spalle", equipment: "Manubri" },
  { name: "Alzate posteriori (pennelli)", muscleGroup: "Spalle", equipment: "Manubri" },
  { name: "Face pull", muscleGroup: "Spalle", equipment: "Cavi" },
  { name: "Shrug", muscleGroup: "Spalle", equipment: "Manubri" },

  // Bicipiti
  { name: "Curl con bilanciere", muscleGroup: "Bicipiti", equipment: "Bilanciere" },
  { name: "Curl con manubri alternato", muscleGroup: "Bicipiti", equipment: "Manubri" },
  { name: "Hammer curl", muscleGroup: "Bicipiti", equipment: "Manubri" },
  { name: "Curl ai cavi", muscleGroup: "Bicipiti", equipment: "Cavi" },
  { name: "Curl predicatore", muscleGroup: "Bicipiti", equipment: "Macchina" },
  { name: "Curl concentrato", muscleGroup: "Bicipiti", equipment: "Manubrio" },

  // Tricipiti
  { name: "French press", muscleGroup: "Tricipiti", equipment: "Bilanciere" },
  { name: "Push-down ai cavi", muscleGroup: "Tricipiti", equipment: "Cavi" },
  { name: "Push-down con corda", muscleGroup: "Tricipiti", equipment: "Cavi" },
  { name: "Dips alle parallele", muscleGroup: "Tricipiti", equipment: "Parallele" },
  { name: "Estensioni sopra la testa", muscleGroup: "Tricipiti", equipment: "Manubrio" },
  { name: "Kickback", muscleGroup: "Tricipiti", equipment: "Manubrio" },
  { name: "Skull crusher", muscleGroup: "Tricipiti", equipment: "Bilanciere" },

  // Addome
  { name: "Crunch", muscleGroup: "Addome", equipment: "Corpo libero" },
  { name: "Crunch ai cavi", muscleGroup: "Addome", equipment: "Cavi" },
  { name: "Plank", muscleGroup: "Addome", equipment: "Corpo libero" },
  { name: "Plank laterale", muscleGroup: "Addome", equipment: "Corpo libero" },
  { name: "Russian twist", muscleGroup: "Addome", equipment: "Corpo libero" },
  { name: "Hanging leg raise", muscleGroup: "Addome", equipment: "Sbarra" },
  { name: "Mountain climber", muscleGroup: "Addome", equipment: "Corpo libero" },

];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const ex of SEED_EXERCISES) {
    const result = await prisma.exercise.upsert({
      where: { name: ex.name },
      update: {
        muscleGroup: ex.muscleGroup,
        equipment: ex.equipment,
        isCustom: false
      },
      create: {
        name: ex.name,
        muscleGroup: ex.muscleGroup,
        equipment: ex.equipment,
        isCustom: false
      }
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      skipped++;
    }
  }

  console.log(
    `Catalogo esercizi seedato: ${created} creati, ${skipped} aggiornati. Totale: ${SEED_EXERCISES.length}`
  );
}

main()
  .catch((error) => {
    console.error("Errore seed esercizi:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
