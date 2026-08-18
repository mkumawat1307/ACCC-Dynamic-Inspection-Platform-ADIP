import { sanitizeNumberInput } from "@/src/utils/fieldInput";

describe("sanitizeNumberInput", () => {
  it("keeps plain digits unchanged", () => {
    expect(sanitizeNumberInput("12")).toBe("12");
  });

  it("keeps empty string empty", () => {
    expect(sanitizeNumberInput("")).toBe("");
  });

  it("keeps zero as a valid value", () => {
    expect(sanitizeNumberInput("0")).toBe("0");
  });

  it("keeps a single decimal point", () => {
    expect(sanitizeNumberInput("12.5")).toBe("12.5");
  });

  it("strips everything after the first decimal point", () => {
    expect(sanitizeNumberInput("12.5.7")).toBe("12.57");
  });

  it("strips non-numeric characters and the minus sign", () => {
    expect(sanitizeNumberInput("abc-12.5x")).toBe("12.5");
  });

  it("turns a lone decimal point into an empty value", () => {
    expect(sanitizeNumberInput(".")).toBe("");
  });

  it("keeps a partial decimal like '1.' for in-progress input", () => {
    expect(sanitizeNumberInput("1.")).toBe("1.");
  });

  it("integerOnly keeps only digits", () => {
    expect(sanitizeNumberInput("abc", { integerOnly: true })).toBe("");
    expect(sanitizeNumberInput("12.9", { integerOnly: true })).toBe("129");
  });
});
