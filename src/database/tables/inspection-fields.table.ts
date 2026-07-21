// src/database/tables/inspection-fields.table.ts

export const createInspectionFieldsTable = `
CREATE TABLE IF NOT EXISTS InspectionFields (

    FieldID INTEGER PRIMARY KEY AUTOINCREMENT,

    SectionID INTEGER NOT NULL,

    FieldName TEXT NOT NULL,

    FieldKey TEXT NOT NULL UNIQUE,

    FieldType TEXT NOT NULL,

    Placeholder TEXT,

    DefaultValue TEXT,

    HelpText TEXT,

    ValidationRule TEXT,

    DisplayOrder INTEGER NOT NULL,

    IsRequired INTEGER NOT NULL DEFAULT 0,

    IsVisible INTEGER NOT NULL DEFAULT 1,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (SectionID)
        REFERENCES InspectionSections(SectionID)
        ON DELETE CASCADE
);
`;