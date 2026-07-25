export const createProjectDeviceTypesTable = `
CREATE TABLE IF NOT EXISTS ProjectDeviceTypes (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProjectID INTEGER NOT NULL,
    DeviceType TEXT NOT NULL,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ProjectID, DeviceType)
);
`;
