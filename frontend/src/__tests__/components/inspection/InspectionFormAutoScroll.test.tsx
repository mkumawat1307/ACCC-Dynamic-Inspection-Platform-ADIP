import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Dimensions, StatusBar } from "react-native";
import {
  FieldInput,
  autoScrollDropdown,
} from "@/src/components/inspection/renderFieldInput";
import {
  notifyScrollOffset,
  cancelPendingOpen,
  hasPendingOpen,
} from "@/src/components/inspection/dropdownScrollGate";

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

describe("autoScrollDropdown", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cancelPendingOpen();
    jest.spyOn(Dimensions, "get").mockImplementation(() => ({
      width: 400,
      height: 800,
      scale: 2,
      fontScale: 2,
    }));
    Object.defineProperty(StatusBar, "currentHeight", {
      get: () => 24,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    cancelPendingOpen();
  });

  afterAll(() => {
    delete (StatusBar as unknown as Record<string, unknown>).currentHeight;
  });

  const requiredSpace = 350 + 2 + 24 + 16;

  it("scrolls the parent ScrollView when the dropdown is near the bottom of the screen", () => {
    const scrollTo = jest.fn();
    autoScrollDropdown(
      { current: { measureInWindow: (cb) => cb(0, 600, 300, 56) } },
      { current: { open: jest.fn() } },
      { current: { scrollTo } },
      100
    );

    const scrollNeeded = requiredSpace - (800 - (600 + 56));
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 100 + scrollNeeded, animated: false });
  });

  it("does not scroll when there is enough space below the dropdown", () => {
    const scrollTo = jest.fn();
    autoScrollDropdown(
      { current: { measureInWindow: (cb) => cb(0, 100, 300, 56) } },
      { current: { open: jest.fn() } },
      { current: { scrollTo } },
      0
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll when space below just satisfies the status bar-aware requirement", () => {
    const scrollTo = jest.fn();
    autoScrollDropdown(
      { current: { measureInWindow: (cb) => cb(0, 800 - requiredSpace - 56, 300, 56) } },
      { current: { open: jest.fn() } },
      { current: { scrollTo } },
      0
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("uses the provided current offset for the scroll target", () => {
    const scrollTo = jest.fn();
    autoScrollDropdown(
      { current: { measureInWindow: (cb) => cb(0, 600, 300, 56) } },
      { current: { open: jest.fn() } },
      { current: { scrollTo } },
      50
    );

    const scrollNeeded = requiredSpace - (800 - (600 + 56));
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 50 + scrollNeeded, animated: false });
  });

  it("uses 0 as the current offset when the ScrollView is at the top", () => {
    const scrollTo = jest.fn();
    autoScrollDropdown(
      { current: { measureInWindow: (cb) => cb(0, 600, 300, 56) } },
      { current: { open: jest.fn() } },
      { current: { scrollTo } },
      0
    );

    const scrollNeeded = requiredSpace - (800 - (600 + 56));
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: scrollNeeded, animated: false });
  });

  it("computes the scroll amount from actual space required, not a fixed offset", () => {
    const scrollTo = jest.fn();
    autoScrollDropdown(
      { current: { measureInWindow: (cb) => cb(0, 500, 300, 56) } },
      { current: { open: jest.fn() } },
      { current: { scrollTo } },
      0
    );

    const expectedY = requiredSpace - (800 - (500 + 56));
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: expectedY, animated: false });
    expect(expectedY).not.toBe(80);
  });

  it("reserves status bar height on top of the dropdown popup requirement", () => {
    jest.restoreAllMocks();
    jest.spyOn(Dimensions, "get").mockImplementation(() => ({
      width: 400,
      height: 800,
      scale: 2,
      fontScale: 2,
    }));
    Object.defineProperty(StatusBar, "currentHeight", {
      get: () => 48,
      configurable: true,
    });

    const scrollTo = jest.fn();
    autoScrollDropdown(
      { current: { measureInWindow: (cb) => cb(0, 600, 300, 56) } },
      { current: { open: jest.fn() } },
      { current: { scrollTo } },
      0
    );

    const tallStatusBarRequiredSpace = 350 + 2 + 48 + 16;
    const scrollNeeded = tallStatusBarRequiredSpace - (800 - (600 + 56));
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: scrollNeeded, animated: false });
  });

  it("positions the popup fully on screen after the scroll", () => {
    const scrollTo = jest.fn();
    autoScrollDropdown(
      { current: { measureInWindow: (cb) => cb(0, 600, 300, 56) } },
      { current: { open: jest.fn() } },
      { current: { scrollTo } },
      0
    );

    const scrollNeeded = requiredSpace - (800 - (600 + 56));
    const newPageY = 600 - scrollNeeded;
    const popupBottom = newPageY + 56 + 2 + 24 + 350;
    expect(popupBottom).toBeLessThanOrEqual(800);
    expect(800 - popupBottom).toBe(16);
  });

  it("does not measure when the ScrollView ref is not attached", () => {
    const measure = jest.fn((cb: (x: number, y: number, w: number, h: number) => void) =>
      cb(0, 600, 300, 56)
    );
    autoScrollDropdown(
      { current: { measureInWindow: measure } },
      { current: { open: jest.fn() } },
      { current: null },
      0
    );

    expect(measure).not.toHaveBeenCalled();
  });

  it("does not scroll when the dropdown ref is not attached", () => {
    const scrollTo = jest.fn();
    autoScrollDropdown(
      { current: null },
      { current: { open: jest.fn() } },
      { current: { scrollTo } },
      0
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("defers open() until the native onScroll reaches the requested target, then re-anchors the popup", () => {
    const scrollTo = jest.fn();
    const open = jest.fn();
    const measure = jest
      .fn()
      .mockImplementationOnce((cb) => cb(0, 600, 300, 56))
      .mockImplementationOnce((cb) => cb(0, 352, 300, 56));
    const viewRef = { current: { measureInWindow: measure } };
    const openRef = { current: { open } };
    const scrollRef = { current: { scrollTo } };

    autoScrollDropdown(viewRef, openRef, scrollRef, 0);

    const scrollNeeded = requiredSpace - (800 - (600 + 56));
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: scrollNeeded, animated: false });
    expect(open).not.toHaveBeenCalled();
    expect(hasPendingOpen()).toBe(true);

    notifyScrollOffset(scrollNeeded);

    expect(open).toHaveBeenCalledTimes(1);
    expect(measure).toHaveBeenCalledTimes(2);
    expect(hasPendingOpen()).toBe(false);
  });

  it("does not call open() when no scrolling is needed", () => {
    const scrollTo = jest.fn();
    const open = jest.fn();
    autoScrollDropdown(
      { current: { measureInWindow: (cb) => cb(0, 100, 300, 56) } },
      { current: { open } },
      { current: { scrollTo } },
      0
    );

    expect(scrollTo).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(hasPendingOpen()).toBe(false);
  });

  it("stays closed on intermediate onScroll offsets that do not reach the target", () => {
    const scrollTo = jest.fn();
    const open = jest.fn();
    const measure = jest
      .fn()
      .mockImplementationOnce((cb) => cb(0, 600, 300, 56))
      .mockImplementationOnce((cb) => cb(0, 352, 300, 56));
    const viewRef = { current: { measureInWindow: measure } };
    const openRef = { current: { open } };
    const scrollRef = { current: { scrollTo } };

    autoScrollDropdown(viewRef, openRef, scrollRef, 0);
    const scrollNeeded = requiredSpace - (800 - (600 + 56));

    notifyScrollOffset(scrollNeeded - 100);
    expect(open).not.toHaveBeenCalled();
    expect(hasPendingOpen()).toBe(true);

    notifyScrollOffset(scrollNeeded);
    expect(open).toHaveBeenCalledTimes(1);
    expect(hasPendingOpen()).toBe(false);
  });

  it("tolerates native rounding between the requested target and the reported offset", () => {
    const scrollTo = jest.fn();
    const open = jest.fn();
    const measure = jest.fn((cb) => cb(0, 600, 300, 56));
    const viewRef = { current: { measureInWindow: measure } };
    const openRef = { current: { open } };
    const scrollRef = { current: { scrollTo } };

    autoScrollDropdown(viewRef, openRef, scrollRef, 0);
    const scrollNeeded = requiredSpace - (800 - (600 + 56));

    notifyScrollOffset(scrollNeeded + 0.148);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("focusing another dropdown cancels the previous pending open before registering a new one", () => {
    const scrollTo = jest.fn();
    const firstOpen = jest.fn();
    const secondOpen = jest.fn();
    const firstView = {
      current: {
        measureInWindow: jest
          .fn()
          .mockImplementationOnce((cb) => cb(0, 600, 300, 56))
          .mockImplementationOnce((cb) => cb(0, 352, 300, 56)),
      },
    };
    const secondView = {
      current: {
        measureInWindow: jest
          .fn()
          .mockImplementationOnce((cb) => cb(0, 700, 300, 56))
          .mockImplementationOnce((cb) => cb(0, 452, 300, 56)),
      },
    };
    const scrollRef = { current: { scrollTo } };

    autoScrollDropdown(firstView, { current: { open: firstOpen } }, scrollRef, 0);
    const scrollNeeded = requiredSpace - (800 - (600 + 56));
    expect(hasPendingOpen()).toBe(true);

    autoScrollDropdown(secondView, { current: { open: secondOpen } }, scrollRef, 0);
    const secondScrollNeeded = requiredSpace - (800 - (700 + 56));
    expect(hasPendingOpen()).toBe(true);

    notifyScrollOffset(scrollNeeded);
    expect(firstOpen).not.toHaveBeenCalled();

    notifyScrollOffset(secondScrollNeeded);
    expect(secondOpen).toHaveBeenCalledTimes(1);
  });

  it("aborts the pending open when the dropdown unmounts before onScroll arrives", () => {
    const scrollTo = jest.fn();
    const open = jest.fn();
    const measure = jest
      .fn()
      .mockImplementationOnce((cb) => cb(0, 600, 300, 56));
    const viewRef: {
      current: { measureInWindow: typeof measure } | null;
    } = { current: { measureInWindow: measure } };
    const openRef = { current: { open } };
    const scrollRef = { current: { scrollTo } };

    autoScrollDropdown(viewRef, openRef, scrollRef, 0);
    const scrollNeeded = requiredSpace - (800 - (600 + 56));

    viewRef.current = null;
    notifyScrollOffset(scrollNeeded);

    expect(open).not.toHaveBeenCalled();
    expect(measure).toHaveBeenCalledTimes(1);
    expect(hasPendingOpen()).toBe(false);
  });

  it("suppresses the re-entrant focus that the deferred open() fires, preventing an infinite loop", () => {
    const scrollTo = jest.fn();
    const open = jest.fn();
    const measure = jest
      .fn()
      .mockImplementationOnce((cb) => cb(0, 600, 300, 56))
      .mockImplementationOnce((cb) => cb(0, 352, 300, 56));
    const viewRef = { current: { measureInWindow: measure } };
    const scrollRef = { current: { scrollTo } };

    let triggerFocus = () => {};
    const dropdownOpenRef = {
      current: {
        open: () => {
          open();
          triggerFocus();
        },
      },
    };
    triggerFocus = () =>
      autoScrollDropdown(viewRef, dropdownOpenRef, scrollRef, 0);

    autoScrollDropdown(viewRef, dropdownOpenRef, scrollRef, 0);
    const scrollNeeded = requiredSpace - (800 - (600 + 56));
    expect(open).not.toHaveBeenCalled();

    notifyScrollOffset(scrollNeeded);

    expect(open).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});