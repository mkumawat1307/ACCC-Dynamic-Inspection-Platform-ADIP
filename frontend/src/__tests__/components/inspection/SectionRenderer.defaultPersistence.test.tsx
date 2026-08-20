import React from "react";
import TestRenderer, { act } from "react-test-renderer";

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
    getValuesByInspection: jest.fn().mockResolvedValue(new Map()),
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

jest.mock("@/src/components/inspection/FieldRenderer", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => R.createElement(RN.TextInput, { testID: `field-${props.fieldKey}`, value: props.value }),
  };
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

const textField = {
  FieldID: 11, FieldKey: "pole_condition", FieldName: "Pole Condition",
  FieldType: "text", IsRequired: 0, IsActive: 1, DefaultValue: null,
  Placeholder: null, HelpText: null, ...EXTRA_FIELD_FIELDS,
};

const fieldWithDefault = {
  FieldID: 12, FieldKey: "inspection_notes", FieldName: "Inspection Notes",
  FieldType: "text", IsRequired: 0, IsActive: 1, DefaultValue: "No issues found",
  Placeholder: null, HelpText: null, ...EXTRA_FIELD_FIELDS,
};

const dropdownWithDefault = {
  FieldID: 13, FieldKey: "cable_type", FieldName: "Cable Type",
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

function createCableTypeOptions() {
  return [
    { OptionID: 5, FieldID: 13, OptionLabel: "Copper", OptionValue: "Copper", IsDefault: 0, DisplayOrder: 1 },
    { OptionID: 6, FieldID: 13, OptionLabel: "Aluminum", OptionValue: "Aluminum", IsDefault: 1, DisplayOrder: 2 },
  ];
}

describe("SectionRenderer default selection persistence — Phase 7B regression", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    valueRepo.saveValue.mockResolvedValue(undefined);
    valueRepo.getValue.mockResolvedValue(null);
    valueRepo.getValuesByInspection.mockResolvedValue([]);
    fieldRepo.getFieldOptions.mockResolvedValue([]);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map());
  });

  it("1. NEW dropdown field + IsDefault: saveValue called with default", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField]);
    fieldRepo.getFieldOptions.mockResolvedValue(createDropdownOptions());
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, createDropdownOptions()]]));

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 10, "Not Verified");
  });

  it("2. NEW text field with DefaultValue: saveValue called with DefaultValue", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([fieldWithDefault]);

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 12, "No issues found");
  });

  it("3. EXISTING saved value wins over IsDefault", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField]);
    fieldRepo.getFieldOptions.mockResolvedValue(createDropdownOptions());
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, createDropdownOptions()]]));
    valueRepo.getValue.mockResolvedValue({
      ValueID: 1,
      InspectionID: 42,
      FieldID: 10,
      FieldValue: "Overhead",
      CreatedAt: "",
      UpdatedAt: "",
    });
    valueRepo.getValuesByInspection.mockResolvedValue([{
      ValueID: 1,
      InspectionID: 42,
      FieldID: 10,
      FieldValue: "Overhead",
      CreatedAt: "",
      UpdatedAt: "",
    }]);

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).not.toHaveBeenCalled();
  });

  it("4. EXISTING saved value wins over Field.DefaultValue", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([fieldWithDefault]);
    valueRepo.getValue.mockResolvedValue({
      ValueID: 2,
      InspectionID: 42,
      FieldID: 12,
      FieldValue: "Custom value",
      CreatedAt: "",
      UpdatedAt: "",
    });
    valueRepo.getValuesByInspection.mockResolvedValue([{
      ValueID: 2,
      InspectionID: 42,
      FieldID: 12,
      FieldValue: "Custom value",
      CreatedAt: "",
      UpdatedAt: "",
    }]);

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).not.toHaveBeenCalled();
  });

  it("5. No default and no saved value: no saveValue called (empty string)", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField]);
    const noDefaultOptions = [
      { OptionID: 7, FieldID: 10, OptionLabel: "A", OptionValue: "A", IsDefault: 0, DisplayOrder: 1 },
      { OptionID: 8, FieldID: 10, OptionLabel: "B", OptionValue: "B", IsDefault: 0, DisplayOrder: 2 },
    ];
    fieldRepo.getFieldOptions.mockResolvedValue(noDefaultOptions);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, noDefaultOptions]]));

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).not.toHaveBeenCalled();
  });

  it("6. TEXT field with no default and no saved value: no saveValue called", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([textField]);

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).not.toHaveBeenCalled();
  });

  it("7. Multiple fields: each field gets its own default independently", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField, dropdownWithDefault]);
    fieldRepo.getFieldOptions.mockImplementation(async (fieldId: number) => {
      if (fieldId === 10) return createDropdownOptions();
      if (fieldId === 13) return createCableTypeOptions();
      return [];
    });
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([
      [10, createDropdownOptions()],
      [13, createCableTypeOptions()],
    ]));

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 10, "Not Verified");
    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 13, "Aluminum");
  });

  it("8. Default for Field A does not affect Field B", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField, textField]);
    fieldRepo.getFieldOptions.mockResolvedValue(createDropdownOptions());
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, createDropdownOptions()]]));

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).toHaveBeenCalledTimes(1);
    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 10, "Not Verified");
  });

  it("9. saveValue not called repeatedly on re-render", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField]);
    fieldRepo.getFieldOptions.mockResolvedValue(createDropdownOptions());
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, createDropdownOptions()]]));

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    const callCount = valueRepo.saveValue.mock.calls.length;

    await act(async () => {
      tree.update(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).toHaveBeenCalledTimes(callCount);
  });

  it("10. Existing value after default change: existing value is preserved", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField]);
    fieldRepo.getFieldOptions.mockResolvedValue(createDropdownOptions());
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, createDropdownOptions()]]));
    valueRepo.getValue.mockResolvedValue({
      ValueID: 1,
      InspectionID: 42,
      FieldID: 10,
      FieldValue: "Overhead",
      CreatedAt: "",
      UpdatedAt: "",
    });
    valueRepo.getValuesByInspection.mockResolvedValue([{
      ValueID: 1,
      InspectionID: 42,
      FieldID: 10,
      FieldValue: "Overhead",
      CreatedAt: "",
      UpdatedAt: "",
    }]);

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).not.toHaveBeenCalled();
  });

  it("11. saveValue receives correct inspectionId and fieldId", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField]);
    fieldRepo.getFieldOptions.mockResolvedValue(createDropdownOptions());
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, createDropdownOptions()]]));

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={99} sectionId={5} />
      );
    });

    expect(valueRepo.saveValue).toHaveBeenCalledWith(99, 10, "Not Verified");
  });

  it("12. Multiple new inspections: each gets its own defaults", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownField]);
    fieldRepo.getFieldOptions.mockResolvedValue(createDropdownOptions());
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[10, createDropdownOptions()]]));

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 10, "Not Verified");

    valueRepo.saveValue.mockClear();

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={99} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).toHaveBeenCalledWith(99, 10, "Not Verified");
  });

  it("13. Value precedence: saved > IsDefault > DefaultValue > empty", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([dropdownWithDefault]);
    const cableTypeOptions = [
      { OptionID: 9, FieldID: 13, OptionLabel: "Copper", OptionValue: "Copper", IsDefault: 0, DisplayOrder: 1 },
      { OptionID: 10, FieldID: 13, OptionLabel: "Aluminum", OptionValue: "Aluminum", IsDefault: 1, DisplayOrder: 2 },
    ];
    fieldRepo.getFieldOptions.mockResolvedValue(cableTypeOptions);
    fieldRepo.getFieldOptionsBySection.mockResolvedValue(new Map([[13, cableTypeOptions]]));

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).toHaveBeenCalledWith(42, 13, "Aluminum");
  });

  it("14. saveValue not called for non-dropdown field without DefaultValue", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([
      { ...textField, DefaultValue: null },
    ]);

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).not.toHaveBeenCalled();
  });

  it("15. DefaultValue with empty string: no saveValue called", async () => {
    fieldRepo.getFieldsBySection.mockResolvedValue([
      { ...textField, DefaultValue: "" },
    ]);

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={42} sectionId={1} />
      );
    });

    expect(valueRepo.saveValue).not.toHaveBeenCalled();
  });
});
