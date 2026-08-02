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
      if (card.BreakdownField) {
        const breakdown = await StatisticCountService.breakdownCard(projectId, card);
        result.push({ ...card, count: undefined, breakdown });
      } else {
        const count = await StatisticCountService.countCard(projectId, card);
        result.push({ ...card, count, breakdown: undefined });
      }
    }
    return result;
  }
}
