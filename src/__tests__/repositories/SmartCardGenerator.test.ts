jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import { SmartCardGenerator, SmartFormField } from "@/src/database/repositories/SmartCardGenerator";
import { SECTION_LABEL_TODAY, SECTION_LABEL_TOTAL } from "@/src/database/seeds/dashboard-cards.seed";

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

function deviceField(overrides: Partial<SmartFormField> = {}): SmartFormField {
  return field({
    FieldID: 10,
    FieldKey: "dev_Camera_CameraStatus",
    FieldName: "Camera Status",
    FieldType: "dropdown",
    source: "device",
    DeviceType: "Camera",
    DeviceColumn: "CameraStatus",
    ...overrides,
  });
}

describe("SmartCardGenerator - card type inference", () => {
  it("maps dropdown to dropdown mode", () => {
    expect(SmartCardGenerator.getCardKind("dropdown")).toBe("dropdown");
  });

  it("maps switch to dropdown mode", () => {
    expect(SmartCardGenerator.getCardKind("switch")).toBe("dropdown");
  });

  it("maps checkbox to dropdown mode", () => {
    expect(SmartCardGenerator.getCardKind("checkbox")).toBe("dropdown");
  });

  it("maps number to sum mode", () => {
    expect(SmartCardGenerator.getCardKind("number")).toBe("sum");
  });

  it("maps text to fieldcount mode", () => {
    expect(SmartCardGenerator.getCardKind("text")).toBe("fieldcount");
  });

  it("maps multiline to fieldcount mode", () => {
    expect(SmartCardGenerator.getCardKind("multiline")).toBe("fieldcount");
  });

  it("maps DATE_AUTO to datebreakdown mode", () => {
    expect(SmartCardGenerator.getCardKind("DATE_AUTO")).toBe("datebreakdown");
  });

  it("maps date to datebreakdown mode", () => {
    expect(SmartCardGenerator.getCardKind("date")).toBe("datebreakdown");
  });

  it("maps GPS to skip", () => {
    expect(SmartCardGenerator.getCardKind("GPS")).toBe("skip");
  });

  it("maps device to skip", () => {
    expect(SmartCardGenerator.getCardKind("device")).toBe("skip");
  });

  it("maps camera to skip", () => {
    expect(SmartCardGenerator.getCardKind("camera")).toBe("skip");
  });

  it("maps calculation to skip", () => {
    expect(SmartCardGenerator.getCardKind("calculation")).toBe("skip");
  });

  it("maps unmapped types to skip", () => {
    expect(SmartCardGenerator.getCardKind("time")).toBe("skip");
    expect(SmartCardGenerator.getCardKind("unknown_type")).toBe("skip");
  });
});

describe("SmartCardGenerator - card generation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generates two dropdown cards (Total + Today's) for a dropdown field", () => {
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
    expect(cards[0].CardMode).toBe("dropdown");
    expect(cards[0].BreakdownField).toBe("pole_status");
    expect(cards[0].AggregateField).toBeNull();
    expect(cards[0].SectionLabel).toBe(SECTION_LABEL_TOTAL);
    expect(cards[0].SortOrder).toBe(10);
    expect(cards[0].IsDefault).toBe(0);
    expect(cards[0].Enabled).toBe(1);

    expect(cards[1].CardKey).toBe("smart_pole_status_today");
    expect(cards[1].CounterType).toBe("today");
    expect(cards[1].SectionLabel).toBe(SECTION_LABEL_TODAY);
    expect(cards[1].CardMode).toBe("dropdown");
    expect(cards[1].BreakdownField).toBe("pole_status");
    expect(cards[1].SortOrder).toBe(11);
  });

  it("generates two sum (SUM) cards for a number field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "camera_count", FieldName: "Camera Count", FieldType: "number" }),
      1,
      0
    );
    expect(cards).toHaveLength(2);

    expect(cards[0].CardMode).toBe("sum");
    expect(cards[0].BreakdownField).toBeNull();
    expect(cards[0].AggregateField).toBe("camera_count");
    expect(cards[0].CounterType).toBe("total");
    expect(cards[0].SectionLabel).toBe(SECTION_LABEL_TOTAL);

    expect(cards[1].CardMode).toBe("sum");
    expect(cards[1].AggregateField).toBe("camera_count");
    expect(cards[1].CounterType).toBe("today");
    expect(cards[1].SectionLabel).toBe(SECTION_LABEL_TODAY);
  });

  it("generates two fieldcount cards for a text field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "block", FieldName: "Block", FieldType: "text" }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].CardMode).toBe("fieldcount");
    expect(cards[0].BreakdownField).toBe("block");
    expect(cards[0].AggregateField).toBeNull();
    expect(cards[0].SectionLabel).toBe(SECTION_LABEL_TOTAL);
    expect(cards[1].SectionLabel).toBe(SECTION_LABEL_TODAY);
  });

  it("returns empty array for the remarks field (excluded)", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "remarks", FieldName: "Remarks", FieldType: "multiline" }),
      1
    );
    expect(cards).toHaveLength(0);
  });

  it("generates two dropdown cards for a switch field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "has_earth", FieldName: "Earthing Wire", FieldType: "switch" }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].CardMode).toBe("dropdown");
    expect(cards[0].BreakdownField).toBe("has_earth");
    expect(cards[1].SectionLabel).toBe(SECTION_LABEL_TODAY);
  });

  it("generates two dropdown cards for a checkbox field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "verified", FieldName: "Verified", FieldType: "checkbox" }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].CardMode).toBe("dropdown");
    expect(cards[0].BreakdownField).toBe("verified");
  });

  it("generates two datebreakdown cards for a date_auto field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      field({ FieldKey: "inspection_date", FieldName: "Date", FieldType: "date_auto" }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].CardMode).toBe("datebreakdown");
    expect(cards[0].BreakdownField).toBe("inspection_date");
    expect(cards[1].SectionLabel).toBe(SECTION_LABEL_TODAY);
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

  it("generates dropdown cards for a device field using the column as breakdown", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      deviceField({ DeviceType: "Camera" }),
      1
    );
    expect(cards).toHaveLength(2);

    expect(cards[0].CardKey).toBe("smart_dev_Camera_CameraStatus_total");
    expect(cards[1].CardKey).toBe("smart_dev_Camera_CameraStatus_today");
    expect(cards[0].CardMode).toBe("dropdown");
    expect(cards[0].EntityType).toBe("devices");
    expect(cards[0].BreakdownField).toBe("CameraStatus");
    expect(cards[0].AggregateField).toBeNull();
    expect(cards[0].Title).toBe("Camera Status");
    expect(cards[1].EntityType).toBe("devices");
    expect(cards[1].BreakdownField).toBe("CameraStatus");
    expect(cards[0].DeviceType).toBe("Camera");
    expect(cards[1].DeviceType).toBe("Camera");
    expect(cards[0].SectionLabel).toBe(SECTION_LABEL_TOTAL);
    expect(cards[1].SectionLabel).toBe(SECTION_LABEL_TODAY);
  });

  it("uses switches entity type for a Switch device field", () => {
    const cards = SmartCardGenerator.generateCardsForField(
      deviceField({
        FieldKey: "dev_Switch_SwitchState",
        FieldName: "Switch State",
        DeviceType: "Switch",
        DeviceColumn: "SwitchState",
      }),
      1
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].EntityType).toBe("devices");
    expect(cards[0].DeviceType).toBe("Switch");
    expect(cards[0].CardKey).toBe("smart_dev_Switch_SwitchState_total");
  });
});

describe("SmartCardGenerator - getFormFields", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("fetches active fields with their options and marks source as inspection", async () => {
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
    expect(fields[0].source).toBe("inspection");
    expect(fields[0].Options).toHaveLength(2);
    expect(fields[0].Options[0]).toEqual({ label: "Available", value: "Available" });
    expect(fields[1].FieldType).toBe("number");
    expect(fields[1].source).toBe("inspection");
    expect(fields[1].Options).toHaveLength(0);

    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(3);
  });

  it("excludes the remarks field in the query", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "remarks", FieldName: "Remarks", FieldType: "multiline" },
      ])
      .mockResolvedValueOnce([]);

    const fields = await SmartCardGenerator.getFormFields();
    expect(fields).toHaveLength(1);

    const sql = mockDb.getAllAsync.mock.calls[0][0] as string;
    expect(sql).toContain("AND f.FieldKey != 'remarks'");
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

describe("SmartCardGenerator - getDeviceFields", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("queries active device fields with dropdown/switch/checkbox types for every device type", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    await SmartCardGenerator.getDeviceFields();

    const sql = mockDb.getAllAsync.mock.calls[0][0] as string;
    expect(sql).toContain("FROM DeviceFieldDefinitions");
    expect(sql).not.toContain("DeviceType IN");
    expect(sql).toContain("FieldType IN ('dropdown', 'switch', 'checkbox')");
    expect(sql).toContain("IsActive = 1");
    expect(sql).toContain("ORDER BY DeviceType, DisplayOrder");
  });

  it("regression — custom device types are included in the field picker with their columns", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { FieldDefID: 20, DeviceType: "Gate", FieldName: "GateStatus", Label: "Gate Status", FieldType: "dropdown" },
      { FieldDefID: 21, DeviceType: "Gate", FieldName: "GateLocked", Label: "Gate Locked", FieldType: "switch" },
    ]);

    const fields = await SmartCardGenerator.getDeviceFields();
    expect(fields).toHaveLength(2);
    expect(fields.map((f) => f.DeviceType)).toEqual(["Gate", "Gate"]);
    expect(fields[0].FieldKey).toBe("dev_Gate_GateStatus");
    expect(fields[0].DeviceColumn).toBe("GateStatus");
    expect(fields[1].FieldKey).toBe("dev_Gate_GateLocked");
    expect(fields[1].DeviceColumn).toBe("GateLocked");
  });

  it("maps device field rows to SmartFormField with dev_ keys and source device", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { FieldDefID: 10, DeviceType: "Camera", FieldName: "CameraStatus", Label: "Camera Status", FieldType: "dropdown" },
      { FieldDefID: 11, DeviceType: "Switch", FieldName: "SwitchState", Label: "Switch State", FieldType: "SWITCH" },
    ]);

    const fields = await SmartCardGenerator.getDeviceFields();
    expect(fields).toHaveLength(2);

    expect(fields[0].FieldID).toBe(10);
    expect(fields[0].FieldKey).toBe("dev_Camera_CameraStatus");
    expect(fields[0].FieldName).toBe("Camera Status");
    expect(fields[0].FieldType).toBe("dropdown");
    expect(fields[0].Options).toEqual([]);
    expect(fields[0].source).toBe("device");
    expect(fields[0].DeviceType).toBe("Camera");
    expect(fields[0].DeviceColumn).toBe("CameraStatus");

    expect(fields[1].FieldKey).toBe("dev_Switch_SwitchState");
    expect(fields[1].FieldType).toBe("switch");
    expect(fields[1].DeviceType).toBe("Switch");
    expect(fields[1].DeviceColumn).toBe("SwitchState");
  });
});

describe("SmartCardGenerator - getAvailableFields", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  function cardRow(overrides: Record<string, unknown> = {}) {
    return {
      CardID: 1,
      CardKey: "k1",
      ProjectID: 1,
      Title: "t",
      Icon: "i",
      Color: "c",
      EntityType: "inspections",
      CounterType: "total",
      CountMode: "count",
      CardMode: "entitycount",
      BreakdownField: null,
      AggregateField: null,
      FilterJson: null,
      DeviceType: null,
      SectionLabel: "Total",
      SortOrder: 1,
      IsSystem: 0,
      IsDisabled: 0,
      ...overrides,
    };
  }

  const DEFAULT_CARDS = [
    cardRow({ CardKey: "k1", BreakdownField: "inspection_done" }),
    cardRow({ CardKey: "k2", CardMode: "dropdown", BreakdownField: "pole_avail" }),
    cardRow({ CardKey: "k3", CardMode: "sum", BreakdownField: null, AggregateField: "camera_count" }),
  ];

  const INSPECTION_FIELDS = [
    { FieldID: 1, FieldKey: "pole_avail", FieldName: "Pole Availability", FieldType: "dropdown" },
    { FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count", FieldType: "number" },
    { FieldID: 3, FieldKey: "inspection_done", FieldName: "Inspection Done", FieldType: "dropdown" },
    { FieldID: 4, FieldKey: "camera_status", FieldName: "Camera Status", FieldType: "text" },
  ];

  it("hides fields already covered by default cards (breakdown or SUM)", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(DEFAULT_CARDS)
      .mockResolvedValueOnce(INSPECTION_FIELDS)
      .mockResolvedValue([]);

    const available = await SmartCardGenerator.getAvailableFields(1);

    const keys = available.map((f) => f.FieldKey);
    expect(keys).not.toContain("inspection_done");
    expect(keys).not.toContain("pole_avail");
    expect(keys).not.toContain("camera_count");
    expect(keys).toEqual(["camera_status"]);
  });

  it("hides a SUM-covered field when a sum card exists for a project", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        cardRow({ CardID: 9, CardKey: "k9", ProjectID: 2, CardMode: "sum", BreakdownField: null, AggregateField: "camera_status" }),
      ])
      .mockResolvedValueOnce([
        { FieldID: 4, FieldKey: "camera_status", FieldName: "Camera Status", FieldType: "number" },
      ])
      .mockResolvedValue([]);

    const available = await SmartCardGenerator.getAvailableFields(2);

    expect(available.map((f) => f.FieldKey)).not.toContain("camera_status");
    expect(available).toHaveLength(0);
  });

  it("shows a field again once its covering card is removed", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(DEFAULT_CARDS.filter((c) => c.CardKey !== "k2"))
      .mockResolvedValueOnce(INSPECTION_FIELDS)
      .mockResolvedValue([]);

    const available = await SmartCardGenerator.getAvailableFields(1);

    const keys = available.map((f) => f.FieldKey);
    expect(keys).toContain("pole_avail");
    expect(keys).not.toContain("camera_count");
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

describe("SmartCardGenerator - addSmartCardsForField", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("creates both cards when none exist", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "test_field", FieldName: "Test Field", FieldType: "text" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { CardKey: "smart_test_field_total", SortOrder: 0 },
        { CardKey: "smart_test_field_today", SortOrder: 1 },
      ]);
    mockDb.getFirstAsync.mockResolvedValue({ max: 5 });

    const ids = await SmartCardGenerator.addSmartCardsForField(1, "test_field");

    expect(ids).toHaveLength(2);
    const insertCalls = mockDb.runAsync.mock.calls.filter((call) =>
      String(call[0]).includes("INSERT INTO DashboardCards")
    );
    expect(insertCalls).toHaveLength(2);
    const params = insertCalls.map((call) => (call[1] as unknown[])[1]);
    expect(params).toEqual(["smart_test_field_total", "smart_test_field_today"]);

    const normalizeUpdates = mockDb.runAsync.mock.calls.filter((call) =>
      String(call[0]).includes("UPDATE DashboardCards") && String(call[0]).includes("SortOrder = ?")
    );
    expect(normalizeUpdates).toHaveLength(2);
  });

  it("skips an existing partial card and creates only the missing one", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "test_field", FieldName: "Test Field", FieldType: "text" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ CardKey: "smart_test_field_total", SortOrder: 0 }])
      .mockResolvedValueOnce([{ CardKey: "smart_test_field_total", SortOrder: 0 }]);
    mockDb.getFirstAsync.mockResolvedValue({ max: 5 });

    const ids = await SmartCardGenerator.addSmartCardsForField(1, "test_field");

    expect(ids).toHaveLength(1);
    const insertCalls = mockDb.runAsync.mock.calls.filter((call) =>
      String(call[0]).includes("INSERT INTO DashboardCards")
    );
    expect(insertCalls).toHaveLength(1);
    const params = insertCalls[0][1] as unknown[];
    expect(params[1]).toBe("smart_test_field_today");
  });

  it("returns no new cards when both cards already exist", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "test_field", FieldName: "Test Field", FieldType: "text" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { CardKey: "smart_test_field_total", SortOrder: 0 },
        { CardKey: "smart_test_field_today", SortOrder: 1 },
      ])
      .mockResolvedValueOnce([
        { CardKey: "smart_test_field_total", SortOrder: 0 },
        { CardKey: "smart_test_field_today", SortOrder: 1 },
      ]);
    mockDb.getFirstAsync.mockResolvedValue({ max: 5 });

    const ids = await SmartCardGenerator.addSmartCardsForField(1, "test_field");

    expect(ids).toHaveLength(0);
    const insertCalls = mockDb.runAsync.mock.calls.filter((call) =>
      String(call[0]).includes("INSERT INTO DashboardCards")
    );
    expect(insertCalls).toHaveLength(0);
  });
});
