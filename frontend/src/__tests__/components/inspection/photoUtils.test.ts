import {
  formatDate,
  formatLocation,
  getFileUri,
  formatWatermarkDate,
  formatLatLngWM,
  generateFileName,
  validatePhotosForSave,
  cleanPoleToken,
  renamePoleTokenInFileName,
} from "@/src/components/inspection/photoUtils";
import { Photo } from "@/src/models/Photo";

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

  it("formats dd-MMM-yyyy 12h (default)", () => {
    expect(formatWatermarkDate("2024-06-15T14:30:00")).toBe("15-Jun-2024 02:30 PM");
  });

  it("formats dd/MM/yyyy 24h", () => {
    expect(formatWatermarkDate("2024-06-15T14:30:00", "dd/MM/yyyy", "24h")).toBe(
      "15/06/2024 14:30"
    );
  });

  it("formats yyyy-MM-dd 12h", () => {
    expect(formatWatermarkDate("2024-01-01T00:05:00", "yyyy-MM-dd", "12h")).toBe(
      "2024-01-01 12:05 AM"
    );
  });
});

describe("formatLatLngWM hemisphere", () => {
  it("appends N/E for north-east", () => {
    expect(formatLatLngWM(27.608123, 75.151703)).toBe("27.608123N 75.151703E");
  });

  it("appends S/W for south-west", () => {
    expect(formatLatLngWM(-33.856784, -151.215297)).toBe("33.856784S 151.215297W");
  });

  it("handles zero", () => {
    expect(formatLatLngWM(0, 0)).toBe("0.000000N 0.000000E");
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

describe("cleanPoleToken", () => {
  it("keeps alphanumeric characters only", () => {
    expect(cleanPoleToken("SIK-001/A")).toBe("SIK001A");
  });

  it("defaults to NA for empty input", () => {
    expect(cleanPoleToken("")).toBe("NA");
  });

  it("defaults to NA for null input", () => {
    expect(cleanPoleToken(null as unknown as string)).toBe("NA");
  });

  it("truncates to 20 characters", () => {
    expect(cleanPoleToken("A".repeat(30))).toBe("A".repeat(20));
  });
});

describe("renamePoleTokenInFileName", () => {
  const fileName = "Sikar_SIK001_14AUG2026_112948.jpg";

  it("replaces the old pole token in the middle of the filename", () => {
    expect(renamePoleTokenInFileName(fileName, "SIK001", "SIK101")).toBe(
      "Sikar_SIK101_14AUG2026_112948.jpg"
    );
  });

  it("preserves extension, date and time tokens", () => {
    const result = renamePoleTokenInFileName(fileName, "SIK001", "SIK101");
    expect(result).toMatch(/^Sikar_SIK101_14AUG2026_112948\.jpg$/);
  });

  it("matches the old token after cleaning special characters", () => {
    expect(renamePoleTokenInFileName(fileName, "SIK-001", "SIK101")).toBe(
      "Sikar_SIK101_14AUG2026_112948.jpg"
    );
  });

  it("cleans the new token before inserting it", () => {
    expect(renamePoleTokenInFileName(fileName, "SIK001", "SIK-101/A")).toBe(
      "Sikar_SIK101A_14AUG2026_112948.jpg"
    );
  });

  it("returns null when the old token is not present", () => {
    expect(renamePoleTokenInFileName(fileName, "ZZZ999", "SIK101")).toBeNull();
  });

  it("returns null when the old token is NA", () => {
    expect(renamePoleTokenInFileName("Sikar_NA_14AUG2026_112948.jpg", "NA", "SIK101")).toBeNull();
  });

  it("returns null for an empty old pole id", () => {
    expect(renamePoleTokenInFileName(fileName, "", "SIK101")).toBeNull();
  });

  it("uses NA when the new pole cleans to empty", () => {
    expect(renamePoleTokenInFileName(fileName, "SIK001", "!!!")).toBe(
      "Sikar_NA_14AUG2026_112948.jpg"
    );
  });

  it("handles the user's example format with a project segment", () => {
    expect(renamePoleTokenInFileName("Sikar_Project_OLDID_112948.jpg", "OLDID", "NEWID")).toBe(
      "Sikar_Project_NEWID_112948.jpg"
    );
  });
});

function makePhoto(id: number, filePath: string): Photo {
  return {
    PhotoID: id,
    InspectionID: 1,
    PhotoType: "Pole",
    FileName: `${id}.jpg`,
    FilePath: filePath,
    Latitude: 1,
    Longitude: 1,
    CapturedAt: "2024-06-15T10:30:00",
    Remarks: null,
  };
}

describe("validatePhotosForSave", () => {
  it("blocks when no photos exist", () => {
    expect(validatePhotosForSave([], {})).toEqual({ canSave: false, reason: "no_photos" });
  });

  it("blocks while a photo is processing", () => {
    const photos = [makePhoto(1, "file:///tmp/1.jpg")];
    expect(validatePhotosForSave(photos, { 1: "processing" })).toEqual({
      canSave: false,
      reason: "processing",
    });
  });

  it("blocks while a photo is pending", () => {
    const photos = [makePhoto(1, "file:///tmp/1.jpg")];
    expect(validatePhotosForSave(photos, { 1: "pending" })).toEqual({
      canSave: false,
      reason: "pending",
    });
  });

  it("blocks when a photo failed", () => {
    const photos = [makePhoto(1, "file:///tmp/1.jpg")];
    expect(validatePhotosForSave(photos, { 1: "failed" })).toEqual({
      canSave: false,
      reason: "failed",
    });
  });

  it("blocks when a photo has no state and a temp file path", () => {
    const photos = [makePhoto(1, "file:///tmp/1.jpg")];
    expect(validatePhotosForSave(photos, {})).toEqual({
      canSave: false,
      reason: "unprocessed",
    });
  });

  it("allows a single completed photo", () => {
    const photos = [makePhoto(1, "content://media/1.jpg")];
    expect(validatePhotosForSave(photos, { 1: "completed" })).toEqual({
      canSave: true,
      reason: null,
    });
  });

  it("treats content:// photos without state as processed (prior session)", () => {
    const photos = [makePhoto(1, "content://media/1.jpg")];
    expect(validatePhotosForSave(photos, {})).toEqual({ canSave: true, reason: null });
  });

  it("allows when all photos are completed", () => {
    const photos = [
      makePhoto(1, "content://media/1.jpg"),
      makePhoto(2, "content://media/2.jpg"),
    ];
    expect(
      validatePhotosForSave(photos, { 1: "completed", 2: "completed" })
    ).toEqual({ canSave: true, reason: null });
  });

  it("blocks when any one of many photos is still processing", () => {
    const photos = [
      makePhoto(1, "content://media/1.jpg"),
      makePhoto(2, "file:///tmp/2.jpg"),
    ];
    expect(
      validatePhotosForSave(photos, { 1: "completed", 2: "processing" })
    ).toEqual({ canSave: false, reason: "processing" });
  });
});
