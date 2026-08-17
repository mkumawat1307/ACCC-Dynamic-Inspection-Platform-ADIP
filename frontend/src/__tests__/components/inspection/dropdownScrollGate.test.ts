import {
  registerPendingOpen,
  cancelPendingOpen,
  hasPendingOpen,
  notifyScrollOffset,
  SCROLL_TOLERANCE,
} from "@/src/components/inspection/dropdownScrollGate";

describe("dropdownScrollGate", () => {
  beforeEach(() => {
    cancelPendingOpen();
  });

  it("fires onReached when the reported offset matches the target exactly", () => {
    const onReached = jest.fn();
    registerPendingOpen(100, onReached);
    notifyScrollOffset(100);
    expect(onReached).toHaveBeenCalledTimes(1);
  });

  it("matches the requested target within the native rounding tolerance", () => {
    const onReached = jest.fn();
    registerPendingOpen(326.148, onReached);
    notifyScrollOffset(326.296);
    expect(onReached).toHaveBeenCalledTimes(1);
  });

  it("does not fire for an intermediate offset outside the tolerance", () => {
    const onReached = jest.fn();
    registerPendingOpen(326.148, onReached);
    notifyScrollOffset(150);
    expect(onReached).not.toHaveBeenCalled();
    expect(hasPendingOpen()).toBe(true);
  });

  it("fires once a later offset reaches the target", () => {
    const onReached = jest.fn();
    registerPendingOpen(326.148, onReached);
    notifyScrollOffset(150);
    notifyScrollOffset(326.296);
    expect(onReached).toHaveBeenCalledTimes(1);
    expect(hasPendingOpen()).toBe(false);
  });

  it("clears pending before invoking onReached so re-entrant notifications cannot double-fire", () => {
    const onReached = jest.fn(() => {
      notifyScrollOffset(326.296);
    });
    registerPendingOpen(326.148, onReached);
    notifyScrollOffset(326.296);
    expect(onReached).toHaveBeenCalledTimes(1);
  });

  it("cancelling a pending open prevents any later offset from firing it", () => {
    const onReached = jest.fn();
    registerPendingOpen(326.148, onReached);
    cancelPendingOpen();
    notifyScrollOffset(326.296);
    expect(onReached).not.toHaveBeenCalled();
    expect(hasPendingOpen()).toBe(false);
  });

  it("registering a new pending open supersedes the previous one", () => {
    const first = jest.fn();
    const second = jest.fn();
    registerPendingOpen(100, first);
    registerPendingOpen(200, second);
    notifyScrollOffset(100);
    expect(first).not.toHaveBeenCalled();
    notifyScrollOffset(200);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("notifyScrollOffset is a no-op when nothing is pending", () => {
    expect(() => notifyScrollOffset(50)).not.toThrow();
    expect(hasPendingOpen()).toBe(false);
  });

  it("hasPendingOpen reflects registered and cancelled state", () => {
    expect(hasPendingOpen()).toBe(false);
    registerPendingOpen(100, jest.fn());
    expect(hasPendingOpen()).toBe(true);
    cancelPendingOpen();
    expect(hasPendingOpen()).toBe(false);
  });

  it("exposes a positive tolerance suitable for native rounding", () => {
    expect(SCROLL_TOLERANCE).toBeGreaterThan(0);
  });
});
