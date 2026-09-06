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

const activeTextField = {
  FieldID: 5, FieldKey: "note", FieldName: "Note",
  FieldType: "text", IsRequired: 0, IsActive: 1, DefaultValue: null,
  Placeholder: null, HelpText: null, ...EXTRA_FIELD_FIELDS,
};

const deletedTextField = {
  FieldID: 30, FieldKey: "old_level", FieldName: "Old Level",
  FieldType: "text", IsRequired: 0, IsActive: 0, DefaultValue: null,
  Placeholder: null, HelpText: null, ...EXTRA_FIELD_FIELDS,
};

const deletedDropdownField = {
  FieldID: 40, FieldKey: "old_status", FieldName: "Old Status",
  FieldType: "dropdown", IsRequired: 0, IsActive: 0, DefaultValue: null,
  Placeholder: null, HelpText: null, ...EXTRA_FIELD_FIELDS,
};

function findTextInputs(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  return tree.root.findAll((n) => {
    if ((n as { type?: unknown }).type !== "TextInput") return false;
    return (n.props as { label?: string }).label === label;
  }) as unknown as Array<{
    props: { label: string; value?: string; editable?: boolean; onChangeText: (text: string) => void };
  }>;
}

function findDropdowns(tree: ReturnType<typeof TestRenderer.create>, value: string) {
  return tree.root.findAll((n) => {
    if ((n as { type?: unknown }).type !== "Dropdown") return false;
    return (n.props as { value?: string }).value === value;
  }) as unknown as Array<{
    props: {
      value: string;
      data: Array<{ label: string; value: string; isClear?: boolean }>;
      onChange: (item: any) => void;
    };
  }>;
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

describe("SectionRenderer — deleted standard fields stay EDITABLE for historical inspections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    valueRepo.saveValue.mockResolvedValue(undefined);
    valueRepo.getValuesByInspection.mockResolvedValue([]);
    fieldRepo.getFieldOptions.mockResolvedValue([]);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map());
  });

  it("renders a deleted text field editable, labeled 'Deleted <Name>', with its historical value", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([activeTextField, deletedTextField]);
    valueRepo.getValuesByInspection.mockResolvedValue([savedValue(30, "5")]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionRenderer inspectionId={42} sectionId={1} existing />);
    });

    const inputs = findTextInputs(tree, "Deleted Old Level");
    expect(inputs).toHaveLength(1);
    expect(inputs[0].props.value).toBe("5");
    expect(inputs[0].props.editable).not.toBe(false);
  });

  it("a deleted dropdown field is editable — its historical option is selectable (Clear selection row present)", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([activeTextField, deletedDropdownField]);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(
      new Map([[40, [{ OptionID: 41, FieldID: 40, OptionLabel: "Special Old", OptionValue: "Special Old", IsDefault: 0, DisplayOrder: 1 }]]])
    );
    valueRepo.getValuesByInspection.mockResolvedValue([savedValue(40, "Special Old")]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionRenderer inspectionId={42} sectionId={1} existing />);
    });

    const dropdowns = findDropdowns(tree, "Special Old");
    expect(dropdowns).toHaveLength(1);
    const labels = dropdowns[0].props.data.map((i) => i.label);
    expect(labels).toContain("Special Old");
    expect(dropdowns[0].props.data.some((i) => i.isClear === true)).toBe(true);
  });

  it("editing a deleted field's historical value persists the change", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([activeTextField, deletedTextField]);
    valueRepo.getValuesByInspection.mockResolvedValue([savedValue(30, "5")]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionRenderer inspectionId={42} sectionId={1} existing />);
    });

    const inputs = findTextInputs(tree, "Deleted Old Level");
    await act(async () => {
      inputs[0].props.onChangeText("9");
    });
    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 30, "9");
  });

  it("clearing a deleted dropdown field persists an empty value (no fake option saved)", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([activeTextField, deletedDropdownField]);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(
      new Map([[40, [{ OptionID: 41, FieldID: 40, OptionLabel: "Special Old", OptionValue: "Special Old", IsDefault: 0, DisplayOrder: 1 }]]])
    );
    valueRepo.getValuesByInspection.mockResolvedValue([savedValue(40, "Special Old")]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionRenderer inspectionId={42} sectionId={1} existing />);
    });

    valueRepo.saveValue.mockClear();
    const dropdowns = findDropdowns(tree, "Special Old");
    const clear = dropdowns[0].props.data.find((i) => i.isClear === true);
    await act(async () => {
      dropdowns[0].props.onChange(clear);
    });
    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 40, "");
    expect(
      valueRepo.saveValue.mock.calls.some((call) => call[2] === "__dropdown_clear__")
    ).toBe(false);
  });
});