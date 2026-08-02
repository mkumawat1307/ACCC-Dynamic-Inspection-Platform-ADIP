jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import { SmartCardGenerator, SmartFormField } from "@/src/database/repositories/SmartCardGenerator";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => {
      await fn();
    }),
  };
}

function field(overrides: Partial<SmartFormField> = {}): SmartFormField {
  return {
    FieldID: 1,
    FieldKey: "test_field",
    FieldName: "Test Field",
    FieldType: "text",
    Options: [],
    ...overrides,
  };
}

describe("SmartCardGenerator - card type inference", () => {
  it("maps dropdown to breakdown", () => {
    expect(SmartCardGenerator.getCardKind("dropdown")).toBe("breakdown");
  });

  it("maps switch to breakdown", () => {
    expect(SmartCardGenerator.getCardKind("switch")).toBe("breakdown");
  });

  it("maps checkbox to breakdown", () => {
    expect(SmartCardGenerator.getCardKind("checkbox")).toBe("breakdown");
  });

  it("maps number to aggregate", () => {
    expect(SmartCardGenerator.getCardKind("number")).toBe("aggregate");
  });

  it("maps text to breakdown", () => {
    expect(SmartCardGenerator.getCardKind("text")).toBe("breakdown");
  });

  it("maps multiline to breakdown", () => {
    expect(SmartCardGenerator.getCardKind("multiline")).toBe("breakdown");
  });

  it("maps DATE_AUTO to breakdown", () => {
    expect(SmartCardGenerator.getCardKind("DATE_AUTO")).toBe("breakdown");
  });

  it("maps GPS to skip", () => {
    expect(SmartCardGenerator.getCardKind("GPS")).toBe("skip");
  });

  it("maps device to skip", () => {
    expect(SmartCardGenerator.getCardKind("device")).toBe("skip");
  });
});

describe("SmartCardGenerator - card generation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generates two breakdown cards (Total + Today's) for a dropdown field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "pole_status", FieldName: "Pole Status", FieldType: "dropdown" }),
      1,
      10
    );
    expect(cards).toHaveLength(2);

    expect(cards[0].CardKey).toBe("smart_pole_status_total");
    expect(cards[0].Title).toBe("Pole Status");
    expect(cards[0].EntityType).toBe("inspections");
    expect(cards[0].CounterType).toBe("total");
    expect(cards[0].BreakdownField).toBe("pole_status");
    expect(cards[0].AggregateField).toBeNull();
    expect(cards[0].SectionLabel).toBe("Total");
    expect(cards[0].SortOrder).toBe(10);
    expect(cards[0].IsDefault).toBe(0);
    expect(cards[0].Enabled).toBe(1);

    expect(cards[1].CardKey).toBe("smart_pole_status_today");
    expect(cards[1].CounterType).toBe("today");
    expect(cards[1].SectionLabel).toBe("Today's");
    expect(cards[1].BreakdownField).toBe("pole_status");
    expect(cards[1].SortOrder).toBe(11);
  });

  it("generates two aggregate (SUM) cards for a number field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "camera_count", FieldName: "Camera Count", FieldType: "number" }),
      1,
      0
    );
    expect(cards).toHaveLength(2);

    expect(cards[0].BreakdownField).toBeNull();
    expect(cards[0].AggregateField).toBe("camera_count");
    expect(cards[0].CounterType).toBe("total");
    expect(cards[0].SectionLabel).toBe("Total");

    expect(cards[1].AggregateField).toBe("camera_count");
    expect(cards[1].CounterType).toBe("today");
    expect(cards[1].SectionLabel).toBe("Today's");
  });

  it("generates two breakdown cards for a text field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "block", FieldName: "Block", FieldType: "text" }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].BreakdownField).toBe("block");
    expect(cards[0].AggregateField).toBeNull();
    expect(cards[0].SectionLabel).toBe("Total");
    expect(cards[1].SectionLabel).toBe("Today's");
  });

  it("generates two breakdown cards for a multiline field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "remarks", FieldName: "Remarks", FieldType: "multiline" }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].BreakdownField).toBe("remarks");
    expect(cards[1].SectionLabel).toBe("Today's");
  });

  it("generates two breakdown cards for a switch field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "has_earth", FieldName: "Earthing Wire", FieldType: "switch" }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].BreakdownField).toBe("has_earth");
    expect(cards[1].SectionLabel).toBe("Today's");
  });

  it("generates two breakdown cards for a checkbox field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "verified", FieldName: "Verified", FieldType: "checkbox" }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].BreakdownField).toBe("verified");
  });

  it("generates two breakdown cards for a date_auto field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "inspection_date", FieldName: "Date", FieldType: "date_auto" }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].BreakdownField).toBe("inspection_date");
    expect(cards[1].SectionLabel).toBe("Today's");
  });

  it("returns empty array for GPS field (skip)", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "gps", FieldName: "GPS", FieldType: "GPS" }),
      1
    );
    expect(cards).toHaveLength(0);
  });

  it("returns empty array for device field (skip)", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "device_info", FieldName: "Device", FieldType: "device" }),
      1
    );
    expect(cards).toHaveLength(0);
  });

  it("uses correct icon and color for each field type", () => {
    const dropdown = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "dd", FieldName: "D", FieldType: "dropdown" }),
      1
    );
    expect(dropdown[0].Icon).toBe("chevron-down-circle");
    expect(dropdown[0].Color).toBe("#6F42C1");

    const number = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "num", FieldName: "N", FieldType: "number" }),
      1
    );
    expect(number[0].Icon).toBe("counter");
    expect(number[0].Color).toBe("#198754");

    const switchField = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "sw", FieldName: "S", FieldType: "switch" }),
      1
    );
    expect(switchField[0].Icon).toBe("toggle-switch");
    expect(switchField[0].Color).toBe("#FD7E14");
  });

  it("assigns incrementing SortOrder to Total and Today's cards", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "test", FieldName: "Test", FieldType: "number" }),
      1,
      20
    );
    expect(cards[0].SortOrder).toBe(20);
    expect(cards[1].SortOrder).toBe(21);
  });

  it("sets ProjectID on generated cards", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "test", FieldName: "Test", FieldType: "text" }),
      42
    );
    expect(cards[0].ProjectID).toBe(42);
    expect(cards[1].ProjectID).toBe(42);
  });

  it("generates unique CardKeys per field", () => {
    const cards1 = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "field_a", FieldName: "A", FieldType: "text" }),
      1
    );
    const cards2 = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "field_b", FieldName: "B", FieldType: "text" }),
      1
    );
    const keys = [...cards1, ...cards2].map((c) => c.CardKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("SmartCardGenerator - getFormFields", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("fetches active fields with their options", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "pole_status", FieldName: "Pole Status", FieldType: "dropdown" },
        { FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count", FieldType: "number" },
      ])
      .mockResolvedValueOnce([
        { OptionLabel: "Available", OptionValue: "Available" },
        { OptionLabel: "Not Available", OptionValue: "Not Available" },
      ])
      .mockResolvedValueOnce([]);

    const fields = await SmartCardGenerator.getFormFields();
    expect(fields).toHaveLength(2);
    expect(fields[0].FieldKey).toBe("pole_status");
    expect(fields[0].FieldType).toBe("dropdown");
    expect(fields[0].Options).toHaveLength(2);
    expect(fields[0].Options[0]).toEqual({ label: "Available", value: "Available" });
    expect(fields[1].FieldType).toBe("number");
    expect(fields[1].Options).toHaveLength(0);

    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(3);
  });

  it("normalizes field type to lowercase", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "date_field", FieldName: "Date", FieldType: "DATE_AUTO" },
      ])
      .mockResolvedValueOnce([]);

    const fields = await SmartCardGenerator.getFormFields();
    expect(fields[0].FieldType).toBe("date_auto");
  });
});

describe("SmartCardGenerator - getAvailableFields", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("returns fields that don't have both smart cards yet", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "pole_status", FieldName: "Pole Status", FieldType: "dropdown" },
        { FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count", FieldType: "number" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { CardKey: "smart_pole_status_total", SortOrder: 0 },
        { CardKey: "smart_pole_status_today", SortOrder: 1 },
      ]);

    const available = await SmartCardGenerator.getAvailableFields(1);
    expect(available).toHaveLength(1);
    expect(available[0].FieldKey).toBe("camera_count");
  });

  it("filters out GPS fields", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "gps_coord", FieldName: "GPS", FieldType: "GPS" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const available = await SmartCardGenerator.getAvailableFields(1);
    expect(available).toHaveLength(0);
  });

  it("returns all valid fields when no smart cards exist", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "pole_status", FieldName: "Pole Status", FieldType: "dropdown" },
        { FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count", FieldType: "number" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const available = await SmartCardGenerator.getAvailableFields(1);
    expect(available).toHaveLength(2);
  });
});

describe("SmartCardGenerator - getNextSortOrder", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("returns max SortOrder + 1 for existing cards", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ max: 5 });
    const order = await SmartCardGenerator.getNextSortOrder(1);
    expect(order).toBe(6);
  });

  it("returns 0 when no cards exist", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const order = await SmartCardGenerator.getNextSortOrder(1);
    expect(order).toBe(0);
  });
});
