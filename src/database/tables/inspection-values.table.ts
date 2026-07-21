export const createInspectionValuesTable = `
CREATE TABLE IF NOT EXISTS InspectionValues (

    ValueID INTEGER PRIMARY KEY AUTOINCREMENT,

    InspectionID INTEGER NOT NULL,

    FieldKey TEXT NOT NULL,

    Value TEXT,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(InspectionID, FieldKey),

    FOREIGN KEY (InspectionID)
        REFERENCES Inspections(InspectionID)
);
`;