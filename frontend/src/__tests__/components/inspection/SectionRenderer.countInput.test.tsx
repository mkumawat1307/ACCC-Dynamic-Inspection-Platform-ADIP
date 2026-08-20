import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const countField = {
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

jest.mock("react-native-paper", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    TextInput: (props: any) => R.createElement(RN.TextInput, props),
    HelperText: (props: any) => R.createElement(RN.Text, null, props.children),
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
    getFieldsBySection: jest.fn().mockResolvedValue([countField]),
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

jest.mock("@/src/context/InspectionContext", () => ({
  useInspection: () => ({ poleId: "P123" }),
}));

jest.mock("@/src/context/InspectionScrollContext", () => ({
  useInspectionScroll: () => ({
    scrollViewRef: { current: { scrollTo: jest.fn() } },
    scrollOffsetRef: { current: 0 },
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/components/inspection/DeviceSection", () => {
  const R = require("react");
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: { count: number; deviceType: string; inspectionId: number }) =>
      R.createElement(View, { testID: `device-section-${props.deviceType}` },
        R.createElement(Text, { testID: "device-count" }, String(props.count)),
      ),
  };
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

function findCountInput(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findByType(require("react-native").TextInput) as unknown as {
    props: { value: string; onChangeText: (text: string) => void };
  };
}

function hasDeviceSection(tree: ReturnType<typeof TestRenderer.create>): boolean {
  return tree.root.findAll((n) => n.props.testID === "device-section-Camera").length > 0;
}

describe("SectionRenderer count input — transient empty string fix", () => {
  it("3 → '' → 1: device section stays mounted during transient empty", async () => {
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

    const input = findCountInput(tree);
    expect(input).toBeTruthy();

    await act(async () => { input!.props.onChangeText("3"); });
    expect(hasDeviceSection(tree)).toBe(true);

    await act(async () => { input!.props.onChangeText(""); });
    expect(hasDeviceSection(tree)).toBe(true);

    await act(async () => { input!.props.onChangeText("1"); });
    expect(hasDeviceSection(tree)).toBe(true);
  });

  it("1 → '' → 2: no unmount during transient empty", async () => {
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

    const input = findCountInput(tree)!;
    await act(async () => { input.props.onChangeText("1"); });
    expect(hasDeviceSection(tree)).toBe(true);

    await act(async () => { input.props.onChangeText(""); });
    expect(hasDeviceSection(tree)).toBe(true);

    await act(async () => { input.props.onChangeText("2"); });
    expect(hasDeviceSection(tree)).toBe(true);
  });

  it("2 → '' → 3: no unmount during transient empty", async () => {
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

    const input = findCountInput(tree)!;
    await act(async () => { input.props.onChangeText("2"); });
    expect(hasDeviceSection(tree)).toBe(true);

    await act(async () => { input.props.onChangeText(""); });
    expect(hasDeviceSection(tree)).toBe(true);

    await act(async () => { input.props.onChangeText("3"); });
    expect(hasDeviceSection(tree)).toBe(true);
  });

  it("3 → '' → 0: committed count becomes 0 (legitimate)", async () => {
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

    const input = findCountInput(tree)!;
    await act(async () => { input.props.onChangeText("3"); });
    expect(hasDeviceSection(tree)).toBe(true);

    await act(async () => { input.props.onChangeText(""); });
    expect(hasDeviceSection(tree)).toBe(true);

    await act(async () => { input.props.onChangeText("0"); });
    expect(hasDeviceSection(tree)).toBe(false);
  });

  it("input displays transient empty while device section stays mounted", async () => {
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

    const input = findCountInput(tree)!;
    await act(async () => { input.props.onChangeText("5"); });
    expect(hasDeviceSection(tree)).toBe(true);

    await act(async () => { input.props.onChangeText(""); });
    expect(input.props.value).toBe("");
    expect(hasDeviceSection(tree)).toBe(true);
  });
});
