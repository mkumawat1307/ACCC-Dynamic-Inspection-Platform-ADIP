import {
  SectionScrollCoordinator,
  SecScrollClassification,
} from "./sectionScrollCoordinator";

export interface ScrollOrchestrationHandlers {
  coordinator: SectionScrollCoordinator | null;
  cancelPendingOpen: () => void;
  notifyScrollOffset: (offset: number) => void;
  tolerance: number;
}

export function handleScrollEvent(
  h: ScrollOrchestrationHandlers,
  offset: number
): SecScrollClassification {
  const classification = h.coordinator
    ? h.coordinator.onScroll(offset, null, h.tolerance)
    : { kind: "manual" as const, reached: false };
  h.notifyScrollOffset(offset);
  return classification;
}

export function handleScrollBeginDrag(
  h: ScrollOrchestrationHandlers,
  offset: number
): void {
  h.coordinator?.onScrollBeginDrag();
  h.cancelPendingOpen();
}

export function pressSection(
  coordinator: SectionScrollCoordinator | null,
  cancelPendingOpenFn: () => void,
  sectionId: number
): void {
  cancelPendingOpenFn();
  coordinator?.press(sectionId);
}
