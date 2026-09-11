import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("react-native-paper", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    Text: RN.Text,
    TextInput: (props: any) => R.createElement(RN.TextInput, props),
    Button: (props: any) => R.createElement(RN.Text, { ...props, accessible: true }, props.children),
    HelperText: (props: any) => R.createElement(RN.Text, null, props.children),
    Checkbox: { Item: (props: any) => R.createElement("CheckboxItem", props) },
    Switch: (props: any) => R.createElement("Switch", props),
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
    getFieldsBySection: jest.fn().mockResolvedValue([]),
    getFieldOptions: jest.fn().mockResolvedValue([]),
    getFieldOptionsBySection: jest.fn().mockResolvedValue(new Map()),
  },
}));

jest.mock("@/src/database/repositories/InspectionValueRepository", () => ({
  __esModule: true,
  default: {
    saveValue: jest.fn().mockResolvedValue(undefined),
    getValue: jest.fn().mockResolvedValue(null),
    getValuesByInspection: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("@/src/database/repositories/DeviceFieldDefinitionsRepository", () => ({
  __esModule: true,
  default: { getDeviceTypes: jest.fn().mockResolvedValue([]) },
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

jest.mock("@/src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import SectionRenderer from "@/src/components/inspection/SectionRenderer";
import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";
import InspectionValueRepository from "@/src/database/repositories/InspectionValueRepository";

const fieldRepo = InspectionFieldRepository as jest.Mocked<typeof InspectionFieldRepository>;
const valueRepo = InspectionValueRepository as jest.Mocked<typeof InspectionValueRepository>;

const EXTRA_FIELD_FIELDS = { SectionID: 1, ValidationRule: null, DisplayOrder: 1, IsVisible: 1 };

const dropdownField = {
  FieldID: 10, FieldKey: "power_cable_status", FieldName: "Power Cable Status",
  FieldType: "dropdown", IsRequired: 0, IsActive: 1, DefaultValue: null,
  Placeholder: null, HelpText: null, ...EXTRA_FIELD_FIELDS,
};

const customDropdownField = {
  FieldID: 20, FieldKey: "custom_rating", FieldName: "Custom Rating",
  FieldType: "dropdown", IsRequired: 0, IsActive: 1, DefaultValue: null,
  Placeholder: null, HelpText: null, ...EXTRA_FIELD_FIELDS,
};

function createDropdownOptions() {
  return [
    { OptionID: 1, FieldID: 10, OptionLabel: "Overhead", OptionValue: "Overhead", IsDefault: 0, DisplayOrder: 1 },
    { OptionID: 2, FieldID: 10, OptionLabel: "Underground", OptionValue: "Underground", IsDefault: 0, DisplayOrder: 2 },
    { OptionID: 3, FieldID: 10, OptionLabel: "On Ground", OptionValue: "On Ground", IsDefault: 0, DisplayOrder: 3 },
    { OptionID: 4, FieldID: 10, OptionLabel: "Not Verified", OptionValue: "Not Verified", IsDefault: 1, DisplayOrder: 4 },
  ];
}

function createCustomOptions() {
  return [
    { OptionID: 21, FieldID: 20, OptionLabel: "Alpha", OptionValue: "Alpha", IsDefault: 0, DisplayOrder: 1 },
    { OptionID: 22, FieldID: 20, OptionLabel: "Beta", OptionValue: "Beta", IsDefault: 0, DisplayOrder: 2 },
  ];
}

function findDropdown(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAll(
    (n) => (n as { type?: unknown }).type === "Dropdown"
  )[0] as unknown as {
    props: {
      value: string;
      data: Array<{ label: string; value: string; isClear?: boolean }>;
      onChange: (item: any) => void;
    };
  };
}

function savedValue(fieldId: number, fieldValue: string) {
  return {
    ValueID: fieldId,
    InspectionID: 42,
    FieldID: fieldId,
    FieldValue: fieldValue,
    CreatedAt: "",
    UpdatedAt: "",
  };
}

describe("SectionRenderer dropdown clear selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    valueRepo.saveValue.mockResolvedValue(undefined);
    valueRepo.getValuesByInspection.mockResolvedValue([]);
    fieldRepo.getFieldOptions.mockResolvedValue([]);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map());
  });

  it("NEW: selecting then clearing a dropdown persists the empty value (never a fake option)", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField]);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, createDropdownOptions()]]));

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionRenderer inspectionId={42} sectionId={1} />);
    });

    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 10, "Not Verified");
    valueRepo.saveValue.mockClear();

    let dd = findDropdown(tree);
    expect(dd.props.value).toBe("Not Verified");
    expect(dd.props.data).toHaveLength(5);
    const clear = dd.props.data[4];
    expect(clear.isClear).toBe(true);
    expect(clear.label).toBe("Clear selection");

    await act(async () => {
      dd.props.onChange({ label: "Underground", value: "Underground" });
    });
    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 10, "Underground");

    dd = findDropdown(tree);
    expect(dd.props.value).toBe("Underground");

    valueRepo.saveValue.mockClear();
    await act(async () => {
      dd.props.onChange(clear);
    });
    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 10, "");
    expect(
      valueRepo.saveValue.mock.calls.some((call) => call[2] === clear.value)
    ).toBe(false);

    dd = findDropdown(tree);
    expect(dd.props.value).toBe("");
    expect(dd.props.data).toHaveLength(4);
    expect(dd.props.data.some((i) => i.isClear === true)).toBe(false);
    expect(dd.props.data.map((i) => i.label)).toEqual([
      "Overhead", "Underground", "On Ground", "Not Verified",
    ]);
  });

  it("EXISTING: clearing a saved dropdown persists empty; reopen stays empty (current default NOT shown)", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField]);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, createDropdownOptions()]]));
    valueRepo.getValuesByInspection.mockResolvedValue([savedValue(10, "Overhead")]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionRenderer inspectionId={42} sectionId={1} existing />);
    });

    expect(valueRepo.saveValue).not.toHaveBeenCalled();
    let dd = findDropdown(tree);
    expect(dd.props.value).toBe("Overhead");
    expect(dd.props.data).toHaveLength(5);

    const clear = dd.props.data[4];
    await act(async () => {
      dd.props.onChange(clear);
    });
    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 10, "");

    dd = findDropdown(tree);
    expect(dd.props.value).toBe("");
    expect(dd.props.data).toHaveLength(4);

    valueRepo.saveValue.mockClear();
    valueRepo.getValuesByInspection.mockResolvedValue([]);

    let reopened!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      reopened = TestRenderer.create(<SectionRenderer inspectionId={42} sectionId={1} existing />);
    });
    const reopenedDd = findDropdown(reopened);
    expect(reopenedDd.props.value).toBe("");
    expect(valueRepo.saveValue).not.toHaveBeenCalled();
  });

  it("custom section: dropdown clear works and configured options stay fully listed", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([customDropdownField]);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[20, createCustomOptions()]]));

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionRenderer inspectionId={42} sectionId={7} />);
    });

    let dd = findDropdown(tree);
    expect(dd.props.value).toBe("");
    expect(dd.props.data).toHaveLength(2);

    await act(async () => {
      dd.props.onChange({ label: "Beta", value: "Beta" });
    });
    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 20, "Beta");

    dd = findDropdown(tree);
    expect(dd.props.data).toHaveLength(3);
    const clear = dd.props.data[2];

    await act(async () => {
      dd.props.onChange(clear);
    });
    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 20, "");

    dd = findDropdown(tree);
    expect(dd.props.value).toBe("");
    expect(dd.props.data.map((i) => i.label)).toEqual(["Alpha", "Beta"]);
  });
});