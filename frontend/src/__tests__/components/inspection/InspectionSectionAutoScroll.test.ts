import {
  computeSectionScrollTarget,
  measureSectionInWindow,
} from "@/src/components/inspection/sectionAutoScroll";

describe("computeSectionScrollTarget", () => {
  const base = {
    scrollViewTop: 88,
    scrollViewHeight: 688,
    currentOffset: 0,
  };

  it("returns null when the section is already fully visible", () => {
    const target = computeSectionScrollTarget({
      ...base,
      sectionY: 200,
      sectionHeight: 300,
    });
    expect(target).toBeNull();
  });

  it("returns null when the section sits exactly at the visible bottom edge", () => {
    const target = computeSectionScrollTarget({
      ...base,
      sectionY: 88,
      sectionHeight: 688,
    });
    expect(target).toBeNull();
  });

  it("scrolls when the section bottom exceeds the visible viewport but not the window height", () => {
    const target = computeSectionScrollTarget({
      ...base,
      sectionY: 188,
      sectionHeight: 600,
    });
    expect(target).toBe(52);
  });

  it("scrolls a below-the-fold section to its content-space top minus padding", () => {
    const target = computeSectionScrollTarget({
      ...base,
      sectionY: 500,
      sectionHeight: 400,
    });
    expect(target).toBe(364);
  });

  it("accounts for the current scroll offset", () => {
    const target = computeSectionScrollTarget({
      ...base,
      currentOffset: 300,
      sectionY: 500,
      sectionHeight: 400,
    });
    expect(target).toBe(664);
  });

  it("scrolls when the section top is above the viewport top", () => {
    const target = computeSectionScrollTarget({
      ...base,
      sectionY: 40,
      sectionHeight: 500,
    });
    expect(target).toBe(0);
  });

  it("clamps the scroll target to 0", () => {
    const target = computeSectionScrollTarget({
      ...base,
      currentOffset: 10,
      sectionY: 40,
      sectionHeight: 100,
    });
    expect(target).toBe(0);
  });

  it("honors a custom padding", () => {
    const target = computeSectionScrollTarget({
      ...base,
      padding: 24,
      sectionY: 500,
      sectionHeight: 400,
    });
    expect(target).toBe(388);
  });
});

describe("measureSectionInWindow", () => {
  function measureRef(y: number, height: number) {
    return {
      measureInWindow: jest.fn(
        (cb: (x: number, y: number, w: number, h: number) => void) =>
          cb(0, y, 300, height)
      ),
    };
  }

  function scrollViewRefWith() {
    return { current: { scrollTo: jest.fn() } };
  }

  it("measures the section and reports the computed target via the callback", () => {
    const ref = measureRef(500, 400);
    const scrollViewRef = scrollViewRefWith();
    const onMeasured = jest.fn();

    measureSectionInWindow(ref, scrollViewRef, 88, 688, 0, undefined, onMeasured);

    expect(ref.measureInWindow).toHaveBeenCalled();
    expect(onMeasured).toHaveBeenCalledWith(364);
  });

  it("reports null when the section is already fully visible", () => {
    const ref = measureRef(200, 300);
    const scrollViewRef = scrollViewRefWith();
    const onMeasured = jest.fn();

    measureSectionInWindow(ref, scrollViewRef, 88, 688, 0, undefined, onMeasured);

    expect(onMeasured).toHaveBeenCalledWith(null);
  });

  it("does not invoke the callback when the section ref is null", () => {
    const scrollViewRef = scrollViewRefWith();
    const onMeasured = jest.fn();

    expect(() =>
      measureSectionInWindow(null, scrollViewRef, 88, 688, 0, undefined, onMeasured)
    ).not.toThrow();
    expect(onMeasured).not.toHaveBeenCalled();
  });

  it("does not measure when the ScrollView ref is not attached", () => {
    const ref = measureRef(500, 400);
    const onMeasured = jest.fn();

    measureSectionInWindow(ref, { current: null }, 88, 688, 0, undefined, onMeasured);

    expect(ref.measureInWindow).not.toHaveBeenCalled();
    expect(onMeasured).not.toHaveBeenCalled();
  });
});