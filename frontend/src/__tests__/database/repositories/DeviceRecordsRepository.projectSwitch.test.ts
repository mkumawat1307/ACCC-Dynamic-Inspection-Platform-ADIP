jest.mock("expo-sqlite");

import { clearActiveProject, getDatabase, setActiveProject } from "@/src/database/db";
import {
  DeviceRecord,
  DeviceRecordsRepository,
} from "@/src/database/repositories/DeviceRecordsRepository";

describe("DeviceRecordsRepository cross-project persist isolation", () => {
  afterEach(async () => {
    DeviceRecordsRepository.cancelPendingSaves();
    jest.restoreAllMocks();
    await clearActiveProject();
  });

  it("aborts instead of writing a new device record to another project when the project switches during flush persist", async () => {
    const pathA = "/mock/documents/Projects/IsolA/inspection.db";
    const pathB = "/mock/documents/Projects/IsolB/inspection.db";

    await setActiveProject(pathA);
    const dbA = await getDatabase();

    let resolveSelectGate!: () => void;
    const selectGate = new Promise<void>((resolve) => {
      resolveSelectGate = resolve;
    });
    jest.spyOn(dbA, "getAllAsync").mockImplementationOnce(async () => {
      await selectGate;
      return [] as DeviceRecord[];
    });

    const record: DeviceRecord = {
      InspectionID: 1,
      DeviceType: "Camera",
      DeviceNo: 1,
      DeviceData: JSON.stringify({ Voltage: "12" }),
      DisplayOrder: 1,
      IsActive: 1,
    };
    const onPersisted = jest.fn();
    await DeviceRecordsRepository.scheduleDeviceRecordSave(record, 500, onPersisted);

    const flushP = DeviceRecordsRepository.flushPendingDeviceSaves();
    await new Promise((r) => setTimeout(r, 0));

    await clearActiveProject();
    await setActiveProject(pathB);
    const dbB = await getDatabase();

    resolveSelectGate();
    await flushP;

    const rowsB = await dbB.getAllAsync<DeviceRecord>("SELECT * FROM DeviceRecords");
    const rowsA = await dbA.getAllAsync<DeviceRecord>("SELECT * FROM DeviceRecords");

    expect(rowsB).toHaveLength(0);
    expect(rowsA).toHaveLength(0);
    expect(onPersisted).not.toHaveBeenCalled();
  });

  it("aborts instead of writing a new device record to another project when the project switches during a debounced save", async () => {
    const pathA = "/mock/documents/Projects/IsolC/inspection.db";
    const pathB = "/mock/documents/Projects/IsolD/inspection.db";

    await setActiveProject(pathA);
    const dbA = await getDatabase();

    let resolveSelectGate!: () => void;
    const selectGate = new Promise<void>((resolve) => {
      resolveSelectGate = resolve;
    });
    jest.spyOn(dbA, "getAllAsync").mockImplementationOnce(async () => {
      await selectGate;
      return [] as DeviceRecord[];
    });

    const record: DeviceRecord = {
      InspectionID: 7,
      DeviceType: "Camera",
      DeviceNo: 2,
      DeviceData: JSON.stringify({ Voltage: "220" }),
      DisplayOrder: 2,
      IsActive: 1,
    };
    const onPersisted = jest.fn();
    await DeviceRecordsRepository.scheduleDeviceRecordSave(record, 500, onPersisted);

    await new Promise((r) => setTimeout(r, 550));
    await new Promise((r) => setTimeout(r, 0));

    await clearActiveProject();
    await setActiveProject(pathB);
    const dbB = await getDatabase();

    resolveSelectGate();
    await new Promise((r) => setTimeout(r, 30));

    const rowsB = await dbB.getAllAsync<DeviceRecord>("SELECT * FROM DeviceRecords");
    const rowsA = await dbA.getAllAsync<DeviceRecord>("SELECT * FROM DeviceRecords");

    expect(rowsB).toHaveLength(0);
    expect(rowsA).toHaveLength(0);
    expect(onPersisted).not.toHaveBeenCalled();
  });
});