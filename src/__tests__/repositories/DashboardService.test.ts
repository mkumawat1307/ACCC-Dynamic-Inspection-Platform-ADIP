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
    SortOrder: 0,
    Enabled: 1,
    IsDefault: 1,
    ...overrides,
  };
}

describe("DashboardService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns enabled cards with their computed counts", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf(),
      cardOf({ CardID: 2, CardKey: "total_cameras", Title: "Total Cameras" }),
    ]);
    countService.countCard.mockResolvedValueOnce(12).mockResolvedValueOnce(40);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(cardRepo.getEnabledCards).toHaveBeenCalledWith(1);
    expect(countService.countCard).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({ CardID: 1, count: 12 }));
    expect(result[1]).toEqual(expect.objectContaining({ CardID: 2, count: 40 }));
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
});
