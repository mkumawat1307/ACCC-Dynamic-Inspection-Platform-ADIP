export const createInspectionPhotosTable = `
CREATE TABLE IF NOT EXISTS InspectionPhotos (

    PhotoID INTEGER PRIMARY KEY AUTOINCREMENT,

    InspectionID INTEGER NOT NULL,

    DeviceID INTEGER,

    PhotoType TEXT,

    FilePath TEXT NOT NULL,

    Latitude REAL,

    Longitude REAL,

    CapturedAt TEXT,

    OCRText TEXT,

    IsUploaded INTEGER DEFAULT 0,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (InspectionID)
        REFERENCES Inspections(InspectionID),

    FOREIGN KEY (DeviceID)
        REFERENCES InspectionDevices(DeviceID)
);
`;