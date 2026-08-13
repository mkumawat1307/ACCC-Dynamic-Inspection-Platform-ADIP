// src/database/tables/blocks.table.ts

export const createBlocksTable = `
CREATE TABLE IF NOT EXISTS Blocks (
    BlockID INTEGER PRIMARY KEY AUTOINCREMENT,

    DistrictID INTEGER NULL,

    BlockName TEXT NOT NULL,
    BlockCode TEXT,

    IsActive INTEGER NOT NULL DEFAULT 1,

    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(DistrictID)
        REFERENCES Districts(DistrictID)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);
`;