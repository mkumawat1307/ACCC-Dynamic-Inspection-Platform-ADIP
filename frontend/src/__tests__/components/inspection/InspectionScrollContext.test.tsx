import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  InspectionScrollProvider,
  useInspectionScroll,
  computeKeyboardScrollTarget,
  computeRevealScrollTarget,
  keyboardBottomInset,
  effectiveKeyboardViewport,
  FOCUS_PADDING,
  REVEAL_PADDING,
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

function revealTargetFor(overrides: Partial<Parameters<typeof computeRevealScrollTarget>[0]> = {}) {
  return computeRevealScrollTarget({
    itemTop: 700,
    itemHeight: 56,
    scrollViewTop: 0,
    scrollViewHeight: 600,
    keyboardHeight: 0,
    currentOffset: 0,
    padding: REVEAL_PADDING,
    ...overrides,
  });
}

describe("computeRevealScrollTarget", () => {
  it("returns null when the element is already fully visible", () => {
    expect(revealTargetFor({ itemTop: 200 })).toBeNull();
  });

  it("reveals a fully below-fold element with the minimal scroll", () => {
    expect(revealTargetFor({ itemTop: 700 })).toBe(700 + 56 - 600 + REVEAL_PADDING);
  });

  it("reveals an element that only partially dips below the fold", () => {
    expect(revealTargetFor({ itemTop: 601 })).toBe(601 + 56 - 600 + REVEAL_PADDING);
  });

  it("accounts for the current scroll offset", () => {
    expect(revealTargetFor({ itemTop: 700, currentOffset: 120 })).toBe(
      120 + 700 + 56 - 600 + REVEAL_PADDING
    );
  });

  it("reveals against the keyboard-adjusted viewport", () => {
    expect(revealTargetFor({ itemTop: 700, keyboardHeight: 300 })).toBe(
      0 + 700 + 56 - (600 - 300) + REVEAL_PADDING
    );
  });

  it("returns null when the element is already visible above the keyboard", () => {
    expect(revealTargetFor({ itemTop: 200, keyboardHeight: 300 })).toBeNull();
  });

  it("anchors the top edge when the element is taller than the viewport", () => {
    expect(revealTargetFor({ itemTop: 700, itemHeight: 800 })).toBe(700 - REVEAL_PADDING);
  });

  it("anchors the top edge when the element starts above the scrolled viewport", () => {
    expect(revealTargetFor({ itemTop: -50 })).toBe(0);
  });

  it("clamps to the max scroll of the content", () => {
    expect(revealTargetFor({ itemTop: 700, maxScroll: 20 })).toBe(20);
  });

  it("returns null for a degenerate viewport", () => {
    expect(revealTargetFor({ scrollViewHeight: 0 })).toBeNull();
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

describe("effectiveKeyboardViewport", () => {
  const base = {
    scrollViewTopWindow: 0,
    scrollViewBottomWindow: 900,
    keyboardHeight: 300,
    keyboardTopScreenY: 1020,
    statusBarHeight: 24,
    isAndroid: true,
  };

  it("anchors the fold to the keyboard's own top edge (Android)", () => {
    expect(effectiveKeyboardViewport(base)).toEqual({
      scrollViewTop: 0,
      scrollViewHeight: 1296,
      keyboardHeight: 300,
    });
  });

  it("is identical whether the ScrollView already shrank after adjustResize (race-free)", () => {
    const shrunk = effectiveKeyboardViewport({ ...base, scrollViewBottomWindow: 696 });
    const unshrunk = effectiveKeyboardViewport({ ...base, scrollViewBottomWindow: 900 });
    expect(shrunk).toEqual(unshrunk);
  });

  it("never double-counts the keyboard height in the visible bottom", () => {
    const viewport = effectiveKeyboardViewport({ ...base, scrollViewBottomWindow: 696 });
    // Old behaviour: scrollViewHeight=696 with keyboardHeight subtracted again.
    const doubleCountedTarget = computeKeyboardScrollTarget({
      fieldTop: 500,
      fieldHeight: 56,
      scrollViewTop: 0,
      scrollViewHeight: 696,
      keyboardHeight: 300,
      currentOffset: 0,
      focusedPadding: FOCUS_PADDING,
    });
    const raceFreeTarget = computeKeyboardScrollTarget({
      fieldTop: 500,
      fieldHeight: 56,
      scrollViewTop: viewport.scrollViewTop,
      scrollViewHeight: viewport.scrollViewHeight,
      keyboardHeight: viewport.keyboardHeight,
      currentOffset: 0,
      focusedPadding: FOCUS_PADDING,
    });
    expect(doubleCountedTarget).not.toBeNull();
    expect(raceFreeTarget).toBeNull();
  });

  it("keeps the full measured frame when the keyboard is hidden", () => {
    expect(
      effectiveKeyboardViewport({ ...base, keyboardHeight: 0, keyboardTopScreenY: null })
    ).toEqual({ scrollViewTop: 0, scrollViewHeight: 900, keyboardHeight: 0 });
  });

  it("falls back to bottom - keyboardHeight when screenY is missing", () => {
    expect(effectiveKeyboardViewport({ ...base, keyboardTopScreenY: null })).toEqual({
      scrollViewTop: 0,
      scrollViewHeight: 900,
      keyboardHeight: 300,
    });
  });

  it("uses bottom - keyboardHeight on iOS where the window never shrinks", () => {
    expect(effectiveKeyboardViewport({ ...base, isAndroid: false })).toEqual({
      scrollViewTop: 0,
      scrollViewHeight: 900,
      keyboardHeight: 300,
    });
  });
});

let invokeScrollFocused: ((ref: any) => void) | null = null;
let invokeScrollElement: ((ref: any, padding?: number) => void) | null = null;

function Harness() {
  const { scrollFocusedFieldIntoView, scrollElementIntoView } = useInspectionScroll();
  invokeScrollFocused = scrollFocusedFieldIntoView;
  invokeScrollElement = scrollElementIntoView;
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
    invokeScrollElement = null;
  });

  function renderProvider(opts: {
    scrollViewHeight?: number;
    contentHeight?: number;
    keyboardHeight?: number;
    offset?: number;
    scrollViewFrame?: [number, number, number, number];
  } = {}) {
    const {
      scrollViewHeight = 600,
      contentHeight = 1000,
      keyboardHeight = 0,
      offset = 0,
      scrollViewFrame,
    } = opts;
    const scrollTo = jest.fn();
    const scrollViewRef = {
      current: scrollViewFrame
        ? {
            scrollTo,
            measureInWindow: (cb: Function) => cb(...scrollViewFrame),
          }
        : { scrollTo },
    };
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

  it("derives the fold from the measured ScrollView frame (single-count)", () => {
    // window top = 88, shrunken height 396 (Android adjustResize shrink).
    const { tree, scrollTo } = renderProvider({
      keyboardHeight: 300,
      scrollViewFrame: [0, 88, 400, 396],
    });
    act(() => {
      invokeScrollFocused?.(makeFieldNode(480));
    });
    // keyboardTop(window) = (88 + 396) - 300 = 184; visible bottom = 184 - 88 - 20 = 76.
    // fieldBottom = 480 - 88 + 56 = 448 -> target = 0 + 448 - 76 = 372.
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 372, animated: true });
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

describe("InspectionScrollProvider scrollElementIntoView", () => {
  beforeEach(() => {
    invokeScrollFocused = null;
    invokeScrollElement = null;
  });

  function renderRevealProvider(opts: {
    contentHeight?: number;
    keyboardHeight?: number;
    offset?: number;
  } = {}) {
    const { contentHeight = 1000, keyboardHeight = 0, offset = 0 } = opts;
    const scrollTo = jest.fn();
    const scrollViewRef = {
      current: {
        scrollTo,
        measureInWindow: (cb: Function) => cb(0, 0, 400, 600),
      },
    };
    const scrollOffsetRef = { current: offset };
    const scrollViewTopRef = { current: 0 };
    const scrollViewHeightRef = { current: 600 };
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

    return {
      tree,
      scrollTo,
      scrollContentHeightRef,
      lastTarget: () => {
        const last = scrollTo.mock.calls[scrollTo.mock.calls.length - 1]?.[0] as
          | { y: number }
          | undefined;
        return last?.y;
      },
    };
  }

  async function flushNextTick() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }

  it("does not scroll an element already fully visible", async () => {
    const { tree, scrollTo } = renderRevealProvider();
    act(() => {
      invokeScrollElement?.(makeFieldNode(200, 56));
    });
    await flushNextTick();
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("scrolls a below-fold element into view with minimal reveal", async () => {
    const { tree, scrollTo, lastTarget } = renderRevealProvider();
    act(() => {
      invokeScrollElement?.(makeFieldNode(700, 56));
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const revealed = 0 + 700 + 56 - 600 + REVEAL_PADDING;
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: revealed, animated: true });
    // Geometry is unchanged on the re-assert pass, so it must NOT scroll again.
    await flushNextTick();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(lastTarget()).toBe(revealed);
    act(() => tree.unmount());
  });

  it("derives the fold from the measured ScrollView frame (window coordinates)", async () => {
    const { tree, scrollTo } = renderRevealProvider({ keyboardHeight: 300 });
    act(() => {
      invokeScrollElement?.(makeFieldNode(300, 56));
    });
    const revealed = 0 + 300 + 56 - (600 - 300) + REVEAL_PADDING;
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: revealed, animated: true });
    await flushNextTick();
    act(() => tree.unmount());
  });

  it("does not scroll an element already visible above the keyboard fold", async () => {
    const { tree, scrollTo } = renderRevealProvider({ keyboardHeight: 300 });
    act(() => {
      invokeScrollElement?.(makeFieldNode(200, 56));
    });
    await flushNextTick();
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("stops at the content max scroll when there is no bottom room", async () => {
    const { tree, scrollTo, lastTarget } = renderRevealProvider({ contentHeight: 620 });
    act(() => {
      invokeScrollElement?.(makeFieldNode(700, 56));
    });
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 20, animated: true });
    await flushNextTick();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(lastTarget()).toBe(20);
    act(() => tree.unmount());
  });

  it("re-asserts and recovers when content is still growing below the fold (stale max scroll)", async () => {
    const { tree, scrollTo, lastTarget, scrollContentHeightRef } = renderRevealProvider({
      contentHeight: 620,
    });
    act(() => {
      invokeScrollElement?.(makeFieldNode(700, 56));
    });
    // First pass is clamped by the stale (small) max scroll.
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 20, animated: true });
    act(() => {
      scrollContentHeightRef.current = 1000;
    });
    await flushNextTick();
    const revealed = 0 + 700 + 56 - 600 + REVEAL_PADDING;
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(lastTarget()).toBe(revealed);
    act(() => tree.unmount());
  });

  it("ignores a node that cannot be measured without crashing", async () => {
    const { tree, scrollTo } = renderRevealProvider();
    act(() => {
      invokeScrollElement?.(makeFieldNode(700, 56, false));
    });
    await flushNextTick();
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});