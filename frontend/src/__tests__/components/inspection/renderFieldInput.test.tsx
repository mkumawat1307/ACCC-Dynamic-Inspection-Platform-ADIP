import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { FieldInput } from "@/src/components/inspection/renderFieldInput";
import { InspectionScrollProvider } from "@/src/context/InspectionScrollContext";

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
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderNumber(params: Partial<React.ComponentProps<typeof FieldInput>> = {}) {
  const onChange = jest.fn();
  const onCameraCountChange = jest.fn();
  const onSwitchCountChange = jest.fn();
  const setDropdownFocus = jest.fn();
  const props = {
    fieldType: "number",
    label: "Voltage",
    value: "",
    editable: true,
    placeholder: "",
    error: undefined,
    options: [],
    dropdownFocus: false,
    setDropdownFocus,
    onChange,
    onCameraCountChange,
    onSwitchCountChange,
    ...params,
  };
  let tree!: ReturnType<typeof TestRenderer.create>;
  act(() => {
    tree = TestRenderer.create(
      <InspectionScrollProvider>
        <FieldInput {...props} />
      </InspectionScrollProvider>
    );
  });
  return { tree, onChange, onCameraCountChange, onSwitchCountChange };
}

function findInput(tree: ReturnType<typeof TestRenderer.create>) {
  const node = tree.root.findAll((n) => (n as { type?: unknown }).type === "TextInput")[0];
  return node as unknown as {
    props: { onChangeText: (text: string) => void };
  };
}

describe("FieldInput NUMBER", () => {
  it("renders a TextInput with decimal-pad keyboard", () => {
    const { tree } = renderNumber();
    const inputs = tree.root.findAll((n) => (n as { type?: unknown }).type === "TextInput");
    expect(inputs.length).toBe(1);
    expect(inputs[0].props.keyboardType).toBe("decimal-pad");
  });

  it("sanitizes a decimal value typed into the field", () => {
    const { tree, onChange } = renderNumber({ value: "12.5" });
    const input = findInput(tree);
    input.props.onChangeText("12.5");
    expect(onChange).toHaveBeenCalledWith("12.5");
  });

  it("keeps empty string as empty (distinct from 0)", () => {
    const { tree, onChange } = renderNumber({ value: "" });
    const input = findInput(tree);
    input.props.onChangeText("");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("camera_count uses integer-only sanitization and reports numeric count", () => {
    const { tree, onChange, onCameraCountChange } = renderNumber({
      fieldKey: "camera_count",
      value: "1",
    });
    const input = findInput(tree);
    input.props.onChangeText("12.9");
    expect(onChange).toHaveBeenCalledWith("129");
    expect(onCameraCountChange).toHaveBeenCalledWith(129);
  });

  it("camera_count cleared maps empty to count 0 but stores empty", () => {
    const { tree, onChange, onCameraCountChange } = renderNumber({
      fieldKey: "camera_count",
      value: "1",
    });
    const input = findInput(tree);
    input.props.onChangeText("");
    expect(onChange).toHaveBeenCalledWith("");
    expect(onCameraCountChange).toHaveBeenCalledWith(0);
  });
});