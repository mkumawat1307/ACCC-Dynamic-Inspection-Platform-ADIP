// src/database/tables/repeatable-group-fields.table.ts

export const createRepeatableGroupFieldsTable = `
CREATE TABLE IF NOT EXISTS RepeatableGroupFields (

    GroupFieldID INTEGER PRIMARY KEY AUTOINCREMENT,

    GroupID INTEGER NOT NULL,

    FieldName TEXT NOT NULL,

    FieldKey TEXT NOT NULL,

    FieldType TEXT NOT NULL,

    Placeholder TEXT,

    DefaultValue TEXT,

    HelpText TEXT,

    ValidationRule TEXT,

    DisplayOrder INTEGER NOT NULL,

    IsRequired INTEGER NOT NULL DEFAULT 0,

    IsVisible INTEGER NOT NULL DEFAULT 1,

    IsReadOnly INTEGER NOT NULL DEFAULT 0,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (GroupID)
        REFERENCES RepeatableGroups(GroupID)
        ON DELETE CASCADE
);
`;