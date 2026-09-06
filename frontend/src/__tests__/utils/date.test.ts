import { getCurrentInspectionDate, parseInspectionDate } from "@/src/utils/date";

describe("getCurrentInspectionDate", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns date in DD-Mon-YYYY format", () => {
    jest.setSystemTime(new Date("2024-06-15T10:30:00"));
    const result = getCurrentInspectionDate();
    expect(result).toBe("15-Jun-2024");
  });

  it("pads single digit day", () => {
    jest.setSystemTime(new Date("2024-01-05T00:00:00"));
    const result = getCurrentInspectionDate();
    expect(result).toBe("05-Jan-2024");
  });

  it("handles December date", () => {
    jest.setSystemTime(new Date("2024-12-25T00:00:00"));
    const result = getCurrentInspectionDate();
    expect(result).toBe("25-Dec-2024");
  });
});

describe("parseInspectionDate", () => {
  it("parses DD-Mon-YYYY into a timestamp", () => {
    const result = parseInspectionDate("15-Jun-2024");
    const parsed = new Date(result);
    expect(parsed.getFullYear()).toBe(2024);
    expect(parsed.getMonth()).toBe(5);
    expect(parsed.getDate()).toBe(15);
  });

  it("sorts chronologically across months", () => {
    expect(parseInspectionDate("01-Aug-2026")).toBeGreaterThan(
      parseInspectionDate("31-Jul-2026")
    );
  });

  it("returns NaN for malformed input", () => {
    expect(Number.isNaN(parseInspectionDate("15/06/2024"))).toBe(true);
    expect(Number.isNaN(parseInspectionDate("15-Xxx-2024"))).toBe(true);
    expect(Number.isNaN(parseInspectionDate(""))).toBe(true);
  });
});
