import { SectionScrollCoordinator } from "@/src/components/inspection/sectionScrollCoordinator";

describe("SectionScrollCoordinator", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  interface SetupResult {
    coordinator: SectionScrollCoordinator;
    isExpanded: jest.Mock;
    scrollToSection: jest.Mock;
    measureSection: jest.Mock;
    expanded: Set<number>;
    measureCallbacks: {
      sectionId: number;
      generation: number;
      cb: (target: number | null) => void;
    }[];
  }

  function setup(debounceMs?: number): SetupResult {
    const expanded = new Set<number>();
    const isExpanded = jest.fn((id: number) => expanded.has(id));
    const scrollToSection = jest.fn();
    const measureCallbacks: SetupResult["measureCallbacks"] = [];
    const measureSection = jest.fn(
      (sectionId: number, generation: number, cb: (target: number | null) => void) => {
        measureCallbacks.push({ sectionId, generation, cb });
      }
    );
    const coordinator = new SectionScrollCoordinator({
      isExpanded,
      measureSection,
      scrollToSection,
      ...(debounceMs !== undefined ? { debounceMs } : {}),
    });
    return { coordinator, isExpanded, scrollToSection, measureSection, expanded, measureCallbacks };
  }

  function pressAndExpand(c: SetupResult, sectionId: number) {
    c.coordinator.press(sectionId);
    c.expanded.add(sectionId);
  }

  function settleAndMeasure(c: SetupResult, sectionId: number, target: number, callIndex?: number) {
    jest.advanceTimersByTime(100);
    expect(c.measureSection).toHaveBeenCalled();
    const i = callIndex ?? c.measureCallbacks.length - 1;
    c.measureCallbacks[i].cb(target);
  }

  it("presses, measures, and issues an animated scroll for the expanded section", () => {
    const c = setup();
    c.coordinator.press(1);
    expect(c.scrollToSection).not.toHaveBeenCalled();
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    expect(c.measureSection).toHaveBeenCalledTimes(1);
    c.measureCallbacks[0].cb(500);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 500);
    expect(c.coordinator.inFlight).toEqual({ generation: 1, target: 500 });
    expect(c.coordinator.currentGeneration).toBe(1);
  });

  it("honors a custom debounce window", () => {
    const c = setup(250);
    c.coordinator.press(1);
    c.expanded.add(1);
    jest.advanceTimersByTime(249);
    expect(c.measureSection).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(c.measureSection).toHaveBeenCalledTimes(1);
  });

  it("reports reached and clears the in-flight state when onScroll reaches the target", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    const cls = c.coordinator.onScroll(501, null, 2);
    expect(cls).toEqual({ kind: "active-auto", reached: true });
    expect(c.coordinator.inFlight).toBeNull();
  });

  it("clears the in-flight target after completion and does not re-scroll without new layout", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
    c.coordinator.onScroll(500, null, 2);
    expect(c.coordinator.inFlight).toBeNull();
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
  });

  it("completes cleanly once the target is reached and ignores trailing settle events", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 533.4815);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 533.4815);
    expect(c.coordinator.onScroll(532.9629, null, 2)).toEqual({ kind: "active-auto", reached: true });
    expect(c.coordinator.inFlight).toBeNull();
    expect(c.coordinator.onScroll(533.3333, null, 2)).toEqual({ kind: "manual", reached: false });
    expect(c.coordinator.inFlight).toBeNull();
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
  });

  it("collapse invalidates the active generation and drops any late measure", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    expect(c.coordinator.inFlight).toEqual({ generation: 1, target: 500 });

    c.coordinator.press(1);
    c.expanded.delete(1);

    expect(c.coordinator.currentGeneration).toBe(2);
    expect(c.coordinator.pendingTarget).toBeNull();
    expect(c.coordinator.inFlight).toBeNull();
    expect(c.coordinator.onScroll(500, null, 2).kind).not.toBe("active-auto");
    expect(c.coordinator.inFlight).toBeNull();
  });

  it("drops a late measure callback that arrives after the section was collapsed", () => {
    const c = setup();
    pressAndExpand(c, 1);
    jest.advanceTimersByTime(100);
    const cb = c.measureCallbacks[0];
    c.coordinator.press(1);
    c.expanded.delete(1);
    cb.cb(400);
    expect(c.scrollToSection).not.toHaveBeenCalled();
  });

  it("switching sections invalidates the previous section's pending scroll", () => {
    const c = setup();
    pressAndExpand(c, 1);
    jest.advanceTimersByTime(100);
    const cbA = c.measureCallbacks[0];
    c.coordinator.press(2);
    c.expanded.add(2);
    jest.advanceTimersByTime(100);
    const cbB = c.measureCallbacks[1];

    cbA.cb(400);
    expect(c.scrollToSection).not.toHaveBeenCalled();

    cbB.cb(600);
    expect(c.scrollToSection).toHaveBeenCalledWith(2, 600);
  });

  it("ignores a stale onScroll from a previous generation after switching sections", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    expect(c.coordinator.inFlight).toEqual({ generation: 1, target: 500 });

    c.coordinator.press(2);
    c.expanded.add(2);
    expect(c.coordinator.currentGeneration).toBe(2);

    const cls = c.coordinator.onScroll(510, null, 2);
    expect(cls).toEqual({ kind: "stale-auto", reached: false });
    expect(c.coordinator.inFlight).toBeNull();
  });

  it("a stale onScroll cannot clear a newer in-flight target", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    c.coordinator.press(2);
    c.expanded.add(2);
    jest.advanceTimersByTime(100);
    c.measureCallbacks[1].cb(900);
    expect(c.coordinator.inFlight).toEqual({ generation: 2, target: 900 });

    const cls = c.coordinator.onScroll(501, null, 2);
    expect(cls).toEqual({ kind: "active-auto", reached: false });
    expect(c.coordinator.inFlight).toEqual({ generation: 2, target: 900 });
  });

  it("coalesces a burst of layout events during expansion into a single measurement", () => {
    const c = setup();
    c.coordinator.press(1);
    c.expanded.add(1);
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(10);
      c.coordinator.notifyLayout(1);
    }
    expect(c.measureSection).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(c.measureSection).toHaveBeenCalledTimes(1);
  });

  it("revalidates and re-scrolls when a layout change arrives during an in-flight scroll", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 500);
    expect(c.coordinator.inFlight).toEqual({ generation: 1, target: 500 });

    c.coordinator.notifyLayout(1);
    jest.advanceTimersByTime(100);
    expect(c.measureSection).toHaveBeenCalledTimes(2);
    c.measureCallbacks[1].cb(820);
    expect(c.scrollToSection).toHaveBeenLastCalledWith(1, 820);
    expect(c.coordinator.inFlight).toEqual({ generation: 1, target: 820 });
  });

  it("re-issues a scroll when layout settles with an unreachable target still pending", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 1335);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 1335);
    expect(c.coordinator.inFlight).toEqual({ generation: 1, target: 1335 });

    c.coordinator.notifyLayout(1);
    jest.advanceTimersByTime(100);
    c.measureCallbacks[1].cb(1335);
    expect(c.scrollToSection).toHaveBeenCalledTimes(2);
    expect(c.scrollToSection).toHaveBeenLastCalledWith(1, 1335);
  });

  it("manual scroll (onScrollBeginDrag) invalidates the active auto-scroll", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);

    c.coordinator.onScrollBeginDrag();

    expect(c.coordinator.currentGeneration).toBe(2);
    expect(c.coordinator.pendingTarget).toBeNull();
    expect(c.coordinator.inFlight).toBeNull();
  });

  it("a late measure after manual scroll cannot reissue a scroll", () => {
    const c = setup();
    c.coordinator.press(1);
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    expect(c.measureSection).toHaveBeenCalledTimes(1);

    c.coordinator.onScrollBeginDrag();

    c.measureCallbacks[0].cb(700);
    expect(c.scrollToSection).not.toHaveBeenCalled();
    expect(c.coordinator.inFlight).toBeNull();
  });

  it("layout events after manual scroll are ignored (no re-measure, no re-scroll)", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);

    c.coordinator.onScrollBeginDrag();

    c.coordinator.notifyLayout(1);
    jest.advanceTimersByTime(200);
    expect(c.measureSection).toHaveBeenCalledTimes(1);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
  });

  it("unmount (cancel) invalidates the active generation", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);

    c.coordinator.cancel();

    expect(c.coordinator.currentGeneration).toBe(2);
    expect(c.coordinator.pendingTarget).toBeNull();
    expect(c.coordinator.inFlight).toBeNull();
    expect(c.coordinator.onScroll(500, null, 2).kind).not.toBe("active-auto");
  });

  it("classifies a dropdown auto-scroll as dropdown-auto when no section scroll is active", () => {
    const c = setup();
    expect(c.coordinator.onScroll(100, 200, 2)).toEqual({ kind: "dropdown-auto", reached: false });
  });

  it("classifies manual scrolling when nothing is pending", () => {
    const c = setup();
    expect(c.coordinator.onScroll(100, null, 2)).toEqual({ kind: "manual", reached: false });
  });

  it("pressing an already-expanded section cancels instead of scheduling", () => {
    const c = setup();
    c.expanded.add(1);
    c.coordinator.press(1);
    expect(c.coordinator.pendingTarget).toBeNull();
    jest.advanceTimersByTime(200);
    expect(c.measureSection).not.toHaveBeenCalled();
    expect(c.scrollToSection).not.toHaveBeenCalled();
  });

  it("cancel() is idempotent and safe when idle", () => {
    const c = setup();
    expect(() => c.coordinator.cancel()).not.toThrow();
    c.coordinator.cancel();
    expect(c.coordinator.pendingTarget).toBeNull();
    jest.advanceTimersByTime(200);
    expect(c.scrollToSection).not.toHaveBeenCalled();
  });

  it("re-expanding a section after it collapsed schedules a fresh auto-scroll", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);

    c.coordinator.press(1);
    c.expanded.delete(1);
    c.coordinator.press(1);
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    expect(c.measureSection).toHaveBeenCalledTimes(2);
    c.measureCallbacks[1].cb(300);
    expect(c.scrollToSection).toHaveBeenCalledTimes(2);
  });

  it("reports pendingTarget only while an auto-scroll generation is active", () => {
    const c = setup();
    expect(c.coordinator.pendingTarget).toBeNull();
    c.coordinator.press(1);
    expect(c.coordinator.pendingTarget).toBe(1);
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    expect(c.coordinator.pendingTarget).toBe(1);
    c.coordinator.onScroll(500, null, 2);
    c.coordinator.onScrollBeginDrag();
    expect(c.coordinator.pendingTarget).toBeNull();
  });

  it("ignores layout events when no auto-scroll is active", () => {
    const c = setup();
    c.coordinator.notifyLayout(3);
    jest.advanceTimersByTime(200);
    expect(c.measureSection).not.toHaveBeenCalled();
  });

  it("a pending revalidation timer exists when the auto-scroll reaches its target", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 500);

    c.coordinator.notifyLayout(1);
    jest.advanceTimersByTime(50);
    expect(c.measureSection).toHaveBeenCalledTimes(1);

    const cls = c.coordinator.onScroll(501, null, 2);
    expect(cls).toEqual({ kind: "active-auto", reached: true });
    expect(c.coordinator.inFlight).toBeNull();
  });

  it("reaching the target invalidates the pending revalidation timer", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);

    c.coordinator.notifyLayout(1);
    c.coordinator.onScroll(501, null, 2);

    jest.advanceTimersByTime(300);
    expect(c.measureSection).toHaveBeenCalledTimes(1);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
  });

  it("a late timer callback cannot issue another scroll for a completed generation", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);

    c.coordinator.notifyLayout(1);
    jest.advanceTimersByTime(100);
    expect(c.measureSection).toHaveBeenCalledTimes(2);

    c.coordinator.onScroll(501, null, 2);
    c.measureCallbacks[1].cb(520);

    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
    expect(c.coordinator.inFlight).toBeNull();
  });

  it("late onLayout cannot issue another scroll for a completed generation", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);

    c.coordinator.onScroll(501, null, 2);

    c.coordinator.notifyLayout(1);
    jest.advanceTimersByTime(300);
    expect(c.measureSection).toHaveBeenCalledTimes(1);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
  });

  it("late measure callback cannot issue another scroll for a completed generation", () => {
    const c = setup();
    pressAndExpand(c, 1);
    jest.advanceTimersByTime(100);
    c.measureCallbacks[0].cb(500);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 500);

    c.coordinator.notifyLayout(1);
    jest.advanceTimersByTime(100);
    expect(c.measureSection).toHaveBeenCalledTimes(2);

    c.coordinator.onScroll(501, null, 2);
    c.measureCallbacks[1].cb(620);

    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
    expect(c.coordinator.inFlight).toBeNull();
  });

  it("re-validation stays active after reaching until the next interaction starts a new generation", () => {
    const c = setup();
    pressAndExpand(c, 1);
    settleAndMeasure(c, 1, 500);
    c.coordinator.onScroll(501, null, 2);

    c.coordinator.press(1);
    c.expanded.delete(1);
    c.coordinator.press(1);
    c.expanded.add(1);

    expect(c.coordinator.pendingTarget).toBe(1);
    jest.advanceTimersByTime(100);
    c.measureCallbacks[1].cb(300);
    expect(c.scrollToSection).toHaveBeenCalledTimes(2);
    expect(c.scrollToSection).toHaveBeenLastCalledWith(1, 300);
  });
});
