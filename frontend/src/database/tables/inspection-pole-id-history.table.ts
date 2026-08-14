//frontend\src\database\tables\inspection-pole-id-history.table.ts
export const createInspectionPoleIdHistoryTable = `
CREATE TABLE IF NOT EXISTS InspectionPoleIdHistory (

    HistoryID INTEGER PRIMARY KEY AUTOINCREMENT,

    InspectionID INTEGER NOT NULL,

    OldPoleId TEXT NOT NULL,

    NewPoleId TEXT NOT NULL,

    ChangedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (InspectionID)
        REFERENCES Inspections(InspectionID)
        ON DELETE CASCADE
);
`;
