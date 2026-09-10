//frontend\src\database\repositories\InspectionLiveValues.ts
//
// Synchronous in-memory snapshot of the values currently shown in the form.
//
// The progress summary is computed asynchronously from the database, so it
// always lags the screen. While the user types, the form's in-memory state
// (GeneralInformation, SectionRenderer) is the only authoritative copy — the
// database catch-up may still be waiting on a debounced save, an async write,
// or a remount. Every field change writes to this overlay immediately, and the
// progress service reads it BEFORE staged and persisted values, so progress
// reflects exactly what the inspector sees.
//
// This is a module-level singleton (mirroring InspectionEditSession and the
// device saveRegistry). It is reset on screen entry and unmount; it holds no
// inspection identity because it is only ever consulted by the active screen.

const liveFieldValues = new Map<number, string>();

export class InspectionLiveValues {
  static setFieldValue(fieldId: number, value: string): void {
    liveFieldValues.set(fieldId, value);
  }

  static getLiveFieldValues(): Map<number, string> | undefined {
    return liveFieldValues.size > 0 ? new Map(liveFieldValues) : undefined;
  }

  static reset(): void {
    liveFieldValues.clear();
  }
}