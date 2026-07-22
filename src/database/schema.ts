// src/database/schema.ts

import { getDatabase } from "./db";
import { createInspectionTemplatesTable } from "./tables/inspection-templates.table";
import { createDistrictsTable } from "./tables/districts.table";
import { createBlocksTable } from "./tables/blocks.table";
import { createProjectsTable } from "./tables/projects.table";
import { createInspectionSectionsTable } from "./tables/inspection-sections.table";
import { createInspectionFieldsTable } from "./tables/inspection-fields.table";
import { createFieldOptionsTable } from "./tables/field-options.table";
import { createInspectionsTable } from "./tables/inspections.table";
import { createInspectionValuesTable } from "./tables/inspection-values.table";
import { createInspectionDevicesTable } from "./tables/inspection-devices.table";
import { createInspectionPhotosTable } from "./tables/inspection-photos.table";
import { createDivisionsTable } from "./tables/divisions.table";
//import { createInspectionAssetsTable } from "./tables/inspection-assets.table";


export async function createSchema() {
  console.log("📄 Creating schema...");

  const db = await getDatabase();
  await db.execAsync(createDivisionsTable);
  await db.execAsync(createDistrictsTable);
  await db.execAsync(createBlocksTable);
  await db.execAsync(createProjectsTable);
  await db.execAsync(createInspectionTemplatesTable);
  await db.execAsync(createInspectionSectionsTable);
  //await db.execAsync(createInspectionAssetsTable);
  await db.execAsync(createInspectionFieldsTable);
  await db.execAsync(createFieldOptionsTable);
  await db.execAsync(createInspectionsTable);
  await db.execAsync(createInspectionValuesTable);
  await db.execAsync(createInspectionDevicesTable);
  await db.execAsync(createInspectionPhotosTable);
  console.log("📄 Schema created.");
}