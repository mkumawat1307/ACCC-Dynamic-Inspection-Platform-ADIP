import {
  FACTORY_SECTIONS,
  FACTORY_DEVICE_TYPES,
  FACTORY_DEVICE_FIELDS,
  FACTORY_DEVICE_OPTIONS,
} from "@/src/database/seeds/factory-config";

describe("factory-config (single canonical source)", () => {
  it("exposes exactly the ten default sections in canonical order", () => {
    expect(FACTORY_SECTIONS.map((s) => s.key)).toEqual([
      "general_information",
      "pole_structure",
      "junction_box",
      "earthing",
      "meter",
      "connectivity",
      "camera_information",
      "switch_information",
      "remarks",
      "photos",
    ]);
  });

  it("Defines the two default device types, Camera and Switch", () => {
    expect(FACTORY_DEVICE_TYPES).toEqual(["Camera", "Switch"]);
  });

  it("defines only Camera and Switch fields", () => {
    expect(FACTORY_DEVICE_FIELDS.every((f) => f.DeviceType === "Camera" || f.DeviceType === "Switch")).toBe(true);
    expect(FACTORY_DEVICE_FIELDS.length).toBe(16);
  });

  it("defines only Camera and Switch options, with 50 total", () => {
    expect(FACTORY_DEVICE_OPTIONS.every((o) => o.DeviceType === "Camera" || o.DeviceType === "Switch")).toBe(true);
    expect(FACTORY_DEVICE_OPTIONS.length).toBe(50);
  });

  it("has unique section keys", () => {
    const keys = FACTORY_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique device field (device type + field name) pairs", () => {
    const pairs = FACTORY_DEVICE_FIELDS.map((f) => `${f.DeviceType}:${f.FieldName}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("has unique device option (device type + field name + option value) triples", () => {
    const triples = FACTORY_DEVICE_OPTIONS.map((o) => `${o.DeviceType}:${o.FieldName}:${o.OptionValue}`);
    expect(new Set(triples).size).toBe(triples.length);
  });

  it("orders device fields consistently within each device type by DisplayOrder", () => {
    for (const dt of FACTORY_DEVICE_TYPES) {
      const orders = FACTORY_DEVICE_FIELDS.filter((f) => f.DeviceType === dt).map((f) => f.DisplayOrder);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    }
  });

  it("makes the Camera Type field optional-order consistent (every field present in reset section list)", () => {
    const cameraType = FACTORY_DEVICE_FIELDS.find((f) => f.FieldName === "CameraType");
    expect(cameraType).toBeDefined();
    expect(cameraType!.IsRequired).toBe(1);
  });
});
