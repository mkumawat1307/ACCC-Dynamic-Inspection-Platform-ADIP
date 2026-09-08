const ROOT_LABEL = "ACCC Dynamic Inspection";
const ROOT_PREFIX = `Download/${ROOT_LABEL}`;

function normalizeRelativePath(raw: string): string {
  let p = raw.trim();
  while (p.startsWith("/")) {
    p = p.substring(1);
  }
  p = p.replace(/Download\/Download\//gi, "Download/");
  const segments = p.split("/").filter((seg) => seg.length > 0);
  if (segments.some((seg) => seg === "..")) {
    throw new Error(`Relative path must not contain '..' segments: '${raw}'`);
  }
  return segments.join("/");
}

function downloadRelativePath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  return normalized.length === 0 ? `${ROOT_PREFIX}/` : `${ROOT_PREFIX}/${normalized}/`;
}

function resolvesTo(relativePath: string): string {
  const stack: string[] = [];
  for (const seg of `${ROOT_PREFIX}/${relativePath}`.split("/").filter((s) => s.length > 0)) {
    if (seg === "..") {
      stack.pop();
    } else if (seg !== ".") {
      stack.push(seg);
    }
  }
  return stack.join("/");
}

describe("Native relative-path normalization (mirror of DownloadStorageModule.kt)", () => {
  it("accepts a normal valid relative path", () => {
    expect(downloadRelativePath("New Delhi_Project Alpha")).toBe(
      `${ROOT_PREFIX}/New Delhi_Project Alpha/`
    );
  });

  it("accepts the empty root relative path (exports/backups)", () => {
    expect(downloadRelativePath("")).toBe(`${ROOT_PREFIX}/`);
  });

  it("accepts a nested multi-segment relative path", () => {
    expect(downloadRelativePath("Alpha/Sub")).toBe(`${ROOT_PREFIX}/Alpha/Sub/`);
  });

  it("rejects internal '..' traversal before a write can escape the root", () => {
    expect(() => normalizeRelativePath("foo/../bar")).toThrow("'..'");
    expect(() => normalizeRelativePath("foo/../../bar")).toThrow("'..'");
    expect(resolvesTo("foo/../../bar")).not.toContain(ROOT_PREFIX);
  });

  it("rejects multiple internal '..' segments", () => {
    expect(() => normalizeRelativePath("a/b/../../c")).toThrow("'..'");
    expect(() => normalizeRelativePath("foo/../../bar")).toThrow("'..'");
    expect(() => normalizeRelativePath("a/../../../b")).toThrow("'..'");
    expect(resolvesTo("a/b/../../c")).toContain(ROOT_PREFIX);
    expect(resolvesTo("a/../../../b")).not.toContain(ROOT_PREFIX);
  });

  it("rejects leading '..' traversal", () => {
    expect(() => normalizeRelativePath("../evil")).toThrow("'..'");
    expect(() => normalizeRelativePath("../../evil")).toThrow("'..'");
    expect(() => downloadRelativePath("../../evil")).toThrow("'..'");
    expect(resolvesTo("../../evil")).not.toContain(ROOT_PREFIX);
  });

  it("rejects a trailing '..' that exits the root", () => {
    expect(() => normalizeRelativePath("foo/..")).toThrow("'..'");
    expect(() => downloadRelativePath("foo/..")).toThrow("'..'");
  });

  it("treats backslash as a literal filename character on Android (not a separator)", () => {
    expect(() => normalizeRelativePath("..\\foo")).not.toThrow();
    expect(normalizeRelativePath("a\\..\\b")).toBe("a\\..\\b");
    expect(downloadRelativePath("a\\..\\b")).toBe(`${ROOT_PREFIX}/a\\..\\b/`);
  });

  it("rejects a '..' segment even when other parts are backslash literal", () => {
    expect(() => normalizeRelativePath("a\\b/..")).toThrow("'..'");
    expect(normalizeRelativePath("a/..\\b")).toBe("a/..\\b");
    expect(downloadRelativePath("a/..\\b")).toBe(`${ROOT_PREFIX}/a/..\\b/`);
  });

  it("does not reject valid filenames that merely contain dots", () => {
    expect(normalizeRelativePath("photo..jpg")).toBe("photo..jpg");
    expect(downloadRelativePath("photo..jpg")).toBe(`${ROOT_PREFIX}/photo..jpg/`);
    expect(() => normalizeRelativePath("v1.2.3")).not.toThrow();
  });

  it("collapses duplicate Download/Download/ prefixes", () => {
    expect(downloadRelativePath("Download/Download/foo")).toBe(`${ROOT_PREFIX}/Download/foo/`);
    expect(downloadRelativePath("download/download/foo")).toBe(`${ROOT_PREFIX}/Download/foo/`);
  });

  it("rejects Download/.. which would climb out of the required prefix", () => {
    expect(() => normalizeRelativePath("Download/../foo")).toThrow("'..'");
  });

  it("still normalizes a leading slash instead of rejecting it", () => {
    expect(downloadRelativePath("/foo")).toBe(`${ROOT_PREFIX}/foo/`);
    expect(downloadRelativePath("//foo//bar/")).toBe(`${ROOT_PREFIX}/foo/bar/`);
  });

  it("keeps existing valid photo/storage operations working", () => {
    expect(downloadRelativePath("Jaipur_AMC 2026")).toBe(`${ROOT_PREFIX}/Jaipur_AMC 2026/`);
    expect(downloadRelativePath("Sikar_XYZ")).toBe(`${ROOT_PREFIX}/Sikar_XYZ/`);
    expect(downloadRelativePath("   ")).toBe(`${ROOT_PREFIX}/`);
  });
});