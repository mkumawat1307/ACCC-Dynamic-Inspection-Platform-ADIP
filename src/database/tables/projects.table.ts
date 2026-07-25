//frontend\src\database\tables\projects.table.ts
export const createProjectsTable = `
CREATE TABLE IF NOT EXISTS Projects (

    ProjectID INTEGER PRIMARY KEY AUTOINCREMENT,

    ProjectName TEXT NOT NULL,

    DistrictID INTEGER NOT NULL,

    Block TEXT,

    Client TEXT,

    Description TEXT,

    InspectorName TEXT,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (DistrictID)
        REFERENCES Districts(DistrictID)
);
`;