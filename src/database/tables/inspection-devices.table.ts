export const createInspectionDevicesTable = `
CREATE TABLE IF NOT EXISTS InspectionDevices (

    DeviceID INTEGER PRIMARY KEY AUTOINCREMENT,

    InspectionID INTEGER NOT NULL,

    DeviceType TEXT NOT NULL,

    DeviceName TEXT,

    SerialNumber TEXT,

    Manufacturer TEXT,

    Model TEXT,

    Status TEXT,

    Remarks TEXT,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (InspectionID)
        REFERENCES Inspections(InspectionID)
);
`;