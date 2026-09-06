jest.mock("@/src/database/db");

import { InspectionListRepository, InspectionListItem } from "@/src/database/repositories/InspectionListRepository";
import { getDatabase } from "@/src/database/db";
import { INSPECTION_FINAL_STATUSES } from "@/src/database/repositories/InspectionRepository";

function makeItem(overrides: Partial<InspectionListItem>): InspectionListItem {
  return {
    InspectionID: 1,
    PoleID: "P-101",
    Division: "North",
    District: "D-1",
    Block: "B-2",
    InspectionDate: "2026-08-01",
    Status: "Completed",
    ...overrides,
  };
}

describe("InspectionListRepository.filterByQuery", () => {
  const items = [
    makeItem({ InspectionID: 1, PoleID: "P-101", Division: "North", District: "D-1", Block: "B-2" }),
    makeItem({ InspectionID: 2, PoleID: "P-202", Division: "South", District: "D-2", Block: "B-3" }),
    makeItem({ InspectionID: 3, PoleID: "P-303", Division: null, District: null, Block: null }),
  ];

  it("matches PoleID case-insensitively", () => {
    expect(InspectionListRepository.filterByQuery(items, "p-202").map((i) => i.InspectionID)).toEqual([2]);
  });

  it("matches Division", () => {
    expect(InspectionListRepository.filterByQuery(items, "south").map((i) => i.InspectionID)).toEqual([2]);
  });

  it("matches District", () => {
    expect(InspectionListRepository.filterByQuery(items, "d-1").map((i) => i.InspectionID)).toEqual([1]);
  });

  it("matches Block", () => {
    expect(InspectionListRepository.filterByQuery(items, "b-3").map((i) => i.InspectionID)).toEqual([2]);
  });

  it("handles null Division/District/Block without throwing", () => {
    expect(() => InspectionListRepository.filterByQuery(items, "nothing")).not.toThrow();
    expect(InspectionListRepository.filterByQuery(items, "nothing")).toEqual([]);
  });

  it("returns all items for an empty query", () => {
    expect(InspectionListRepository.filterByQuery(items, "")).toHaveLength(3);
  });
});

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
