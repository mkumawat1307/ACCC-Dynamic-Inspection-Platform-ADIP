export const createDeviceRecordsTable = `
CREATE TABLE IF NOT EXISTS DeviceRecords (
    RecordID INTEGER PRIMARY KEY AUTOINCREMENT,
    InspectionID INTEGER NOT NULL,
    DeviceType TEXT NOT NULL,
    DeviceLabel TEXT,
    DeviceNo INTEGER NOT NULL DEFAULT 1,
    DeviceData TEXT,
    DisplayOrder INTEGER DEFAULT 0,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(InspectionID) REFERENCES Inspections(InspectionID) ON DELETE CASCADE
);
`;
