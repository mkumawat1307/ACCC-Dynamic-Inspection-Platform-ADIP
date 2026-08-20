import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  FieldInput,
} from "@/src/components/inspection/renderFieldInput";

jest.mock("react-native-paper", () => {
  const ReactPaper = require("react");
  const { Text } = require("react-native");
  return {
    Text,
    TextInput: (props: Record<string, unknown>) =>
      ReactPaper.createElement("TextInput", props),
    Checkbox: {
      Item: (props: Record<string, unknown>) =>
        ReactPaper.createElement("CheckboxItem", props),
    },
    Switch: (props: Record<string, unknown>) =>
      ReactPaper.createElement("Switch", props),
  };
});

jest.mock("react-native-element-dropdown", () => ({
  Dropdown: (props: any) => {
    const ReactMock = require("react");
    return ReactMock.createElement("Dropdown", props);
  },
}));

jest.mock("@/src/context/InspectionScrollContext", () => ({
  useInspectionScroll: () => ({
    scrollViewRef: { current: null },
    scrollOffsetRef: { current: 0 },
    setDropdownOpen: jest.fn(),
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderDropdown(params: Partial<React.ComponentProps<typeof FieldInput>> = {}) {
  const onChange = jest.fn();
  const setDropdownFocus = jest.fn();
  const props = {
    fieldType: "dropdown",
    label: "Camera Type",
    value: "",
    editable: true,
    placeholder: "Select",
    error: undefined,
    options: [
      { label: "PTZ", value: "PTZ" },
      { label: "Fixed", value: "Fixed" },
      { label: "Dome", value: "Dome" },
    ],
    dropdownFocus: false,
    setDropdownFocus,
    onChange,
    ...params,
  };
  let tree!: ReturnType<typeof TestRenderer.create>;
  act(() => {
    tree = TestRenderer.create(<FieldInput {...props} />);
  });
  return { tree, onChange, setDropdownFocus };
}

function findDropdown(tree: ReturnType<typeof TestRenderer.create>) {
  const node = tree.root.findAll((n) => (n as { type?: unknown }).type === "Dropdown")[0];
  return node as unknown as {
    props: {
      onFocus: () => void;
      onChange: (item: { value: string }) => void;
      data: Array<{ label: string; value: string }>;
      disable: boolean;
    };
  };
}

describe("FieldInput dropdown component", () => {
  it("renders dropdown options and honors the editable flag", () => {
    const { tree } = renderDropdown();
    const dropdown = findDropdown(tree);
    expect(dropdown.props.data).toHaveLength(3);
    expect(dropdown.props.disable).toBe(false);

    const disabledTree = renderDropdown({ editable: false });
    expect(findDropdown(disabledTree.tree).props.disable).toBe(true);
  });

  it("selecting an option calls onChange with the value and closes the dropdown", () => {
    const { tree, onChange, setDropdownFocus } = renderDropdown();

    act(() => {
      findDropdown(tree).props.onChange({ value: "PTZ" });
    });

    expect(onChange).toHaveBeenCalledWith("PTZ");
    expect(setDropdownFocus).toHaveBeenCalledWith(false);
  });

  it("focusing the dropdown marks it focused", () => {
    const { tree, setDropdownFocus } = renderDropdown();

    act(() => {
      findDropdown(tree).props.onFocus();
    });

    expect(setDropdownFocus).toHaveBeenCalledWith(true);
  });
});