//frontend\src\database\tables\inspections.table.ts

export const createInspectionsTable = `
CREATE TABLE IF NOT EXISTS Inspections (

    InspectionID INTEGER PRIMARY KEY AUTOINCREMENT,

    ProjectID INTEGER NOT NULL,

    DistrictID INTEGER,

    PoleID TEXT NOT NULL,

    Latitude REAL,

    Longitude REAL,

    InspectionDate TEXT NOT NULL,

    Status TEXT NOT NULL DEFAULT 'Draft',

    InspectorName TEXT,

    Remarks TEXT,

    SyncStatus INTEGER DEFAULT 0,

    SectionsSnapshot TEXT,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
`;