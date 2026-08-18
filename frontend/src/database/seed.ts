// frontend/src/database/seed.ts

import { getGlobalDatabase } from "./db";
import { seedDivisions } from "./seeds/division.seed";

export async function seedGlobalDatabase() {
    await getGlobalDatabase();
    await seedDivisions();
}

