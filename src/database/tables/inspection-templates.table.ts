// src/database/tables/inspection-templates.table.ts

export const createInspectionTemplatesTable = `
CREATE TABLE IF NOT EXISTS InspectionTemplates (

    TemplateID INTEGER PRIMARY KEY AUTOINCREMENT,

    TemplateName TEXT NOT NULL UNIQUE,

    Description TEXT,

    Version INTEGER NOT NULL DEFAULT 1,

    IsDefault INTEGER NOT NULL DEFAULT 0,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
`;