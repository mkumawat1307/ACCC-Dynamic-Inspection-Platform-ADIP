// frontend/src/__tests__/database/InspectionProgressService.test.ts

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
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  getContentUriAsync: jest.fn().mockResolvedValue("content://mock/exported"),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn().mockResolvedValue({ resultCode: 0 }),
}));

jest.mock("@/src/utils/storageManager", () => ({
  ensureRootFolder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    androidApiLevel: 35,
    hasFiles: jest.fn().mockResolvedValue(true),
    writeBase64: jest.fn().mockResolvedValue("content://mock/exported/file.xlsx"),
    writeUtf8: jest.fn().mockResolvedValue("content://mock/exported/file.csv"),
    readBase64: jest.fn().mockResolvedValue("QUJD"),
    deleteFile: jest.fn().mockResolvedValue(true),
    findFile: jest.fn().mockResolvedValue(null),
  },
}));

import type { SQLiteDatabase } from "expo-sqlite";
import type {
  InspectionProgress,
  InspectionSectionProgress,
  ProgressGroup,
  ProgressGroupKey,
} from "@/src/database/repositories/InspectionProgressService";

const PROJECT = "/mock/documents/Projects/InspectionProgressService";
let projectSeq = 0;

type Row = { [key: string]: any };

type Services = {
  progressService: typeof import("@/src/database/repositories/InspectionProgressService")["InspectionProgressService"];
  session: typeof import("@/src/database/repositories/InspectionEditSession")["InspectionEditSession"];
  recordsRepo: typeof import("@/src/database/repositories/DeviceRecordsRepository")["default"];
  defsRepo: typeof import("@/src/database/repositories/DeviceFieldDefinitionsRepository")["default"];
};

function getServices(): Services {
  const progressService = require("@/src/database/repositories/InspectionProgressService") as typeof import("@/src/database/repositories/InspectionProgressService");
  const session = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");
  const recordsRepo = require("@/src/database/repositories/DeviceRecordsRepository") as { default: Services["recordsRepo"] };
  const defsRepo = require("@/src/database/repositories/DeviceFieldDefinitionsRepository") as { default: Services["defsRepo"] };
  return {
    progressService: progressService.InspectionProgressService,
    session: session.InspectionEditSession,
    recordsRepo: recordsRepo.default,
    defsRepo: defsRepo.default,
  };
}

function group(progress: InspectionProgress, key: ProgressGroupKey): ProgressGroup | undefined {
  return progress.groups.find((g) => g.key === key);
}

function sectionOf(
  progress: InspectionProgress,
  key: string
): InspectionSectionProgress | undefined {
  return progress.sections.find((s) => s.key === key);
}

describe("InspectionProgressService (config-driven, read-only)", () => {
  beforeEach(async () => {
    jest.resetModules();
    await getServices().session.discard();
  });

  async function openSeededProject(): Promise<{ db: SQLiteDatabase }> {
    projectSeq += 1;
    const path = `${PROJECT}/${projectSeq}/inspection.db`;
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(path);
    const { createProjectSchema } = require("@/src/database/schema");
    await createProjectSchema();
    const tpl = require("@/src/database/seeds/inspection-template.seed");
    await tpl.seedInspectionTemplate();
    const sec = require("@/src/database/seeds/inspection-sections.seed");
    await sec.seedInspectionSections();
    const fld = require("@/src/database/seeds/inspection-fields.seed");
    await fld.seedInspectionFields();
    const fo = require("@/src/database/seeds/field-options.seed");
    await fo.seedFieldOptions();
    const dopt = require("@/src/database/seeds/device-options.seed");
    await dopt.seedDeviceOptions();
    const ddf = require("@/src/database/seeds/device-field-definitions.seed");
    await ddf.seedDeviceFieldDefinitions();
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync(
      "UPDATE DeviceFieldDefinitions SET TemplateID = 1, IsActive = 1, IsVisible = 1 WHERE TemplateID IS NULL"
    );
    return { db };
  }

  async function createInspection(): Promise<number> {
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    return InspectionRepository.createInspection(1, 1, "2026-09-10");
  }

  async function fieldId(db: SQLiteDatabase, sectionKey: string, fieldKey: string): Promise<number> {
    const row = await db.getFirstAsync<Row>(
      `SELECT f.FieldID FROM InspectionFields f
       JOIN InspectionSections s ON f.SectionID = s.SectionID
       WHERE s.SectionKey = ? AND f.FieldKey = ? LIMIT 1`,
      [sectionKey, fieldKey]
    );
    if (!row) throw new Error(`field not found: ${sectionKey}/${fieldKey}`);
    return Number(row.FieldID);
  }

  async function setValue(db: SQLiteDatabase, inspectionId: number, fieldId: number, value: string): Promise<void> {
    await db.runAsync("DELETE FROM InspectionValues WHERE InspectionID = ? AND FieldID = ?", [inspectionId, fieldId]);
    await db.runAsync(
      "INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)",
      [inspectionId, fieldId, value]
    );
  }

  async function addCustomSection(
    db: SQLiteDatabase,
    sectionKey: string,
    name: string,
    displayOrder: number
  ): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsDefault, IsActive)
       VALUES (1, ?, ?, ?, 0, 1)`,
      [name, sectionKey, displayOrder]
    );
    return Number(result.lastInsertRowId);
  }

  async function addCustomField(
    db: SQLiteDatabase,
    sectionId: number,
    fieldKey: string,
    fieldName: string,
    fieldType: string,
    isRequired: number,
    displayOrder: number
  ): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO InspectionFields (
         SectionID, FieldKey, FieldName, FieldType, DisplayOrder, IsRequired, IsActive, IsVisible
       ) VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
      [sectionId, fieldKey, fieldName, fieldType, displayOrder, isRequired]
    );
    return Number(result.lastInsertRowId);
  }

  async function addDeviceDef(
    deviceType: string,
    fieldName: string,
    label: string,
    fieldType: string,
    isRequired: number,
    displayOrder: number
  ): Promise<void> {
    const { defsRepo } = getServices();
    await defsRepo.add(
      {
        DeviceType: deviceType,
        FieldName: fieldName,
        Label: label,
        FieldType: fieldType,
        IsRequired: isRequired,
        DisplayOrder: displayOrder,
        IsActive: 1,
      },
      1
    );
    const db = await require("@/src/database/db").getDatabase();
    await db.runAsync(
      "UPDATE DeviceFieldDefinitions SET IsActive = 1, IsVisible = 1 WHERE DeviceType = ? AND TemplateID = 1",
      [deviceType]
    );
  }

  async function addDeviceRecord(
    inspectionId: number,
    deviceType: string,
    deviceNo: number,
    data: Record<string, string>
  ): Promise<void> {
    const { recordsRepo } = getServices();
    await recordsRepo.create({
      InspectionID: inspectionId,
      DeviceType: deviceType,
      DeviceNo: deviceNo,
      DeviceData: JSON.stringify(data),
      DisplayOrder: 1,
      IsActive: 1,
    } as any);
  }

  const fullCameraData = (): Record<string, string> => ({
    CameraType: "Box",
    CameraStatus: "Local",
    CameraMake: "CP Plus",
    CameraModel: "M1",
    CameraIP: "10.0.0.1",
    CameraSerialNumber: "S1",
    CameraSI: "TCIL (Smart City)",
    SDCardCapacity: "128 GB",
    SDCardStatus: "Working",
  });

  const fullSwitchData = (): Record<string, string> => ({
    SwitchType: "8-Port",
    SwitchStatus: "Local",
    SwitchMake: "Cisco",
    SwitchModel: "M1",
    SwitchIP: "10.0.0.2",
    SwitchSerialNumber: "S2",
    SwitchSI: "TCIL (RC)",
  });

  async function setupCustomTransformer(
    db: SQLiteDatabase
  ): Promise<{ section: number; countField: number }> {
    const section = await addCustomSection(db, "transformer_information", "Transformer", 90);
    await addCustomField(db, section, "transformer_count", "Transformer Count", "number", 0, 1);
    await addCustomField(db, section, "transformer_type", "Transformer Type", "dropdown", 1, 2);
    await addCustomField(db, section, "transformer_capacity", "Transformer Capacity", "number", 1, 3);
    await addDeviceDef("Transformer", "TransformerType", "Transformer Type", "dropdown", 1, 1);
    await addDeviceDef("Transformer", "TransformerCapacity", "Transformer Capacity", "number", 1, 2);
    const countField = await fieldId(db, "transformer_information", "transformer_count");
    return { section, countField };
  }

  async function setupCustomUps(
    db: SQLiteDatabase
  ): Promise<{ section: number; countField: number }> {
    // Custom device section with ZERO required defs (0-required generic rule).
    const section = await addCustomSection(db, "ups_information", "UPS", 91);
    await addCustomField(db, section, "ups_count", "UPS Count", "number", 0, 1);
    await addCustomField(db, section, "ups_ref", "UPS Reference", "text", 0, 2);
    await addDeviceDef("UPS", "UpsRef", "UPS Reference", "text", 0, 1);
    const countField = await fieldId(db, "ups_information", "ups_count");
    return { section, countField };
  }

  describe("grouped output shape", () => {
    beforeEach(async () => {
      await openSeededProject();
    });

    it("always returns all five groups in stable order", async () => {
      const inspectionId = await createInspection();
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);

      expect(progress.groups.map((g) => g.key)).toEqual([
        "general_information",
        "default_sections",
        "default_devices",
        "custom_devices",
        "custom_sections",
      ]);
      expect(progress.groups.map((g) => g.label)).toEqual([
        "General Information",
        "Default Sections",
        "Default Device Type",
        "Custom Device Types",
        "Custom Sections",
      ]);
    });
  });

  describe("per-section header progress", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
    });

    it("includes an entry per real section with units (keyed by SectionKey); photos and zero-unit sections excluded", async () => {
      const inspectionId = await createInspection();
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);

      const keys = progress.sections.map((s) => s.key);
      expect(keys).toContain("general_information");
      expect(keys).toContain("pole_structure");
      expect(keys).toContain("junction_box");
      // Progress counts ALL fields (not just mandatory ones), so every
      // non-device section with progress-relevant fields gets an entry.
      expect(keys).toContain("earthing");
      expect(keys).toContain("meter");
      expect(keys).toContain("connectivity");
      expect(keys).toContain("remarks");
      // No camera/switch count configured yet → device sections have no units
      // and must NOT appear (no misleading "0 / 0" placeholder).
      expect(keys).not.toContain("camera_information");
      expect(keys).not.toContain("switch_information");
      // Photos never carries progress.
      expect(keys).not.toContain("photos");
      expect(keys.some((key) => key.length === 0)).toBe(false);

      // Once a count is configured the device section appears (with units).
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "1");
      await setValue(db, inspectionId, await fieldId(db, "switch_information", "switch_count"), "1");
      const withCounts = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const keysWithCounts = withCounts.sections.map((s) => s.key);
      expect(keysWithCounts).toContain("camera_information");
      expect(keysWithCounts).toContain("switch_information");
    });

    it("general_information counts 5 relevant fields; date/division/district excluded but pole_id counts", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "general_information", "inspector_name"), "R. Inspector");

      let progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const entry = sectionOf(progress, "general_information")!;
      expect(entry.total).toBe(5);
      expect(entry.completed).toBe(1);
      expect(entry.remaining).toBe(4);

      // pole_id (the Site ID) is a progress-relevant result and COUNTS.
      await setValue(db, inspectionId, await fieldId(db, "general_information", "pole_id"), "P-001");
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(sectionOf(progress, "general_information")!.completed).toBe(2);

      await setValue(db, inspectionId, await fieldId(db, "general_information", "gps"), "26.5,80.1");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "block"), "B1");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "location"), "Main Street");
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(sectionOf(progress, "general_information")!.completed).toBe(5);
      expect(sectionOf(progress, "general_information")!.remaining).toBe(0);
    });

    it("camera section: 0/9 empty; parent aggregates ALL devices × ALL visible fields", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "1");

      let progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const camera = sectionOf(progress, "camera_information");
      expect(camera).toBeDefined();
      expect(camera!.total).toBe(9);
      expect(camera!.completed).toBe(0);
      expect(camera!.remaining).toBe(9);
      expect(camera!.label).toBe("Camera");
      // Per-device breakdown: one empty device across all visible field defs.
      expect(camera!.devices).toHaveLength(1);
      expect(camera!.devices![0].deviceNo).toBe(1);
      expect(camera!.devices![0].completed).toBe(0);
      expect(camera!.devices![0].total).toBe(9);
      expect(camera!.devices![0].remaining).toBe(9);
      expect(camera!.devices![0].percentage).toBe(0);

      // Two meaningful values (CameraType + CameraStatus) are NOT enough:
      // progress counts every active+visible definition, not just required ones.
      await addDeviceRecord(inspectionId, "Camera", 1, { CameraType: "Monochrome", CameraStatus: "OK" });
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(sectionOf(progress, "camera_information")!.completed).toBe(2);
      expect(sectionOf(progress, "camera_information")!.devices![0].completed).toBe(2);
      expect(sectionOf(progress, "camera_information")!.devices![0].remaining).toBe(7);

      // All nine visible defs filled → the device completes and the parent does too.
      await addDeviceRecord(inspectionId, "Camera", 1, fullCameraData());
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(sectionOf(progress, "camera_information")!.completed).toBe(9);
      expect(sectionOf(progress, "camera_information")!.remaining).toBe(0);
      expect(sectionOf(progress, "camera_information")!.devices![0].completed).toBe(9);
      expect(sectionOf(progress, "camera_information")!.devices![0].remaining).toBe(0);
    });

    it("camera with no configured count has NO header entry (determinate, never a 0/0 placeholder)", async () => {
      const inspectionId = await createInspection();
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(sectionOf(progress, "camera_information")).toBeUndefined();
    });

    it("custom device & custom section entries appear keyed by their own SectionKey", async () => {
      await setupCustomTransformer(db);
      const notesId = await addCustomSection(db, "maintenance_notes", "Maintenance Notes", 92);
      await addCustomField(db, notesId, "maint_note", "Note", "text", 1, 1);

      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "transformer_information", "transformer_count"), "1");
      await addDeviceRecord(inspectionId, "Transformer", 1, {
        TransformerType: "Pole Mounted",
        TransformerCapacity: "100",
      });
      await setValue(db, inspectionId, await fieldId(db, "maintenance_notes", "maint_note"), "Seen rust");

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(sectionOf(progress, "transformer_information")!.label).toBe("Transformer");
      expect(sectionOf(progress, "transformer_information")!.completed).toBe(2);
      expect(sectionOf(progress, "maintenance_notes")!.completed).toBe(1);
    });

    it("custom section with optional-only fields still gets a header entry (progress counts all fields)", async () => {
      const sectionId = await addCustomSection(db, "remarks_extra", "Extra Remarks", 93);
      await addCustomField(db, sectionId, "extra_note", "Extra Note", "text", 0, 1);
      const inspectionId = await createInspection();

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const entry = sectionOf(progress, "remarks_extra")!;
      expect(entry.total).toBe(1);
      expect(entry.completed).toBe(0);

      await setValue(db, inspectionId, await fieldId(db, "remarks_extra", "extra_note"), "Seen");
      const after = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(sectionOf(after, "remarks_extra")!.completed).toBe(1);
    });
  });

  describe("default factory template", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
    });

    it("empty inspection → 0%, units = geninfo(5) + default sections(18), devices 0", async () => {
      const inspectionId = await createInspection();
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);

      expect(progress.percentage).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.total).toBe(23);
      expect(progress.remaining).toBe(23);

      const genInfo = group(progress, "general_information");
      expect(genInfo!.completed).toBe(0);
      expect(genInfo!.total).toBe(5);
      expect(genInfo!.remaining).toBe(5);

      const defaultSections = group(progress, "default_sections");
      expect(defaultSections!.total).toBe(18);

      const defaultDevices = group(progress, "default_devices");
      expect(defaultDevices!.total).toBe(0);
      expect(defaultDevices!.remaining).toBe(0);

      const customDevices = group(progress, "custom_devices");
      expect(customDevices!.total).toBe(0);

      const customSections = group(progress, "custom_sections");
      expect(customSections!.total).toBe(0);
    });

    it("no date/division/district units contributed; pole_id is progress-relevant", async () => {
      const inspectionId = await createInspection();
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const genInfo = group(progress, "general_information");
      expect(genInfo!.total).toBe(5);
    });

    it("date/division/district add zero completion; pole_id DOES count", async () => {
      const inspectionId = await createInspection();
      const dateId = await fieldId(db, "general_information", "date");
      const divisionId = await fieldId(db, "general_information", "division");
      const districtId = await fieldId(db, "general_information", "district");
      await setValue(db, inspectionId, dateId, "2026-09-10");
      await setValue(db, inspectionId, divisionId, "Division A");
      await setValue(db, inspectionId, districtId, "District B");

      let progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(progress.completed).toBe(0);
      expect(progress.percentage).toBe(0);
      expect(group(progress, "general_information")!.completed).toBe(0);

      await setValue(db, inspectionId, await fieldId(db, "general_information", "pole_id"), "P-001");
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(progress.completed).toBe(1);
      expect(progress.percentage).toBe(4);
      expect(group(progress, "general_information")!.completed).toBe(1);
    });

    it("whitespace-only inspector_name incomplete; meaningful completes", async () => {
      const inspectionId = await createInspection();
      const inspectorId = await fieldId(db, "general_information", "inspector_name");
      await setValue(db, inspectionId, inspectorId, "   ");

      let progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(progress.completed).toBe(0);

      await setValue(db, inspectionId, inspectorId, "R. Inspector");
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "general_information")!.completed).toBe(1);
    });

    it("fully filled non-device sections → 100%", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "general_information", "inspector_name"), "R. Inspector");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "block"), "B1");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "pole_id"), "P-001");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "location"), "Main Street");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "gps"), "26.5,80.1");
      await setValue(db, inspectionId, await fieldId(db, "pole_structure", "foundation_cond"), "Good");
      await setValue(db, inspectionId, await fieldId(db, "pole_structure", "pole_avail"), "Yes");
      await setValue(db, inspectionId, await fieldId(db, "pole_structure", "pole_si"), "TASL (Technosys)");
      await setValue(db, inspectionId, await fieldId(db, "pole_structure", "pole_status"), "Active");
      await setValue(db, inspectionId, await fieldId(db, "junction_box", "jb_status"), "OK");
      await setValue(db, inspectionId, await fieldId(db, "junction_box", "power_cable"), "Present");
      await setValue(db, inspectionId, await fieldId(db, "junction_box", "cable_status"), "Good");
      await setValue(db, inspectionId, await fieldId(db, "junction_box", "power_cable_length"), "10");
      await setValue(db, inspectionId, await fieldId(db, "earthing", "earthing_wire"), "OK");
      await setValue(db, inspectionId, await fieldId(db, "earthing", "earthing_chamber"), "OK");
      await setValue(db, inspectionId, await fieldId(db, "earthing", "earthing_cover"), "OK");
      await setValue(db, inspectionId, await fieldId(db, "earthing", "earthing_voltage"), "3");
      await setValue(db, inspectionId, await fieldId(db, "meter", "meter_box_status"), "OK");
      await setValue(db, inspectionId, await fieldId(db, "meter", "meter_status"), "OK");
      await setValue(db, inspectionId, await fieldId(db, "meter", "meter_power_status"), "OK");
      await setValue(db, inspectionId, await fieldId(db, "meter", "meter_serial"), "M-1");
      await setValue(db, inspectionId, await fieldId(db, "connectivity", "connectivity_type"), "Fiber");
      await setValue(db, inspectionId, await fieldId(db, "remarks", "remarks"), "All good");

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(progress.completed).toBe(23);
      expect(progress.total).toBe(23);
      expect(progress.remaining).toBe(0);
      expect(progress.percentage).toBe(100);
      expect(group(progress, "default_sections")!.remaining).toBe(0);
    });

    it("photos section contributes nothing", async () => {
      const inspectionId = await createInspection();
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(progress.total).toBe(23);
    });

    it("overall percentage is weighted by units, not averaged", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "general_information", "inspector_name"), "R. Inspector");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "block"), "B1");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "pole_id"), "P-001");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "location"), "Main Street");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "gps"), "26.5,80.1");
      await setValue(db, inspectionId, await fieldId(db, "junction_box", "jb_status"), "OK");
      await setValue(db, inspectionId, await fieldId(db, "junction_box", "power_cable"), "Present");

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      // 7 of 23 units (general_information 5/5, default_sections 2/18) → 30%
      expect(progress.completed).toBe(7);
      expect(progress.total).toBe(23);
      expect(progress.percentage).toBe(30);
      expect(group(progress, "general_information")!.percentage).toBe(100);
      expect(group(progress, "default_sections")!.percentage).toBe(11);
    });
  });

  describe("device sections (factory Camera)", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
    });

    it("count 0 → default device group has no units", async () => {
      const inspectionId = await createInspection();
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "default_devices")!.total).toBe(0);
      expect(progress.total).toBe(23);
    });

    it("count 1 but no Camera fields filled → device contributes 0/9", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "general_information", "inspector_name"), "R. Inspector");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "pole_id"), "P-001");
      await setValue(db, inspectionId, await fieldId(db, "general_information", "gps"), "26.5,80.1");
      await setValue(db, inspectionId, await fieldId(db, "pole_structure", "foundation_cond"), "Good");
      await setValue(db, inspectionId, await fieldId(db, "pole_structure", "pole_avail"), "Yes");
      await setValue(db, inspectionId, await fieldId(db, "junction_box", "jb_status"), "OK");
      // Configured count exists, but no Camera fields have been filled yet.
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "1");

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "default_devices")!.total).toBe(9);
      expect(group(progress, "default_devices")!.completed).toBe(0);
      expect(group(progress, "default_devices")!.remaining).toBe(9);

      // Regression: must NOT show 100%. 23 base units + 9 device fields.
      expect(progress.total).toBe(32);
      expect(progress.completed).toBe(6);
      expect(progress.percentage).toBe(19);
      expect(progress.remaining).toBe(26);
    });

    it("expected-count total from camera_count × fields, not records.length", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "2");
      await addDeviceRecord(inspectionId, "Camera", 1, { CameraType: "Monochrome", CameraStatus: "OK" });
      await addDeviceRecord(inspectionId, "Camera", 2, { CameraType: "Colour", CameraStatus: "OK" });
      await addDeviceRecord(inspectionId, "Camera", 3, { CameraType: "Colour", CameraStatus: "Damaged" });

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      // 2 configured devices × 9 fields each = 18 (never records.length = 3).
      expect(group(progress, "default_devices")!.total).toBe(18);
      // Partial records (only 2 of 9 fields each) contribute 2+2 fields.
      expect(group(progress, "default_devices")!.completed).toBe(4);
    });

    it("partial records aggregate their filled fields; no device is complete", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "2");
      await addDeviceRecord(inspectionId, "Camera", 1, { CameraType: "Monochrome", CameraStatus: "OK" });

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const devices = group(progress, "default_devices")!;
      expect(devices.total).toBe(18);
      expect(devices.completed).toBe(2);
      expect(devices.percentage).toBe(11);
    });

    it("record with one field filled counts 1 completed field; needs all 9 to complete", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "1");
      await addDeviceRecord(inspectionId, "Camera", 1, { CameraSerialNumber: "S-1" });

const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "default_devices")!.completed).toBe(1);
      const camera = sectionOf(progress, "camera_information")!;
      expect(camera.completed).toBe(1);
      expect(camera.total).toBe(9);
      expect(camera.remaining).toBe(8);
    });

    it("parent/group totals use configured count × fields even with extra records", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "1");
      await addDeviceRecord(inspectionId, "Camera", 1, fullCameraData());
      await addDeviceRecord(inspectionId, "Camera", 2, fullCameraData());

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const devices = group(progress, "default_devices")!;
      expect(devices.completed).toBe(9);
      expect(devices.total).toBe(9);
      expect(devices.percentage).toBe(100);
    });

    it("per-device field progress covers every visible field def (UI breakdown, not the count)", async () => {
      const inspectionId = await createInspection();
      // Two devices: #1 has two meaningful values, #2 is empty.
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "2");
      await addDeviceRecord(inspectionId, "Camera", 1, { CameraType: "Monochrome", CameraStatus: "OK" });

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const camera = sectionOf(progress, "camera_information")!;
      expect(camera.devices).toHaveLength(2);
      expect(camera.devices![0]).toEqual({
        deviceNo: 1,
        completed: 2,
        total: 9,
        remaining: 7,
        percentage: 22,
      });
      expect(camera.devices![1]).toEqual({
        deviceNo: 2,
        completed: 0,
        total: 9,
        remaining: 9,
        percentage: 0,
      });
      // Each per-device total stays ONE device's field count (never 18).
      expect(camera.devices![0].total).toBe(9);
      expect(camera.devices![1].total).toBe(9);
      // Parent total aggregates: 2 devices × 9 fields = 18.
      expect(camera.total).toBe(18);
      expect(camera.completed).toBe(2);
    });

    it("per-device field progress is config-driven: invisible defs are excluded from the total", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "1");
      await db.runAsync(
        "UPDATE DeviceFieldDefinitions SET IsVisible = 0 WHERE DeviceType = 'Camera' AND TemplateID = 1 AND FieldName = 'SDCardStatus'"
      );

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const camera = sectionOf(progress, "camera_information")!;
      expect(camera.devices![0].total).toBe(8);
    });

    it("per-device progress does NOT add extra overall units (no double counting)", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "2");
      await addDeviceRecord(inspectionId, "Camera", 1, fullCameraData());
      await addDeviceRecord(inspectionId, "Camera", 2, fullCameraData());

      // Base total 23 + 2 devices × 9 fields = 18 aggregated device fields. The
      // parent aggregate already represents every device field, so the
      // per-device breakdown (9+9) must never be added on top.
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(progress.total).toBe(41);
      expect(progress.completed).toBe(18);
      expect(progress.percentage).toBe(44);
    });
  });

  describe("parent device section aggregates ALL devices × relevant fields", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
    });

    it("two cameras × 9 fields: parent 0/18 (denominator is fields, NOT device count)", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "2");

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const camera = sectionOf(progress, "camera_information")!;
      expect(camera.total).toBe(18);
      expect(camera.completed).toBe(0);
      expect(camera.remaining).toBe(18);
      expect(camera.devices).toHaveLength(2);
      // Each per-device total stays ONE device's fields (never 18).
      expect(camera.devices![0].total).toBe(9);
      expect(camera.devices![1].total).toBe(9);
    });

    it("camera1 = 9/9, camera2 = 3/9 → parent 12/18 and NOT complete", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "2");
      await addDeviceRecord(inspectionId, "Camera", 1, fullCameraData());
      await addDeviceRecord(inspectionId, "Camera", 2, {
        CameraType: "Colour",
        CameraStatus: "OK",
        CameraMake: "Hikvision",
      });

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const camera = sectionOf(progress, "camera_information")!;
      expect(camera.completed).toBe(12);
      expect(camera.total).toBe(18);
      expect(camera.remaining).toBe(6);
      expect(camera.percentage).toBe(67);
      expect(camera.devices![0].completed).toBe(9);
      expect(camera.devices![1].completed).toBe(3);
    });

    it("parent is complete only when ALL devices × fields are complete", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "2");
      await addDeviceRecord(inspectionId, "Camera", 1, fullCameraData());
      await addDeviceRecord(inspectionId, "Camera", 2, fullCameraData());

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const camera = sectionOf(progress, "camera_information")!;
      expect(camera.completed).toBe(18);
      expect(camera.remaining).toBe(0);
      expect(camera.percentage).toBe(100);
      expect(camera.devices![0].total).toBe(9);
      expect(camera.devices![1].total).toBe(9);
    });

    it("overall progress counts the aggregated device fields exactly once", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "2");
      await addDeviceRecord(inspectionId, "Camera", 1, fullCameraData());
      await addDeviceRecord(inspectionId, "Camera", 2, {
        CameraType: "Colour",
        CameraStatus: "OK",
        CameraMake: "Hikvision",
      });

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const defaultDevices = group(progress, "default_devices")!;
      expect(defaultDevices.total).toBe(18);
      expect(defaultDevices.completed).toBe(12);
      // Base 23 non-device units + exactly 18 aggregated device fields.
      expect(progress.total).toBe(41);
      expect(progress.completed).toBe(12);
    });
  });

  describe("zero-required device types (factory Switch + custom UPS)", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
      await setupCustomUps(db);
    });

    it("factory Switch with count 2, empty records → 0/14 in default devices", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "switch_information", "switch_count"), "2");

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "default_devices")!.total).toBe(14);
      expect(group(progress, "default_devices")!.completed).toBe(0);
    });

    it("factory Switch: partial record aggregates fields; all 7 visible fields per device required", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "switch_information", "switch_count"), "3");
      await addDeviceRecord(inspectionId, "Switch", 1, { SwitchModel: "M-1" });

      let progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const devices = group(progress, "default_devices")!;
      expect(devices.completed).toBe(1);
      expect(devices.total).toBe(21);

      await addDeviceRecord(inspectionId, "Switch", 1, fullSwitchData());
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "default_devices")!.completed).toBe(7);
    });

    it("custom UPS (single visible def) → counts once its field is filled", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "ups_information", "ups_count"), "2");

      let progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const ups = group(progress, "custom_devices")!;
      expect(ups.total).toBe(2);
      expect(ups.completed).toBe(0);

      await addDeviceRecord(inspectionId, "UPS", 1, { UpsRef: "U-1" });
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "custom_devices")!.completed).toBe(1);
    });
  });

  describe("custom Transformer device + custom sections", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
      const { section } = await setupCustomTransformer(db);
      expect(section).toBeGreaterThan(0);
    });

    it("device section contributes nothing until a count is configured", async () => {
      const inspectionId = await createInspection();
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);

      // transformer_information is a CUSTOM device section → its units land in
      // custom_devices, never in custom_sections, and only once a count exists.
      expect(group(progress, "custom_devices")!.total).toBe(0);
      expect(group(progress, "custom_sections")!.total).toBe(0);
    });

    it("custom transformer_count drives device units from config (2 defs × 2 devices)", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "transformer_information", "transformer_count"), "2");
      await addDeviceRecord(inspectionId, "Transformer", 1, { TransformerType: "Pole Mounted", TransformerCapacity: "100" });

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const devices = group(progress, "custom_devices")!;
      expect(devices.total).toBe(4);
      expect(devices.completed).toBe(2);

      // Per-device breakdown for the custom type: 2 visible Transformer defs.
      const transformer = sectionOf(progress, "transformer_information")!;
      expect(transformer.devices).toHaveLength(2);
      expect(transformer.devices![0]).toEqual({
        deviceNo: 1,
        completed: 2,
        total: 2,
        remaining: 0,
        percentage: 100,
      });
      expect(transformer.devices![1].completed).toBe(0);
    });

    it("device record with missing required def fields counts only filled fields", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "transformer_information", "transformer_count"), "1");
      await addDeviceRecord(inspectionId, "Transformer", 1, { TransformerType: "Pole Mounted" });

      let progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "custom_devices")!.completed).toBe(1);

      await addDeviceRecord(inspectionId, "Transformer", 1, {
        TransformerType: "Pole Mounted",
        TransformerCapacity: "100",
      });
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "custom_devices")!.completed).toBe(2);
    });

    it("custom non-device section (IsDefault=0) counts under custom sections", async () => {
      const section = await addCustomSection(db, "maintenance_notes", "Maintenance Notes", 92);
      await addCustomField(db, section, "maint_note", "Note", "text", 1, 1);
      const inspectionId = await createInspection();

      let progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      const customSections = group(progress, "custom_sections")!;
      expect(customSections.total).toBe(1);
      expect(customSections.completed).toBe(0);

      await setValue(db, inspectionId, await fieldId(db, "maintenance_notes", "maint_note"), "Seen rust");
      progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "custom_sections")!.completed).toBe(1);
    });
  });

  describe("existing inspections (saved-values-only)", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
    });

    it("empty existing inspection stays 0% — no defaults introduced", async () => {
      const inspectionId = await createInspection();
      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(progress.completed).toBe(0);
      expect(progress.percentage).toBe(0);
    });

    it("saved values only (service is read-only)", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "general_information", "inspector_name"), "Legacy");

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "general_information")!.completed).toBe(1);

      const count = await db.getFirstAsync<Row>(
        "SELECT COUNT(*) AS n FROM InspectionValues"
      );
      expect(Number(count!.n)).toBe(1);
    });
  });

  describe("edit-session staged overlay (existing inspections)", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
    });

    it("staged field + staged device records drive live progress without DB writes", async () => {
      const inspectionId = await createInspection();
      const inspectorId = await fieldId(db, "general_information", "inspector_name");
      const cameraCountId = await fieldId(db, "camera_information", "camera_count");
      const { session } = getServices();

      session.activate(inspectionId);
      session.stageFieldValue(inspectorId, "R. Inspector");
      await setValue(db, inspectionId, cameraCountId, "1");
      session.stageDeviceRecord({
        InspectionID: inspectionId,
        DeviceType: "Camera",
        DeviceNo: 1,
        DeviceData: JSON.stringify({ CameraType: "Monochrome", CameraStatus: "OK" }),
        DisplayOrder: 1,
        IsActive: 1,
      } as any);

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "general_information")!.completed).toBe(1);
      // 2/9 visible defs staged → the device still needs the other 7, but the
      // staged record feeds BOTH the parent aggregate and the per-device breakdown.
      expect(group(progress, "default_devices")!.completed).toBe(2);
      const camera = sectionOf(progress, "camera_information")!;
      expect(camera.completed).toBe(2);
      expect(camera.devices![0].deviceNo).toBe(1);
      expect(camera.devices![0].completed).toBe(2);

      const count = await db.getFirstAsync<Row>(
        "SELECT COUNT(*) AS n FROM InspectionValues WHERE FieldValue = 'R. Inspector'"
      );
      expect(Number(count!.n)).toBe(0);
    });

    it("no session → staged data ignored", async () => {
      const inspectionId = await createInspection();
      const inspectorId = await fieldId(db, "general_information", "inspector_name");
      // No InspectionEditSession.activate() → isActive(inspectionId) is false
      getServices().session.stageFieldValue(inspectorId, "Should be ignored");

      const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "general_information")!.completed).toBe(0);
    });
  });

  describe("fresh new-inspection form (inspectionId = null)", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
    });

    it("config-only totals, 0 completed, per-section breakdown, no device units", async () => {
      const progress = await getServices().progressService.getInspectionProgress(null, 1);

      expect(progress.completed).toBe(0);
      expect(progress.total).toBe(23);
      expect(progress.remaining).toBe(23);
      expect(progress.percentage).toBe(0);

      const genInfo = group(progress, "general_information");
      expect(genInfo!.total).toBe(5);
      expect(genInfo!.completed).toBe(0);
      expect(group(progress, "default_sections")!.total).toBe(18);
      expect(group(progress, "default_devices")!.total).toBe(0);
      expect(group(progress, "custom_devices")!.total).toBe(0);
      expect(group(progress, "custom_sections")!.total).toBe(0);

      const entries = new Map(progress.sections.map((s) => [s.key, s]));
      expect(entries.get("general_information")!.total).toBe(5);
      expect(entries.get("pole_structure")!.total).toBe(4);
      expect(entries.get("junction_box")!.total).toBe(4);
      expect(entries.get("earthing")!.total).toBe(4);
      expect(entries.get("meter")!.total).toBe(4);
      expect(entries.get("connectivity")!.total).toBe(1);
      expect(entries.get("remarks")!.total).toBe(1);
      // Device sections and photos never appear without a count / without data.
      expect(entries.has("camera_information")).toBe(false);
      expect(entries.has("switch_information")).toBe(false);
      expect(entries.has("photos")).toBe(false);

      // No inspection exists → nothing written anywhere.
      const count = await db.getFirstAsync<Row>(
        "SELECT COUNT(*) AS n FROM Inspections"
      );
      expect(Number(count!.n)).toBe(0);
    });

    it("writing nothing in a null inspection keeps groups stable across reads", async () => {
      const first = await getServices().progressService.getInspectionProgress(null, 1);
      const second = await getServices().progressService.getInspectionProgress(null, 1);
      expect(first.groups.map((g) => [g.key, g.total])).toEqual(
        second.groups.map((g) => [g.key, g.total])
      );
    });
  });

  describe("live progress for NEW inspections (pending device-save overlay)", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
    });

    it("a debounced (pending) device record counts before it hits the database", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "1");

      const { recordsRepo } = getServices();
      await recordsRepo.scheduleDeviceRecordSave({
        InspectionID: inspectionId,
        DeviceType: "Camera",
        DeviceNo: 1,
        DeviceData: JSON.stringify(fullCameraData()),
        DisplayOrder: 1,
        IsActive: 1,
      } as any);

      try {
        const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
        expect(group(progress, "default_devices")!.completed).toBe(9);
        expect(sectionOf(progress, "camera_information")!.devices![0].completed).toBe(9);
      } finally {
        await recordsRepo.flushPendingDeviceSaves();
      }
    });

    it("pending overlay is latest-wins per (DeviceType, DeviceNo)", async () => {
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "1");
      await addDeviceRecord(inspectionId, "Camera", 1, fullCameraData());

      const { recordsRepo } = getServices();
      // Schedule a SECOND (partial) save for the same device — the pending
      // (debounced) value must override the DB row so the UI stays truthful.
      await recordsRepo.scheduleDeviceRecordSave({
        InspectionID: inspectionId,
        DeviceType: "Camera",
        DeviceNo: 1,
        DeviceData: JSON.stringify({ CameraType: "Monochrome" }),
        DisplayOrder: 1,
        IsActive: 1,
      } as any);

      try {
        const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
        expect(group(progress, "default_devices")!.completed).toBe(1);
        expect(sectionOf(progress, "camera_information")!.devices![0].completed).toBe(1);
      } finally {
        await recordsRepo.flushPendingDeviceSaves();
      }
    });
  });

  describe("live overlay (form-synced values outrank staged + persisted)", () => {
    let db!: SQLiteDatabase;

    beforeEach(async () => {
      ({ db } = await openSeededProject());
    });

    const liveValues = () =>
      require("@/src/database/repositories/InspectionLiveValues")
        .InspectionLiveValues as typeof import("@/src/database/repositories/InspectionLiveValues")["InspectionLiveValues"];

    it("a typed Pole ID counts immediately on a fresh (null-inspection) form", async () => {
      const poleField = await fieldId(db, "general_information", "pole_id");
      liveValues().setFieldValue(poleField, "P-100");
      try {
        const progress = await getServices().progressService.getInspectionProgress(null, 1);
        const genInfo = group(progress, "general_information")!;
        expect(genInfo.total).toBe(5);
        expect(genInfo.completed).toBe(1);
        const gi = sectionOf(progress, "general_information")!;
        expect(gi.completed).toBe(1);
        expect(gi.remaining).toBe(4);
      } finally {
        liveValues().reset();
      }
    });

    it("each subsequent typed field counts immediately, still config-only totals", async () => {
      const poleField = await fieldId(db, "general_information", "pole_id");
      const inspectorField = await fieldId(db, "general_information", "inspector_name");
      liveValues().setFieldValue(poleField, "P-100");
      liveValues().setFieldValue(inspectorField, "R. Inspector");
      try {
        const progress = await getServices().progressService.getInspectionProgress(null, 1);
        expect(progress.total).toBe(23);
        expect(progress.completed).toBe(2);
        expect(group(progress, "general_information")!.completed).toBe(2);
      } finally {
        liveValues().reset();
      }
    });

    it("live outranks staged, which outranks persisted values", async () => {
      const inspectionId = await createInspection();
      const inspectorId = await fieldId(db, "general_information", "inspector_name");
      await setValue(db, inspectionId, inspectorId, "DB. Value");
      const { session } = getServices();

      // No session, no live overlay → persisted value counts.
      let progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
      expect(group(progress, "general_information")!.completed).toBe(1);

      session.activate(inspectionId);
      session.stageFieldValue(inspectorId, "Staged Value");
      try {
        // An empty live value must outrank the non-empty staged value.
        liveValues().setFieldValue(inspectorId, "");
        progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
        expect(group(progress, "general_information")!.completed).toBe(0);

        liveValues().setFieldValue(inspectorId, "Typed Value");
        progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
        expect(group(progress, "general_information")!.completed).toBe(1);

        liveValues().setFieldValue(inspectorId, "");
        progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
        expect(group(progress, "general_information")!.completed).toBe(0);
      } finally {
        liveValues().reset();
        session.deactivate();
      }
    });

    it("a live-typed device count changes the device denominator before any write", async () => {
      const inspectionId = await createInspection();
      const countField = await fieldId(db, "camera_information", "camera_count");
      liveValues().setFieldValue(countField, "2");
      try {
        const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
        // 2 devices × 9 fields = 18, reflected live before any DB write.
        expect(group(progress, "default_devices")!.total).toBe(18);
        const camera = sectionOf(progress, "camera_information")!;
        expect(camera.total).toBe(18);
        expect(camera.devices!.length).toBe(2);
        expect(camera.devices![1].deviceNo).toBe(2);
      } finally {
        liveValues().reset();
      }
    });

    it("pending device overlay is retained during the in-flight persist window", async () => {
      jest.useFakeTimers();
      const inspectionId = await createInspection();
      await setValue(db, inspectionId, await fieldId(db, "camera_information", "camera_count"), "1");

      const { recordsRepo } = getServices();
      const originalCreate = recordsRepo.create;
      let releaseCreate!: () => void;
      const createGate = new Promise<void>((resolve) => { releaseCreate = resolve; });
      jest.spyOn(recordsRepo, "create").mockImplementation(async (...args: any[]) => {
        await createGate;
        return originalCreate(args[0] as any);
      });

      try {
        await recordsRepo.scheduleDeviceRecordSave({
          InspectionID: inspectionId,
          DeviceType: "Camera",
          DeviceNo: 1,
          DeviceData: JSON.stringify(fullCameraData()),
          DisplayOrder: 1,
          IsActive: 1,
        } as any);

        // Fire the debounce; persist() suspends on createGate, so the write is
        // still in flight and the database does NOT hold the row yet.
        jest.advanceTimersByTime(500);
        expect(recordsRepo.getPendingDeviceRecords().length).toBe(1);

        const progress = await getServices().progressService.getInspectionProgress(inspectionId, 1);
        expect(group(progress, "default_devices")!.completed).toBe(9);

        const rows = await db.getAllAsync<Row>("SELECT * FROM DeviceRecords");
        expect(rows.length).toBe(0);

        releaseCreate();
        jest.useRealTimers();
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));

        expect(recordsRepo.getPendingDeviceRecords().length).toBe(0);
        const afterRows = await db.getAllAsync<Row>("SELECT * FROM DeviceRecords");
        expect(afterRows.length).toBe(1);
      } finally {
        jest.restoreAllMocks();
        jest.useRealTimers();
      }
    });
  });
});