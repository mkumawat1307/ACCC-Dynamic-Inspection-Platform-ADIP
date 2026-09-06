import type { SQLiteDatabase } from "expo-sqlite";

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
}));

type DeviceRow = {
  RecordID: number;
  InspectionID: number;
  DeviceType: string;
  DeviceNo: number;
  DeviceData: string | null;
  IsActive: number;
};

const CAM_1 = JSON.stringify({ CameraType: "Bullet", CameraStatus: "Working" });
const CAM_2 = JSON.stringify({ CameraType: "PTZ", CameraStatus: "Working" });
const CAM_3 = JSON.stringify({ CameraType: "Box", CameraStatus: "NotWorking" });

let pathCounter = 0;

function uniqueProjectPath(): string {
  pathCounter += 1;
  return `/mock/documents/Projects/RestoreProj${pathCounter}/inspection.db`;
}

describe("DeviceRecords restorePendingDeactivatedRecords (DB state)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string): Promise<SQLiteDatabase> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- require keeps modules resettable via jest.resetModules()
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync(
      `INSERT INTO Inspections (ProjectID, DistrictID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?, ?)`,
      [1, 1, "RESTORE-P", "2026-08-16", "Draft"]
    );
    return db;
  }

  async function getRepository(): Promise<typeof import("@/src/database/repositories/DeviceRecordsRepository").DeviceRecordsRepository> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- require keeps modules resettable via jest.resetModules()
    const mod = require("@/src/database/repositories/DeviceRecordsRepository") as typeof import("@/src/database/repositories/DeviceRecordsRepository");
    return mod.DeviceRecordsRepository;
  }

  async function cameraRows(db: SQLiteDatabase): Promise<DeviceRow[]> {
    return db.getAllAsync<DeviceRow>(
      `SELECT RecordID, InspectionID, DeviceType, DeviceNo, DeviceData, IsActive
       FROM DeviceRecords WHERE DeviceType = ? ORDER BY DeviceNo`,
      ["Camera"]
    );
  }

  function rowForNo(rows: DeviceRow[], deviceNo: number): DeviceRow[] {
    return rows.filter((r) => r.DeviceNo === deviceNo);
  }

  it("Test 1 — basic preservation: RecordID, DeviceData and IsActive survive shrink and are restored on grow, with no duplicate row", async () => {
    const db = await openProject(uniqueProjectPath());
    const repo = await getRepository();
    const inspectionId = 1;

    const cam1 = await repo.create({
      InspectionID: inspectionId,
      DeviceType: "Camera",
      DeviceNo: 1,
      DeviceData: CAM_1,
      DisplayOrder: 1,
      IsActive: 1,
    });
    const cam2 = await repo.create({
      InspectionID: inspectionId,
      DeviceType: "Camera",
      DeviceNo: 2,
      DeviceData: CAM_2,
      DisplayOrder: 2,
      IsActive: 1,
    });

    const before = await cameraRows(db);
    expect(rowForNo(before, 2)).toEqual([
      { RecordID: cam2, InspectionID: 1, DeviceType: "Camera", DeviceNo: 2, DeviceData: CAM_2, IsActive: 1 },
    ]);

    await repo.deactivateBeyond(inspectionId, "Camera", 1);

    const afterShrink = await cameraRows(db);
    expect(rowForNo(afterShrink, 2)).toEqual([
      { RecordID: cam2, InspectionID: 1, DeviceType: "Camera", DeviceNo: 2, DeviceData: CAM_2, IsActive: 0 },
    ]);

    const restored = await repo.restorePendingDeactivatedRecords(inspectionId, "Camera", 2);

    const afterGrow = await cameraRows(db);
    expect(rowForNo(afterGrow, 2)).toEqual([
      { RecordID: cam2, InspectionID: 1, DeviceType: "Camera", DeviceNo: 2, DeviceData: CAM_2, IsActive: 1 },
    ]);
    expect(rowForNo(afterGrow, 2).length).toBe(1);

    expect(
      restored.map((r) => ({
        RecordID: r.RecordID,
        InspectionID: r.InspectionID,
        DeviceType: r.DeviceType,
        DeviceNo: r.DeviceNo,
        DeviceData: r.DeviceData,
        IsActive: r.IsActive,
      }))
    ).toEqual([
      { RecordID: cam2, InspectionID: 1, DeviceType: "Camera", DeviceNo: 2, DeviceData: CAM_2, IsActive: 1 },
    ]);
    expect(cam1).toBeGreaterThan(0);
  });

  it("Test 2 — multiple devices 3 -> 1 -> 3: all pruned rows come back with their own RecordID and data", async () => {
    const db = await openProject(uniqueProjectPath());
    const repo = await getRepository();
    const inspectionId = 1;

    const id1 = await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 1, DeviceData: CAM_1, DisplayOrder: 1, IsActive: 1 });
    const id2 = await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 2, DeviceData: CAM_2, DisplayOrder: 2, IsActive: 1 });
    const id3 = await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 3, DeviceData: CAM_3, DisplayOrder: 3, IsActive: 1 });

    await repo.deactivateBeyond(inspectionId, "Camera", 1);

    const restored = await repo.restorePendingDeactivatedRecords(inspectionId, "Camera", 3);

    expect(restored.map((r) => r.DeviceNo)).toEqual([2, 3]);
    expect(restored[0]).toMatchObject({ RecordID: id2, DeviceData: CAM_2, IsActive: 1 });
    expect(restored[1]).toMatchObject({ RecordID: id3, DeviceData: CAM_3, IsActive: 1 });

    const rows = await cameraRows(db);
    expect(rowForNo(rows, 1)[0]).toMatchObject({ RecordID: id1, IsActive: 1 });
    expect(rowForNo(rows, 2)[0]).toMatchObject({ RecordID: id2, IsActive: 1 });
    expect(rowForNo(rows, 3)[0]).toMatchObject({ RecordID: id3, IsActive: 1 });
    expect(rowForNo(rows, 1).length).toBe(1);
    expect(rowForNo(rows, 2).length).toBe(1);
    expect(rowForNo(rows, 3).length).toBe(1);
  });

  it("Test 3 — partial restore: only devices up to maxDeviceNo are restored", async () => {
    const db = await openProject(uniqueProjectPath());
    const repo = await getRepository();
    const inspectionId = 1;

    await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 1, DeviceData: CAM_1, DisplayOrder: 1, IsActive: 1 });
    await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 2, DeviceData: CAM_2, DisplayOrder: 2, IsActive: 1 });
    await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 3, DeviceData: CAM_3, DisplayOrder: 3, IsActive: 1 });

    await repo.deactivateBeyond(inspectionId, "Camera", 1);

    const restored = await repo.restorePendingDeactivatedRecords(inspectionId, "Camera", 2);

    expect(restored.map((r) => r.DeviceNo)).toEqual([2]);

    const rows = await cameraRows(db);
    expect(rowForNo(rows, 2)[0]).toMatchObject({ IsActive: 1, DeviceData: CAM_2 });
    expect(rowForNo(rows, 3)[0]).toMatchObject({ IsActive: 0, DeviceData: CAM_3 });
    expect(rowForNo(rows, 1)[0]).toMatchObject({ IsActive: 1, DeviceData: CAM_1 });
  });

  it("Test 4 — no previous record: restore returns nothing when there is no inactive row", async () => {
    const db = await openProject(uniqueProjectPath());
    const repo = await getRepository();
    const inspectionId = 1;

    const restored = await repo.restorePendingDeactivatedRecords(inspectionId, "Camera", 3);

    expect(restored).toEqual([]);
    expect(await cameraRows(db)).toEqual([]);
  });

  it("Test 5 — repeated shrink/grow: RecordIDs stay stable and no duplicate rows are created", async () => {
    const db = await openProject(uniqueProjectPath());
    const repo = await getRepository();
    const inspectionId = 1;

    const id1 = await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 1, DeviceData: CAM_1, DisplayOrder: 1, IsActive: 1 });
    const id2 = await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 2, DeviceData: CAM_2, DisplayOrder: 2, IsActive: 1 });
    const id3 = await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 3, DeviceData: CAM_3, DisplayOrder: 3, IsActive: 1 });

    const cycle = async (shrinkTo: number, growTo: number) => {
      await repo.deactivateBeyond(inspectionId, "Camera", shrinkTo);
      await repo.restorePendingDeactivatedRecords(inspectionId, "Camera", growTo);
    };

    await cycle(1, 2);
    let rows = await cameraRows(db);
    expect(rowForNo(rows, 2)[0]).toMatchObject({ RecordID: id2, IsActive: 1, DeviceData: CAM_2 });
    expect(rowForNo(rows, 3)[0]).toMatchObject({ IsActive: 0 });

    await cycle(1, 3);
    rows = await cameraRows(db);
    expect(rowForNo(rows, 1)[0]).toMatchObject({ RecordID: id1, IsActive: 1 });
    expect(rowForNo(rows, 2)[0]).toMatchObject({ RecordID: id2, IsActive: 1 });
    expect(rowForNo(rows, 3)[0]).toMatchObject({ RecordID: id3, IsActive: 1, DeviceData: CAM_3 });
    expect(rowForNo(rows, 1).length).toBe(1);
    expect(rowForNo(rows, 2).length).toBe(1);
    expect(rowForNo(rows, 3).length).toBe(1);
  });

  it("Test 7 — mixed existing + new: restore only the rows that already exist (2 -> 4 restores 2, leaves 3/4 for fresh creation)", async () => {
    const db = await openProject(uniqueProjectPath());
    const repo = await getRepository();
    const inspectionId = 1;

    await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 1, DeviceData: CAM_1, DisplayOrder: 1, IsActive: 1 });
    const id2 = await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 2, DeviceData: CAM_2, DisplayOrder: 2, IsActive: 1 });
    await repo.deactivateBeyond(inspectionId, "Camera", 1);

    const restored = await repo.restorePendingDeactivatedRecords(inspectionId, "Camera", 4);

    expect(restored.map((r) => ({ RecordID: r.RecordID, DeviceNo: r.DeviceNo }))).toEqual([
      { RecordID: id2, DeviceNo: 2 },
    ]);

    const rows = await cameraRows(db);
    expect(rowForNo(rows, 2)[0]).toMatchObject({ RecordID: id2, IsActive: 1 });
    expect(rowForNo(rows, 3)).toEqual([]);
    expect(rowForNo(rows, 4)).toEqual([]);
  });

  it("Test 8 — different device types are isolated: restoring Camera does not touch Switch rows", async () => {
    const db = await openProject(uniqueProjectPath());
    const repo = await getRepository();
    const inspectionId = 1;

    const cam2 = await repo.create({ InspectionID: inspectionId, DeviceType: "Camera", DeviceNo: 2, DeviceData: CAM_2, DisplayOrder: 2, IsActive: 1 });
    const sw2 = await repo.create({ InspectionID: inspectionId, DeviceType: "Switch", DeviceNo: 2, DeviceData: JSON.stringify({ SwitchType: "8-Port" }), DisplayOrder: 2, IsActive: 1 });

    await repo.deactivateBeyond(inspectionId, "Camera", 1);
    await repo.deactivateBeyond(inspectionId, "Switch", 1);

    const restored = await repo.restorePendingDeactivatedRecords(inspectionId, "Camera", 2);

    expect(restored.map((r) => r.DeviceNo)).toEqual([2]);

    const cameraRows = await db.getAllAsync<DeviceRow>(
      `SELECT RecordID, InspectionID, DeviceType, DeviceNo, DeviceData, IsActive FROM DeviceRecords WHERE DeviceType = 'Camera' AND DeviceNo = 2`
    );
    const switchRows = await db.getAllAsync<DeviceRow>(
      `SELECT RecordID, InspectionID, DeviceType, DeviceNo, DeviceData, IsActive FROM DeviceRecords WHERE DeviceType = 'Switch' AND DeviceNo = 2`
    );
    expect(cameraRows[0]).toMatchObject({ RecordID: cam2, IsActive: 1, DeviceData: CAM_2 });
    expect(switchRows[0]).toMatchObject({ RecordID: sw2, IsActive: 0 });
  });
});
