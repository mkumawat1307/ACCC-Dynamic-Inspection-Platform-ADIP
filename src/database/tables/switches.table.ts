// frontend/src/database/tables/switches.table.ts

export const createSwitchesTable = `
CREATE TABLE IF NOT EXISTS Switches (

    SwitchID INTEGER PRIMARY KEY AUTOINCREMENT,

    InspectionID INTEGER NOT NULL,

    SwitchNo INTEGER NOT NULL,

    SwitchType TEXT,

    SwitchStatus TEXT,

    SwitchMake TEXT,

    SwitchModel TEXT,

    SwitchIP TEXT,

    SwitchSerialNumber TEXT,

    SwitchSI TEXT,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (InspectionID)
        REFERENCES Inspections(InspectionID)
        ON DELETE CASCADE
);
`;