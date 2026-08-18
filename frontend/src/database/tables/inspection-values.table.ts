// src/database/tables/inspection-values.table.ts
export const createInspectionValuesTable = `
CREATE TABLE IF NOT EXISTS InspectionValues (

    ValueID INTEGER PRIMARY KEY AUTOINCREMENT,

    InspectionID INTEGER NOT NULL,

    FieldID INTEGER NOT NULL,

    FieldValue TEXT,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (InspectionID)
        REFERENCES Inspections(InspectionID)
        ON DELETE CASCADE,

    FOREIGN KEY (FieldID)
        REFERENCES InspectionFields(FieldID)
        ON DELETE CASCADE
);
`;