import { openDatabaseAsync, __resetDbState } from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { closeAllDatabases } from "@/src/database/db";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";

const TID = 1;

async function insertDef(
  db: SQLiteDatabase,
  opts: {
    DeviceType: string;
    FieldName: string;
    Label: string;
    FieldType?: string;
    IsActive: number;
    DisplayOrder?: number;
  }
) {
  return db.runAsync(
    `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    [
      TID,
      opts.DeviceType,
      opts.FieldName,
      opts.Label,
      opts.FieldType ?? "text",
      opts.DisplayOrder ?? 1,
      opts.IsActive,
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

describe("DeviceFieldDefinitionsRepository — includeInactive (old-inspection reconstruction)", () => {
  it("getByDeviceType excludes inactive defs by default", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", IsActive: 0 });
    await insertDef(db, { DeviceType: "Camera", FieldName: "Brand", Label: "Brand", IsActive: 1, DisplayOrder: 2 });

    const defs = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID);

    expect(defs.map((d) => d.FieldName)).toEqual(["Brand"]);
  });

  it("getByDeviceType(includeInactive=true) returns deleted defs alongside active defs in DisplayOrder", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", IsActive: 0, DisplayOrder: 1 });
    await insertDef(db, { DeviceType: "Camera", FieldName: "Brand", Label: "Brand", IsActive: 1, DisplayOrder: 2 });

    const defs = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID, true);

    expect(defs.map((d) => `${d.FieldName}:${d.IsActive}`)).toEqual(["CameraType:0", "Brand:1"]);
  });

  it("getDeviceTypes excludes a type whose defs are all deleted by default", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", IsActive: 1 });
    await insertDef(db, { DeviceType: "Battery", FieldName: "BatteryLevel", Label: "Battery Level", IsActive: 0 });

    const types = await DeviceFieldDefinitionsRepository.getDeviceTypes(TID);

    expect(types).toEqual(["Camera"]);
  });

  it("getDeviceTypes(includeInactive=true) includes a fully-deleted device type", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", IsActive: 1 });
    await insertDef(db, { DeviceType: "Battery", FieldName: "BatteryLevel", Label: "Battery Level", IsActive: 0 });

    const types = await DeviceFieldDefinitionsRepository.getDeviceTypes(TID, true);

    expect(types).toContain("Camera");
    expect(types).toContain("Battery");
  });

  it("default includeInactive=false still excludes deleted defs when no templateId is passed", async () => {
    await insertDef(db, { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", IsActive: 0 });

    const defs = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera");

    expect(defs).toEqual([]);
  });
});

describe("DeviceOptionsRepository — includeInactive (deleted dropdown options)", () => {
  it("getDropdownData(includeInactive=true) returns options for a deleted field", async () => {
    const insert = () =>
      db.runAsync(
        `INSERT INTO DeviceOptions (TemplateID, DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [TID, "Camera", "CameraType", "Bullet", "Bullet", 1, 1]
      );
    await insert();
    await db.runAsync(
      `UPDATE DeviceOptions SET IsActive = 0 WHERE DeviceType = 'Camera' AND FieldName = 'CameraType'`
    );

    const active = await DeviceOptionsRepository.getDropdownData("Camera", "CameraType", TID);
    const withInactive = await DeviceOptionsRepository.getDropdownData("Camera", "CameraType", TID, true);

    expect(active).toEqual([]);
    expect(withInactive).toEqual([{ label: "Bullet", value: "Bullet", isDefault: 0, IsActive: 0 }]);
  });
});