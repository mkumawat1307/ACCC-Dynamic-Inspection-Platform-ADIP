jest.mock("@/src/database/db");

import { InspectionListRepository } from "@/src/database/repositories/InspectionListRepository";
import { getDatabase } from "@/src/database/db";
import { INSPECTION_FINAL_STATUSES } from "@/src/database/repositories/InspectionRepository";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  };
}

const sampleRows = [
  { InspectionID: 3, PoleID: "P003", Division: "D", District: "C", Block: "B", InspectionDate: "2026-08-07", Status: "Completed" },
  { InspectionID: 2, PoleID: "P002", Division: "D", District: "C", Block: "B", InspectionDate: "2026-08-06", Status: "Draft" },
  { InspectionID: 1, PoleID: "P001", Division: "D", District: "C", Block: "B", InspectionDate: "2026-08-05", Status: "Completed" },
];

describe("InspectionListRepository.getByProject", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    mockDb.getAllAsync.mockResolvedValue(sampleRows);
  });

  it("filters by the final status set in SQL and returns rows sorted by date desc", async () => {
    const rows = await InspectionListRepository.getByProject(7, INSPECTION_FINAL_STATUSES);

    const sql = mockDb.getAllAsync.mock.calls[0][0] as string;
    const params = mockDb.getAllAsync.mock.calls[0][1] as unknown[];

    expect(sql).toContain("i.ProjectID = ?");
    expect(sql).toContain("i.Status IN (?,?)");
    expect(params).toEqual([7, "Completed", "Submitted"]);
    expect(rows.map((r) => r.InspectionID)).toEqual([3, 2, 1]);
  });

  it("filters by Draft status in SQL for the drafts surface", async () => {
    await InspectionListRepository.getByProject(7, ["Draft"]);

    const sql = mockDb.getAllAsync.mock.calls[0][0] as string;
    const params = mockDb.getAllAsync.mock.calls[0][1] as unknown[];

    expect(sql).toContain("i.Status IN (?)");
    expect(params).toEqual([7, "Draft"]);
  });

  it("projects the expected InspectionListItem fields", async () => {
    const rows = await InspectionListRepository.getByProject(7, ["Completed"]);
    expect(rows[0]).toEqual({
      InspectionID: 3,
      PoleID: "P003",
      Division: "D",
      District: "C",
      Block: "B",
      InspectionDate: "2026-08-07",
      Status: "Completed",
    });
  });
});