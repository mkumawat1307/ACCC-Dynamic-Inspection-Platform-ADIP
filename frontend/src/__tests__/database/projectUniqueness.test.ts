jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
}));

import type { SQLiteDatabase } from "expo-sqlite";
import type { ProjectDuplicateGroup } from "@/src/database/projectIdentity";

describe("Project uniqueness (integration)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function initGlobal(): Promise<void> {
    const { createGlobalSchema } = require("@/src/database/schema");
    const { seedDivisions } = require("@/src/database/seeds/division.seed");
    await createGlobalSchema();
    await seedDivisions();
  }

  async function districtId(name: string): Promise<number> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db = await dbModule.getGlobalDatabase();
    const row = await db.getFirstAsync<{ DistrictID: number }>(
      "SELECT DistrictID FROM Districts WHERE DistrictName = ?",
      [name]
    );
    if (!row) throw new Error(`district not found: ${name}`);
    return row.DistrictID;
  }

  it("user critical #6 — SIKAR/XYZ and JAIPUR/XYZ are independent projects with distinct DBs", async () => {
    await initGlobal();

    const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository") as typeof import("@/src/database/repositories/ProjectRepository");
    const { getProjectDbPath } = require("@/src/database/helpers/ProjectDBManager");
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");

    const sikarId = await districtId("Sikar");
    const jaipurId = await districtId("Jaipur");

    const sikarPath = getProjectDbPath("Sikar", "XYZ");
    const jaipurPath = getProjectDbPath("Jaipur", "XYZ");
    expect(sikarPath).not.toBe(jaipurPath);

    const sikarId1 = await ProjectRepository.createProject({
      projectName: "XYZ",
      districtId: sikarId,
      dbPath: sikarPath,
    });
    const jaipurId2 = await ProjectRepository.createProject({
      projectName: "XYZ",
      districtId: jaipurId,
      dbPath: jaipurPath,
    });
    expect(sikarId1).toBeGreaterThan(0);
    expect(jaipurId2).toBeGreaterThan(0);
    expect(sikarId1).not.toBe(jaipurId2);

    const db = await dbModule.getGlobalDatabase();
    const rows = await db.getAllAsync<{
      ProjectName: string;
      DistrictKey: string;
      ProjectKey: string;
      DBPath: string;
    }>("SELECT ProjectName, DistrictKey, ProjectKey, DBPath FROM Projects");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => `${r.DistrictKey}/${r.ProjectKey}`))).toEqual(
      new Set(["sikar/xyz", "jaipur/xyz"])
    );
    expect(new Set(rows.map((r) => r.DBPath))).toEqual(new Set([sikarPath, jaipurPath]));

    await dbModule.setActiveProject(jaipurPath);
    const dbJ = await dbModule.getDatabase();
    await dbJ.runAsync(
      "INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault) VALUES (?, ?, ?)",
      ["Jaipur Tpl", "d", 1]
    );

    await dbModule.clearActiveProject();

    await dbModule.setActiveProject(sikarPath);
    const dbS = await dbModule.getDatabase();
    const tplInSikar = await dbS.getAllAsync<{ TemplateName: string }>(
      "SELECT TemplateName FROM InspectionTemplates"
    );
    expect(tplInSikar).toEqual([]);
  });

  it("user critical #7 — 'sikar/amc 2026' is rejected when SIKAR/AMC 2026 exists", async () => {
    await initGlobal();

    const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository") as typeof import("@/src/database/repositories/ProjectRepository");
    const { getProjectDbPath } = require("@/src/database/helpers/ProjectDBManager");

    const sikarId = await districtId("Sikar");

    const first = await ProjectRepository.createProject({
      projectName: "AMC 2026",
      districtId: sikarId,
      dbPath: getProjectDbPath("Sikar", "AMC 2026"),
    });
    expect(first).toBeGreaterThan(0);

    await expect(
      ProjectRepository.createProject({
        projectName: "amc 2026",
        districtId: sikarId,
        dbPath: getProjectDbPath("sikar", "amc 2026"),
      })
    ).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
  });

  it("real SQLite UNIQUE constraint failure is recognized as a duplicate", async () => {
    const { DatabaseSync } = require("node:sqlite");
    const { isUniqueConstraintError } = require("@/src/database/repositories/ProjectRepository");

    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE Projects (
        ProjectID INTEGER PRIMARY KEY AUTOINCREMENT,
        DistrictKey TEXT,
        ProjectKey TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_district_project
        ON Projects(DistrictKey, ProjectKey);
    `);
    db.prepare("INSERT INTO Projects (DistrictKey, ProjectKey) VALUES ('sikar', 'amc 2026')").run();

    let thrown: unknown = null;
    try {
      db.prepare("INSERT INTO Projects (DistrictKey, ProjectKey) VALUES ('sikar', 'amc 2026')").run();
    } catch (e) {
      thrown = e;
    }

    expect(thrown).not.toBeNull();
    expect(isUniqueConstraintError(thrown)).toBe(true);
    db.close();
  });

  it("migration detects duplicate groups, backfills keys, skips the index, then creates it after resolution", async () => {
    await initGlobal();

    const { migrateProjectUniqueness } = require("@/src/database/schema") as {
      migrateProjectUniqueness: () => Promise<ProjectDuplicateGroup[]>;
    };
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");

    const sikarId = await districtId("Sikar");
    const db = await dbModule.getGlobalDatabase();

    const first = await db.runAsync(
      "INSERT INTO Projects (ProjectName, DistrictID, DBPath) VALUES (?, ?, ?)",
      ["AMC 2026", sikarId, "/docs/Projects/Jaipur_AMC 2026_old1/inspection.db"]
    );
    const second = await db.runAsync(
      "INSERT INTO Projects (ProjectName, DistrictID, DBPath) VALUES (?, ?, ?)",
      ["amc 2026", sikarId, "/docs/Projects/Jaipur_AMC 2026_old2/inspection.db"]
    );

    const groups = await migrateProjectUniqueness();
    expect(groups).toHaveLength(1);
    expect(groups[0].districtKey).toBe("sikar");
    expect(groups[0].projectKey).toBe("amc 2026");
    expect(groups[0].members).toHaveLength(2);
    expect(new Set(groups[0].members.map((m) => m.ProjectName))).toEqual(
      new Set(["AMC 2026", "amc 2026"])
    );

    const rows = await db.getAllAsync<{ DistrictKey: string | null; ProjectKey: string | null }>(
      "SELECT DistrictKey, ProjectKey FROM Projects"
    );
    expect(rows.every((r) => r.DistrictKey === "sikar" && r.ProjectKey === "amc 2026")).toBe(true);

    const secondId = second.lastInsertRowId as number;
    await db.runAsync(
      "UPDATE Projects SET ProjectName = ?, ProjectKey = ? WHERE ProjectID = ?",
      ["AMC 2027", "amc 2027", secondId]
    );

    const execSpy = jest.spyOn(db, "execAsync");
    const groupsAfter = await migrateProjectUniqueness();
    expect(groupsAfter).toEqual([]);
    expect(
      execSpy.mock.calls.some((call) =>
        String(call[0]).includes("CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_district_project")
      )
    ).toBe(true);
    execSpy.mockRestore();
  });
});
