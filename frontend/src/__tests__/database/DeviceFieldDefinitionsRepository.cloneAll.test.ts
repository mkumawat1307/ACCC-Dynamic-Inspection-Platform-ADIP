import { openDatabaseAsync, __resetDbState } from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { closeAllDatabases } from "@/src/database/db";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";

const SRC_TID = 1;
const TGT_TID = 2;

async function insertDef(
  db: SQLiteDatabase,
  opts: {
    DeviceType: string;
    FieldName: string;
    Label: string;
    FieldType?: string;
    IsRequired?: number;
    IsVisible?: number;
    DisplayOrder?: number;
    IsActive: number;
    Placeholder?: string | null;
  }
) {
  return db.runAsync(
    `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive, Placeholder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      SRC_TID,
      opts.DeviceType,
      opts.FieldName,
      opts.Label,
      opts.FieldType ?? "text",
      opts.IsRequired ?? 0,
      opts.IsVisible ?? 1,
      opts.DisplayOrder ?? 1,
      opts.IsActive,
      opts.Placeholder ?? null,
    ]
  );
}

let db: SQLiteDatabase;

beforeEach(async () => {
  await closeAllDatabases();
  __resetDbState();
  db = await openDatabaseAsync("accc_global.db");
});

afterEach(async () => {
  await closeAllDatabases();
  await db.closeAsync();
});

describe("DeviceFieldDefinitionsRepository — cloneAll", () => {
  it("clones every active field into the target template with DisplayOrder, IsActive and Placeholder preserved", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", FieldType: "dropdown", IsRequired: 1, DisplayOrder: 3, IsActive: 1, Placeholder: "pick one" });
    await insertDef(db, { DeviceType: "Camera", FieldName: "Brand", Label: "Brand", FieldType: "text", DisplayOrder: 5, IsActive: 1 });

    await DeviceFieldDefinitionsRepository.cloneAll(SRC_TID, TGT_TID);

    const clones = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TGT_TID);
    expect(clones).toEqual([
      expect.objectContaining({ TemplateID: TGT_TID, DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", FieldType: "dropdown", IsRequired: 1, IsVisible: 1, DisplayOrder: 3, IsActive: 1, Placeholder: "pick one" }),
      expect.objectContaining({ TemplateID: TGT_TID, DeviceType: "Camera", FieldName: "Brand", Label: "Brand", FieldType: "text", IsRequired: 0, IsVisible: 1, DisplayOrder: 5, IsActive: 1, Placeholder: null }),
    ]);
  });

  it("clones a non-null Placeholder and preserves a null Placeholder", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "WithHint", Label: "With Hint", DisplayOrder: 1, IsActive: 1, Placeholder: "enter value" });
    await insertDef(db, { DeviceType: "Camera", FieldName: "NoHint", Label: "No Hint", DisplayOrder: 2, IsActive: 1, Placeholder: null });

    await DeviceFieldDefinitionsRepository.cloneAll(SRC_TID, TGT_TID);

    const clones = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TGT_TID);
    expect(clones.find((c) => c.FieldName === "WithHint")?.Placeholder).toBe("enter value");
    expect(clones.find((c) => c.FieldName === "NoHint")?.Placeholder).toBe(null);
  });

  it("clones IsRequired, IsVisible and FieldType exactly", async () => {
    await insertDef(db, { DeviceType: "Battery", FieldName: "BatteryLevel", Label: "Battery Level", FieldType: "number", IsRequired: 1, IsVisible: 0, DisplayOrder: 2, IsActive: 1 });

    await DeviceFieldDefinitionsRepository.cloneAll(SRC_TID, TGT_TID);

    const clones = await DeviceFieldDefinitionsRepository.getByDeviceType("Battery", TGT_TID);
    expect(clones).toEqual([
      expect.objectContaining({ FieldType: "number", IsRequired: 1, IsVisible: 0, DisplayOrder: 2, IsActive: 1 }),
    ]);
  });

  it("skips inactive source rows", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "Older", Label: "Older", DisplayOrder: 1, IsActive: 0 });
    await insertDef(db, { DeviceType: "Camera", FieldName: "Current", Label: "Current", DisplayOrder: 2, IsActive: 1 });

    await DeviceFieldDefinitionsRepository.cloneAll(SRC_TID, TGT_TID);

    const clones = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TGT_TID);
    expect(clones.map((c) => c.FieldName)).toEqual(["Current"]);
  });

  it("clones fields for every device type present on the source template", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", IsActive: 1 });
    await insertDef(db, { DeviceType: "Battery", FieldName: "BatteryLevel", Label: "Battery Level", IsActive: 1 });

    await DeviceFieldDefinitionsRepository.cloneAll(SRC_TID, TGT_TID);

    expect(await DeviceFieldDefinitionsRepository.getDeviceTypes(TGT_TID)).toEqual(["Camera", "Battery"]);
  });

  it("leaves the source template rows untouched and writes only to the target template", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", DisplayOrder: 4, IsActive: 1 });

    await DeviceFieldDefinitionsRepository.cloneAll(SRC_TID, TGT_TID);

    const source = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", SRC_TID);
    expect(source).toHaveLength(1);
    expect(source[0]).toEqual(expect.objectContaining({ FieldDefID: source[0].FieldDefID, TemplateID: SRC_TID, DisplayOrder: 4, IsActive: 1 }));
    const sourceIds = source.map((s) => s.FieldDefID);
    const clones = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TGT_TID);
    expect(clones).toHaveLength(1);
    expect(sourceIds).not.toContain(clones[0].FieldDefID);
  });

  it("is a no-op when the source template has no active fields", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "Disabled", Label: "Disabled", IsActive: 0 });

    await DeviceFieldDefinitionsRepository.cloneAll(SRC_TID, TGT_TID);

    expect(await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TGT_TID)).toEqual([]);
  });
});