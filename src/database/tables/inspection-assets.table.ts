// src/database/tables/inspection-assets.table.ts

export const createInspectionAssetsTable = `
CREATE TABLE IF NOT EXISTS InspectionAssets (

    AssetID INTEGER PRIMARY KEY AUTOINCREMENT,

    TemplateID INTEGER NOT NULL,

    SectionID INTEGER NOT NULL,

    AssetName TEXT NOT NULL,

    AssetKey TEXT NOT NULL,

    DisplayOrder INTEGER NOT NULL,

    IsRepeatable INTEGER NOT NULL DEFAULT 0,

    IsRequired INTEGER NOT NULL DEFAULT 0,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (TemplateID)
        REFERENCES InspectionTemplates(TemplateID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    FOREIGN KEY (SectionID)
        REFERENCES InspectionSections(SectionID)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);
`;