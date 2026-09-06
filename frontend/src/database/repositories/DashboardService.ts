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
  fieldType?: string | null;
  fieldSectionName?: string | null;
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
        case "datebreakdown":
          break;
        case "dropdown": {
          const fieldType = await StatisticCountService.resolveFieldType(card);
          if (fieldType === "checkbox") {
            const count =
              card.EntityType === "devices"
                ? await StatisticCountService.deviceCheckboxCountCard(projectId, card)
                : await StatisticCountService.checkboxCountCard(projectId, card);
            const fieldSectionName = await StatisticCountService.resolveSectionName(card);
            result.push({ ...card, count, breakdown: undefined, fieldType, fieldSectionName });
          } else if (fieldType && fieldType !== "dropdown") {
            break;
          } else if (card.EntityType === "inspections") {
            result.push({ ...card, count: undefined, breakdown: await StatisticCountService.breakdownCard(projectId, card) });
          } else {
            result.push({ ...card, count: undefined, breakdown: await StatisticCountService.deviceBreakdownCard(projectId, card) });
          }
          break;
        }
        default:
          result.push({ ...card, count: await StatisticCountService.countCard(projectId, card), breakdown: undefined });
      }
    }
    return result;
  }
}
