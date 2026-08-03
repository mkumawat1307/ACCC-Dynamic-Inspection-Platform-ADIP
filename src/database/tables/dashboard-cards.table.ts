export const createDashboardCardsTable = `
CREATE TABLE IF NOT EXISTS DashboardCards (
    CardID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProjectID INTEGER NOT NULL,
    CardKey TEXT NOT NULL,
    Title TEXT NOT NULL,
    Icon TEXT NOT NULL DEFAULT 'chart-box-outline',
    Color TEXT NOT NULL DEFAULT '#0B5ED7',
    EntityType TEXT NOT NULL,
    CounterType TEXT NOT NULL DEFAULT 'total',
    FilterJson TEXT,
    CountMode TEXT NOT NULL DEFAULT 'count',
    DistinctColumn TEXT,
    BreakdownField TEXT,
    SectionLabel TEXT,
    AggregateField TEXT,
    DeviceType TEXT,
    CardMode TEXT NOT NULL DEFAULT 'entitycount',
    SortOrder INTEGER NOT NULL DEFAULT 0,
    Enabled INTEGER NOT NULL DEFAULT 1,
    IsDefault INTEGER NOT NULL DEFAULT 0,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ProjectID, CardKey)
);
`;
