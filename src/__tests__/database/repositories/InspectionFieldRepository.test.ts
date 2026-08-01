jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

describe("InspectionFieldRepository", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("getFieldOptions", () => {
    it("returns options including IsDefault", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 1, FieldID: 1, OptionLabel: "Yes", OptionValue: "Y", DisplayOrder: 1, IsDefault: 1 },
        { OptionID: 2, FieldID: 1, OptionLabel: "No", OptionValue: "N", DisplayOrder: 2, IsDefault: 0 },
      ]);

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      const options = await InspectionFieldRepository.getFieldOptions(1);

      expect(options).toHaveLength(2);
      expect(options[0].IsDefault).toBe(1);
      expect(options[1].IsDefault).toBe(0);

      const query = (mockDb.getAllAsync as jest.Mock).mock.calls[0][0];
      expect(query).toContain("IsDefault");
    });

    it("returns empty array when field has no options", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      const options = await InspectionFieldRepository.getFieldOptions(999);
      expect(options).toEqual([]);
    });
  });
});
