import { readFileSync } from "fs";
import { join } from "path";

const schemaPath = join(process.cwd(), "src/database/schema.ts");
const schemaContent = readFileSync(schemaPath, "utf-8");

describe("DeviceOptions.IsDefault — schema verification", () => {
  describe("CREATE TABLE includes IsDefault", () => {
    it("IsDefault column defined in CREATE TABLE DeviceOptions", () => {
      const createBlock = schemaContent.substring(
        schemaContent.indexOf("CREATE TABLE IF NOT EXISTS DeviceOptions"),
        schemaContent.indexOf(");", schemaContent.indexOf("CREATE TABLE IF NOT EXISTS DeviceOptions"))
      );
      expect(createBlock).toContain("IsDefault INTEGER NOT NULL DEFAULT 0");
    });

    it("IsDefault comes after DisplayOrder in CREATE TABLE", () => {
      const createBlock = schemaContent.substring(
        schemaContent.indexOf("CREATE TABLE IF NOT EXISTS DeviceOptions"),
        schemaContent.indexOf(");", schemaContent.indexOf("CREATE TABLE IF NOT EXISTS DeviceOptions"))
      );
      const displayOrderIdx = createBlock.indexOf("DisplayOrder");
      const isDefaultIdx = createBlock.indexOf("IsDefault");
      expect(displayOrderIdx).toBeGreaterThan(-1);
      expect(isDefaultIdx).toBeGreaterThan(displayOrderIdx);
    });
  });

  describe("migrateProjectSchema includes ALTER TABLE", () => {
    it("ALTER TABLE DeviceOptions ADD COLUMN IsDefault exists", () => {
      expect(schemaContent).toContain("ALTER TABLE DeviceOptions ADD COLUMN IsDefault INTEGER NOT NULL DEFAULT 0");
    });

    it("migration is wrapped in try/catch (idempotent)", () => {
      const alterIdx = schemaContent.indexOf("ALTER TABLE DeviceOptions ADD COLUMN IsDefault");
      const surroundingCode = schemaContent.substring(alterIdx - 200, alterIdx + 200);
      expect(surroundingCode).toContain("try {");
      expect(surroundingCode).toContain("} catch {");
    });

    it("migration does not alter OptionValue, OptionID, FieldName, or DeviceType", () => {
      const migrateIdx = schemaContent.indexOf("ALTER TABLE DeviceOptions ADD COLUMN IsDefault");
      const migrateBlock = schemaContent.substring(migrateIdx, migrateIdx + 300);
      expect(migrateBlock).not.toContain("OptionValue");
      expect(migrateBlock).not.toContain("OptionID");
      expect(migrateBlock).not.toContain("FieldName");
      expect(migrateBlock).not.toContain("DeviceType");
    });
  });

  describe("existing columns not affected", () => {
    it("DeviceOptions table retains all expected columns", () => {
      const createBlock = schemaContent.substring(
        schemaContent.indexOf("CREATE TABLE IF NOT EXISTS DeviceOptions"),
        schemaContent.indexOf(");", schemaContent.indexOf("CREATE TABLE IF NOT EXISTS DeviceOptions"))
      );
      expect(createBlock).toContain("OptionID INTEGER PRIMARY KEY AUTOINCREMENT");
      expect(createBlock).toContain("TemplateID INTEGER NOT NULL DEFAULT 1");
      expect(createBlock).toContain("DeviceType TEXT NOT NULL");
      expect(createBlock).toContain("FieldName TEXT NOT NULL");
      expect(createBlock).toContain("OptionLabel TEXT NOT NULL");
      expect(createBlock).toContain("OptionValue TEXT NOT NULL");
      expect(createBlock).toContain("DisplayOrder INTEGER NOT NULL DEFAULT 1");
      expect(createBlock).toContain("IsActive INTEGER NOT NULL DEFAULT 1");
      expect(createBlock).toContain("CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP");
      expect(createBlock).toContain("UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP");
    });
  });
});
