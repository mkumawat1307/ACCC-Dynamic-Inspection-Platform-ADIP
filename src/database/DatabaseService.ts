import { createSchema } from "./schema";
import { getDatabase } from "./db";
import { seedDatabase } from "./seed";
import { InspectionRepository } from "./repositories/InspectionRepository";

export async function initializeDatabase() {
  console.log("📦 initializeDatabase() called");

  try {
    const db = await getDatabase();

    // Delete existing tables (development only)
await db.execAsync(`
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS InspectionPhotos;
DROP TABLE IF EXISTS InspectionDevices;
DROP TABLE IF EXISTS InspectionValues;
DROP TABLE IF EXISTS Inspections;

DROP TABLE IF EXISTS FieldOptions;
DROP TABLE IF EXISTS InspectionFields;
DROP TABLE IF EXISTS InspectionSections;

DROP TABLE IF EXISTS Projects;

DROP TABLE IF EXISTS Blocks;
DROP TABLE IF EXISTS Districts;
DROP TABLE IF EXISTS Divisions;

PRAGMA foreign_keys = ON;
`);

    await createSchema();
    await seedDatabase();
    const sections = await InspectionRepository.getSections();
    console.log("📋 Repository Result:", sections);
    
    const table = await db.getAllAsync(`
    SELECT *
    FROM InspectionSections
    ORDER BY DisplayOrder;
  `);
    console.log("📋 Inspection Sections:", table);

    const tables = await db.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table';"
    );

    console.log("📋 Database Tables:", tables);

    console.log("✅ Database initialized.");
  } catch (e) {
    console.error("❌ Database Error", e);
  }
}