// Registry for debounced field-value saves (scheduleFieldValueSave /
// flushPendingFieldValueSaves / cancelPendingFieldValueSaves). Regression for
// the save-path debounce race: a stale debounced write landing after a
// Save/Complete, and the latest typed value being lost when Save happens inside
// the debounce window.
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { InspectionEditSession } from "@/src/database/repositories/InspectionEditSession";
import { InspectionEditSessionState } from "@/src/database/repositories/InspectionEditSessionState";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("InspectionRepository field-value save debounce registry", () => {
  let saveFieldValue: jest.SpyInstance;

  beforeEach(() => {
    saveFieldValue = jest
      .spyOn(InspectionRepository, "saveFieldValue")
      .mockResolvedValue(undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    InspectionRepository.cancelPendingFieldValueSaves();
    await InspectionEditSession.discard();
  });

  it("writes the scheduled value after the debounce window", async () => {
    InspectionRepository.scheduleFieldValueSave(1, 10, "first", 30);
    await wait(60);

    expect(saveFieldValue).toHaveBeenCalledTimes(1);
    expect(saveFieldValue).toHaveBeenCalledWith(1, 10, "first");
  });

  it("settles rapid changes into a single write of the latest value", async () => {
    InspectionRepository.scheduleFieldValueSave(1, 10, "a", 30);
    await wait(10);
    InspectionRepository.scheduleFieldValueSave(1, 10, "b", 30);
    await wait(10);
    InspectionRepository.scheduleFieldValueSave(1, 10, "c", 30);
    await wait(60);

    expect(saveFieldValue).toHaveBeenCalledTimes(1);
    expect(saveFieldValue).toHaveBeenCalledWith(1, 10, "c");
  });

  it("flushes the latest value immediately, then writes nothing afterwards", async () => {
    InspectionRepository.scheduleFieldValueSave(1, 10, "latest", 30);
    await InspectionRepository.flushPendingFieldValueSaves();

    expect(saveFieldValue).toHaveBeenCalledTimes(1);
    expect(saveFieldValue).toHaveBeenCalledWith(1, 10, "latest");

    await wait(60);
    expect(saveFieldValue).toHaveBeenCalledTimes(1);
  });

  it("keeps per-inspection per-field timers independent", async () => {
    InspectionRepository.scheduleFieldValueSave(1, 10, "f10", 30);
    InspectionRepository.scheduleFieldValueSave(1, 20, "f20", 30);
    InspectionRepository.scheduleFieldValueSave(2, 10, "other", 30);
    await wait(60);

    expect(saveFieldValue).toHaveBeenCalledTimes(3);
    expect(saveFieldValue).toHaveBeenCalledWith(1, 10, "f10");
    expect(saveFieldValue).toHaveBeenCalledWith(1, 20, "f20");
    expect(saveFieldValue).toHaveBeenCalledWith(2, 10, "other");
  });

  it("cancels pending writes without persisting anything", async () => {
    InspectionRepository.scheduleFieldValueSave(1, 10, "lost", 30);
    InspectionRepository.cancelPendingFieldValueSaves();
    await wait(60);

    expect(saveFieldValue).not.toHaveBeenCalled();
  });

  it("a flush supersedes a pending timer (no duplicate post-flush write)", async () => {
    InspectionRepository.scheduleFieldValueSave(1, 10, "stale", 30);
    await InspectionRepository.flushPendingFieldValueSaves();
    await wait(10);
    InspectionRepository.scheduleFieldValueSave(1, 10, "fresh", 30);
    await wait(60);

    expect(saveFieldValue).toHaveBeenCalledTimes(2);
    expect(saveFieldValue).toHaveBeenLastCalledWith(1, 10, "fresh");
  });

  it("drains in-flight writes before flushing the latest value (no stale overwrite)", async () => {
    let calls = 0;
    let release: () => void = () => {};
    saveFieldValue.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return Promise.resolve(undefined);
    });

    InspectionRepository.scheduleFieldValueSave(1, 10, "old", 30);
    await wait(60); // fires the "old" write, held in-flight

    InspectionRepository.scheduleFieldValueSave(1, 10, "new", 30);
    const flushPromise = InspectionRepository.flushPendingFieldValueSaves();
    // The flush must not issue the newer write until the in-flight one lands.
    expect(calls).toBe(1);
    release();
    await flushPromise;

    expect(calls).toBe(2);
    expect(saveFieldValue).toHaveBeenLastCalledWith(1, 10, "new");
  });

  it("stages synchronously into an active edit session, never via a timer", async () => {
    InspectionEditSession.activate(42);
    InspectionRepository.scheduleFieldValueSave(42, 7, "staged", 30);

    expect(InspectionEditSessionState.getStagedFieldValues().get(7)).toBe("staged");
    expect(saveFieldValue).not.toHaveBeenCalled();

    await wait(60);
    expect(saveFieldValue).not.toHaveBeenCalled();
  });
});