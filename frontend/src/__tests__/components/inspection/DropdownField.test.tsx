import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import DropdownField from "@/src/components/inspection/DropdownField";

jest.mock("react-native-element-dropdown", () => ({
  Dropdown: (props: any) => {
    const R = require("react");
    return R.createElement("Dropdown", props);
  },
}));

const OPTIONS = [
  { label: "Overhead", value: "Overhead" },
  { label: "Underground", value: "Underground" },
];

function findDropdown(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAll(
    (n) => (n as { type?: unknown }).type === "Dropdown"
  )[0] as unknown as {
    props: {
      data: Array<{ label: string; value: string; isClear?: boolean }>;
      value: unknown;
      disable?: boolean;
      renderItem: (item: any, selected?: boolean) => React.ReactNode;
      onChange: (item: any) => void;
      onFocus?: () => void;
      onBlur?: () => void;
    };
  };
}

function render(props: Partial<React.ComponentProps<typeof DropdownField>> = {}) {
  const onChange = jest.fn();
  const base = {
    value: "Overhead",
    options: OPTIONS,
    editable: true,
    placeholder: "Select",
    onChange,
  };
  let tree!: ReturnType<typeof TestRenderer.create>;
  act(() => {
    tree = TestRenderer.create(<DropdownField {...base} {...props} />);
  });
  return { tree, onChange };
}

describe("DropdownField clear selection", () => {
  it("renders the configured options plus a marker-based Clear selection row when a value is selected", () => {
    const { tree } = render();
    const dd = findDropdown(tree);
    expect(dd.props.data).toHaveLength(3);
    expect(dd.props.data[0]).toEqual({ label: "Overhead", value: "Overhead" });
    const clear = dd.props.data[2];
    expect(clear.label).toBe("Clear selection");
    expect(clear.isClear).toBe(true);
    expect(dd.props.value).toBe("Overhead");
  });

  it("omits the Clear selection row when the value is empty", () => {
    const { tree } = render({ value: "" });
    const dd = findDropdown(tree);
    expect(dd.props.data).toHaveLength(2);
    expect(dd.props.data.some((i) => i.isClear === true)).toBe(false);
  });

  it("omits the Clear selection row when the value is null", () => {
    const { tree } = render({ value: null });
    expect(findDropdown(tree).props.data).toHaveLength(2);
  });

  it("omits the Clear selection row when not editable", () => {
    const { tree } = render({ editable: false });
    const dd = findDropdown(tree);
    expect(dd.props.data).toHaveLength(2);
    expect(dd.props.disable).toBe(true);
  });

  it("selecting Clear selection clears the field (empty string), never the sentinel", () => {
    const { tree, onChange } = render();
    const clear = findDropdown(tree).props.data[2];
    act(() => {
      findDropdown(tree).props.onChange(clear);
    });
    expect(onChange).toHaveBeenCalledWith("");
    expect(onChange.mock.calls[0][0]).not.toBe(clear.value);
  });

  it("selecting a configured option reports its value", () => {
    const { tree, onChange } = render();
    act(() => {
      findDropdown(tree).props.onChange({ label: "Underground", value: "Underground" });
    });
    expect(onChange).toHaveBeenCalledWith("Underground");
  });

  it("detects the clear action by marker, never by label (a configured option literally named Clear selection stays selectable)", () => {
    const { tree, onChange } = render({
      options: [
        { label: "A", value: "A" },
        { label: "Clear selection", value: "cs-option" },
      ],
      value: "A",
    });
    const dd = findDropdown(tree);
    expect(dd.props.data).toHaveLength(3);
    act(() => {
      dd.props.onChange({ label: "Clear selection", value: "cs-option" });
    });
    expect(onChange).toHaveBeenCalledWith("cs-option");
  });

  it("never mutates the configured options (no clear row leaked into program data)", () => {
    render();
    expect(OPTIONS).toHaveLength(2);
    expect(OPTIONS.every((o) => (o as { isClear?: boolean }).isClear === undefined)).toBe(true);
  });

  it("after clearing, the dropdown renders options only (no Clear selection row)", () => {
    const { tree, onChange } = render();
    const clear = findDropdown(tree).props.data[2];
    act(() => {
      findDropdown(tree).props.onChange(clear);
    });
    act(() => {
      tree.update(
        React.createElement(DropdownField, {
          value: "",
          options: OPTIONS,
          editable: true,
          placeholder: "Select",
          onChange,
        })
      );
    });
    const dd = findDropdown(tree);
    expect(dd.props.value).toBe("");
    expect(dd.props.data).toHaveLength(2);
    expect(dd.props.data.some((i) => i.isClear === true)).toBe(false);
  });

  it("renderItem renders option rows and a visually distinct clear row", () => {
    const { tree } = render();
    const dd = findDropdown(tree);
    let optionTree!: ReturnType<typeof TestRenderer.create>;
    act(() => {
      optionTree = TestRenderer.create(
        <>{dd.props.renderItem({ label: "Overhead", value: "Overhead" }, false)}</>
      );
    });
    const optionTexts = optionTree.root.findAll(
      (n) => (n as { type?: unknown }).type === "Text"
    );
    expect(optionTexts.some((t) => t.props.children === "Overhead")).toBe(true);

    let clearTree!: ReturnType<typeof TestRenderer.create>;
    act(() => {
      clearTree = TestRenderer.create(
        <>{dd.props.renderItem({ label: "Clear selection", value: "__dropdown_clear__", isClear: true }, false)}</>
      );
    });
    const clearTexts = clearTree.root.findAll(
      (n) => (n as { type?: unknown }).type === "Text"
    );
    expect(clearTexts.some((t) => t.props.children === "Clear selection")).toBe(true);
  });

  it("forwards focus/blur/style props to the underlying dropdown", () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const { tree } = render({ onFocus, onBlur });
    const dd = findDropdown(tree);
    expect(typeof dd.props.onFocus).toBe("function");
    expect(typeof dd.props.onBlur).toBe("function");
    act(() => dd.props.onFocus?.());
    expect(onFocus).toHaveBeenCalled();
    act(() => dd.props.onBlur?.());
    expect(onBlur).toHaveBeenCalled();
  });
});