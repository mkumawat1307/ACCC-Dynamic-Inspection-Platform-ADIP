import { DashboardCard } from "@/src/models/DashboardCard";
import { DashboardCardRepository } from "./DashboardCardRepository";
import { StatisticCountService } from "./StatisticCountService";

export interface CardWithCount extends DashboardCard {
  count: number;
}

export class DashboardService {
  static async getEnabledCardsWithCounts(projectId: number): Promise<CardWithCount[]> {
    const cards = await DashboardCardRepository.getEnabledCards(projectId);
    const result: CardWithCount[] = [];
    for (const card of cards) {
      const count = await StatisticCountService.countCard(projectId, card);
      result.push({ ...card, count });
    }
    return result;
  }
}
