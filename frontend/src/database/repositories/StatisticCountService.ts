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
  deviceColumns: string[];
}

export const COUNT_ENTITIES: Record<string, CountEntityConfig> = {
  inspections: {
    table: "Inspections",
    alias: "i",
    joins: "",
    projectClause: "i.ProjectID = ?",
    filterableColumns: ["Status"],
    distinctableColumns: ["i.PoleID", "i.InspectionID"],
    deviceColumns: [],
  },
  cameras: {
    table: "Cameras",
    alias: "c",
    joins: "JOIN Inspections i ON c.InspectionID = i.InspectionID",
    projectClause: "i.ProjectID = ?",
    filterableColumns: ["CameraType", "CameraStatus"],
    distinctableColumns: ["c.CameraID"],
    deviceColumns: [
      "CameraType",
      "CameraStatus",
      "CameraMake",
      "CameraModel",
      "CameraIP",
      "CameraSerialNumber",
      "CameraSI",
      "SDCardCapacity",
      "SDCardStatus",
    ],
  },
  switches: {
    table: "Switches",
    alias: "s",
    joins: "JOIN Inspections i ON s.InspectionID = i.InspectionID",
    projectClause: "i.ProjectID = ?",
    filterableColumns: ["SwitchType", "SwitchStatus"],
    distinctableColumns: ["s.SwitchID"],
    deviceColumns: [
      "SwitchType",
      "SwitchStatus",
      "SwitchMake",
      "SwitchModel",
      "SwitchIP",
      "SwitchSerialNumber",
      "SwitchSI",
    ],
  },
  devices: {
    table: "DeviceRecords",
    alias: "r",
    joins: "JOIN Inspections i ON r.InspectionID = i.InspectionID",
    projectClause: "i.ProjectID = ? AND r.IsActive = 1",
    filterableColumns: ["DeviceType", "DeviceLabel"],
    distinctableColumns: ["r.RecordID"],
    deviceColumns: [],
  },
};

export interface CounterTypeConfig {
  key: string;
  label: string;
  buildTimeClause: (alias: string) => { clause: string; params: (string | number)[] };
}

export const DRAFT_EXCLUDED_STATUS_SQL = "i.Status != 'Draft'";

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
       AND ${DRAFT_EXCLUDED_STATUS_SQL}
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

  static async breakdownCard(
    projectId: number,
    card: DashboardCard
  ): Promise<{ label: string; count: number }[]> {
    try {
      if (card.EntityType !== "inspections" || !card.BreakdownField) return [];

      const entity = COUNT_ENTITIES.inspections;
      const counter = COUNTER_TYPES[card.CounterType];
      if (!counter) return [];

      const params: (string | number)[] = [projectId];

      const time = counter.buildTimeClause(entity.alias);
      if (time.clause) params.push(...time.params);

      const filters = parseFilterJson(card.FilterJson);
      const filterFragments: string[] = [];
      for (const [field, value] of Object.entries(filters)) {
        if (!entity.filterableColumns.includes(field)) continue;
        filterFragments.push(`AND ${entity.alias}.${field} = ?`);
        params.push(String(value));
      }

      params.push(card.BreakdownField);

      const sql = `SELECT iv.FieldValue AS label, COUNT(DISTINCT iv.InspectionID) AS count
         FROM Inspections i
         JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID
         JOIN InspectionFields f ON f.FieldID = iv.FieldID
         WHERE i.ProjectID = ?
         AND ${DRAFT_EXCLUDED_STATUS_SQL}
         ${time.clause}
         ${filterFragments.join(" ")}
         AND f.FieldKey = ?
         AND f.IsActive = 1
         GROUP BY iv.FieldValue
         ORDER BY count DESC, label ASC`;

      const db = await getDatabase();
      const rows = await db.getAllAsync<{ label: string | null; count: number }>(sql, params);
      return rows.map((row) => ({ label: row.label ?? "(Not set)", count: row.count }));
    } catch {
      return [];
    }
  }

  static async fieldCard(projectId: number, card: DashboardCard): Promise<number> {
    try {
      if (card.EntityType !== "inspections" || !card.AggregateField) return 0;

      const counter = COUNTER_TYPES[card.CounterType];
      if (!counter) return 0;

      const params: (string | number)[] = [projectId];

      const time = counter.buildTimeClause("i");
      if (time.clause) params.push(...time.params);

      params.push(card.AggregateField);

      const sql = `SELECT SUM(CAST(iv.FieldValue AS REAL)) AS total
         FROM Inspections i
         JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID
         JOIN InspectionFields f ON f.FieldID = iv.FieldID
         WHERE i.ProjectID = ?
         AND ${DRAFT_EXCLUDED_STATUS_SQL}
         ${time.clause}
         AND f.FieldKey = ?
         AND f.IsActive = 1`;

      const db = await getDatabase();
      const row = await db.getFirstAsync<{ total: number | null }>(sql, params);
      return row?.total ?? 0;
    } catch {
      return 0;
    }
  }

  static async fieldCountCard(projectId: number, card: DashboardCard): Promise<number> {
    try {
      if (card.EntityType !== "inspections" || !card.BreakdownField) return 0;

      const counter = COUNTER_TYPES[card.CounterType];
      if (!counter) return 0;

      const params: (string | number)[] = [projectId];

      const time = counter.buildTimeClause("i");
      if (time.clause) params.push(...time.params);

      params.push(card.BreakdownField);

      const sql = `SELECT COUNT(DISTINCT iv.InspectionID) AS count
         FROM Inspections i
         JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID
         JOIN InspectionFields f ON f.FieldID = iv.FieldID
         WHERE i.ProjectID = ?
         AND ${DRAFT_EXCLUDED_STATUS_SQL}
         ${time.clause}
         AND f.FieldKey = ?
         AND f.IsActive = 1
         AND iv.FieldValue IS NOT NULL AND iv.FieldValue != ''`;

      const db = await getDatabase();
      const row = await db.getFirstAsync<{ count: number }>(sql, params);
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }

  static async dateBreakdownCard(
    projectId: number,
    card: DashboardCard
  ): Promise<{ label: string; count: number }[]> {
    try {
      if (card.EntityType !== "inspections" || !card.BreakdownField) return [];

      const entity = COUNT_ENTITIES.inspections;
      const counter = COUNTER_TYPES[card.CounterType];
      if (!counter) return [];

      const params: (string | number)[] = [projectId];

      const time = counter.buildTimeClause(entity.alias);
      if (time.clause) params.push(...time.params);

      const filters = parseFilterJson(card.FilterJson);
      const filterFragments: string[] = [];
      for (const [field, value] of Object.entries(filters)) {
        if (!entity.filterableColumns.includes(field)) continue;
        filterFragments.push(`AND ${entity.alias}.${field} = ?`);
        params.push(String(value));
      }

      params.push(card.BreakdownField);

      const sql = `SELECT iv.FieldValue AS label, COUNT(DISTINCT iv.InspectionID) AS count
         FROM Inspections i
         JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID
         JOIN InspectionFields f ON f.FieldID = iv.FieldID
         WHERE i.ProjectID = ?
         AND ${DRAFT_EXCLUDED_STATUS_SQL}
         ${time.clause}
         ${filterFragments.join(" ")}
         AND f.FieldKey = ?
         AND f.IsActive = 1
         GROUP BY iv.FieldValue
         ORDER BY count DESC, label ASC`;

      const db = await getDatabase();
      const rows = await db.getAllAsync<{ label: string | null; count: number }>(sql, params);
      return rows.map((row) => ({ label: row.label ?? "(Not set)", count: row.count }));
    } catch {
      return [];
    }
  }

  static async deviceBreakdownCard(
    projectId: number,
    card: DashboardCard
  ): Promise<{ label: string; count: number }[]> {
    try {
      if (!card.BreakdownField) return [];

      const counter = COUNTER_TYPES[card.CounterType];
      if (!counter) return [];

      if (card.EntityType === "devices") {
        const fieldName = card.BreakdownField;
        if (!card.DeviceType || !/^[A-Za-z0-9_]+$/.test(fieldName)) return [];

        const params: (string | number)[] = [projectId];
        const time = counter.buildTimeClause("r");
        if (time.clause) params.push(...time.params);

        const jsonExpr = `json_extract(r.DeviceData, '$.${fieldName}')`;
        const sql = `SELECT ${jsonExpr} AS label, COUNT(*) AS count
           FROM DeviceRecords r
           JOIN Inspections i ON r.InspectionID = i.InspectionID
           WHERE i.ProjectID = ? AND r.IsActive = 1
           AND ${DRAFT_EXCLUDED_STATUS_SQL}
           ${time.clause}
           AND r.DeviceType = ?
           AND ${jsonExpr} IS NOT NULL AND ${jsonExpr} != ''
           GROUP BY ${jsonExpr}
           ORDER BY count DESC, label ASC`;

        params.push(card.DeviceType);

        const db = await getDatabase();
        const rows = await db.getAllAsync<{ label: string | null; count: number }>(sql, params);
        return rows.map((row) => ({ label: row.label ?? "(Not set)", count: row.count }));
      }

      const entity = COUNT_ENTITIES[card.EntityType];
      if (!entity || !entity.deviceColumns.includes(card.BreakdownField)) return [];

      const params: (string | number)[] = [projectId];

      const time = counter.buildTimeClause(entity.alias);
      if (time.clause) params.push(...time.params);

      const column = card.BreakdownField;

      const sql = `SELECT ${entity.alias}.${column} AS label, COUNT(*) AS count
         FROM ${entity.table} ${entity.alias}
         ${entity.joins}
         WHERE ${entity.projectClause}
         AND ${DRAFT_EXCLUDED_STATUS_SQL}
         ${time.clause}
         AND ${entity.alias}.${column} IS NOT NULL AND ${entity.alias}.${column} != ''
         GROUP BY ${entity.alias}.${column}
         ORDER BY count DESC, label ASC`;

      const db = await getDatabase();
      const rows = await db.getAllAsync<{ label: string | null; count: number }>(sql, params);
      return rows.map((row) => ({ label: row.label ?? "(Not set)", count: row.count }));
    } catch {
      return [];
    }
  }
}
