// src/database/tables/repeatable-records.table.ts

export const createRepeatableRecordsTable = `
CREATE TABLE IF NOT EXISTS RepeatableRecords (

    RecordID INTEGER PRIMARY KEY AUTOINCREMENT,

    InspectionID INTEGER NOT NULL,

    GroupID INTEGER NOT NULL,

    RecordIndex INTEGER NOT NULL,

    RecordTitle TEXT,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (InspectionID)
        REFERENCES Inspections(InspectionID)
        ON DELETE CASCADE,

    FOREIGN KEY (GroupID)
        REFERENCES RepeatableGroups(GroupID)
        ON DELETE CASCADE,

    UNIQUE(InspectionID, GroupID, RecordIndex)
);
`;