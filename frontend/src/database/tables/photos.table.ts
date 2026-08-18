//frontend\src\database\tables\photos.table.ts
export const createPhotosTable = `
CREATE TABLE IF NOT EXISTS Photos (

    PhotoID INTEGER PRIMARY KEY AUTOINCREMENT,

    InspectionID INTEGER NOT NULL,

    PhotoType TEXT,

    FileName TEXT NOT NULL,

    FilePath TEXT NOT NULL,

    Latitude REAL,

    Longitude REAL,

    CapturedAt TEXT,

    Remarks TEXT,

    StoragePath TEXT,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (InspectionID)
        REFERENCES Inspections(InspectionID)
        ON DELETE CASCADE
);
`;