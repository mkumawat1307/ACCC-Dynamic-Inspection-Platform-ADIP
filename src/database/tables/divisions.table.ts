//frontend\src\database\tables\divisions.table.ts
export const createDivisionsTable = `
CREATE TABLE IF NOT EXISTS Divisions (

    DivisionID INTEGER PRIMARY KEY AUTOINCREMENT,

    DivisionName TEXT NOT NULL UNIQUE,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
`;