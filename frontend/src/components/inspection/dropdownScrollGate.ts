export const SCROLL_TOLERANCE = 2;

interface PendingOpen {
  target: number;
  onReached: () => void;
}

let pendingOpen: PendingOpen | null = null;

export function registerPendingOpen(target: number, onReached: () => void): void {
  pendingOpen = { target, onReached };
}

export function cancelPendingOpen(): void {
  pendingOpen = null;
}

export function hasPendingOpen(): boolean {
  return pendingOpen !== null;
}

export function notifyScrollOffset(offset: number): void {
  if (!pendingOpen) return;
  if (Math.abs(offset - pendingOpen.target) <= SCROLL_TOLERANCE) {
    const onReached = pendingOpen.onReached;
    pendingOpen = null;
    onReached();
  }
}
