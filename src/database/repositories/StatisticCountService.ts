import { getDatabase } from "../db";
import { DashboardCard } from "@/src/models/DashboardCard";
import { getTodayDateString } from "@/src/utils/date";

export interface CountEntityConfig {
  table: string;
  alias: string;
  joins: string;
  projectClause: string;
  filterableColumns: string[];
  distinctableColumns: string[];
}

export const COUNT_ENTITIES: Record<string, CountEntityConfig> = {
  inspections: {
    table: "Inspections",
    alias: "i",
    joins: "",
    projectClause: "i.ProjectID = ?",
    filterableColumns: ["Status"],
    distinctableColumns: ["i.PoleID", "i.InspectionID"],
  },
  cameras: {
    table: "Cameras",
    alias: "c",
    joins: "JOIN Inspections i ON c.InspectionID = i.InspectionID",
    projectClause: "i.ProjectID = ?",
    filterableColumns: ["CameraType", "CameraStatus"],
    distinctableColumns: ["c.CameraID"],
  },
  switches: {
    table: "Switches",
    alias: "s",
    joins: "JOIN Inspections i ON s.InspectionID = i.InspectionID",
    projectClause: "i.ProjectID = ?",
    filterableColumns: ["SwitchType", "SwitchStatus"],
    distinctableColumns: ["s.SwitchID"],
  },
  devices: {
    table: "DeviceRecords",
    alias: "r",
    joins: "JOIN Inspections i ON r.InspectionID = i.InspectionID",
    projectClause: "i.ProjectID = ?",
    filterableColumns: ["DeviceType", "DeviceLabel"],
    distinctableColumns: ["r.RecordID"],
  },
};

export interface CounterTypeConfig {
  key: string;
  label: string;
  buildTimeClause: (alias: string) => { clause: string; params: (string | number)[] };
}

export const COUNTER_TYPES: Record<string, CounterTypeConfig> = {
  total: {
    key: "total",
    label: "Total",
    buildTimeClause: () => ({ clause: "", params: [] }),
  },
  today: {
    key: "today",
    label: "Today's",
    buildTimeClause: () => ({
      clause: "AND i.InspectionDate = ?",
      params: [getTodayDateString()],
    }),
  },
};
function parseFilterJson(filterJson: string | null | undefined): Record<string, unknown> {
  if (!filterJson) return {};
  try {
    const parsed = JSON.parse(filterJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export class StatisticCountService {
  static buildCountSql(
    card: Pick<DashboardCard, "EntityType" | "CounterType" | "FilterJson" | "CountMode" | "DistinctColumn">
  ): { sql: string; params: (string | number)[] } | null {
    const entity = COUNT_ENTITIES[card.EntityType];
    if (!entity) return null;

    const counter = COUNTER_TYPES[card.CounterType];
    if (!counter) return null;

    const countClause =
      card.CountMode === "distinct" &&
      card.DistinctColumn &&
      entity.distinctableColumns.includes(card.DistinctColumn)
        ? `COUNT(DISTINCT ${card.DistinctColumn})`
        : "COUNT(*)";

    const params: (string | number)[] = [];

    const time = counter.buildTimeClause(entity.alias);
    if (time.clause) params.push(...time.params);

    const filters = parseFilterJson(card.FilterJson);
    const filterFragments: string[] = [];
    for (const [field, value] of Object.entries(filters)) {
      if (!entity.filterableColumns.includes(field)) continue;
      filterFragments.push(`AND ${entity.alias}.${field} = ?`);
      params.push(String(value));
    }

    const sql = `SELECT ${countClause} AS count
       FROM ${entity.table} ${entity.alias}
       ${entity.joins}
       WHERE ${entity.projectClause}
       ${time.clause}
       ${filterFragments.join(" ")}`;

    return { sql, params };
  }

  static async countCard(projectId: number, card: DashboardCard): Promise<number> {
    try {
      const built = StatisticCountService.buildCountSql(card);
      if (!built) return 0;
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ count: number }>(built.sql, [projectId, ...built.params]);
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }
}
