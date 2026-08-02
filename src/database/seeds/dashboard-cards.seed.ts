import { getDatabase } from "../db";
import { logger } from "@/src/utils/logger";

export interface DashboardCardSeed {
  CardKey: string;
  Title: string;
  Icon: string;
  Color: string;
  EntityType: string;
  CounterType: string;
  CountMode: "count" | "distinct";
  DistinctColumn?: string;
  SortOrder: number;
}

export const DEFAULT_DASHBOARD_CARDS: DashboardCardSeed[] = [
  { CardKey: "total_poles",    Title: "Total Poles",     Icon: "transmission-tower", Color: "#0B5ED7", EntityType: "inspections", CounterType: "total", CountMode: "distinct", DistinctColumn: "PoleID", SortOrder: 0 },
  { CardKey: "total_cameras",  Title: "Total Cameras",   Icon: "cctv",               Color: "#198754", EntityType: "cameras",     CounterType: "total", CountMode: "count",   SortOrder: 1 },
  { CardKey: "today_poles",    Title: "Today's Poles",   Icon: "transmission-tower", Color: "#DC3545", EntityType: "inspections", CounterType: "today", CountMode: "distinct", DistinctColumn: "PoleID", SortOrder: 2 },
  { CardKey: "today_cameras",  Title: "Today's Cameras", Icon: "cctv",               Color: "#6F42C1", EntityType: "cameras",     CounterType: "today", CountMode: "count",   SortOrder: 3 },
];

export async function seedDashboardCards(): Promise<void> {
  const db = await getDatabase();

  const existing = await db.getAllAsync<{ CardKey: string }>(
    `SELECT CardKey FROM DashboardCards`
  );
  const existingKeys = new Set(existing.map((r) => r.CardKey));

  const missing = DEFAULT_DASHBOARD_CARDS.filter((c) => !existingKeys.has(c.CardKey));
  if (missing.length === 0) {
    logger.info("✅ Dashboard cards already seeded.");
    return;
  }

  logger.info(`🌱 Seeding ${missing.length} default dashboard cards...`);

  await db.withTransactionAsync(async () => {
    for (const card of missing) {
      await db.runAsync(
        `INSERT INTO DashboardCards
         (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, SortOrder, Enabled, IsDefault)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, 1)`,
        [
          1,
          card.CardKey,
          card.Title,
          card.Icon,
          card.Color,
          card.EntityType,
          card.CounterType,
          card.CountMode,
          card.DistinctColumn ?? null,
          card.SortOrder,
        ]
      );
    }
  });

  logger.info("✅ Default dashboard cards seeded.");
}
