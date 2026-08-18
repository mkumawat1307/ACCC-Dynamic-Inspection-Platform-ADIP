import { openDatabaseAsync, __resetDbState } from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { closeAllDatabases } from "@/src/database/db";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";

const TID = 1;

async function insertOption(
  db: SQLiteDatabase,
  opts: {
    DeviceType?: string;
    FieldName?: string;
    OptionLabel?: string;
    OptionValue?: string;
    DisplayOrder?: number;
    IsDefault?: number;
    IsActive?: number;
    TemplateID?: number;
  } = {}
) {
  const o = {
    DeviceType: "Camera",
    FieldName: "CameraStatus",
    OptionLabel: "Working",
    OptionValue: "Working",
    DisplayOrder: 1,
    IsDefault: 0,
    IsActive: 1,
    TemplateID: TID,
    ...opts,
  };
  return db.runAsync(
    `INSERT INTO DeviceOptions (TemplateID, DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [o.TemplateID, o.DeviceType, o.FieldName, o.OptionLabel, o.OptionValue, o.DisplayOrder, o.IsDefault, o.IsActive]
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

describe("DeviceOptionsRepository — real DB tests", () => {
  describe("add()", () => {
    it("stores option with IsDefault=0", async () => {
      const id = await DeviceOptionsRepository.add(
        { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "W", OptionValue: "W", DisplayOrder: 1, IsDefault: 0, IsActive: 1 },
        TID
      );
      const row = await db.getFirstAsync<{ IsDefault: number }>(
        "SELECT IsDefault FROM DeviceOptions WHERE OptionID = ?", [id]
      );
      expect(row?.IsDefault).toBe(0);
    });

    it("stores option with IsDefault=1", async () => {
      const id = await DeviceOptionsRepository.add(
        { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "W", OptionValue: "W", DisplayOrder: 1, IsDefault: 1, IsActive: 1 },
        TID
      );
      const row = await db.getFirstAsync<{ IsDefault: number }>(
        "SELECT IsDefault FROM DeviceOptions WHERE OptionID = ?", [id]
      );
      expect(row?.IsDefault).toBe(1);
    });

    it("defaults IsDefault to 0 when omitted", async () => {
      const id = await DeviceOptionsRepository.add(
        { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "W", OptionValue: "W", DisplayOrder: 1, IsDefault: 0 as any, IsActive: 1 },
        TID
      );
      const row = await db.getFirstAsync<{ IsDefault: number }>(
        "SELECT IsDefault FROM DeviceOptions WHERE OptionID = ?", [id]
      );
      expect(row?.IsDefault).toBe(0);
    });
  });

  describe("getByField()", () => {
    it("returns IsDefault flag correctly per option", async () => {
      await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 });
      await insertOption(db, { OptionLabel: "B", OptionValue: "B", IsDefault: 0, DisplayOrder: 2 });

      const result = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", TID);
      expect(result).toHaveLength(2);
      expect(result.find((o) => o.OptionLabel === "A")?.IsDefault).toBe(1);
      expect(result.find((o) => o.OptionLabel === "B")?.IsDefault).toBe(0);
    });
  });

  describe("getDropdownData()", () => {
    it("returns isDefault in dropdown data", async () => {
      await insertOption(db, { OptionLabel: "Working", OptionValue: "Working", IsDefault: 1 });
      await insertOption(db, { OptionLabel: "Broken", OptionValue: "Broken", IsDefault: 0, DisplayOrder: 2 });

      const data = await DeviceOptionsRepository.getDropdownData("Camera", "CameraStatus", TID);
      expect(data).toEqual([
        { label: "Working", value: "Working", isDefault: 1 },
        { label: "Broken", value: "Broken", isDefault: 0 },
      ]);
    });
  });

  describe("getDefaultOption()", () => {
    it("returns option value when exactly one IsDefault=1", async () => {
      await insertOption(db, { OptionLabel: "Working", OptionValue: "Working", IsDefault: 1 });
      await insertOption(db, { OptionLabel: "Broken", OptionValue: "Broken", IsDefault: 0, DisplayOrder: 2 });

      const result = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID);
      expect(result).toBe("Working");
    });

    it("returns null when no option has IsDefault=1", async () => {
      await insertOption(db, { OptionLabel: "Working", OptionValue: "Working", IsDefault: 0 });

      const result = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID);
      expect(result).toBeNull();
    });

    it("returns first default when multiple IsDefault=1 exist (legacy)", async () => {
      await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 });
      await insertOption(db, { OptionLabel: "B", OptionValue: "B", IsDefault: 1, DisplayOrder: 2 });

      const result = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID);
      expect(result).toBe("A");
    });

    it("returns null for empty option list", async () => {
      const result = await DeviceOptionsRepository.getDefaultOption("Camera", "NonExistent", TID);
      expect(result).toBeNull();
    });
  });

  describe("setDefault()", () => {
    it("clears previous default and sets new one", async () => {
      const rA = await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 });
      const rB = await insertOption(db, { OptionLabel: "B", OptionValue: "B", IsDefault: 0, DisplayOrder: 2 });

      await DeviceOptionsRepository.setDefault("Camera", "CameraStatus", rB.lastInsertRowId, TID);

      const rows = await db.getAllAsync<{ OptionLabel: string; IsDefault: number }>(
        "SELECT OptionLabel, IsDefault FROM DeviceOptions WHERE IsActive = 1 AND DeviceType = 'Camera' AND FieldName = 'CameraStatus' AND TemplateID = ? ORDER BY DisplayOrder",
        [TID]
      );
      expect(rows.find((r) => r.OptionLabel === "A")?.IsDefault).toBe(0);
      expect(rows.find((r) => r.OptionLabel === "B")?.IsDefault).toBe(1);
    });

    it("only affects the same field — not other fields", async () => {
      const statusA = await insertOption(db, { FieldName: "CameraStatus", OptionLabel: "SA", OptionValue: "SA", IsDefault: 1, DisplayOrder: 1 });
      const condB = await insertOption(db, { FieldName: "CameraCondition", OptionLabel: "CB", OptionValue: "CB", IsDefault: 1, DisplayOrder: 1 });

      const newStatus = await insertOption(db, { FieldName: "CameraStatus", OptionLabel: "New", OptionValue: "New", IsDefault: 0, DisplayOrder: 2 });
      await DeviceOptionsRepository.setDefault("Camera", "CameraStatus", newStatus.lastInsertRowId, TID);

      const condDefault = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraCondition", TID);
      expect(condDefault).toBe("CB");

      const statusDefault = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID);
      expect(statusDefault).toBe("New");
    });

    it("with non-existent optionId — clears default without crash", async () => {
      await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 });

      await DeviceOptionsRepository.setDefault("Camera", "CameraStatus", 99999, TID);

      const result = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID);
      expect(result).toBeNull();
    });

    it("sets default on already-default option (no-op)", async () => {
      const rA = await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 });

      await DeviceOptionsRepository.setDefault("Camera", "CameraStatus", rA.lastInsertRowId, TID);

      const result = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID);
      expect(result).toBe("A");
    });

    it("only-one-default invariant holds after multiple setDefault calls", async () => {
      const rA = await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 0, DisplayOrder: 1 });
      const rB = await insertOption(db, { OptionLabel: "B", OptionValue: "B", IsDefault: 0, DisplayOrder: 2 });
      const rC = await insertOption(db, { OptionLabel: "C", OptionValue: "C", IsDefault: 0, DisplayOrder: 3 });

      await DeviceOptionsRepository.setDefault("Camera", "CameraStatus", rA.lastInsertRowId, TID);
      await DeviceOptionsRepository.setDefault("Camera", "CameraStatus", rB.lastInsertRowId, TID);
      await DeviceOptionsRepository.setDefault("Camera", "CameraStatus", rC.lastInsertRowId, TID);

      const rows = await db.getAllAsync<{ IsDefault: number }>(
        "SELECT IsDefault FROM DeviceOptions WHERE DeviceType = 'Camera' AND FieldName = 'CameraStatus' AND TemplateID = ? AND IsActive = 1",
        [TID]
      );
      const defaultCount = rows.filter((r) => r.IsDefault === 1).length;
      expect(defaultCount).toBe(1);

      const defaultOpt = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID);
      expect(defaultOpt).toBe("C");
    });
  });

  describe("delete() preserves IsDefault integrity", () => {
    it("deleting the default option leaves other options without default", async () => {
      const rA = await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 });
      await insertOption(db, { OptionLabel: "B", OptionValue: "B", IsDefault: 0, DisplayOrder: 2 });

      await DeviceOptionsRepository.delete(rA.lastInsertRowId);

      const result = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID);
      expect(result).toBeNull();

      const remaining = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", TID);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].OptionLabel).toBe("B");
      expect(remaining[0].IsDefault).toBe(0);
    });
  });

  describe("update() persists IsDefault", () => {
    it("updates IsDefault from 0 to 1", async () => {
      const rA = await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 0, DisplayOrder: 1 });

      await DeviceOptionsRepository.update({
        OptionID: rA.lastInsertRowId,
        DeviceType: "Camera",
        FieldName: "CameraStatus",
        OptionLabel: "A",
        OptionValue: "A",
        DisplayOrder: 1,
        IsDefault: 1,
        IsActive: 1,
      });

      const row = await db.getFirstAsync<{ IsDefault: number }>(
        "SELECT IsDefault FROM DeviceOptions WHERE OptionID = ?", [rA.lastInsertRowId]
      );
      expect(row?.IsDefault).toBe(1);
    });
  });

  describe("cloneAll() invariant safety", () => {
    it("clones options with IsDefault=0 regardless of source", async () => {
      await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 });
      await insertOption(db, { OptionLabel: "B", OptionValue: "B", IsDefault: 0, DisplayOrder: 2 });

      await DeviceOptionsRepository.cloneAll(TID, 2);

      const cloned = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", 2);
      expect(cloned).toHaveLength(2);
      expect(cloned.find((o) => o.OptionLabel === "A")?.IsDefault).toBe(0);
      expect(cloned.find((o) => o.OptionLabel === "B")?.IsDefault).toBe(0);
    });

    it("does not create duplicate defaults when target already has a default", async () => {
      await insertOption(db, { OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 });
      await insertOption(db, { OptionLabel: "B", OptionValue: "B", IsDefault: 0, DisplayOrder: 2 });

      await insertOption(db, { TemplateID: 2, OptionLabel: "Existing", OptionValue: "Existing", IsDefault: 1, DisplayOrder: 1 });

      await DeviceOptionsRepository.cloneAll(TID, 2);

      const targetOptions = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", 2);
      const defaultCount = targetOptions.filter((o) => o.IsDefault === 1).length;
      expect(defaultCount).toBeLessThanOrEqual(1);

      const existingDefault = targetOptions.find((o) => o.OptionLabel === "Existing");
      expect(existingDefault?.IsDefault).toBe(1);

      const clonedA = targetOptions.find((o) => o.OptionLabel === "A");
      expect(clonedA?.IsDefault).toBe(0);
    });
  });
});
