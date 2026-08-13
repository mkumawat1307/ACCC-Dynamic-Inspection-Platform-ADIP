// src/database/tables/repeatable-values.table.ts

export const createRepeatableValuesTable = `
CREATE TABLE IF NOT EXISTS RepeatableValues (

    ValueID INTEGER PRIMARY KEY AUTOINCREMENT,

    RecordID INTEGER NOT NULL,

    GroupFieldID INTEGER NOT NULL,

    FieldValue TEXT,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (RecordID)
        REFERENCES RepeatableRecords(RecordID)
        ON DELETE CASCADE,

    FOREIGN KEY (GroupFieldID)
        REFERENCES RepeatableGroupFields(GroupFieldID)
        ON DELETE CASCADE,

    UNIQUE(RecordID, GroupFieldID)
);
`;