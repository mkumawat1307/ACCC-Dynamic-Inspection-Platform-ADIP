//frontend\src\database\DatabaseService.ts
import { createSchema } from "./schema";
import { getDatabase } from "./db";
import { seedDatabase } from "./seed";

export async function initializeDatabase() {
  console.log("📦 initializeDatabase() called");

  try {
    const db = await getDatabase();

    await createSchema();
    await seedDatabase();

    const tables = await db.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table';"
    );

    console.log("📋 Database Tables:", tables);
    console.log("✅ Database initialized.");
  } catch (e) {
    console.error("❌ Database Error", e);
  }
}