export type SecScrollKind = "active-auto" | "stale-auto" | "manual" | "dropdown-auto";

export interface SecScrollClassification {
  kind: SecScrollKind;
  reached: boolean;
}

export interface SecInFlight {
  generation: number;
  target: number;
}

export interface SectionScrollCoordinatorDeps {
  isExpanded: (sectionId: number) => boolean;
  measureSection: (
    sectionId: number,
    generation: number,
    onMeasured: (target: number | null) => void
  ) => void;
  scrollToSection: (sectionId: number, target: number) => void;
  debounceMs?: number;
}

export class SectionScrollCoordinator {
  private readonly isExpanded: (sectionId: number) => boolean;
  private readonly measureSection: SectionScrollCoordinatorDeps["measureSection"];
  private readonly scrollToSection: (sectionId: number, target: number) => void;
  private readonly debounceMs: number;
  private target: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private inFlightState: SecInFlight | null = null;
  private satisfied = false;

  constructor(deps: SectionScrollCoordinatorDeps) {
    this.isExpanded = deps.isExpanded;
    this.measureSection = deps.measureSection;
    this.scrollToSection = deps.scrollToSection;
    this.debounceMs = deps.debounceMs ?? 100;
  }

  press(sectionId: number): void {
    const wasExpanded = this.isExpanded(sectionId);
    if (wasExpanded) {
      this.cancel();
      return;
    }
    this.generation += 1;
    this.satisfied = false;
    this.target = sectionId;
    this.schedule(sectionId);
  }

  schedule(sectionId: number): void {
    if (this.target !== sectionId) {
      return;
    }
    if (this.satisfied) {
      return;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.satisfied) {
        return;
      }
      if (!this.isExpanded(sectionId)) {
        this.cancel();
        return;
      }
      const gen = this.generation;
      this.measureSection(sectionId, gen, (target) => this.onMeasured(sectionId, gen, target));
    }, this.debounceMs);
  }

  notifyLayout(sectionId: number): void {
    if (this.target === null) {
      return;
    }
    if (this.satisfied) {
      return;
    }
    this.schedule(this.target);
  }

  onMeasured(sectionId: number, generation: number, target: number | null): void {
    if (target === null) {
      this.inFlightState = null;
      return;
    }
    if (this.satisfied || generation !== this.generation || this.target !== sectionId) {
      return;
    }
    this.inFlightState = { generation, target };
    this.scrollToSection(sectionId, target);
  }

  onScroll(offset: number, dropdownTarget: number | null, tolerance: number): SecScrollClassification {
    const inFlight = this.inFlightState;
    if (inFlight !== null && inFlight.generation === this.generation) {
      const reached = Math.abs(offset - inFlight.target) <= tolerance;
      if (reached) {
        this.inFlightState = null;
        this.satisfied = true;
        const timer = this.timer;
        if (timer !== null) {
          clearTimeout(timer);
          this.timer = null;
        }
      }
      return { kind: "active-auto", reached };
    }
    if (inFlight !== null) {
      this.inFlightState = null;
      return { kind: "stale-auto", reached: false };
    }
    if (dropdownTarget !== null) {
      return { kind: "dropdown-auto", reached: false };
    }
    return { kind: "manual", reached: false };
  }

  onScrollBeginDrag(): void {
    this.cancel();
  }

  cancel(): void {
    this.generation += 1;
    this.target = null;
    this.inFlightState = null;
    this.satisfied = false;
    const timer = this.timer;
    if (timer !== null) {
      clearTimeout(timer);
      this.timer = null;
    }
  }

  get pendingTarget(): number | null {
    return this.target;
  }

  get currentGeneration(): number {
    return this.generation;
  }

  get inFlight(): SecInFlight | null {
    return this.inFlightState;
  }
}
