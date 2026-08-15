import {
  buildProjectIdentity,
  detectProjectDuplicates,
  normalizeKey,
} from "@/src/database/projectIdentity";

describe("normalizeKey", () => {
  it("trims and lowercases", () => {
    expect(normalizeKey(" SIKAR ")).toBe("sikar");
    expect(normalizeKey("XYZ")).toBe("xyz");
    expect(normalizeKey("  AMC  2026  ")).toBe("amc  2026");
  });

  it("handles undefined/null as empty string", () => {
    expect(normalizeKey(undefined as unknown as string)).toBe("");
    expect(normalizeKey(null as unknown as string)).toBe("");
  });
});

describe("buildProjectIdentity", () => {
  it("builds normalized district + project keys", () => {
    expect(buildProjectIdentity(" SIKAR ", "XYZ")).toEqual({
      districtKey: "sikar",
      projectKey: "xyz",
    });
  });
});

describe("detectProjectDuplicates", () => {
  const districts = [
    { DistrictID: 1, DistrictName: "SIKAR" },
    { DistrictID: 2, DistrictName: "JAIPUR" },
  ];

  it("flags case-insensitive district+name duplicates as one group", () => {
    const groups = detectProjectDuplicates(
      [
        { ProjectID: 1, ProjectName: "XYZ", DistrictID: 1, DBPath: "/a" },
        { ProjectID: 2, ProjectName: "xyz", DistrictID: 1, DBPath: "/b" },
      ],
      districts
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.ProjectID)).toEqual([1, 2]);
  });

  it("flags all normalization variants in one group", () => {
    const groups = detectProjectDuplicates(
      [
        { ProjectID: 1, ProjectName: "XYZ", DistrictID: 1, DBPath: null },
        { ProjectID: 2, ProjectName: "xyz", DistrictID: 1, DBPath: null },
        { ProjectID: 3, ProjectName: "XyZ", DistrictID: 1, DBPath: null },
        { ProjectID: 4, ProjectName: " XYZ ", DistrictID: 1, DBPath: null },
      ],
      districts
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(4);
  });

  it("returns no groups for allowed combos", () => {
    const groups = detectProjectDuplicates(
      [
        { ProjectID: 1, ProjectName: "XYZ", DistrictID: 1, DBPath: null },
        { ProjectID: 2, ProjectName: "ABC", DistrictID: 1, DBPath: null },
        { ProjectID: 3, ProjectName: "XYZ", DistrictID: 2, DBPath: null },
      ],
      districts
    );
    expect(groups).toEqual([]);
  });

  it("returns no groups for a single project", () => {
    const groups = detectProjectDuplicates(
      [{ ProjectID: 1, ProjectName: "XYZ", DistrictID: 1, DBPath: null }],
      districts
    );
    expect(groups).toEqual([]);
  });

  it("groups orphaned DistrictIDs by name with empty district name", () => {
    const groups = detectProjectDuplicates(
      [
        { ProjectID: 1, ProjectName: "XYZ", DistrictID: 99, DBPath: null },
        { ProjectID: 2, ProjectName: "xyz", DistrictID: 99, DBPath: null },
      ],
      districts
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].districtKey).toBe("");
    expect(groups[0].projectKey).toBe("xyz");
    expect(groups[0].members.map((m) => m.DistrictName)).toEqual(["", ""]);
  });
});
