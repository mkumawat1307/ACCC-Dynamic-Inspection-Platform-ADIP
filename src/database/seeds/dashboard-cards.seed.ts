import { getDatabase } from "../db";
import { CardModeValue } from "@/src/models/DashboardCard";
import { logger } from "@/src/utils/logger";

export interface DashboardCardSeed {
  CardKey: string;
  Title: string;
  Icon: string;
  Color: string;
  EntityType: string;
  CounterType: string;
  CountMode: "count" | "distinct";
  CardMode: CardModeValue;
  DistinctColumn?: string;
  FilterJson?: string;
  BreakdownField?: string;
  SectionLabel?: string;
  AggregateField?: string;
  DeviceType?: string;
  SortOrder: number;
}

export const DEFAULT_DASHBOARD_CARDS: DashboardCardSeed[] = [
  { CardKey: "total_inspections",      Title: "Total Inspections",        Icon: "clipboard-text",     Color: "#0B5ED7", EntityType: "inspections", CounterType: "total", CountMode: "count",   CardMode: "entitycount", SortOrder: 0 },
  { CardKey: "total_poles",            Title: "Total Poles",              Icon: "transmission-tower", Color: "#0B5ED7", EntityType: "inspections", CounterType: "total", CountMode: "distinct", DistinctColumn: "i.PoleID", CardMode: "entitycount", SortOrder: 1 },
  { CardKey: "total_cameras",          Title: "Total Cameras",            Icon: "cctv",               Color: "#198754", EntityType: "cameras",     CounterType: "total", CountMode: "count",   CardMode: "entitycount", SortOrder: 2 },
  { CardKey: "today_inspections_done", Title: "Today's Inspections Done", Icon: "check-circle",       Color: "#198754", EntityType: "inspections", CounterType: "today", CountMode: "count",   FilterJson: JSON.stringify({ Status: "Completed" }), CardMode: "entitycount", SortOrder: 3 },
  { CardKey: "today_poles",            Title: "Today's Poles",            Icon: "transmission-tower", Color: "#DC3545", EntityType: "inspections", CounterType: "today", CountMode: "distinct", DistinctColumn: "i.PoleID", CardMode: "entitycount", SortOrder: 4 },
  { CardKey: "today_cameras",          Title: "Today's Cameras",          Icon: "cctv",               Color: "#6F42C1", EntityType: "cameras",     CounterType: "today", CountMode: "count",   CardMode: "entitycount", SortOrder: 5 },
];

export const DEFAULT_SECTIONED_CARDS: DashboardCardSeed[] = [
  { CardKey: "total_inspection_done", Title: "Inspection Done", Icon: "clipboard-text",     Color: "#0B5ED7", EntityType: "inspections", CounterType: "total", CountMode: "count",   CardMode: "entitycount", FilterJson: JSON.stringify({ Status: "Completed" }), SectionLabel: "Total",   SortOrder: 0 },
  { CardKey: "total_pole_status",     Title: "Pole Status",     Icon: "transmission-tower", Color: "#198754", EntityType: "inspections", CounterType: "total", CountMode: "count",   CardMode: "dropdown",  BreakdownField: "pole_avail", SectionLabel: "Total",   SortOrder: 1 },
  { CardKey: "total_camera_count",    Title: "Camera Count",     Icon: "cctv",               Color: "#6F42C1", EntityType: "inspections", CounterType: "total", CountMode: "count",   CardMode: "sum",  AggregateField: "camera_count", SectionLabel: "Total",   SortOrder: 2 },
  { CardKey: "today_inspection_done", Title: "Inspection Done",  Icon: "clipboard-text",     Color: "#0B5ED7", EntityType: "inspections", CounterType: "today", CountMode: "count",   CardMode: "entitycount", FilterJson: JSON.stringify({ Status: "Completed" }), SectionLabel: "Today's", SortOrder: 3 },
  { CardKey: "today_pole_status",     Title: "Pole Status",      Icon: "transmission-tower", Color: "#DC3545", EntityType: "inspections", CounterType: "today", CountMode: "count",   CardMode: "dropdown",  BreakdownField: "pole_avail", SectionLabel: "Today's", SortOrder: 4 },
  { CardKey: "today_camera_count",    Title: "Camera Count",      Icon: "cctv",               Color: "#6F42C1", EntityType: "inspections", CounterType: "today", CountMode: "count",   CardMode: "sum",  AggregateField: "camera_count", SectionLabel: "Today's", SortOrder: 5 },
];

export async function seedDashboardCards(): Promise<void> {
  const db = await getDatabase();

  const existing = await db.getAllAsync<{ CardKey: string }>(
    `SELECT CardKey FROM DashboardCards`
  );
  const existingKeys = new Set(existing.map((r) => r.CardKey));

  const missing = DEFAULT_SECTIONED_CARDS.filter((c) => !existingKeys.has(c.CardKey));
  if (missing.length === 0) {
    logger.info("✅ Dashboard cards already seeded.");
    return;
  }

  logger.info(`🌱 Seeding ${missing.length} default dashboard cards...`);

  await db.withTransactionAsync(async () => {
    for (const card of missing) {
      await db.runAsync(
        `INSERT INTO DashboardCards
         (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, CardMode, SortOrder, Enabled, IsDefault, DeviceType)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
        [
          1,
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

  logger.info("✅ Default dashboard cards seeded.");
}
