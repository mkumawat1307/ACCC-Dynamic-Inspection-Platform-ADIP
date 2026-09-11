import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const cameraCountField = {
  FieldID: 100,
  FieldKey: "camera_count",
  FieldName: "Camera Count",
  FieldType: "number",
  IsRequired: 0,
  IsActive: 1,
  DefaultValue: "0",
  Placeholder: "0",
  HelpText: "",
};

const nvrCountField = {
  FieldID: 101,
  FieldKey: "nvr_count",
  FieldName: "NVR Count",
  FieldType: "number",
  IsRequired: 0,
  IsActive: 1,
  DefaultValue: "0",
  Placeholder: "0",
  HelpText: "",
};

jest.mock("react-native-paper", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    TextInput: (props: any) => R.createElement(RN.TextInput, props, props.label),
    HelperText: (props: any) => R.createElement(RN.Text, null, props.children),
    Text: (props: any) => R.createElement(RN.Text, props),
  };
});

jest.mock("react-native-element-dropdown", () => ({
  Dropdown: (props: any) => {
    const R = require("react");
    return R.createElement("Dropdown", props);
  },
}));

jest.mock("@/src/database/repositories/InspectionFieldRepository", () => ({
  __esModule: true,
  default: {
    getFieldsBySection: jest.fn().mockResolvedValue([cameraCountField]),
    getFieldOptions: jest.fn().mockResolvedValue([]),
    getFieldOptionsBySection: jest.fn().mockResolvedValue(new Map()),
  },
}));

jest.mock("@/src/database/repositories/InspectionValueRepository", () => ({
  __esModule: true,
  default: {
    saveValue: jest.fn().mockResolvedValue(undefined),
    getValue: jest.fn().mockResolvedValue(null),
    getValuesByInspection: jest.fn().mockResolvedValue(new Map()),
  },
}));

jest.mock("@/src/database/repositories/DeviceFieldDefinitionsRepository", () => ({
  __esModule: true,
  default: { getDeviceTypes: jest.fn().mockResolvedValue(["Camera"]) },
}));

jest.mock("@/src/database/repositories/ProjectDeviceTypesRepository", () => ({
  __esModule: true,
  default: { getRequired: jest.fn().mockResolvedValue([]) },
}));

jest.mock("@/src/context/InspectionContext", () => ({
  useInspection: () => ({ poleId: "P123" }),
}));

jest.mock("@/src/context/InspectionScrollContext", () => ({
  useInspectionScroll: () => ({
    scrollViewRef: { current: { scrollTo: jest.fn() } },
    scrollOffsetRef: { current: 0 },
    setDropdownOpen: jest.fn(),
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/components/inspection/DeviceSection", () => {
  const R = require("react");
  return { __esModule: true, default: () => R.createElement("DeviceSection") };
});

jest.mock("@/src/components/inspection/PhotoSection", () => {
  const R = require("react");
  return { __esModule: true, default: () => R.createElement("PhotoSection") };
});

jest.mock("@/src/components/inspection/renderFieldInput", () => {
  const actual = jest.requireActual("@/src/components/inspection/renderFieldInput");
  return { ...actual };
});

jest.mock("@/src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import SectionRenderer from "@/src/components/inspection/SectionRenderer";

function containsExact(
  node: unknown,
  target: string,
  seen: Set<object> = new Set()
): boolean {
  if (node === null || typeof node !== "object") {
    return node === target;
  }
  if (seen.has(node as object)) {
    return false;
  }
  seen.add(node as object);
  const values: unknown[] = Array.isArray(node) ? node : Object.values(node);
  return values.some((v) => containsExact(v, target, seen));
}

function hasStar(tree: ReturnType<typeof TestRenderer.create>): boolean {
  return containsExact(tree.toJSON(), "*");
}

describe("SectionRenderer required indicator — device-level IsRequired drives the count-field asterisk", () => {
  beforeEach(() => {
    (require("@/src/database/repositories/ProjectDeviceTypesRepository").default
      .getRequired as jest.Mock).mockResolvedValue([]);
  });

  it("camera_count shows the required star when Camera is Required ON", async () => {
    (require("@/src/database/repositories/ProjectDeviceTypesRepository").default
      .getRequired as jest.Mock).mockResolvedValue(["Camera"]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer
          inspectionId={1}
          sectionId={1}
          sectionKey="camera_information"
          templateId={1}
        />
      );
    });

    expect(hasStar(tree)).toBe(true);
  });

  it("camera_count shows no star when Camera is not required", async () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer
          inspectionId={1}
          sectionId={1}
          sectionKey="camera_information"
          templateId={1}
        />
      );
    });

    expect(hasStar(tree)).toBe(false);
  });

  it("custom device nvr_count shows the star when NVR is Required ON", async () => {
    const fieldRepo = require("@/src/database/repositories/InspectionFieldRepository").default;
    (fieldRepo.getFieldsBySection as jest.Mock).mockResolvedValue([nvrCountField]);
    const ddfRepo =
      require("@/src/database/repositories/DeviceFieldDefinitionsRepository").default;
    (ddfRepo.getDeviceTypes as jest.Mock).mockResolvedValue(["NVR"]);
    (require("@/src/database/repositories/ProjectDeviceTypesRepository").default
      .getRequired as jest.Mock).mockResolvedValue(["NVR"]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer
          inspectionId={1}
          sectionId={2}
          sectionKey="nvr_information"
          templateId={1}
        />
      );
    });

    expect(hasStar(tree)).toBe(true);
  });
});