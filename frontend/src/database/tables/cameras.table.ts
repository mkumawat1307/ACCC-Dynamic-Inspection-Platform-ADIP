// frontend/src/database/tables/cameras.table.ts

export const createCamerasTable = `
CREATE TABLE IF NOT EXISTS Cameras (

    CameraID INTEGER PRIMARY KEY AUTOINCREMENT,

    InspectionID INTEGER NOT NULL,

    CameraNo INTEGER NOT NULL,

    CameraType TEXT,

    CameraStatus TEXT,

    CameraMake TEXT,

    CameraModel TEXT,

    CameraIP TEXT,

    CameraSerialNumber TEXT,

    CameraSI TEXT,

    SDCardCapacity TEXT,

    SDCardStatus TEXT,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (InspectionID)
        REFERENCES Inspections(InspectionID)
        ON DELETE CASCADE
);
`;