type Row = Record<string, unknown>;
type TableData = Row[];

const databases = new Map<string, MockDatabase>();

const PRIMARY_KEYS: Record<string, string> = {
  Inspections: "InspectionID",
  InspectionValues: "ValueID",
  RepeatableRecords: "RecordID",
  RepeatableValues: "ValueID",
  Cameras: "CameraID",
  Switches: "SwitchID",
  Photos: "PhotoID",
  DeviceRecords: "RecordID",
  DeviceOptions: "OptionID",
  DeviceFieldDefinitions: "FieldDefID",
  ProjectDeviceTypes: "ID",
  InspectionTemplates: "TemplateID",
  InspectionSections: "SectionID",
  InspectionFields: "FieldID",
  FieldOptions: "OptionID",
  RepeatableGroups: "GroupID",
  RepeatableGroupFields: "GroupFieldID",
  DashboardCards: "CardID",
  Projects: "ProjectID",
  Divisions: "DivisionID",
  Districts: "DistrictID",
  Blocks: "BlockID",
};

function resetState() {
  databases.clear();
}

const SQL_COMMANDS = {
  INSERT: /^\s*INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*;?\s*$/i,
  SELECT: /^\s*SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?;?\s*$/i,
  UPDATE: /^\s*UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+?))?;?\s*$/i,
  DELETE: /^\s*DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?;?\s*$/i,
  PRAGMA: /^\s*PRAGMA\s/i,
  CREATE_TABLE: /^\s*CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)/i,
  ALTER_TABLE: /^\s*ALTER\s+TABLE/i,
  SELECT_SQLITE_MASTER: /^\s*SELECT\s+name\s+FROM\s+sqlite_master/i,
};

function parseWhere(whereClause: string, params: unknown[]): (row: Row) => boolean {
  const conditions = whereClause.split(/\s+AND\s+/i);
  let paramIdx = 0;
  return (row: Row) => {
    return conditions.every((cond) => {
      const match = cond.match(/(\w+)\s*=\s*(?:\?|'([^']*)'|(\d+))/);
      if (!match) return true;
      const col = match[1];
      let value: unknown;
      if (match[2] !== undefined) {
        value = match[2];
      } else if (match[3] !== undefined) {
        value = parseInt(match[3], 10);
      } else {
        value = params[paramIdx++];
      }
      return row[col] === value;
    });
  };
}

function parseColumnList(cols: string): string[] {
  return cols
    .split(",")
    .map((c) => c.trim())
    .map((c) => {
      const asMatch = c.match(/(\w+)\s+AS\s+(\w+)/i);
      if (asMatch) return asMatch[1];
      const dotMatch = c.match(/^\w+\.(\w+)$/);
      if (dotMatch) return dotMatch[1];
      return c;
    });
}

function parseInsertValues(valuesClause: string, params: unknown[]): unknown[] {
  const tokens = valuesClause.split(",").map((t) => t.trim());
  let paramIdx = 0;
  return tokens.map((token) => {
    if (token === "?") return params[paramIdx++];
    if (/^'.*'$/.test(token)) return token.slice(1, -1);
    if (/^-?\d+$/.test(token)) return parseInt(token, 10);
    if (/^NULL$/i.test(token)) return null;
    return token;
  });
}

class MockDatabase {
  private tables = new Map<string, TableData>();
  private rowIdCounter = 1;

  constructor(readonly name: string) {
  }

  async execAsync(_sql: string): Promise<void> {
  }

  async runAsync(sql: string, params: unknown[] = []): Promise<{ lastInsertRowId: number; changes: number }> {
    const insertMatch = sql.match(SQL_COMMANDS.INSERT);
    if (insertMatch) {
      const tableName = insertMatch[1];
      const cols = insertMatch[2].split(",").map((c) => c.trim());
      const values = parseInsertValues(insertMatch[3], params);
      const row: Row = {};
      cols.forEach((col, i) => {
        row[col] = values[i] ?? null;
      });
      const id = this.rowIdCounter++;
      if (cols.includes("ID") || cols.includes("id")) {
        row.ID = id;
      }
      const pk = PRIMARY_KEYS[tableName];
      if (pk && !cols.includes(pk)) {
        row[pk] = id;
      }
      const table = this.tables.get(tableName) ?? [];
      table.push(row);
      this.tables.set(tableName, table);
      return { lastInsertRowId: id, changes: 1 };
    }

    const updateMatch = sql.match(SQL_COMMANDS.UPDATE);
    if (updateMatch) {
      const tableName = updateMatch[1];
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const table = this.tables.get(tableName) ?? [];
      const setParts = setClause.split(",").map((s) => s.trim());
      let paramIdx = 0;
      const filter = whereClause ? parseWhere(whereClause, params) : () => true;
      let changes = 0;
      for (const row of table) {
        if (filter(row)) {
          for (const part of setParts) {
            const setMatch = part.match(/(\w+)\s*=\s*(?:\?|CURRENT_TIMESTAMP)/);
            if (setMatch) {
              const col = setMatch[1];
              if (part.includes("CURRENT_TIMESTAMP")) {
                row[col] = new Date().toISOString();
              } else {
                row[col] = params[paramIdx++];
              }
            }
          }
          changes++;
        }
      }
      return { lastInsertRowId: 0, changes };
    }

    const deleteMatch = sql.match(SQL_COMMANDS.DELETE);
    if (deleteMatch) {
      const tableName = deleteMatch[1];
      const whereClause = deleteMatch[2];
      const table = this.tables.get(tableName) ?? [];
      if (!whereClause) {
        this.tables.set(tableName, []);
        return { lastInsertRowId: 0, changes: table.length };
      }
      const filter = parseWhere(whereClause, params);
      const remaining = table.filter((r) => !filter(r));
      const changes = table.length - remaining.length;
      this.tables.set(tableName, remaining);
      return { lastInsertRowId: 0, changes };
    }

    return { lastInsertRowId: 0, changes: 0 };
  }

  async getAllAsync<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const sqliteMasterMatch = sql.match(SQL_COMMANDS.SELECT_SQLITE_MASTER);
    if (sqliteMasterMatch) {
      return Array.from(this.tables.keys()).map((name) => ({ name })) as T[];
    }

    const selectMatch = sql.match(SQL_COMMANDS.SELECT);
    if (selectMatch) {
      const cols = parseColumnList(selectMatch[1]);
      const tableName = selectMatch[2];
      const whereClause = selectMatch[3];
      const orderByClause = selectMatch[4];
      const limitClause = selectMatch[5] ? parseInt(selectMatch[5], 10) : null;

      const table = this.tables.get(tableName) ?? [];
      const filter = whereClause ? parseWhere(whereClause, params) : () => true;
      let results = table.filter(filter);

      if (orderByClause) {
        const orderMatch = orderByClause.match(/(\w+)\s+(ASC|DESC)/i);
        if (orderMatch) {
          const [_, col, dir] = orderMatch;
          results = [...results].sort((a, b) => {
            const va = a[col] ?? "";
            const vb = b[col] ?? "";
            if (typeof va === "number" && typeof vb === "number") {
              return dir.toUpperCase() === "DESC" ? vb - va : va - vb;
            }
            return dir.toUpperCase() === "DESC"
              ? String(vb).localeCompare(String(va))
              : String(va).localeCompare(String(vb));
          });
        }
      }

      if (limitClause) {
        results = results.slice(0, limitClause);
      }

      return results.map((row) => {
        if (cols[0] === "*" || cols[0] === "") return row as T;
        const projected: Row = {};
        for (const col of cols) {
          const trimCol = col.trim();
          if (row[trimCol] !== undefined) {
            projected[trimCol] = row[trimCol];
          }
        }
        return projected as T;
      });
    }

    return [];
  }

  async getFirstAsync<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
    const results = await this.getAllAsync<T>(sql, params);
    return results[0] ?? null;
  }

  async closeAsync(): Promise<void> {
  }

  async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export const defaultDatabaseDirectory = "/mock/sqlite";

export function openDatabaseAsync(dbName: string): Promise<MockDatabase> {
  let handle = databases.get(dbName);
  if (!handle) {
    handle = new MockDatabase(dbName);
    databases.set(dbName, handle);
  }
  return Promise.resolve(handle);
}

export type { MockDatabase as SQLiteDatabase };

export function __resetDbState() {
  resetState();
}
