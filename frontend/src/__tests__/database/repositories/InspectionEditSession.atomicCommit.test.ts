jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  getContentUriAsync: jest.fn().mockResolvedValue("content://mock/exported"),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn().mockResolvedValue({ resultCode: 0 }),
}));

jest.mock("@/src/utils/storageManager", () => ({
  ensureRootFolder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    androidApiLevel: 35,
    hasFiles: jest.fn().mockResolvedValue(true),
    writeBase64: jest.fn().mockResolvedValue("content://mock/exported/file.xlsx"),
    writeUtf8: jest.fn().mockResolvedValue("content://mock/exported/file.csv"),
    readBase64: jest.fn().mockResolvedValue("QUJD"),
    deleteFile: jest.fn().mockResolvedValue(true),
    findFile: jest.fn().mockResolvedValue(null),
  },
}));

import type { SQLiteDatabase } from "expo-sqlite";
import type { DeviceRecord } from "@/src/database/repositories/DeviceRecordsRepository";

const PROJECT = "/mock/documents/Projects/AtomicCommit/inspection.db";

describe("InspectionEditSession.commit is atomic", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  async function openSeededProject(path = PROJECT): Promise<{ db: SQLiteDatabase }> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(path);
    const { createProjectSchema } = require("@/src/database/schema");
    await createProjectSchema();
    const tpl = require("@/src/database/seeds/inspection-template.seed");
    await tpl.seedInspectionTemplate();
    const sec = require("@/src/database/seeds/inspection-sections.seed");
    await sec.seedInspectionSections();
    const fld = require("@/src/database/seeds/inspection-fields.seed");
    await fld.seedInspectionFields();
    const fo = require("@/src/database/seeds/field-options.seed");
    await fo.seedFieldOptions();
    const dopt = require("@/src/database/seeds/device-options.seed");
    await dopt.seedDeviceOptions();
    const ddf = require("@/src/database/seeds/device-field-definitions.seed");
    await ddf.seedDeviceFieldDefinitions();
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync("UPDATE FieldOptions SET IsActive = 1");
    await db.runAsync("UPDATE DeviceOptions SET IsActive = 1");
    await db.runAsync("UPDATE DeviceFieldDefinitions SET IsActive = 1");
    return { db };
  }

  async function createInspection(date: string): Promise<number> {
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    return InspectionRepository.createInspection(1, 1, date);
  }

  async function getFieldId(db: SQLiteDatabase, fieldKey: string): Promise<number | null> {
    const row = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = ?",
      [fieldKey]
    );
    return row?.FieldID ?? null;
  }

  async function getTwoDataFields(db: SQLiteDatabase): Promise<number[]> {
    const rows = await db.getAllAsync<{ FieldID: number; FieldKey: string }>(
      `SELECT FieldID, FieldKey FROM InspectionFields
       WHERE IsActive = 1 AND IsVisible = 1
       ORDER BY FieldID`
    );
    return rows.filter((r) => r.FieldKey !== "pole_id").slice(0, 2).map((r) => r.FieldID);
  }

  async function getPoleId(db: SQLiteDatabase, inspectionId: number): Promise<string> {
    const row = await db.getFirstAsync<{ PoleID: string }>(
      "SELECT PoleID FROM Inspections WHERE InspectionID = ?",
      [inspectionId]
    );
    return row?.PoleID ?? "";
  }

  function newDevice(inspectionId: number, deviceNo: number): DeviceRecord {
    return {
      InspectionID: inspectionId,
      DeviceType: "camera",
      DeviceNo: deviceNo,
      DeviceData: JSON.stringify({ serial: `SN-${deviceNo}` }),
      DisplayOrder: 1,
      IsActive: 1,
    };
  }

  it("A. success: pole + fields + device persist and the session clears", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { DeviceRecordsRepository } = require("@/src/database/repositories/DeviceRecordsRepository") as typeof import("@/src/database/repositories/DeviceRecordsRepository");
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const inspectionId = await createInspection("2026-09-07");
    const [f1, f2] = await getTwoDataFields(db);
    const poleFieldId = await getFieldId(db, "pole_id");
    expect(f1).toBeDefined();
    expect(f2).toBeDefined();
    expect(poleFieldId).not.toBeNull();

    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, f1!, "Underground");
    await InspectionValueRepository.saveValue(inspectionId, f2!, "Overhead");
    jest.spyOn(InspectionEditSession, "resolvePoleIdFieldId").mockResolvedValue(poleFieldId!);
    await InspectionRepository.updateInspectionPoleId(inspectionId, "P-NEW");
    await DeviceRecordsRepository.scheduleDeviceRecordSave(newDevice(inspectionId, 1), 500, jest.fn());

    const ok = await InspectionEditSession.commit();
    expect(ok).toBe(true);

    expect((await InspectionValueRepository.getValue(inspectionId, f1!))?.FieldValue).toBe("Underground");
    expect((await InspectionValueRepository.getValue(inspectionId, f2!))?.FieldValue).toBe("Overhead");
    expect(await getPoleId(db, inspectionId)).toBe("P-NEW");
    expect((await DeviceRecordsRepository.getByInspectionAll(inspectionId)).length).toBe(1);

    expect(InspectionEditSession.isActive(inspectionId)).toBe(false);
    expect(InspectionEditSession.getStagedFieldValues().size).toBe(0);
    expect(InspectionEditSession.getStagedDeviceRecords().length).toBe(0);
    expect(InspectionEditSession.getStagedPoleId()).toBeNull();
  });

  it("B. field write failure midway rolls back earlier field writes and preserves the session", async () => {
    const { db } = await openSeededProject();
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const inspectionId = await createInspection("2026-09-07");
    const [f1, f2] = await getTwoDataFields(db);

    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, f1!, "Underground");
    await InspectionValueRepository.saveValue(inspectionId, f2!, "Overhead");

    const original = InspectionValueRepository.saveValue;
    let calls = 0;
    jest.spyOn(InspectionValueRepository, "saveValue").mockImplementation(
      async (inspectionId: number, fieldId: number, value: string | null): Promise<void> => {
        calls++;
        if (calls === 2) throw new Error("mid-transaction failure");
        return original(inspectionId, fieldId, value);
      }
    );

    const ok = await InspectionEditSession.commit();
    expect(calls).toBe(2);
    expect(ok).toBe(false);

    expect(await InspectionValueRepository.getValue(inspectionId, f1!)).toBeNull();
    expect(await InspectionValueRepository.getValue(inspectionId, f2!)).toBeNull();

    expect(InspectionEditSession.isActive(inspectionId)).toBe(true);
    expect(InspectionEditSession.getStagedFieldValues().size).toBe(2);
  });

  it("C. device write failure rolls back earlier field writes and preserves the session", async () => {
    const { db } = await openSeededProject();
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { DeviceRecordsRepository } = require("@/src/database/repositories/DeviceRecordsRepository") as typeof import("@/src/database/repositories/DeviceRecordsRepository");
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const inspectionId = await createInspection("2026-09-07");
    const [f1] = await getTwoDataFields(db);

    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, f1!, "Underground");
    await DeviceRecordsRepository.scheduleDeviceRecordSave(newDevice(inspectionId, 1), 500, jest.fn());

    jest.spyOn(DeviceRecordsRepository, "save").mockRejectedValue(new Error("device write failed"));

    const ok = await InspectionEditSession.commit();
    expect(ok).toBe(false);

    expect(await InspectionValueRepository.getValue(inspectionId, f1!)).toBeNull();
    expect((await DeviceRecordsRepository.getByInspectionAll(inspectionId)).length).toBe(0);

    expect(InspectionEditSession.isActive(inspectionId)).toBe(true);
    expect(InspectionEditSession.getStagedFieldValues().size).toBe(1);
    expect(InspectionEditSession.getStagedDeviceRecords().length).toBe(1);
  });

  it("D. pole + field + device failure leaves the database untouched and preserves the session", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { DeviceRecordsRepository } = require("@/src/database/repositories/DeviceRecordsRepository") as typeof import("@/src/database/repositories/DeviceRecordsRepository");
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const inspectionId = await createInspection("2026-09-07");
    await db.runAsync("UPDATE Inspections SET PoleID = 'P-OLD' WHERE InspectionID = ?", [inspectionId]);
    const poleFieldId = await getFieldId(db, "pole_id");
    expect(poleFieldId).not.toBeNull();
    await db.runAsync(
      "INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)",
      [inspectionId, poleFieldId!, "P-OLD"]
    );
    const [f1] = await getTwoDataFields(db);

    InspectionEditSession.activate(inspectionId);
    jest.spyOn(InspectionEditSession, "resolvePoleIdFieldId").mockResolvedValue(poleFieldId!);
    await InspectionRepository.updateInspectionPoleId(inspectionId, "P-NEW");
    await InspectionValueRepository.saveValue(inspectionId, f1!, "Underground");
    await DeviceRecordsRepository.scheduleDeviceRecordSave(newDevice(inspectionId, 1), 500, jest.fn());

    jest.spyOn(InspectionValueRepository, "saveValue").mockRejectedValue(new Error("field write failed"));

    const ok = await InspectionEditSession.commit();
    expect(ok).toBe(false);

    expect(await getPoleId(db, inspectionId)).toBe("P-OLD");
    const poleValue = await db.getFirstAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE InspectionID = ? AND FieldID = ?",
      [inspectionId, poleFieldId!]
    );
    expect(poleValue?.FieldValue).toBe("P-OLD");
    expect(await InspectionValueRepository.getValue(inspectionId, f1!)).toBeNull();
    expect((await DeviceRecordsRepository.getByInspectionAll(inspectionId)).length).toBe(0);

    expect(InspectionEditSession.isActive(inspectionId)).toBe(true);
    expect(InspectionEditSession.getStagedPoleId()).toBe("P-NEW");
    expect(InspectionEditSession.getStagedFieldValues().size).toBe(1);
    expect(InspectionEditSession.getStagedDeviceRecords().length).toBe(1);
  });

  it("E. transient failure can be retried to a successful commit", async () => {
    const { db } = await openSeededProject();
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const inspectionId = await createInspection("2026-09-07");
    const [f1, f2] = await getTwoDataFields(db);

    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, f1!, "Underground");
    await InspectionValueRepository.saveValue(inspectionId, f2!, "Overhead");

    const original = InspectionValueRepository.saveValue;
    let calls = 0;
    jest.spyOn(InspectionValueRepository, "saveValue").mockImplementation(
      async (inspectionId: number, fieldId: number, value: string | null): Promise<void> => {
        calls++;
        if (calls === 1) throw new Error("transient failure");
        return original(inspectionId, fieldId, value);
      }
    );

    const first = await InspectionEditSession.commit();
    expect(first).toBe(false);
    expect(InspectionEditSession.isActive(inspectionId)).toBe(true);

    jest.restoreAllMocks();

    const second = await InspectionEditSession.commit();
    expect(second).toBe(true);

    expect((await InspectionValueRepository.getValue(inspectionId, f1!))?.FieldValue).toBe("Underground");
    expect((await InspectionValueRepository.getValue(inspectionId, f2!))?.FieldValue).toBe("Overhead");
    expect(InspectionEditSession.isActive(inspectionId)).toBe(false);
  });
});