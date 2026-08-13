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

  it("perfReport logs a structured per-photo line and returns total", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const acc = perfStart(3);
    await new Promise(r => setTimeout(r, 2));
    perfStage(acc, "safWrite");
    const total = perfReport(acc);

    expect(total).toBeGreaterThanOrEqual(0);
    const log = spy.mock.calls[0][0] as string;
    expect(log).toContain("[Perf:watermark]");
    expect(log).toContain("photo=3");
    expect(log).toContain("total=");
    expect(log).toContain("safWrite=");
    spy.mockRestore();
  });

  it("perfLog logs a single stage measurement", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const start = perfNow();
    const ms = perfLog("capture", "takePicture", start);

    expect(ms).toBeGreaterThanOrEqual(0);
    const log = spy.mock.calls[0][0] as string;
    expect(log).toContain("[Perf] capture takePicture:");
    expect(log).toContain("ms");
    spy.mockRestore();
  });

  it("perfStage mutates the passed accumulator in place", () => {
    const acc = perfStart(1);
    const returned = perfStage(acc, "x");
    expect(returned).toBe(acc);
    expect(acc.stages).toHaveLength(1);
  });

  it("uiPerfReset starts a fresh UI perf session", () => {
    uiPerfReset();
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    uiPerfStage("photoCaptured", "size=100x200");
    const log = spy.mock.calls[0][0] as string;
    expect(log).toContain("[Perf:UI] photoCaptured");
    expect(log).toContain("size=100x200");
    expect(log).toContain("since=(start)");
    spy.mockRestore();
  });

  it("uiPerfStage reports delta from the previous checkpoint", async () => {
    uiPerfReset();
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    uiPerfStage("shutterTap");
    await new Promise(r => setTimeout(r, 5));
    uiPerfStage("overlayStart", "photo=1");
    const first = spy.mock.calls[0][0] as string;
    const second = spy.mock.calls[1][0] as string;
    expect(first).toContain("since=(start)");
    expect(second).toContain("since=shutterTap");
    expect(second).toContain("photo=1");
    const sincePrev = second.match(/\+(\d+(?:\.\d+)?)ms/)?.[1];
    expect(Number(sincePrev)).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it("uiPerfReset clears the previous checkpoint so the next session starts fresh", async () => {
    uiPerfReset();
    uiPerfStage("shutterTap");
    await new Promise(r => setTimeout(r, 5));
    uiPerfReset();
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    uiPerfStage("photoCaptured");
    const log = spy.mock.calls[0][0] as string;
    expect(log).toContain("since=(start)");
    // Allow small timing variance in test environment (>= 0ms instead of exactly 0.0ms)
    const sinceMatch = log.match(/\+(\d+(?:\.\d+)?)ms/);
    expect(sinceMatch).toBeTruthy();
    expect(Number(sinceMatch![1])).toBeLessThanOrEqual(5);
    spy.mockRestore();
  });
});
