jest.mock("@/src/database/db");

import { InspectionListRepository, InspectionListItem } from "@/src/database/repositories/InspectionListRepository";

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
