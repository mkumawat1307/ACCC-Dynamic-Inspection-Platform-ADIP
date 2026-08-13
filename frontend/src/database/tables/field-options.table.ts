// src/database/tables/field-options.table.ts

export const createFieldOptionsTable = `
CREATE TABLE IF NOT EXISTS FieldOptions (

    OptionID INTEGER PRIMARY KEY AUTOINCREMENT,

    FieldID INTEGER NOT NULL,

    OptionLabel TEXT NOT NULL,

    OptionValue TEXT NOT NULL,

    DisplayOrder INTEGER NOT NULL DEFAULT 1,

    IsDefault INTEGER NOT NULL DEFAULT 0,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(FieldID)
        REFERENCES InspectionFields(FieldID)
        ON DELETE CASCADE
);
`;