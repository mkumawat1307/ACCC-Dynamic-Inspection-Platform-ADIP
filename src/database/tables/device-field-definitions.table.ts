export const createDeviceFieldDefinitionsTable = `
CREATE TABLE IF NOT EXISTS DeviceFieldDefinitions (
    FieldDefID INTEGER PRIMARY KEY AUTOINCREMENT,
    TemplateID INTEGER NOT NULL DEFAULT 1,
    DeviceType TEXT NOT NULL,
    FieldName TEXT NOT NULL,
    Label TEXT NOT NULL,
    FieldType TEXT NOT NULL DEFAULT 'text',
    IsRequired INTEGER DEFAULT 0,
    DisplayOrder INTEGER NOT NULL DEFAULT 0,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(TemplateID, DeviceType, FieldName),
    FOREIGN KEY (TemplateID) REFERENCES InspectionTemplates(TemplateID) ON DELETE CASCADE
);
`;
