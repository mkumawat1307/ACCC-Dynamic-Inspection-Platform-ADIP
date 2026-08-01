import {
  formatDate,
  formatLocation,
  getFileUri,
  formatWatermarkDate,
  formatLatLngWM,
  generateFileName,
} from "@/src/components/inspection/photoUtils";

describe("formatDate", () => {
  it("returns empty string for null input", () => {
    expect(formatDate(null)).toBe("");
  });

  it("returns empty string for empty string input", () => {
    expect(formatDate("")).toBe("");
  });

  it("formats a valid date string", () => {
    const result = formatDate("2024-06-15T10:30:00");
    expect(result).toContain("2024");
    expect(result).toContain("Jun");
  });
});

describe("formatLocation", () => {
  it('returns "No GPS" when lat is null', () => {
    expect(formatLocation(null, 10)).toBe("No GPS");
  });

  it('returns "No GPS" when lng is null', () => {
    expect(formatLocation(20, null)).toBe("No GPS");
  });

  it('returns "No GPS" when both are null', () => {
    expect(formatLocation(null, null)).toBe("No GPS");
  });

  it("formats valid coordinates to 6 decimal places", () => {
    expect(formatLocation(34.052235, -118.243683)).toBe("34.052235, -118.243683");
  });

  it("pads short coordinates", () => {
    expect(formatLocation(0, 0)).toBe("0.000000, 0.000000");
  });
});

describe("getFileUri", () => {
  it("returns empty string for empty path", () => {
    expect(getFileUri("")).toBe("");
  });

  it("returns path unchanged if already file://", () => {
    expect(getFileUri("file:///path/to/file.jpg")).toBe("file:///path/to/file.jpg");
  });

  it("prepends file:// for absolute paths", () => {
    expect(getFileUri("/data/storage/file.jpg")).toBe("file:///data/storage/file.jpg");
  });

  it("returns path unchanged for relative paths", () => {
    expect(getFileUri("relative/path.jpg")).toBe("relative/path.jpg");
  });
});

describe("formatWatermarkDate", () => {
  it("formats ISO date correctly", () => {
    const result = formatWatermarkDate("2024-06-15T14:30:00");
    expect(result).toMatch(/^\d{2}-[A-Z][a-z]{2}-\d{4} \d{1,2}:\d{2} (AM|PM)$/);
    expect(result).toContain("Jun");
    expect(result).toContain("2024");
  });

  it("handles midnight (00:00)", () => {
    const result = formatWatermarkDate("2024-01-01T00:00:00");
    expect(result).toContain("12:00 AM");
  });

  it("handles noon (12:00)", () => {
    const result = formatWatermarkDate("2024-06-15T12:00:00");
    expect(result).toContain("12:00 PM");
  });
});

describe("formatLatLngWM", () => {
  it("formats coordinates to 6 decimal places", () => {
    expect(formatLatLngWM(34.052235, -118.243683)).toBe("34.052235, -118.243683");
  });

  it("handles zero coordinates", () => {
    expect(formatLatLngWM(0, 0)).toBe("0.000000, 0.000000");
  });

  it("handles negative coordinates", () => {
    expect(formatLatLngWM(-33.856784, 151.215297)).toBe("-33.856784, 151.215297");
  });
});

describe("generateFileName", () => {
  it("generates filename from valid inputs", () => {
    const result = generateFileName("North", "BlockA", "P001", "2024-06-15T10:30:00");
    expect(result).toMatch(/^North_BlockA_P001_\d{2}[A-Z]{3}\d{4}_\d{6}\.jpg$/);
  });

  it("sanitizes special characters from district", () => {
    const result = generateFileName("North/1", "BlockA", "P001", "2024-06-15T10:30:00");
    expect(result).toMatch(/^North1_BlockA_P001_/);
  });

  it("sanitizes special characters from block name", () => {
    const result = generateFileName("North", "Block:A", "P001", "2024-06-15T10:30:00");
    expect(result).toMatch(/^North_BlockA_P001_/);
  });

  it("sanitizes special characters from pole", () => {
    const result = generateFileName("North", "BlockA", "P-001", "2024-06-15T10:30:00");
    expect(result).toMatch(/^North_BlockA_P001_/);
  });

  it("uses NA for null district", () => {
    const result = generateFileName("", "BlockA", "P001", "2024-06-15T10:30:00");
    expect(result).toMatch(/^NA_BlockA_P001_/);
  });

  it("uses NA for null block", () => {
    const result = generateFileName("North", "", "P001", "2024-06-15T10:30:00");
    expect(result).toMatch(/^North_NA_P001_/);
  });

  it("uses NA for null pole", () => {
    const result = generateFileName("North", "BlockA", "", "2024-06-15T10:30:00");
    expect(result).toMatch(/^North_BlockA_NA_/);
  });

  it("truncates long names to 20 chars", () => {
    const long = "A".repeat(30);
    const result = generateFileName(long, "BlockA", "P001", "2024-06-15T10:30:00");
    expect(result).toMatch(new RegExp(`^A{20}_BlockA_P001_`));
  });
});
