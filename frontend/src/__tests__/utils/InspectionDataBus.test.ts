import { InspectionDataBus } from "@/src/utils/InspectionDataBus";

describe("InspectionDataBus", () => {
  beforeEach(() => {
    InspectionDataBus.__reset();
  });

  it("delivers emitted events to subscribed listeners with the projectId", () => {
    const listener = jest.fn();
    InspectionDataBus.subscribe(listener);
    InspectionDataBus.emitInspectionsChanged(7);
    expect(listener).toHaveBeenCalledWith({ projectId: 7 });
  });

  it("does not deliver after unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = InspectionDataBus.subscribe(listener);
    unsubscribe();
    InspectionDataBus.emitInspectionsChanged(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers to multiple listeners", () => {
    const a = jest.fn();
    const b = jest.fn();
    InspectionDataBus.subscribe(a);
    InspectionDataBus.subscribe(b);
    InspectionDataBus.emitInspectionsChanged(3);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("does not fail when a listener throws", () => {
    InspectionDataBus.subscribe(() => {
      throw new Error("boom");
    });
    const ok = jest.fn();
    InspectionDataBus.subscribe(ok);
    expect(() => InspectionDataBus.emitInspectionsChanged(2)).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("__reset clears all listeners", () => {
    const listener = jest.fn();
    InspectionDataBus.subscribe(listener);
    InspectionDataBus.__reset();
    InspectionDataBus.emitInspectionsChanged(4);
    expect(listener).not.toHaveBeenCalled();
  });
});
