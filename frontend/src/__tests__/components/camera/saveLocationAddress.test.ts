jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, isDirectory: false }),
}));

const PROJECT_A = "/mock/documents/Projects/ProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ProjectBeta/inspection.db";

describe("saveLocationAddress cross-project isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function openProject(dbPath: string) {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db = await dbModule.getDatabase();
    return { dbModule, db };
  }

  it("saves the captured address into the active project when it stays active", async () => {
    const { dbModule, db: dbA } = await openProject(PROJECT_A);

    await dbA.runAsync(
      "INSERT INTO InspectionFields (FieldKey, IsActive) VALUES ('location', 1)"
    );
    await dbA.runAsync("INSERT INTO Inspections (InspectionID) VALUES (1)");

    const { saveLocationAddress } = require("@/src/components/camera/saveLocationAddress") as {
      saveLocationAddress: (inspectionId: number, fullAddress: string) => Promise<void>;
    };
    await saveLocationAddress(1, "123 Main St, Sikar");

    const saved = await dbA.getFirstAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE InspectionID = 1"
    );
    expect(saved?.FieldValue).toBe("123 Main St, Sikar");

    await dbModule.clearActiveProject();
  });

  it("does not write the captured address into another project when the project switches mid-save", async () => {
    const { dbModule, db: dbA } = await openProject(PROJECT_A);

    await dbA.runAsync(
      "INSERT INTO InspectionFields (FieldKey, IsActive) VALUES ('location', 1)"
    );

    let resolveFieldLookup!: (value: { FieldID: number } | null) => void;
    const fieldLookupGate = new Promise<{ FieldID: number } | null>((resolve) => {
      resolveFieldLookup = resolve;
    });
    jest.spyOn(dbA, "getFirstAsync").mockImplementationOnce(
      () => fieldLookupGate
    );

    const { saveLocationAddress } = require("@/src/components/camera/saveLocationAddress") as {
      saveLocationAddress: (inspectionId: number, fullAddress: string) => Promise<void>;
    };

    const saveP = saveLocationAddress(1, "123 Main St, Sikar");
    await new Promise((r) => setTimeout(r, 0));

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);
    await dbB.runAsync(
      "INSERT INTO InspectionFields (FieldKey, IsActive) VALUES ('location', 1)"
    );
    await dbB.runAsync("INSERT INTO Inspections (InspectionID) VALUES (1)");

    resolveFieldLookup({ FieldID: 1 });
    await saveP;

    const valuesInB = await dbB.getAllAsync<{ ValueID: number }>(
      "SELECT ValueID FROM InspectionValues"
    );
    expect(valuesInB).toHaveLength(0);

    const valuesInA = await dbA.getAllAsync<{ ValueID: number }>(
      "SELECT ValueID FROM InspectionValues"
    );
    expect(valuesInA).toHaveLength(0);

    await dbModule.clearActiveProject();
  });
});