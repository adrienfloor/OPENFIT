/**
 * Idempotent exercise upsert — adds any missing exercises from
 * DEFAULT_EXERCISES without touching the rest of the DB. Safe to run on
 * a live database with real users, programs, and logs.
 *
 * Run with: `npm run db:seed-exercises` (from packages/db).
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_EXERCISES } from './exercises';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log(`Upserting ${DEFAULT_EXERCISES.length} exercises...`);

  let created = 0;
  let updated = 0;

  for (const ex of DEFAULT_EXERCISES) {
    const existing = await prisma.exercise.findUnique({
      where: { name: ex.name },
      select: { id: true },
    });
    await prisma.exercise.upsert({
      where: { name: ex.name },
      create: ex,
      update: { muscleGroups: ex.muscleGroups, equipment: ex.equipment },
    });
    if (existing) updated++;
    else created++;
  }

  const total = await prisma.exercise.count();
  console.log(`✓ Created ${created}, updated ${updated}. Library now has ${total} exercises.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
