export interface SectionScrollTargetInput {
  sectionY: number;
  sectionHeight: number;
  scrollViewTop: number;
  scrollViewHeight: number;
  currentOffset: number;
  padding?: number;
}

export function computeSectionScrollTarget({
  sectionY,
  sectionHeight,
  scrollViewTop,
  scrollViewHeight,
  currentOffset,
  padding = 48,
}: SectionScrollTargetInput): number | null {
  const sectionTop = sectionY - scrollViewTop;
  const sectionBottom = sectionTop + sectionHeight;

  const isFullyVisible = sectionTop >= 0 && sectionBottom <= scrollViewHeight;
  if (isFullyVisible) return null;

  const contentTop = Math.max(0, sectionTop + currentOffset);
  return Math.max(0, contentTop - padding);
}

type MeasureCallback = (x: number, y: number, width: number, height: number) => void;

export function measureSectionInWindow(
  ref: { measureInWindow?: (cb: MeasureCallback) => void } | null,
  scrollViewRef: { current: unknown } | null,
  scrollViewTop: number,
  scrollViewHeight: number,
  currentOffset: number,
  padding?: number,
  onMeasured?: (target: number | null) => void
): void {
  if (!ref || !scrollViewRef?.current) {
    return;
  }

  ref.measureInWindow?.((x, y, width, height) => {
    if (!scrollViewRef.current) {
      return;
    }

    const target = computeSectionScrollTarget({
      sectionY: y,
      sectionHeight: height,
      scrollViewTop,
      scrollViewHeight,
      currentOffset,
      padding,
    });

    onMeasured?.(target);
  });
}
