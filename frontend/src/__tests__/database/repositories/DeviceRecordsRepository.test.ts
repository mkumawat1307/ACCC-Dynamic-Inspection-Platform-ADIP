jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import {
  DeviceRecordsRepository,
  DeviceRecord,
} from "@/src/database/repositories/DeviceRecordsRepository";

function createMockDb() {
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 100, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

function makeRecord(overrides: Partial<DeviceRecord> = {}): DeviceRecord {
  return {
    InspectionID: 1,
    DeviceType: "Camera",
    DeviceNo: 1,
    DeviceData: JSON.stringify({ Voltage: "12" }),
    DisplayOrder: 1,
    IsActive: 1,
    ...overrides,
  };
}

const INSERT_SQL = expect.stringContaining("INSERT INTO DeviceRecords");
const UPDATE_SQL = expect.stringContaining("UPDATE DeviceRecords");

describe("DeviceRecordsRepository pending-save registry", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  afterEach(() => {
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useRealTimers();
  });

  it("flush writes the latest record immediately without waiting for the debounce timer", async () => {
    jest.useFakeTimers();
    const record = makeRecord({ DeviceData: JSON.stringify({ Voltage: "12.5" }) });

    await DeviceRecordsRepository.scheduleDeviceRecordSave(record);
    await DeviceRecordsRepository.flushPendingDeviceSaves();

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(INSERT_SQL, [
      1,
      "Camera",
      null,
      1,
      JSON.stringify({ Voltage: "12.5" }),
      1,
    ]);

    await jest.advanceTimersByTimeAsync(500);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("scheduling twice for the same key persists only the latest value on flush", async () => {
    jest.useFakeTimers();
    await DeviceRecordsRepository.scheduleDeviceRecordSave(
      makeRecord({ DeviceData: JSON.stringify({ Voltage: "1" }) })
    );
    await DeviceRecordsRepository.scheduleDeviceRecordSave(
      makeRecord({ DeviceData: JSON.stringify({ Voltage: "12" }) })
    );

    await DeviceRecordsRepository.flushPendingDeviceSaves();

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(INSERT_SQL, [
      1,
      "Camera",
      null,
      1,
      JSON.stringify({ Voltage: "12" }),
      1,
    ]);
  });

  it("flush with nothing pending resolves immediately without a DB call", async () => {
    await DeviceRecordsRepository.flushPendingDeviceSaves();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("back-fills the RecordID on the record after create", async () => {
    const record = makeRecord();
    expect(record.RecordID).toBeUndefined();

    await DeviceRecordsRepository.scheduleDeviceRecordSave(record);
    await DeviceRecordsRepository.flushPendingDeviceSaves();

    expect(record.RecordID).toBe(100);
  });

  it("calls onPersisted with the new RecordID when the timer fires", async () => {
    jest.useFakeTimers();
    const onPersisted = jest.fn();

    await DeviceRecordsRepository.scheduleDeviceRecordSave(makeRecord(), 500, onPersisted);
    await jest.advanceTimersByTimeAsync(500);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(onPersisted).toHaveBeenCalledWith(100);
  });

  it("calls onPersisted with the new RecordID when flushed", async () => {
    const onPersisted = jest.fn();

    await DeviceRecordsRepository.scheduleDeviceRecordSave(makeRecord(), 500, onPersisted);
    await DeviceRecordsRepository.flushPendingDeviceSaves();

    expect(onPersisted).toHaveBeenCalledWith(100);
  });

  it("updates existing records instead of inserting once a RecordID is known", async () => {
    const record = makeRecord({ RecordID: 5, DeviceData: JSON.stringify({ Voltage: "13" }) });

    await DeviceRecordsRepository.scheduleDeviceRecordSave(record);
    await DeviceRecordsRepository.flushPendingDeviceSaves();

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(UPDATE_SQL, [
      null,
      JSON.stringify({ Voltage: "13" }),
      5,
    ]);
  });

  it("upserts by (InspectionID, DeviceType, DeviceNo) when RecordID is still unknown", async () => {
    // Simulates a keystroke during an in-flight create: the pending record has no
    // RecordID yet, but the row already exists -> must UPDATE, never INSERT a duplicate.
    mockDb.getAllAsync.mockResolvedValueOnce([{ RecordID: 9 }]);
    const onPersisted = jest.fn();
    const record = makeRecord({ DeviceData: JSON.stringify({ Voltage: "14" }) });

    await DeviceRecordsRepository.scheduleDeviceRecordSave(record, 500, onPersisted);
    await DeviceRecordsRepository.flushPendingDeviceSaves();

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(UPDATE_SQL, [
      null,
      JSON.stringify({ Voltage: "14" }),
      9,
    ]);
    expect(record.RecordID).toBe(9);
    expect(onPersisted).toHaveBeenCalledWith(9);
  });

  it("keeps pending saves isolated per device type (no key collision)", async () => {
    const camera = makeRecord({ DeviceType: "Camera", DeviceNo: 1 });
    const switchRecord = makeRecord({ DeviceType: "Switch", DeviceNo: 1 });

    await DeviceRecordsRepository.scheduleDeviceRecordSave(camera);
    await DeviceRecordsRepository.scheduleDeviceRecordSave(switchRecord);
    await DeviceRecordsRepository.flushPendingDeviceSaves();

    expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
    expect(mockDb.runAsync).toHaveBeenCalledWith(INSERT_SQL, [
      1,
      "Camera",
      null,
      1,
      camera.DeviceData,
      1,
    ]);
    expect(mockDb.runAsync).toHaveBeenCalledWith(INSERT_SQL, [
      1,
      "Switch",
      null,
      1,
      switchRecord.DeviceData,
      1,
    ]);
  });

  it("cancelPendingSaves(deviceType) stops only that type's pending timer", async () => {
    jest.useFakeTimers();
    await DeviceRecordsRepository.scheduleDeviceRecordSave(
      makeRecord({ DeviceType: "Camera", DeviceNo: 1 })
    );
    await DeviceRecordsRepository.scheduleDeviceRecordSave(
      makeRecord({ DeviceType: "Switch", DeviceNo: 1 })
    );

    DeviceRecordsRepository.cancelPendingSaves("Camera");
    await jest.advanceTimersByTimeAsync(500);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(INSERT_SQL, [
      1,
      "Switch",
      null,
      1,
      expect.any(String),
      1,
    ]);
  });

  it("cancelPendingSaves() with no device type cancels every pending timer", async () => {
    jest.useFakeTimers();
    await DeviceRecordsRepository.scheduleDeviceRecordSave(
      makeRecord({ DeviceType: "Camera", DeviceNo: 1 })
    );
    await DeviceRecordsRepository.scheduleDeviceRecordSave(
      makeRecord({ DeviceType: "Switch", DeviceNo: 1 })
    );

    DeviceRecordsRepository.cancelPendingSaves();
    await jest.advanceTimersByTimeAsync(500);

    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("cancelPendingSaves(deviceType, maxDeviceNo) cancels pending saves for pruned devices above the count", async () => {
    jest.useFakeTimers();
    await DeviceRecordsRepository.scheduleDeviceRecordSave(makeRecord({ DeviceNo: 1 }));
    await DeviceRecordsRepository.scheduleDeviceRecordSave(makeRecord({ DeviceNo: 2 }));
    await DeviceRecordsRepository.scheduleDeviceRecordSave(makeRecord({ DeviceNo: 3 }));

    // Simulates a count shrink to 1: devices 2/3 must NOT be persisted
    // (their INSERT would resurrect stale data with IsActive DEFAULT 1).
    DeviceRecordsRepository.cancelPendingSaves("Camera", 1);
    await jest.advanceTimersByTimeAsync(500);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(INSERT_SQL, [
      1,
      "Camera",
      null,
      1,
      expect.any(String),
      1,
    ]);
  });

  it("deactivateBeyond soft-deletes orphaned rows with DeviceNo above the count", async () => {
    await DeviceRecordsRepository.deactivateBeyond(1, "Camera", 2);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DeviceNo > ?"),
      [1, "Camera", 2]
    );
  });
});