import { DashboardCard } from "@/src/models/DashboardCard";
import { DashboardCardRepository } from "./DashboardCardRepository";
import { StatisticCountService } from "./StatisticCountService";

export interface BreakdownRow {
  label: string;
  count: number;
}

export interface CardWithCount extends DashboardCard {
  count?: number;
  breakdown?: BreakdownRow[];
}

export class DashboardService {
  static async getEnabledCardsWithCounts(projectId: number): Promise<CardWithCount[]> {
    const cards = await DashboardCardRepository.getEnabledCards(projectId);
    const result: CardWithCount[] = [];
    for (const card of cards) {
      switch (card.CardMode) {
        case "sum":
          result.push({ ...card, count: await StatisticCountService.fieldCard(projectId, card), breakdown: undefined });
          break;
        case "fieldcount":
          result.push({ ...card, count: await StatisticCountService.fieldCountCard(projectId, card), breakdown: undefined });
          break;
        case "datebreakdown":
          result.push({ ...card, count: undefined, breakdown: await StatisticCountService.dateBreakdownCard(projectId, card) });
          break;
        case "dropdown":
          if (card.EntityType === "inspections") {
            result.push({ ...card, count: undefined, breakdown: await StatisticCountService.breakdownCard(projectId, card) });
          } else {
            result.push({ ...card, count: undefined, breakdown: await StatisticCountService.deviceBreakdownCard(projectId, card) });
          }
          break;
        default:
          result.push({ ...card, count: await StatisticCountService.countCard(projectId, card), breakdown: undefined });
      }
    }
    return result;
  }
}
