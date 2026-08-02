export interface InspectionChangeEvent {
  projectId: number;
}

type Listener = (event: InspectionChangeEvent) => void;

const listeners = new Set<Listener>();

export const InspectionDataBus = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  emitInspectionsChanged(projectId: number): void {
    const snapshot = [...listeners];
    for (const listener of snapshot) {
      try {
        listener({ projectId });
      } catch {
        // A listener failure must never break the write path.
      }
    }
  },

  __reset(): void {
    listeners.clear();
  },
};
