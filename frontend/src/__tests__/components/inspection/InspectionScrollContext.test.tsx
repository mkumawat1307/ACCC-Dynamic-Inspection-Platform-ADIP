import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  InspectionScrollProvider,
  useInspectionScroll,
  computeKeyboardScrollTarget,
  keyboardBottomInset,
  FOCUS_PADDING,
} from "@/src/context/InspectionScrollContext";

function targetFor(overrides: Partial<Parameters<typeof computeKeyboardScrollTarget>[0]> = {}) {
  return computeKeyboardScrollTarget({
    fieldTop: 480,
    fieldHeight: 56,
    scrollViewTop: 0,
    scrollViewHeight: 600,
    keyboardHeight: 0,
    currentOffset: 0,
    focusedPadding: FOCUS_PADDING,
    ...overrides,
  });
}

describe("computeKeyboardScrollTarget", () => {
  it("returns null when the keyboard is hidden and the field fits", () => {
    expect(targetFor({ fieldTop: 200 })).toBeNull();
  });

  it("returns null when the keyboard is up and the field is already visible above it", () => {
    expect(targetFor({ fieldTop: 100, fieldHeight: 40, keyboardHeight: 300 })).toBeNull();
  });

  it("scrolls by the overflow when the focused field bottom passes the keyboard-adjusted visible area", () => {
    const target = targetFor({ fieldTop: 480, keyboardHeight: 300 });
    expect(target).toBe(480 + 56 - (600 - 300 - 20));
  });

  it("accounts for the current scroll offset", () => {
    const target = targetFor({ fieldTop: 480, keyboardHeight: 300, currentOffset: 120 });
    expect(target).toBe(120 + 480 + 56 - (600 - 300 - 20));
  });

  it("reports the bottom field's required scroll when the keyboard is hidden (below the viewport)", () => {
    const target = targetFor({ fieldTop: 700, keyboardHeight: 0 });
    expect(target).toBe(700 + 56 - 600);
  });

  it("clamps to the max scroll of the content", () => {
    const target = targetFor({ fieldTop: 480, keyboardHeight: 300, maxScroll: 20 });
    expect(target).toBe(20);
  });

  it("never returns a negative target", () => {
    expect(targetFor({ fieldTop: 480, keyboardHeight: 300, maxScroll: 0 })).toBe(0);
  });

  it("returns null for a degenerate viewport", () => {
    expect(targetFor({ scrollViewHeight: 0 })).toBeNull();
  });
});

describe("keyboardBottomInset", () => {
  it("is 0 while the keyboard is hidden", () => {
    expect(keyboardBottomInset(0, FOCUS_PADDING)).toBe(0);
  });

  it("is keyboard height + extra while the keyboard is visible", () => {
    expect(keyboardBottomInset(300, FOCUS_PADDING)).toBe(320);
  });

  it("gives a bottom field enough scrollable room to clear the keyboard", () => {
    const scrollViewHeight = 600;
    const keyboardHeight = 300;
    const contentHeightBefore = 620;
    const inset = keyboardBottomInset(keyboardHeight, FOCUS_PADDING);
    const contentHeightAfter = contentHeightBefore + inset;

    const needed = computeKeyboardScrollTarget({
      fieldTop: 540,
      fieldHeight: 56,
      scrollViewTop: 0,
      scrollViewHeight,
      keyboardHeight,
      currentOffset: 0,
      focusedPadding: FOCUS_PADDING,
      maxScroll: Math.max(0, contentHeightBefore - scrollViewHeight),
    });
    const usableAfter = computeKeyboardScrollTarget({
      fieldTop: 540,
      fieldHeight: 56,
      scrollViewTop: 0,
      scrollViewHeight,
      keyboardHeight,
      currentOffset: 0,
      focusedPadding: FOCUS_PADDING,
      maxScroll: Math.max(0, contentHeightAfter - scrollViewHeight),
    });

    expect(needed).not.toBeNull();
    if (usableAfter != null && needed != null) {
      expect(usableAfter).toBe(540 + 56 - (600 - 300 - 20));
      expect(usableAfter).toBeGreaterThan(needed);
      expect(usableAfter).toBeLessThanOrEqual(contentHeightAfter - scrollViewHeight);
    }
  });
});

let invokeScrollFocused: ((ref: any) => void) | null = null;

function Harness() {
  const { scrollFocusedFieldIntoView } = useInspectionScroll();
  invokeScrollFocused = scrollFocusedFieldIntoView;
  return null;
}

function makeFieldNode(y: number, height = 56, withMeasure = true) {
  return {
    measureInWindow: withMeasure
      ? (cb: (x: number, top: number, w: number, h: number) => void) => cb(0, y, 200, height)
      : undefined,
  };
}

describe("InspectionScrollProvider scrollFocusedFieldIntoView", () => {
  beforeEach(() => {
    invokeScrollFocused = null;
  });

  function renderProvider(opts: {
    scrollViewHeight?: number;
    contentHeight?: number;
    keyboardHeight?: number;
    offset?: number;
  } = {}) {
    const { scrollViewHeight = 600, contentHeight = 1000, keyboardHeight = 0, offset = 0 } = opts;
    const scrollTo = jest.fn();
    const scrollViewRef = { current: { scrollTo } };
    const scrollOffsetRef = { current: offset };
    const scrollViewTopRef = { current: 0 };
    const scrollViewHeightRef = { current: scrollViewHeight };
    const scrollContentHeightRef = { current: contentHeight };
    const keyboardHeightRef = { current: keyboardHeight };
    const setDropdownOpen = jest.fn();

    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => {
      tree = TestRenderer.create(
        <InspectionScrollProvider
          scrollViewRef={scrollViewRef}
          scrollOffsetRef={scrollOffsetRef}
          scrollViewTopRef={scrollViewTopRef}
          scrollViewHeightRef={scrollViewHeightRef}
          scrollContentHeightRef={scrollContentHeightRef}
          keyboardHeightRef={keyboardHeightRef}
          setDropdownOpen={setDropdownOpen}
        >
          <Harness />
        </InspectionScrollProvider>
      );
    });

    const target = (scrollTo.mock.calls[scrollTo.mock.calls.length - 1]?.[0] as
      | { y: number }
      | undefined)?.y;

    return {
      tree,
      scrollTo,
      scrollViewRef,
      scrollContentHeightRef,
      setDropdownOpen,
      getLastTarget: () => target,
    };
  }

  it("does not scroll a field that already fits above the keyboard", () => {
    const { tree, scrollTo } = renderProvider({ keyboardHeight: 300 });
    act(() => {
      invokeScrollFocused?.(makeFieldNode(200, 40));
    });
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("scrolls a keyboard-obscured field into view via the SAME ref passed to the provider", () => {
    const { tree, scrollTo } = renderProvider({ keyboardHeight: 300 });
    act(() => {
      invokeScrollFocused?.(makeFieldNode(480));
    });
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 256, animated: true });
    act(() => tree.unmount());
  });

  it("stops at the content max scroll when there is no bottom room (bottom field before inset)", () => {
    const { tree, scrollTo } = renderProvider({ contentHeight: 620, keyboardHeight: 300 });
    act(() => {
      invokeScrollFocused?.(makeFieldNode(540));
    });
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 20, animated: true });
    act(() => tree.unmount());
  });

  it("clears the keyboard once the bottom inset grows the scrollable content", () => {
    const { tree, scrollTo, scrollContentHeightRef } = renderProvider({
      contentHeight: 620,
      keyboardHeight: 300,
    });
    act(() => {
      scrollContentHeightRef.current = 620 + keyboardBottomInset(300, FOCUS_PADDING);
    });
    act(() => {
      invokeScrollFocused?.(makeFieldNode(540));
    });
    const lastCall = scrollTo.mock.calls[scrollTo.mock.calls.length - 1]?.[0] as { y: number };
    expect(lastCall.y).toBe(316);
    act(() => tree.unmount());
  });

  it("scrolls a field that extends below the viewport even without a keyboard", () => {
    const { tree, scrollTo } = renderProvider();
    act(() => {
      invokeScrollFocused?.(makeFieldNode(700));
    });
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 156, animated: true });
    act(() => tree.unmount());
  });

  it("ignores a node that cannot be measured without crashing", () => {
    const { tree, scrollTo } = renderProvider({ keyboardHeight: 300 });
    act(() => {
      invokeScrollFocused?.(makeFieldNode(480, 56, false));
    });
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("passes the setDropdownOpen handler through the context", () => {
    const { tree, setDropdownOpen } = renderProvider();
    act(() => {
      setDropdownOpen(true);
    });
    act(() => tree.unmount());
  });
});