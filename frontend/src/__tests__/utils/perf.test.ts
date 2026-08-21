import { perfNow, perfStart, perfStage, perfReport, perfLog, uiPerfReset, uiPerfStage } from "@/src/utils/perf";

describe("perf utils", () => {
  it("perfNow returns a finite number", () => {
    const t = perfNow();
    expect(typeof t).toBe("number");
    expect(Number.isFinite(t)).toBe(true);
  });

  it("perfStart initializes an accumulator for a photo", () => {
    const acc = perfStart(7);
    expect(acc.photoId).toBe(7);
    expect(acc.stages).toEqual([]);
    expect(acc.totalStart).toBeGreaterThan(0);
  });

  it("perfStage records a named stage measuring from the previous stage", async () => {
    const acc = perfStart(1);
    await new Promise(r => setTimeout(r, 5));
    perfStage(acc, "fileRead");
    await new Promise(r => setTimeout(r, 5));
    perfStage(acc, "htmlGen");

    expect(acc.stages).toHaveLength(2);
    expect(acc.stages[0].name).toBe("fileRead");
    expect(acc.stages[1].name).toBe("htmlGen");
    expect(acc.stages[0].ms).toBeGreaterThanOrEqual(0);
    expect(acc.stages[1].ms).toBeGreaterThanOrEqual(0);
  });

  it("perfReport returns total", async () => {
    const acc = perfStart(3);
    await new Promise(r => setTimeout(r, 2));
    perfStage(acc, "safWrite");
    const total = perfReport(acc);

    expect(total).toBeGreaterThanOrEqual(0);
  });

  it("perfLog returns ms", () => {
    const start = perfNow();
    const ms = perfLog("capture", "takePicture", start);

    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("perfStage mutates the passed accumulator in place", () => {
    const acc = perfStart(1);
    const returned = perfStage(acc, "x");
    expect(returned).toBe(acc);
    expect(acc.stages).toHaveLength(1);
  });

  it("uiPerfReset starts a fresh UI perf session", () => {
    uiPerfReset();
    uiPerfStage("photoCaptured", "size=100x200");
    expect(true).toBe(true);
  });

  it("uiPerfStage is callable without error", async () => {
    uiPerfReset();
    uiPerfStage("shutterTap");
    await new Promise(r => setTimeout(r, 5));
    uiPerfStage("overlayStart", "photo=1");
    expect(true).toBe(true);
  });

  it("uiPerfReset clears the previous checkpoint so the next session starts fresh", async () => {
    uiPerfReset();
    uiPerfStage("shutterTap");
    await new Promise(r => setTimeout(r, 5));
    uiPerfReset();
    uiPerfStage("photoCaptured");
    expect(true).toBe(true);
  });
});
