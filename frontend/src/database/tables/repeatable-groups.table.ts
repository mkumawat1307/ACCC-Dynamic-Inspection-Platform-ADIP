// src/database/tables/repeatable-groups.table.ts

export const createRepeatableGroupsTable = `
CREATE TABLE IF NOT EXISTS RepeatableGroups (

    GroupID INTEGER PRIMARY KEY AUTOINCREMENT,

    TemplateID INTEGER NOT NULL,

    SectionID INTEGER NOT NULL,

    GroupName TEXT NOT NULL,

    DisplayName TEXT NOT NULL,

    Description TEXT,

    CountFieldKey TEXT NOT NULL,

    MinCount INTEGER NOT NULL DEFAULT 0,

    MaxCount INTEGER,

    DisplayOrder INTEGER NOT NULL DEFAULT 0,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (TemplateID)
        REFERENCES InspectionTemplates(TemplateID)
        ON DELETE CASCADE,

    FOREIGN KEY (SectionID)
        REFERENCES InspectionSections(SectionID)
        ON DELETE CASCADE
);
`;