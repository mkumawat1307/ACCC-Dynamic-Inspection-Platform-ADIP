// src/database/tables/inspection-sections.table.ts

export const createInspectionSectionsTable = `
CREATE TABLE IF NOT EXISTS InspectionSections (

    SectionID INTEGER PRIMARY KEY AUTOINCREMENT,

    SectionName TEXT NOT NULL,

    DisplayOrder INTEGER NOT NULL,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP

);
`;