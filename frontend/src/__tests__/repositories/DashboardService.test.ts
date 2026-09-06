import { DashboardService } from "@/src/database/repositories/DashboardService";
import { DashboardCardRepository } from "@/src/database/repositories/DashboardCardRepository";
import { StatisticCountService } from "@/src/database/repositories/StatisticCountService";
import { DashboardCard } from "@/src/models/DashboardCard";

jest.mock("@/src/database/repositories/DashboardCardRepository");
jest.mock("@/src/database/repositories/StatisticCountService");

const cardRepo = DashboardCardRepository as jest.Mocked<typeof DashboardCardRepository>;
const countService = StatisticCountService as jest.Mocked<typeof StatisticCountService>;

function cardOf(overrides: Partial<DashboardCard> = {}): DashboardCard {
  return {
    CardID: 1,
    ProjectID: 1,
    CardKey: "total_poles",
    Title: "Total Poles",
    Icon: "transmission-tower",
    Color: "#0B5ED7",
    EntityType: "inspections",
    CounterType: "total",
    FilterJson: null,
    CountMode: "count",
    DistinctColumn: null,
    BreakdownField: null,
    SectionLabel: null,
    AggregateField: null,
    CardMode: "entitycount",
    SortOrder: 0,
    Enabled: 1,
    IsDefault: 1,
    ...overrides,
  };
}

describe("DashboardService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("dispatches entitycount to countCard", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([cardOf()]);
    countService.countCard.mockResolvedValue(12);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.fieldCard).not.toHaveBeenCalled();
    expect(countService.fieldCountCard).not.toHaveBeenCalled();
    expect(countService.breakdownCard).not.toHaveBeenCalled();
    expect(countService.deviceBreakdownCard).not.toHaveBeenCalled();
    expect(countService.dateBreakdownCard).not.toHaveBeenCalled();
    expect(countService.countCard).toHaveBeenCalledWith(1, expect.objectContaining({ CardID: 1 }));
    expect(result[0]).toEqual(expect.objectContaining({ CardID: 1, count: 12, breakdown: undefined }));
  });

  it("dispatches sum to fieldCard", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 5, CardKey: "total_camera_count", AggregateField: "camera_count", CardMode: "sum" }),
    ]);
    countService.fieldCard.mockResolvedValue(17);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.countCard).not.toHaveBeenCalled();
    expect(countService.fieldCard).toHaveBeenCalledWith(1, expect.objectContaining({ CardMode: "sum" }));
    expect(result[0]).toEqual(expect.objectContaining({ CardID: 5, count: 17, breakdown: undefined }));
  });

  it("hides fieldcount cards", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 6, CardKey: "camera_count_done", BreakdownField: "camera_count", CardMode: "fieldcount" }),
    ]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(result).toEqual([]);
    expect(countService.fieldCountCard).not.toHaveBeenCalled();
    expect(countService.resolveFieldType).not.toHaveBeenCalled();
  });

  it("dispatches dropdown with inspections to breakdownCard", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 9, CardKey: "foundation_breakdown", BreakdownField: "foundation_cond", CardMode: "dropdown" }),
    ]);
    countService.breakdownCard.mockResolvedValue([
      { label: "Good", count: 42 },
      { label: "Bad", count: 7 },
    ]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.countCard).not.toHaveBeenCalled();
    expect(countService.deviceBreakdownCard).not.toHaveBeenCalled();
    expect(countService.breakdownCard).toHaveBeenCalledWith(1, expect.objectContaining({ BreakdownField: "foundation_cond" }));
    expect(result[0]).toEqual(expect.objectContaining({
      CardID: 9,
      count: undefined,
      breakdown: [
        { label: "Good", count: 42 },
        { label: "Bad", count: 7 },
      ],
    }));
  });

  it("keeps sum and entitycount cards intact while a cleared dropdown renders no breakdown rows", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 1, CardKey: "total_poles", CardMode: "entitycount" }),
      cardOf({ CardID: 5, CardKey: "total_camera_count", AggregateField: "camera_count", CardMode: "sum" }),
      cardOf({ CardID: 9, CardKey: "foundation_breakdown", BreakdownField: "foundation_cond", CardMode: "dropdown" }),
    ]);
    countService.countCard.mockResolvedValue(12);
    countService.fieldCard.mockResolvedValue(17);
    countService.breakdownCard.mockResolvedValue([]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.countCard).toHaveBeenCalledWith(1, expect.objectContaining({ CardID: 1 }));
    expect(countService.fieldCard).toHaveBeenCalledWith(1, expect.objectContaining({ CardID: 5 }));
    expect(countService.breakdownCard).toHaveBeenCalledWith(1, expect.objectContaining({ CardID: 9 }));
    expect(result).toEqual([
      expect.objectContaining({ CardID: 1, count: 12, breakdown: undefined }),
      expect.objectContaining({ CardID: 5, count: 17, breakdown: undefined }),
      expect.objectContaining({ CardID: 9, count: undefined, breakdown: [] }),
    ]);
  });

  it("dispatches dropdown with cameras to deviceBreakdownCard", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 10, CardKey: "camera_type_breakdown", EntityType: "cameras", BreakdownField: "CameraType", CardMode: "dropdown" }),
    ]);
    countService.deviceBreakdownCard.mockResolvedValue([
      { label: "PTZ", count: 3 },
      { label: "Fixed", count: 2 },
    ]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.breakdownCard).not.toHaveBeenCalled();
    expect(countService.deviceBreakdownCard).toHaveBeenCalledWith(1, expect.objectContaining({ EntityType: "cameras" }));
    expect(result[0]).toEqual(expect.objectContaining({
      CardID: 10,
      count: undefined,
      breakdown: [
        { label: "PTZ", count: 3 },
        { label: "Fixed", count: 2 },
      ],
    }));
  });

  it("hides datebreakdown cards", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 11, CardKey: "inspection_date_breakdown", BreakdownField: "inspection_date", CardMode: "datebreakdown" }),
    ]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(result).toEqual([]);
    expect(countService.dateBreakdownCard).not.toHaveBeenCalled();
    expect(countService.resolveFieldType).not.toHaveBeenCalled();
  });

  it("keeps the inspection breakdown when a dropdown field resolves to dropdown", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 9, CardKey: "foundation_breakdown", BreakdownField: "foundation_cond", CardMode: "dropdown" }),
    ]);
    countService.resolveFieldType.mockResolvedValue("dropdown");
    countService.breakdownCard.mockResolvedValue([{ label: "Good", count: 42 }]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.checkboxCountCard).not.toHaveBeenCalled();
    expect(countService.breakdownCard).toHaveBeenCalledWith(1, expect.objectContaining({ BreakdownField: "foundation_cond" }));
    expect(result[0]).toEqual(expect.objectContaining({ CardID: 9, count: undefined, breakdown: [{ label: "Good", count: 42 }] }));
  });

  it("hides a dropdown-mode card whose field type is neither checkbox nor dropdown", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 12, CardKey: "foundation_switch", BreakdownField: "foundation_cond", CardMode: "dropdown" }),
    ]);
    countService.resolveFieldType.mockResolvedValue("switch");

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(result).toEqual([]);
    expect(countService.breakdownCard).not.toHaveBeenCalled();
    expect(countService.deviceBreakdownCard).not.toHaveBeenCalled();
  });

  it("dispatches a dropdown inspection checkbox field to checkboxCountCard", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 13, CardKey: "online_breakdown", BreakdownField: "online", CardMode: "dropdown" }),
    ]);
    countService.resolveFieldType.mockResolvedValue("checkbox");
    countService.checkboxCountCard.mockResolvedValue(4);
    countService.resolveSectionName.mockResolvedValue("RF Details");

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.checkboxCountCard).toHaveBeenCalledWith(1, expect.objectContaining({ CardID: 13 }));
    expect(countService.resolveSectionName).toHaveBeenCalledWith(expect.objectContaining({ CardID: 13 }));
    expect(countService.breakdownCard).not.toHaveBeenCalled();
    expect(result[0]).toEqual(expect.objectContaining({
      CardID: 13,
      count: 4,
      breakdown: undefined,
      fieldType: "checkbox",
      fieldSectionName: "RF Details",
    }));
  });

  it("dispatches a devices checkbox field to deviceCheckboxCountCard", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 14, CardKey: "camera_status_online", EntityType: "devices", DeviceType: "Camera", BreakdownField: "CameraStatus", CardMode: "dropdown" }),
    ]);
    countService.resolveFieldType.mockResolvedValue("checkbox");
    countService.deviceCheckboxCountCard.mockResolvedValue(6);
    countService.resolveSectionName.mockResolvedValue("Camera");

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.deviceCheckboxCountCard).toHaveBeenCalledWith(1, expect.objectContaining({ CardID: 14 }));
    expect(countService.resolveSectionName).toHaveBeenCalledWith(expect.objectContaining({ CardID: 14 }));
    expect(countService.deviceBreakdownCard).not.toHaveBeenCalled();
    expect(result[0]).toEqual(expect.objectContaining({
      CardID: 14,
      count: 6,
      breakdown: undefined,
      fieldType: "checkbox",
      fieldSectionName: "Camera",
    }));
  });

  it("treats a failing card count as zero without throwing", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([cardOf()]);
    countService.countCard.mockResolvedValue(0);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(result).toEqual([expect.objectContaining({ CardID: 1, count: 0 })]);
  });

  it("returns an empty array when no cards are configured", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(result).toEqual([]);
    expect(countService.countCard).not.toHaveBeenCalled();
  });

  it("dispatches each mode to its engine across a mixed set", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 1, CardKey: "total_poles", CardMode: "entitycount" }),
      cardOf({ CardID: 2, CardKey: "foundation_breakdown", BreakdownField: "foundation_cond", CardMode: "dropdown" }),
      cardOf({ CardID: 3, CardKey: "total_camera_count", AggregateField: "camera_count", CardMode: "sum" }),
      cardOf({ CardID: 5, CardKey: "camera_type_breakdown", EntityType: "cameras", BreakdownField: "CameraType", CardMode: "dropdown" }),
    ]);
    countService.countCard.mockResolvedValue(12);
    countService.breakdownCard.mockResolvedValue([{ label: "Good", count: 42 }]);
    countService.fieldCard.mockResolvedValue(17);
    countService.deviceBreakdownCard.mockResolvedValue([{ label: "PTZ", count: 3 }]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.countCard).toHaveBeenCalledTimes(1);
    expect(countService.fieldCard).toHaveBeenCalledTimes(1);
    expect(countService.fieldCountCard).not.toHaveBeenCalled();
    expect(countService.breakdownCard).toHaveBeenCalledTimes(1);
    expect(countService.dateBreakdownCard).not.toHaveBeenCalled();
    expect(countService.deviceBreakdownCard).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({ CardID: 1, count: 12, breakdown: undefined }),
      expect.objectContaining({ CardID: 2, count: undefined, breakdown: [{ label: "Good", count: 42 }] }),
      expect.objectContaining({ CardID: 3, count: 17, breakdown: undefined }),
      expect.objectContaining({ CardID: 5, count: undefined, breakdown: [{ label: "PTZ", count: 3 }] }),
    ]);
  });
});
