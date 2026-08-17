import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { FieldDialog } from "@/src/components/app/settings/components/DeviceTypeDialogs";
import { CREATEABLE_FIELD_TYPES, FIELD_TYPES } from "@/src/database/repositories/FieldRepository";

type HostComponent = ((props: Record<string, unknown>) => React.ReactElement) &
  Record<string, unknown>;

jest.mock("react-native-paper", () => {
  const ReactPaper = require("react");
  const make = (name: string): HostComponent => {
    const Comp = (props: Record<string, unknown>) => ReactPaper.createElement(name, props);
    return Comp as HostComponent;
  };
  const Dialog = make("Dialog");
  Dialog.Title = make("DialogTitle");
  Dialog.Content = make("DialogContent");
  Dialog.Actions = make("DialogActions");
  return {
    Text: make("Text"),
    TextInput: make("TextInput"),
    Chip: make("Chip"),
    Button: make("Button"),
    Dialog,
  };
});

interface TestNode {
  type?: unknown;
  props: Record<string, unknown>;
}

function nodesByType(tree: ReturnType<typeof TestRenderer.create>, type: string) {
  return tree.root.findAll((n) => (n as TestNode).type === type);
}

function nodeByText(tree: ReturnType<typeof TestRenderer.create>, type: string, text: string) {
  const node = tree.root.findAll((n) => {
    const inst = n as TestNode;
    return inst.type === type && inst.props.children === text;
  })[0];
  return node?.props as Record<string, unknown> | undefined;
}

function chipByText(tree: ReturnType<typeof TestRenderer.create>, text: string) {
  return nodeByText(tree, "Chip", text);
}

function buttonByText(tree: ReturnType<typeof TestRenderer.create>, text: string) {
  return nodeByText(tree, "Button", text);
}

function textInputByLabel(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  const node = tree.root.findAll((n) => {
    const inst = n as TestNode;
    return inst.type === "TextInput" && inst.props.label === label;
  })[0];
  return node?.props as { label: string; value?: string } | undefined;
}

function renderDialog(params: Record<string, unknown> = {}) {
  const onDismiss = jest.fn();
  const onFieldLabelChange = jest.fn();
  const onFieldTypeChange = jest.fn();
  const onFieldRequiredToggle = jest.fn();
  const onSave = jest.fn();
  const props = {
    visible: true,
    editingField: false,
    fieldLabel: "Voltage",
    fieldType: "text",
    fieldRequired: false,
    onDismiss,
    onFieldLabelChange,
    onFieldTypeChange,
    onFieldRequiredToggle,
    onSave,
    ...params,
  };
  let tree!: ReturnType<typeof TestRenderer.create>;
  act(() => {
    tree = TestRenderer.create(<FieldDialog {...props} />);
  });
  return { tree, onDismiss, onFieldTypeChange, onFieldRequiredToggle, onSave };
}

const LEGACY_TYPES = FIELD_TYPES.filter(
  (t) => !CREATEABLE_FIELD_TYPES.some((c) => c.value === t.value)
);

describe("FieldDialog (shared by Device Types and Sections)", () => {
  it("shows exactly the five createable field types in CREATEABLE_FIELD_TYPES order", () => {
    const { tree } = renderDialog();
    const chipTexts = nodesByType(tree, "Chip").map(
      (n) => (n as TestNode).props.children
    );
    const expected = CREATEABLE_FIELD_TYPES.map((t) => t.label);
    expect(expected).toHaveLength(5);
    expect(chipTexts.slice(0, 5)).toEqual(expected);
  });

  it("does not show legacy field types as choices", () => {
    const { tree } = renderDialog();
    const chipTexts = nodesByType(tree, "Chip").map(
      (n) => (n as TestNode).props.children
    );
    for (const legacy of LEGACY_TYPES) {
      expect(chipTexts).not.toContain(legacy.label);
    }
  });

  it("selecting a type chip calls onFieldTypeChange with its value", () => {
    const { tree, onFieldTypeChange } = renderDialog();
    act(() => {
      (chipByText(tree, "Dropdown")?.onPress as () => void)();
    });
    expect(onFieldTypeChange).toHaveBeenCalledWith("dropdown");

    act(() => {
      (chipByText(tree, "Numbers")?.onPress as () => void)();
    });
    expect(onFieldTypeChange).toHaveBeenCalledWith("number");
  });

  it("marks the currently selected type chip as selected", () => {
    const { tree } = renderDialog({ fieldType: "checkbox" });
    expect(chipByText(tree, "Checkbox")?.selected).toBe(true);
    expect(chipByText(tree, "Text Input")?.selected).toBe(false);
  });

  it("renders Cancel and Save actions that fire their handlers", () => {
    const { tree, onDismiss, onSave } = renderDialog();
    act(() => {
      (buttonByText(tree, "Cancel")?.onPress as () => void)();
    });
    expect(onDismiss).toHaveBeenCalled();

    act(() => {
      (buttonByText(tree, "Save")?.onPress as () => void)();
    });
    expect(onSave).toHaveBeenCalled();
  });

  it("renders the Required chip and toggles it", () => {
    const { tree, onFieldRequiredToggle } = renderDialog({ fieldRequired: true });
    expect(chipByText(tree, "Required")?.selected).toBe(true);
    act(() => {
      (chipByText(tree, "Required")?.onPress as () => void)();
    });
    expect(onFieldRequiredToggle).toHaveBeenCalled();
  });

  it("uses Add Field title for create and Edit Field for edit", () => {
    const create = renderDialog();
    expect(
      nodesByType(create.tree, "DialogTitle").filter(
        (n) => (n as TestNode).props.children === "Add Field"
      ).length
    ).toBe(1);

    const edit = renderDialog({ editingField: true });
    expect(
      nodesByType(edit.tree, "DialogTitle").filter(
        (n) => (n as TestNode).props.children === "Edit Field"
      ).length
    ).toBe(1);
  });

  it("Device Types mode renders Placeholder and Visible chip but no Default Value", () => {
    const { tree } = renderDialog();
    expect(textInputByLabel(tree, "Placeholder")).toBeDefined();
    expect(textInputByLabel(tree, "Default Value")).toBeUndefined();
    expect(chipByText(tree, "Visible")).toBeDefined();
  });

  it("Sections mode renders Visible chip and Placeholder but not Default Value", () => {
    const onVisibleToggle = jest.fn();
    const { tree } = renderDialog({
      showExtraConfig: true,
      isVisible: true,
      onVisibleToggle,
    });
    expect(textInputByLabel(tree, "Placeholder")).toBeDefined();
    expect(textInputByLabel(tree, "Default Value")).toBeUndefined();
    expect(textInputByLabel(tree, "Help Text")).toBeUndefined();
    expect(chipByText(tree, "Visible")?.selected).toBe(true);
    act(() => {
      (chipByText(tree, "Visible")?.onPress as () => void)();
    });
    expect(onVisibleToggle).toHaveBeenCalled();
  });

  it("Sections mode keeps the Sections field name label", () => {
    const { tree } = renderDialog({ showExtraConfig: true, fieldLabelText: "Field Name *" });
    expect(textInputByLabel(tree, "Field Name *")).toBeDefined();
  });

  it("editing a legacy field shows a non-interactive indicator chip and locks the createable type chips", () => {
    const { tree, onFieldTypeChange } = renderDialog({ editingField: true, fieldType: "date" });

    const legacyChip = chipByText(tree, "Date");
    expect(legacyChip?.selected).toBe(true);
    expect(legacyChip?.onPress).toBeUndefined();

    for (const t of CREATEABLE_FIELD_TYPES) {
      const chip = chipByText(tree, t.label);
      expect(chip?.onPress).toBeUndefined();
      expect(chip?.disabled).toBe(true);
    }

    expect(onFieldTypeChange).not.toHaveBeenCalled();
  });

  it("keeps the createable type chips interactive when editing a createable field", () => {
    const { tree, onFieldTypeChange } = renderDialog({ editingField: true, fieldType: "text" });

    expect(chipByText(tree, "Date")).toBeUndefined();
    const textChip = chipByText(tree, "Text Input");
    expect(textChip?.disabled).toBeFalsy();
    act(() => {
      (textChip?.onPress as () => void)();
    });
    expect(onFieldTypeChange).toHaveBeenCalledWith("text");
  });
});