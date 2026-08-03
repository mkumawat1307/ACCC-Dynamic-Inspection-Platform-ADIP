import { getDatabase } from "../db";
import { CardModeValue, DashboardCard } from "@/src/models/DashboardCard";
import { DEFAULT_DASHBOARD_CARDS, DEFAULT_SECTIONED_CARDS, DashboardCardSeed, SECTION_LABEL_TODAY, SECTION_LABEL_TOTAL } from "../seeds/dashboard-cards.seed";

const CARD_COLUMNS = `
  CardID, ProjectID, CardKey, Title, Icon, Color,
  EntityType, CounterType, FilterJson, CountMode, DistinctColumn,
  BreakdownField, SectionLabel, AggregateField, DeviceType, CardMode, SortOrder, Enabled, IsDefault, CreatedAt, UpdatedAt
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
    SectionLabel: (row.SectionLabel as string) ?? null,
    AggregateField: (row.AggregateField as string) ?? null,
    DeviceType: (row.DeviceType as string) ?? null,
    CardMode: ((row.CardMode as string) || "entitycount") as CardModeValue,
    SortOrder: row.SortOrder as number,
    Enabled: row.Enabled as number,
    IsDefault: row.IsDefault as number,
    CreatedAt: row.CreatedAt as string,
    UpdatedAt: row.UpdatedAt as string,
  };
}

const LEGACY_DEFAULT_KEYS = DEFAULT_DASHBOARD_CARDS.map((c) => c.CardKey);

function selectDefaultSet(existingKeys: Set<string>): DashboardCardSeed[] {
  const isLegacy = LEGACY_DEFAULT_KEYS.some((key) => existingKeys.has(key));
  return isLegacy ? DEFAULT_DASHBOARD_CARDS : DEFAULT_SECTIONED_CARDS;
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
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, CardMode, SortOrder, Enabled, IsDefault, DeviceType)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        card.SectionLabel ?? null,
        card.AggregateField ?? null,
        card.CardMode,
        sortOrder,
        card.Enabled,
        card.IsDefault,
        card.DeviceType ?? null,
      ]
    );

    return result.lastInsertRowId as number;
  }

  static async updateCard(card: DashboardCard): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DashboardCards
       SET Title = ?, Icon = ?, Color = ?, EntityType = ?, CounterType = ?,
           FilterJson = ?, CountMode = ?, CardMode = ?, DistinctColumn = ?, BreakdownField = ?, SortOrder = ?,
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
        card.CardMode,
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

    const activeSet = selectDefaultSet(existingKeys);
    const missing = activeSet.filter((c) => !existingKeys.has(c.CardKey));
    if (missing.length === 0) return;

    await db.withTransactionAsync(async () => {
      for (const card of missing) {
        await db.runAsync(
          `INSERT INTO DashboardCards
           (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, CardMode, SortOrder, Enabled, IsDefault, DeviceType)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
          [
            projectId,
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
            card.SectionLabel ?? null,
            card.AggregateField ?? null,
            card.CardMode,
            card.SortOrder,
            card.DeviceType ?? null,
          ]
        );
      }
    });
  }

  static async migrateDefaultCards(projectId: number): Promise<void> {
    const db = await getDatabase();

    const existing = await db.getAllAsync<{ CardKey: string }>(
      `SELECT CardKey FROM DashboardCards WHERE ProjectID = ?`,
      [projectId]
    );
    const existingKeys = new Set(existing.map((r) => r.CardKey));

    if (!LEGACY_DEFAULT_KEYS.some((key) => existingKeys.has(key))) return;

    if (existingKeys.has("total_inspections") && existingKeys.has("today_inspections_done")) {
      return;
    }

    const missing = DEFAULT_DASHBOARD_CARDS.filter((c) => !existingKeys.has(c.CardKey));

    await db.withTransactionAsync(async () => {
      for (const card of missing) {
        await db.runAsync(
          `INSERT INTO DashboardCards
           (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, CardMode, SortOrder, Enabled, IsDefault, DeviceType)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
          [
            projectId,
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
            card.SectionLabel ?? null,
            card.AggregateField ?? null,
            card.CardMode,
            card.SortOrder,
            card.DeviceType ?? null,
          ]
        );
      }

      const defaults = await db.getAllAsync<{ CardID: number; CardKey: string }>(
        `SELECT CardID, CardKey FROM DashboardCards WHERE ProjectID = ? AND IsDefault = 1`,
        [projectId]
      );
      const canonical = new Map(DEFAULT_DASHBOARD_CARDS.map((c) => [c.CardKey, c]));
      for (const row of defaults) {
        const config = canonical.get(row.CardKey);
        if (!config) continue;
        await db.runAsync(
          `UPDATE DashboardCards SET SortOrder = ?, DistinctColumn = ? WHERE CardID = ?`,
          [config.SortOrder, config.DistinctColumn ?? null, row.CardID]
        );
      }
    });
  }

  static async normalizeSections(projectId: number): Promise<void> {
    const db = await getDatabase();
    const cards = await this.getAllCards(projectId);

    const rank = (label: string | null): number => {
      if (label === SECTION_LABEL_TOTAL) return 0;
      if (label === SECTION_LABEL_TODAY) return 1;
      if (label) return 2;
      return 3;
    };

    const sorted = cards
      .map((card, index) => ({ card, index }))
      .sort((a, b) => {
        const ra = rank(a.card.SectionLabel ?? null);
        const rb = rank(b.card.SectionLabel ?? null);
        if (ra !== rb) return ra - rb;
        if (ra === 2) {
          const la = a.card.SectionLabel ?? "";
          const lb = b.card.SectionLabel ?? "";
          const cmp = la.localeCompare(lb);
          if (cmp !== 0) return cmp;
        }
        return a.index - b.index;
      });

    await db.withTransactionAsync(async () => {
      for (let i = 0; i < sorted.length; i++) {
        await db.runAsync(
          `UPDATE DashboardCards
           SET SortOrder = ?, UpdatedAt = CURRENT_TIMESTAMP
           WHERE CardID = ? AND ProjectID = ?`,
          [i, sorted[i].card.CardID!, projectId]
        );
      }
    });
  }

  static async resetDefaultCards(projectId: number): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(`DELETE FROM DashboardCards WHERE ProjectID = ?`, [projectId]);
      for (const card of DEFAULT_SECTIONED_CARDS) {
        await db.runAsync(
          `INSERT INTO DashboardCards
           (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, CardMode, SortOrder, Enabled, IsDefault, DeviceType)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
          [
            projectId,
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
            card.SectionLabel ?? null,
            card.AggregateField ?? null,
            card.CardMode,
            card.SortOrder,
            card.DeviceType ?? null,
          ]
        );
      }
    });
    await this.normalizeSections(projectId);
  }

  static async migrateDeviceCards(projectId: number): Promise<void> {
    const db = await getDatabase();

    const existing = await db.getAllAsync<{ CardID: number; CardKey: string }>(
      `SELECT CardID, CardKey FROM DashboardCards WHERE ProjectID = ?`,
      [projectId]
    );

    const smartCards = existing.filter((row) => row.CardKey.startsWith("smart_dev_"));
    const cameraKeys = new Set(["total_cameras", "today_cameras", "total_camera_count", "today_camera_count"]);
    const cameraCards = existing.filter((row) => cameraKeys.has(row.CardKey));

    if (smartCards.length === 0 && cameraCards.length === 0) return;

    await db.withTransactionAsync(async () => {
      for (const row of smartCards) {
        const key = row.CardKey.replace(/_(total|today)$/, "");
        const parts = key.split("_");
        const deviceType = parts[2];
        const fieldName = parts.slice(3).join("_");
        if (!deviceType || !fieldName) continue;
        await db.runAsync(
          `UPDATE DashboardCards
           SET EntityType = 'devices', DeviceType = ?, BreakdownField = ?, UpdatedAt = CURRENT_TIMESTAMP
           WHERE CardID = ? AND ProjectID = ?`,
          [deviceType, fieldName, row.CardID, projectId]
        );
      }

      for (const row of cameraCards) {
        await db.runAsync(
          `UPDATE DashboardCards
           SET EntityType = 'devices', DeviceType = 'Camera', CardMode = 'entitycount',
               FilterJson = ?, AggregateField = NULL, UpdatedAt = CURRENT_TIMESTAMP
           WHERE CardID = ? AND ProjectID = ?`,
          ['{"DeviceType":"Camera"}', row.CardID, projectId]
        );
      }

      await db.runAsync(
        `UPDATE DashboardCards SET SectionLabel = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionLabel = ? AND ProjectID = ?`,
        [SECTION_LABEL_TOTAL, "Total", projectId]
      );
      await db.runAsync(
        `UPDATE DashboardCards SET SectionLabel = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionLabel = ? AND ProjectID = ?`,
        [SECTION_LABEL_TODAY, "Today's", projectId]
      );
    });
  }
}
