jest.mock("@/src/database/db");
jest.mock("@/src/utils/InspectionDataBus");
jest.mock("@/src/utils/androidBackup", () => ({
  requestAndroidBackup: jest.fn(),
}));

import { getDatabase } from "@/src/database/db";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
import { requestAndroidBackup } from "@/src/utils/androidBackup";
import {
  InspectionRepository,
  INSPECTION_FINAL_STATUSES,
} from "@/src/database/repositories/InspectionRepository";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => {
      await fn();
    }),
  };
}

describe("InspectionRepository auto-refresh emits", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("createInspection emits with its projectId", async () => {
    const id = await InspectionRepository.createInspection(9, 1, "02-Aug-2026");
    expect(id).toBe(42);
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(9);
  });

  it("saveFieldValue emits with the resolved projectId", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ProjectID: 5 });
    await InspectionRepository.saveFieldValue(3, 7, "Yes");
    expect(mockDb.runAsync).toHaveBeenCalled();
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(5);
  });

  it("saveFieldValue emits after an UPDATE path", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
      .mockResolvedValueOnce({ ValueID: 11 })
      .mockResolvedValueOnce({ ProjectID: 5 });
    await InspectionRepository.saveFieldValue(3, 7, "No");
    expect(mockDb.runAsync).toHaveBeenCalled();
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(5);
  });

  it("updateInspectionPoleId emits with the resolved projectId", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 4 });
    await InspectionRepository.updateInspectionPoleId(2, "P-100");
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(4);
  });

  it("updateInspectionStatus emits with the resolved projectId", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 6 });
    await InspectionRepository.updateInspectionStatus(2, "Completed");
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(6);
  });

  it("deleteInspection resolves projectId before deleting and emits after", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 8 });
    await InspectionRepository.deleteInspection(2);
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(8);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(requestAndroidBackup).toHaveBeenCalled();
  });

  it("deleteMultipleInspections resolves projectId from the first id and emits after", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 3 });
    await InspectionRepository.deleteMultipleInspections([2, 5, 9]);
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(3);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(requestAndroidBackup).toHaveBeenCalled();
  });

  it("emits 0 when projectId cannot be resolved (save path)", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await InspectionRepository.saveFieldValue(3, 7, "Yes");
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(0);
  });
});

describe("INSPECTION_FINAL_STATUSES", () => {
  it("includes Completed and Submitted but not Draft", () => {
    expect(INSPECTION_FINAL_STATUSES).toEqual(["Completed", "Submitted"]);
    expect(INSPECTION_FINAL_STATUSES).not.toContain("Draft");
  });
});
