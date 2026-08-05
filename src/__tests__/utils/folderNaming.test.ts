import { Project } from "@/src/models/Project";
import {
  canonicalProjectLabel,
  legacyProjectOnlyLabel,
  legacyStrippedLabel,
  sanitizeFolderName,
} from "@/src/utils/folderNaming";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    ProjectID: 1,
    ProjectName: "Project Alpha",
    DistrictID: 1,
    DBPath: null,
    SAFPath: null,
    DistrictName: "New Delhi",
    DivisionName: "Division",
    Block: null,
    Client: null,
    Description: null,
    InspectorName: null,
    CreatedAt: "2024-06-15T10:30:00",
    UpdatedAt: "2024-06-15T10:30:00",
    ...overrides,
  };
}

describe("sanitizeFolderName", () => {
  it.each(["<", ">", ":", '"', "/", "\\", "|", "?", "*"])(
    "replaces illegal character %s with underscore",
    (char) => {
      expect(sanitizeFolderName(`a${char}b`)).toBe("a_b");
    }
  );

  it("preserves legal characters", () => {
    const legal =
      "Name with space - dot . apostrophe ' parens ( ) comma , ampersand &";
    expect(sanitizeFolderName(legal)).toBe(legal);
  });

  it("preserves empty string", () => {
    expect(sanitizeFolderName("")).toBe("");
  });
});

describe("canonicalProjectLabel", () => {
  it("combines district and project name", () => {
    const project = makeProject({
      DistrictName: "New Delhi",
      ProjectName: "Project Alpha",
    });
    expect(canonicalProjectLabel(project)).toBe("New Delhi_Project Alpha");
  });

  it("returns project name when district is empty", () => {
    const project = makeProject({ DistrictName: "" });
    expect(canonicalProjectLabel(project)).toBe("Project Alpha");
  });

  it("returns project name when district is whitespace-only", () => {
    const project = makeProject({ DistrictName: "   " });
    expect(canonicalProjectLabel(project)).toBe("Project Alpha");
  });

  it("sanitizes illegal characters in names", () => {
    const project = makeProject({ DistrictName: "N<ew>", ProjectName: "A/B" });
    expect(canonicalProjectLabel(project)).toBe("N_ew__A_B");
  });
});

describe("legacyStrippedLabel", () => {
  it("removes non-alphanumerics and joins district and project with underscore", () => {
    const project = makeProject({
      DistrictName: "New Delhi",
      ProjectName: "Project Alpha",
    });
    expect(legacyStrippedLabel(project)).toBe("NewDelhi_ProjectAlpha");
  });

  it("follows the old watermark-processor scheme exactly", () => {
    const project = makeProject({ DistrictName: "New Delhi", ProjectName: "Block A" });
    expect(legacyStrippedLabel(project)).toBe("NewDelhi_BlockA");
  });

  it("keeps the literal separator when district is empty", () => {
    const project = makeProject({ DistrictName: "", ProjectName: "Project Alpha" });
    expect(legacyStrippedLabel(project)).toBe("_ProjectAlpha");
  });
});

describe("legacyProjectOnlyLabel", () => {
  it("returns the project name", () => {
    const project = makeProject({ ProjectName: "Project Alpha" });
    expect(legacyProjectOnlyLabel(project)).toBe("Project Alpha");
  });
});

describe("canonical vs legacy labels", () => {
  it("canonical label differs from stripped label for spaced names", () => {
    const project = makeProject({
      DistrictName: "New Delhi",
      ProjectName: "Project Alpha",
    });
    expect(canonicalProjectLabel(project)).not.toBe(legacyStrippedLabel(project));
  });
});
