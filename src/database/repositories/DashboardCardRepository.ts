import { getDatabase } from "../db";
import { DashboardCard } from "@/src/models/DashboardCard";
import { DEFAULT_DASHBOARD_CARDS } from "../seeds/dashboard-cards.seed";

const CARD_COLUMNS = `
  CardID, ProjectID, CardKey, Title, Icon, Color,
  EntityType, CounterType, FilterJson, CountMode, DistinctColumn,
  BreakdownField, SortOrder, Enabled, IsDefault, CreatedAt, UpdatedAt
`;

function mapRow(row: Record<string, unknown>): DashboardCard {
  return {
    CardID: row.CardID as number,
    ProjectID: row.ProjectID as number,
    CardKey: row.CardKey as string,
    Title: row.Title as string,
    Icon: row.Icon as string,
    Color: row.Color as string,
    EntityType: row.EntityType as string,
    CounterType: row.CounterType as string,
    FilterJson: (row.FilterJson as string) ?? null,
    CountMode: row.CountMode === "distinct" ? "distinct" : "count",
    DistinctColumn: (row.DistinctColumn as string) ?? null,
    BreakdownField: (row.BreakdownField as string) ?? null,
    SortOrder: row.SortOrder as number,
    Enabled: row.Enabled as number,
    IsDefault: row.IsDefault as number,
    CreatedAt: row.CreatedAt as string,
    UpdatedAt: row.UpdatedAt as string,
  };
}

export class DashboardCardRepository {
  static async getAllCards(projectId: number): Promise<DashboardCard[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT ${CARD_COLUMNS}
       FROM DashboardCards
       WHERE ProjectID = ?
       ORDER BY SortOrder ASC, CardID ASC`,
      [projectId]
    );
    return rows.map(mapRow);
  }

  static async getEnabledCards(projectId: number): Promise<DashboardCard[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT ${CARD_COLUMNS}
       FROM DashboardCards
       WHERE ProjectID = ? AND Enabled = 1
       ORDER BY SortOrder ASC, CardID ASC`,
      [projectId]
    );
    return rows.map(mapRow);
  }

  static async getCardById(cardId: number): Promise<DashboardCard | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT ${CARD_COLUMNS}
       FROM DashboardCards
       WHERE CardID = ?`,
      [cardId]
    );
    return row ? mapRow(row) : null;
  }

  static async createCard(card: DashboardCard): Promise<number> {
    const db = await getDatabase();

    let sortOrder = card.SortOrder;
    if (sortOrder === undefined || sortOrder === null) {
      const max = await db.getFirstAsync<{ max: number }>(
        `SELECT MAX(SortOrder) AS max FROM DashboardCards WHERE ProjectID = ?`,
        [card.ProjectID]
      );
      sortOrder = ((max?.max ?? -1) + 1);
    }

    const result = await db.runAsync(
      `INSERT INTO DashboardCards
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SortOrder, Enabled, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.ProjectID,
        card.CardKey,
        card.Title,
        card.Icon,
        card.Color,
        card.EntityType,
        card.CounterType,
        card.FilterJson ?? null,
        card.CountMode,
        card.DistinctColumn ?? null,
        card.BreakdownField ?? null,
        sortOrder,
        card.Enabled,
        card.IsDefault,
      ]
    );

    return result.lastInsertRowId as number;
  }

  static async updateCard(card: DashboardCard): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DashboardCards
       SET Title = ?, Icon = ?, Color = ?, EntityType = ?, CounterType = ?,
           FilterJson = ?, CountMode = ?, DistinctColumn = ?, BreakdownField = ?, SortOrder = ?,
           Enabled = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE CardID = ?`,
      [
        card.Title,
        card.Icon,
        card.Color,
        card.EntityType,
        card.CounterType,
        card.FilterJson ?? null,
        card.CountMode,
        card.DistinctColumn ?? null,
        card.BreakdownField ?? null,
        card.SortOrder,
        card.Enabled,
        card.CardID!,
      ]
    );
  }

  static async deleteCard(cardId: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `DELETE FROM DashboardCards WHERE CardID = ?`,
      [cardId]
    );
  }

  static async setCardEnabled(cardId: number, enabled: boolean): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DashboardCards
       SET Enabled = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE CardID = ?`,
      [enabled ? 1 : 0, cardId]
    );
  }

  static async reorderCards(projectId: number, orderedIds: number[]): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.runAsync(
          `UPDATE DashboardCards
           SET SortOrder = ?, UpdatedAt = CURRENT_TIMESTAMP
           WHERE CardID = ? AND ProjectID = ?`,
          [i, orderedIds[i], projectId]
        );
      }
    });
  }

  static async ensureDefaultCards(projectId: number): Promise<void> {
    const db = await getDatabase();

    const existing = await db.getAllAsync<{ CardKey: string }>(
      `SELECT CardKey FROM DashboardCards WHERE ProjectID = ?`,
      [projectId]
    );
    const existingKeys = new Set(existing.map((r) => r.CardKey));

    const missing = DEFAULT_DASHBOARD_CARDS.filter((c) => !existingKeys.has(c.CardKey));
    if (missing.length === 0) return;

    await db.withTransactionAsync(async () => {
      for (const card of missing) {
        await db.runAsync(
          `INSERT INTO DashboardCards
           (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, SortOrder, Enabled, IsDefault)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            projectId,
            card.CardKey,
            card.Title,
            card.Icon,
            card.Color,
            card.EntityType,
            card.CounterType,
            null,
            card.CountMode,
            card.DistinctColumn ?? null,
            card.SortOrder,
          ]
        );
      }
    });
  }
}
