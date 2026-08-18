export function sanitizeNumberInput(
  text: string,
  opts?: { integerOnly?: boolean }
): string {
  if (opts?.integerOnly) {
    return text.replace(/[^0-9]/g, "");
  }

  const digits = text.replace(/[^0-9.]/g, "");
  const firstDot = digits.indexOf(".");
  if (firstDot === -1) return digits;
  const before = digits.slice(0, firstDot);
  const after = digits.slice(firstDot + 1).replace(/\./g, "");
  if (before === "" && after === "") return "";
  return `${before}.${after}`;
}
