import {
  SectionScrollCoordinator,
} from "@/src/components/inspection/sectionScrollCoordinator";
import {
  registerPendingOpen,
  cancelPendingOpen,
  hasPendingOpen,
  notifyScrollOffset,
  SCROLL_TOLERANCE,
} from "@/src/components/inspection/dropdownScrollGate";
import {
  handleScrollEvent,
  handleScrollBeginDrag,
  pressSection,
  ScrollOrchestrationHandlers,
} from "@/src/components/inspection/scrollOrchestration";

interface MeasureCall {
  sectionId: number;
  generation: number;
  cb: (target: number | null) => void;
}

function setup() {
  const expanded = new Set<number>();
  const isExpanded = jest.fn((id: number) => expanded.has(id));
  const scrollToSection = jest.fn();
  const measureCallbacks: MeasureCall[] = [];
  const measureSection = jest.fn(
    (
      sectionId: number,
      generation: number,
      cb: (target: number | null) => void
    ) => {
      measureCallbacks.push({ sectionId, generation, cb });
    }
  );
  const coordinator = new SectionScrollCoordinator({
    isExpanded,
    measureSection,
    scrollToSection,
  });
  const handlers: ScrollOrchestrationHandlers = {
    coordinator,
    cancelPendingOpen,
    notifyScrollOffset,
    tolerance: SCROLL_TOLERANCE,
  };
  return {
    coordinator,
    isExpanded,
    scrollToSection,
    measureSection,
    measureCallbacks,
    handlers,
    expanded,
  };
}

function expectManual(c: ReturnType<typeof setup>, offset: number) {
  return c.coordinator.onScroll(offset, null, SCROLL_TOLERANCE);
}

beforeEach(() => {
  jest.useFakeTimers();
  cancelPendingOpen();
});

afterEach(() => {
  cancelPendingOpen();
  jest.useRealTimers();
});

describe("section auto-scroll + dropdown auto-scroll integration", () => {
  it("a completed section auto-scroll does not block a subsequent dropdown auto-scroll", () => {
    const c = setup();

    c.coordinator.press(1);
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    c.measureCallbacks[0].cb(500);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 500);
    expect(
      c.coordinator.onScroll(501, null, SCROLL_TOLERANCE)
    ).toEqual({ kind: "active-auto", reached: true });
    expect(c.coordinator.inFlight).toBeNull();

    const open = jest.fn();
    registerPendingOpen(700, open);
    expect(hasPendingOpen()).toBe(true);

    const classification = handleScrollEvent(c.handlers, 700);
    expect(classification.kind).toBe("manual");
    expect(open).toHaveBeenCalledTimes(1);
    expect(hasPendingOpen()).toBe(false);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
  });

  it("a pending dropdown open is registered while a section scroll is in flight and fires when the section settles", () => {
    const c = setup();

    c.coordinator.press(1);
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    c.measureCallbacks[0].cb(500);
    expect(c.coordinator.inFlight).not.toBeNull();

    const open = jest.fn();
    registerPendingOpen(640, open);

    expect(handleScrollEvent(c.handlers, 620).kind).toBe("active-auto");
    expect(open).not.toHaveBeenCalled();
    expect(hasPendingOpen()).toBe(true);

    const reached = handleScrollEvent(c.handlers, 640);
    expect(reached).toEqual({ kind: "active-auto", reached: false });
    expect(open).toHaveBeenCalledTimes(1);
    expect(hasPendingOpen()).toBe(false);
  });
});

describe("section press vs pending dropdown", () => {
  it("pressing a section cancels a pending dropdown open before the section scroll starts", () => {
    const c = setup();
    const open = jest.fn();
    registerPendingOpen(700, open);
    expect(hasPendingOpen()).toBe(true);

    pressSection(c.coordinator, cancelPendingOpen, 2);
    c.expanded.add(2);

    expect(hasPendingOpen()).toBe(false);
    expect(c.coordinator.pendingTarget).toBe(2);

    handleScrollEvent(c.handlers, 700);
    expect(open).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    c.measureCallbacks[0].cb(600);
    expect(c.scrollToSection).toHaveBeenCalledWith(2, 600);
  });

  it("collapsing a section clears both the pending dropdown and the section target", () => {
    const c = setup();
    const open = jest.fn();
    registerPendingOpen(700, open);
    c.expanded.add(1);

    pressSection(c.coordinator, cancelPendingOpen, 1);
    c.expanded.delete(1);

    expect(hasPendingOpen()).toBe(false);
    expect(c.coordinator.pendingTarget).toBeNull();
    expect(c.coordinator.inFlight).toBeNull();

    handleScrollEvent(c.handlers, 700);
    expect(open).not.toHaveBeenCalled();

    pressSection(c.coordinator, cancelPendingOpen, 1);
    c.expanded.add(1);
    expect(c.coordinator.pendingTarget).toBe(1);

    jest.advanceTimersByTime(100);
    c.measureCallbacks[0].cb(400);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 400);
  });
});

describe("manual drag takes control", () => {
  it("manual drag takes control from an active section auto-scroll", () => {
    const c = setup();

    c.coordinator.press(1);
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    c.measureCallbacks[0].cb(500);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 500);

    const genBefore = c.coordinator.currentGeneration;
    handleScrollBeginDrag(c.handlers, 400);

    expect(c.coordinator.currentGeneration).toBe(genBefore + 1);
    expect(c.coordinator.pendingTarget).toBeNull();
    expect(c.coordinator.inFlight).toBeNull();

    const cls = handleScrollEvent(c.handlers, 500);
    expect(cls.kind).not.toBe("active-auto");
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
  });

  it("manual drag cancels a pending dropdown open; stale onScroll cannot reopen it", () => {
    const c = setup();
    const open = jest.fn();
    registerPendingOpen(700, open);
    expect(hasPendingOpen()).toBe(true);

    handleScrollBeginDrag(c.handlers, 400);

    expect(hasPendingOpen()).toBe(false);

    handleScrollEvent(c.handlers, 700);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("rapid switching", () => {
  it("rapid section switches leave only the last section owning the active generation", () => {
    const c = setup();

    pressSection(c.coordinator, cancelPendingOpen, 1);
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    const cbA = c.measureCallbacks[0];

    pressSection(c.coordinator, cancelPendingOpen, 2);
    c.expanded.add(2);
    jest.advanceTimersByTime(100);
    const cbB = c.measureCallbacks[1];

    pressSection(c.coordinator, cancelPendingOpen, 3);
    c.expanded.add(3);
    jest.advanceTimersByTime(100);
    const cbC = c.measureCallbacks[2];

    cbA.cb(400);
    cbB.cb(500);
    expect(c.scrollToSection).not.toHaveBeenCalled();

    cbC.cb(600);
    expect(c.scrollToSection).toHaveBeenCalledWith(3, 600);
    expect(hasPendingOpen()).toBe(false);
  });

  it("a cancelled dropdown cannot reopen; a fresh dropdown opens normally", () => {
    const c = setup();
    const openA = jest.fn();
    const openB = jest.fn();

    registerPendingOpen(700, openA);
    cancelPendingOpen();
    expect(hasPendingOpen()).toBe(false);

    registerPendingOpen(900, openB);

    handleScrollEvent(c.handlers, 900);
    expect(openB).toHaveBeenCalledTimes(1);
    expect(openA).not.toHaveBeenCalled();
    expect(hasPendingOpen()).toBe(false);

    handleScrollEvent(c.handlers, 700);
    expect(openA).not.toHaveBeenCalled();
  });
});

describe("async layout during a pending dropdown", () => {
  it("does not restart the completed section scroll nor reopen the dropdown", () => {
    const c = setup();

    c.coordinator.press(1);
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    c.measureCallbacks[0].cb(500);
    c.coordinator.onScroll(501, null, SCROLL_TOLERANCE);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);

    const open = jest.fn();
    registerPendingOpen(700, open);

    c.coordinator.notifyLayout(1);
    jest.advanceTimersByTime(200);

    expect(c.measureSection).toHaveBeenCalledTimes(1);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
    expect(hasPendingOpen()).toBe(true);

    handleScrollEvent(c.handlers, 700);
    expect(open).toHaveBeenCalledTimes(1);
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
  });
});

describe("unmount cleanup", () => {
  it("clears a pending dropdown and an in-flight section scroll", () => {
    const c = setup();

    c.coordinator.press(1);
    c.expanded.add(1);
    jest.advanceTimersByTime(100);
    c.measureCallbacks[0].cb(500);
    expect(c.scrollToSection).toHaveBeenCalledWith(1, 500);

    const open = jest.fn();
    registerPendingOpen(700, open);

    cancelPendingOpen();
    c.coordinator.cancel();

    expect(hasPendingOpen()).toBe(false);
    expect(c.coordinator.pendingTarget).toBeNull();
    expect(c.coordinator.inFlight).toBeNull();

    handleScrollEvent(c.handlers, 700);
    expect(open).not.toHaveBeenCalled();
    expect(expectManual(c, 501).kind).not.toBe("active-auto");
    expect(c.scrollToSection).toHaveBeenCalledTimes(1);
  });
});
