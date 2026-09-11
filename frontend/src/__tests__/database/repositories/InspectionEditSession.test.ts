jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import InspectionValueRepository from "@/src/database/repositories/InspectionValueRepository";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { DeviceRecordsRepository, DeviceRecord } from "@/src/database/repositories/DeviceRecordsRepository";
import { InspectionEditSession } from "@/src/database/repositories/InspectionEditSession";
import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";

function createMockDb() {
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue({ hasInspection: 1, hasField: 1 }),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  };
}

// Count the inspection-value write calls (INSERT/UPDATE into InspectionValues).
function countValueWrites(mockDb: ReturnType<typeof createMockDb>): number {
  return (mockDb.runAsync as jest.Mock).mock.calls.filter((c: any[]) =>
    /InspectionValues/.test(String(c[0]))
  ).length;
}

function writeCalls(mockDb: ReturnType<typeof createMockDb>): string[] {
  return (mockDb.runAsync as jest.Mock).mock.calls.map((c: any[]) => String(c[0]));
}

// True if any InspectionValues write carried the given value in its bound args.
function wroteValue(mockDb: ReturnType<typeof createMockDb>, value: string): boolean {
  return (mockDb.runAsync as jest.Mock).mock.calls.some((c: any[]) => {
    const [sql, args] = c;
    if (!/InspectionValues/i.test(String(sql))) return false;
    return JSON.stringify(args ?? []).includes(value);
  });
}

describe("InspectionEditSession — existing inspection save boundary", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    // Query-aware: the parent-exists check returns valid parents; the
    // existing-ValueID lookup returns null so saveValue takes the INSERT path.
    mockDb.getFirstAsync.mockImplementation(async (query: string) => {
      if (/hasInspection/i.test(query)) {
        return { hasInspection: 1, hasField: 1 };
      }
      // Existing-ValueID lookup (and any other read) returns no row.
      return null;
    });
  });

  afterEach(async () => {
    await InspectionEditSession.discard();
  });

  describe("edit + Cancel (discard) leaves the database untouched", () => {
    it("1. change Pole ID then Cancel: original Pole ID remains", async () => {
      InspectionEditSession.activate(42);
      // Editing an existing inspection routes Pole ID writes to the session.
      await InspectionRepository.updatePoleIdDirectSave(42, 1, "P002");

      await InspectionEditSession.discard();

      expect(countValueWrites(mockDb)).toBe(0);
      expect(writeCalls(mockDb).some((q) => /UPDATE Inspections/i.test(q))).toBe(false);
      expect(writeCalls(mockDb).some((q) => /PoleID/i.test(q))).toBe(false);
    });

    it("2. change dropdown then Cancel: no database write", async () => {
      InspectionEditSession.activate(42);
      await InspectionValueRepository.saveValue(42, 10, "Underground");
      await InspectionValueRepository.saveValue(42, 10, "Overhead");

      await InspectionEditSession.discard();

      expect(countValueWrites(mockDb)).toBe(0);
    });

    it("3. change text field then Cancel: no database write", async () => {
      InspectionEditSession.activate(42);
      await InspectionValueRepository.saveValue(42, 11, "Typewritten notes");

      await InspectionEditSession.discard();

      expect(countValueWrites(mockDb)).toBe(0);
    });

    it("4. change number field then Cancel: no database write", async () => {
      InspectionEditSession.activate(42);
      await InspectionValueRepository.saveValue(42, 12, "3");

      await InspectionEditSession.discard();

      expect(countValueWrites(mockDb)).toBe(0);
    });

    it("5. change multiple fields then Cancel: none persist", async () => {
      InspectionEditSession.activate(42);
      await InspectionValueRepository.saveValue(42, 10, "Underground");
      await InspectionValueRepository.saveValue(42, 11, "new text");
      await InspectionValueRepository.saveValue(42, 12, "7");
      await InspectionRepository.updateInspectionPoleId(42, "P099");

      await InspectionEditSession.discard();

      expect(countValueWrites(mockDb)).toBe(0);
      expect(writeCalls(mockDb).some((q) => /PoleID/i.test(q))).toBe(false);
    });

    it("8. open with no changes then Cancel: zero database writes", async () => {
      InspectionEditSession.activate(42);
      await InspectionEditSession.discard();
      expect((mockDb.runAsync as jest.Mock).mock.calls.length).toBe(0);
    });

    it("9. missing value + configured default, open then Cancel: no InspectionValue created", async () => {
      InspectionEditSession.activate(42);
      // Existing inspection default application is a no-op (existing=true), and
      // the session stages nothing for an untouched field.
      await InspectionFieldRepository.applyDefaultSelections(42, true);

      await InspectionEditSession.discard();

      expect(countValueWrites(mockDb)).toBe(0);
    });

    it("device edit then Cancel: device record is not written", async () => {
      InspectionEditSession.activate(42);
      const record: DeviceRecord = {
        InspectionID: 42,
        DeviceType: "camera",
        DeviceNo: 1,
        DeviceData: JSON.stringify({ serial: "SN123" }),
        DisplayOrder: 1,
        IsActive: 1,
      };
      await DeviceRecordsRepository.scheduleDeviceRecordSave(record, 500, jest.fn());
      // Flush (as Back/Cancel would) must be a no-op for staged device edits.
      await DeviceRecordsRepository.flushPendingDeviceSaves();

      await InspectionEditSession.discard();

      expect(writeCalls(mockDb).some((q) => /DeviceRecords/i.test(q))).toBe(false);
    });
  });

  describe("edit + Save (commit) persists the changes", () => {
    it("6. change a field then Save: value persists", async () => {
      InspectionEditSession.activate(42);
      await InspectionValueRepository.saveValue(42, 10, "Underground");

      const ok = await InspectionEditSession.commit();

      expect(ok).toBe(true);
      expect(countValueWrites(mockDb)).toBeGreaterThan(0);
      expect(wroteValue(mockDb, "Underground")).toBe(true);
    });

    it("7. change multiple fields then Save: all persist", async () => {
      InspectionEditSession.activate(42);
      // resolvePoleIdFieldId uses an ESM dynamic import unsupported by Jest's
      // VM; stub it so the pole commit path is exercised without that import.
      jest
        .spyOn(InspectionEditSession, "resolvePoleIdFieldId")
        .mockResolvedValue(1);
      await InspectionValueRepository.saveValue(42, 10, "Underground");
      await InspectionValueRepository.saveValue(42, 11, "new text");
      await InspectionValueRepository.saveValue(42, 12, "7");
      await InspectionRepository.updateInspectionPoleId(42, "P099");

      const ok = await InspectionEditSession.commit();

      expect(ok).toBe(true);
      expect(countValueWrites(mockDb)).toBeGreaterThanOrEqual(3);
      expect(writeCalls(mockDb).some((q) => /PoleID/i.test(q))).toBe(true);
    });

    it("10. missing value + default, user selects a value then Save: selected value persists", async () => {
      InspectionEditSession.activate(42);
      // Field was blank; the technician explicitly selects a value.
      await InspectionValueRepository.saveValue(42, 13, "Aluminum");

      const ok = await InspectionEditSession.commit();

      expect(ok).toBe(true);
      expect(wroteValue(mockDb, "Aluminum")).toBe(true);
    });

    it("device edit then Save: device record is persisted", async () => {
      InspectionEditSession.activate(42);
      const record: DeviceRecord = {
        InspectionID: 42,
        DeviceType: "switch",
        DeviceNo: 1,
        DeviceData: JSON.stringify({ state: "1" }),
        DisplayOrder: 1,
        IsActive: 1,
      };
      await DeviceRecordsRepository.scheduleDeviceRecordSave(record, 500, jest.fn());

      const ok = await InspectionEditSession.commit();

      expect(ok).toBe(true);
      expect(writeCalls(mockDb).some((q) => /DeviceRecords/i.test(q))).toBe(true);
    });
  });

  describe("commit with a staged identity rename (district/block/pole)", () => {
    it("13. pole-only pending rename commits the Pole ID change", async () => {
      InspectionEditSession.activate(42);
      InspectionEditSession.stagePendingRename({
        oldPoleId: "P001",
        newPoleId: "P002",
        renameFiles: false,
        updateReports: true,
      });

      const ok = await InspectionEditSession.commit();

      expect(ok).toBe(true);
      expect(
        writeCalls(mockDb).some((q) => /UPDATE Inspections/i.test(q) && /PoleID/i.test(q))
      ).toBe(true);
      expect(
        writeCalls(mockDb).some((q) => /InspectionPoleIdHistory/i.test(q))
      ).toBe(true);
      expect(InspectionEditSession.isActive(42)).toBe(false);
    });

    it("14. staged district/block identity passes identity to the rename services", async () => {
      InspectionEditSession.activate(42);
      const identity = {
        oldDistrict: "Sikar",
        oldBlock: "BlockA",
        newDistrict: "Jaipur",
        newBlock: "Malarna",
      };
      InspectionEditSession.stagePendingRename({
        oldPoleId: "P001",
        newPoleId: "SIK101",
        renameFiles: false,
        updateReports: true,
        ...identity,
      });

      const prepareSpy = jest.spyOn(
        require("@/src/database/repositories/PoleRenameService").PoleRenameService,
        "prepareRename"
      );
      const writeSpy = jest.spyOn(
        require("@/src/database/repositories/PoleRenameService").PoleRenameService,
        "writeRenameInTransaction"
      );

      const ok = await InspectionEditSession.commit();

      expect(ok).toBe(true);
      expect(prepareSpy).toHaveBeenCalledWith(
        42,
        "P001",
        "SIK101",
        { renameFiles: false, updateReports: true },
        identity
      );
      expect(writeSpy).toHaveBeenCalledWith(
        expect.anything(),
        42,
        "P001",
        "SIK101",
        { renameFiles: false, updateReports: true },
        expect.anything(),
        identity
      );
    });

    it("15. staged identity field values persist alongside a pending rename", async () => {
      InspectionEditSession.activate(42);
      InspectionEditSession.stageFieldValue(20, "Jaipur");
      InspectionEditSession.stageFieldValue(21, "Malarna");
      InspectionEditSession.stagePoleId("SIK101");
      InspectionEditSession.stagePendingRename({
        oldPoleId: "P001",
        newPoleId: "SIK101",
        renameFiles: false,
        updateReports: true,
        oldDistrict: "Sikar",
        oldBlock: "BlockA",
        newDistrict: "Jaipur",
        newBlock: "Malarna",
      });

      const ok = await InspectionEditSession.commit();

      expect(ok).toBe(true);
      expect(wroteValue(mockDb, "Jaipur")).toBe(true);
      expect(wroteValue(mockDb, "Malarna")).toBe(true);
      expect(
        writeCalls(mockDb).some((q) => /UPDATE Inspections/i.test(q) && /PoleID/i.test(q))
      ).toBe(true);
      expect(InspectionEditSession.isActive(42)).toBe(false);
    });
  });

  describe("reports / Excel / CSV read the persisted database after Save", () => {
    it("11/12/13. committed values are readable by the report/export source", async () => {
      InspectionEditSession.activate(42);
      await InspectionValueRepository.saveValue(42, 10, "Underground");
      await InspectionEditSession.commit();

      // Reports/Excel/CSV read from the persisted DB (InspectionValues). Verify
      // the staged value reached the persisted source after an explicit Save.
      expect(wroteValue(mockDb, "Underground")).toBe(true);
      expect(countValueWrites(mockDb)).toBeGreaterThan(0);

      // After Save, the session is deactivated, so the value is persisted (not
      // held in memory) and the DB read reflects it.
      expect(InspectionEditSession.isActive(42)).toBe(false);
    });
  });
});
