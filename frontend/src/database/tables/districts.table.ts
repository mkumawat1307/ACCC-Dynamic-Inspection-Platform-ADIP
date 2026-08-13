//frontend\src\database\tables\districts.table.ts
export const createDistrictsTable = `
CREATE TABLE IF NOT EXISTS Districts (

    DistrictID INTEGER PRIMARY KEY AUTOINCREMENT,

    DivisionID INTEGER NOT NULL,

    DistrictName TEXT NOT NULL,

    DistrictCode TEXT,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (DivisionID)
        REFERENCES Divisions(DivisionID)
);
`;