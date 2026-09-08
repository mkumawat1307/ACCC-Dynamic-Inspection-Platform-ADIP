import { Project } from "@/src/models/Project";
import {
  buildProjectFolderLabel,
  canonicalProjectLabel,
  legacyProjectOnlyLabel,
  legacyStrippedLabel,
  photoStorageLabelForProject,
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

describe("buildProjectFolderLabel", () => {
  it("combines district and project name", () => {
    expect(buildProjectFolderLabel("SIKAR", "XYZ")).toBe("SIKAR_XYZ");
  });

  it("sanitizes illegal characters", () => {
    expect(buildProjectFolderLabel("A", "B:C/D")).toBe("A_B_C_D");
  });

  it("trims whitespace", () => {
    expect(buildProjectFolderLabel("  Jaipur  ", "  AMC 2026 ")).toBe("Jaipur_AMC 2026");
  });

  it("returns project name when district is empty", () => {
    expect(buildProjectFolderLabel("", "Project Alpha")).toBe("Project Alpha");
    expect(buildProjectFolderLabel("   ", "Project Alpha")).toBe("Project Alpha");
  });
});

describe("canonical vs buildProjectFolderLabel", () => {
  it("canonical label matches buildProjectFolderLabel for the same project", () => {
    const project = makeProject({
      DistrictName: "New Delhi",
      ProjectName: "Project Alpha",
    });
    expect(canonicalProjectLabel(project)).toBe(
      buildProjectFolderLabel("New Delhi", "Project Alpha")
    );
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

describe("photoStorageLabelForProject", () => {
  const dbPath = (folder: string) =>
    `file:///data/user/0/com.accc.app/files/Projects/${folder}/inspection.db`;

  it("extracts the creation-time label from a valid project DBPath", () => {
    const project = makeProject({
      DBPath: dbPath("Jaipur_Jaipur_1234abcd"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Jaipur_Jaipur");
  });

  it("accepts a relative Projects/ DBPath without a file:// prefix", () => {
    const project = makeProject({
      DBPath: "Projects/Karnal_Highway_00ffee77/inspection.db",
    });
    expect(photoStorageLabelForProject(project)).toBe("Karnal_Highway");
  });

  it("returns the creation-time label even after the project was renamed", () => {
    const project = makeProject({
      ProjectName: "Renamed Project",
      DistrictName: "Renamed District",
      DBPath: dbPath("Jaipur_Jaipur_1234abcd"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Jaipur_Jaipur");
  });

  it("preserves a label that itself ends with _<8hex> by stripping only the final hash", () => {
    const project = makeProject({
      DBPath: dbPath("Foo_1a2b3c4d_abcdef12"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Foo_1a2b3c4d");
  });

  it("falls back to canonicalProjectLabel when DBPath is null", () => {
    const project = makeProject({ DBPath: null });
    expect(photoStorageLabelForProject(project)).toBe(canonicalProjectLabel(project));
    expect(photoStorageLabelForProject(project)).toBe("New Delhi_Project Alpha");
  });

  it("falls back to canonicalProjectLabel when DBPath is undefined", () => {
    const project = makeProject({ DBPath: undefined });
    expect(photoStorageLabelForProject(project)).toBe("New Delhi_Project Alpha");
  });

  it("falls back safely when DBPath is empty or missing the hash", () => {
    const project = makeProject({ DBPath: "" });
    expect(photoStorageLabelForProject(project)).toBe("New Delhi_Project Alpha");
    const noHash = makeProject({ DBPath: dbPath("Jaipur_Jaipur") });
    expect(photoStorageLabelForProject(noHash)).toBe("New Delhi_Project Alpha");
  });

  it.each([
    "not a path",
    "file:///data/user/0/com.accc.app/files/Projects/Jaipur_Jaipur_1234abcd",
    `file:///data/user/0/com.accc.app/files/Projects/Jaipur_Jaipur_GGGGGGGG/inspection.db`,
    `file:///data/user/0/com.accc.app/files/Projects/Jaipur/inspection.db`,
    `file:///data/user/0/com.accc.app/files/Other/Jaipur_Jaipur_1234abcd/inspection.db`,
    `file:///data/user/0/com.accc.app/files/Projects/_1234abcd/inspection.db`,
    `file:///data/user/0/com.accc.app/files/Projects/Jaipur_Jaipur_1234ab/inspection.db`,
  ])("falls back safely on malformed DBPath %p", (badPath) => {
    const project = makeProject({
      DistrictName: "New Delhi",
      ProjectName: "Project Alpha",
      DBPath: badPath,
    });
    expect(photoStorageLabelForProject(project)).toBe("New Delhi_Project Alpha");
  });

  it("never throws on malformed DBPath", () => {
    expect(() => {
      photoStorageLabelForProject(
        makeProject({ DBPath: "::::" as unknown as string })
      );
    }).not.toThrow();
  });

  it("sanitized extraction matches the canonical label scheme", () => {
    const project = makeProject({ DBPath: dbPath("N_ew__A_B_1a2b3c4d") });
    expect(photoStorageLabelForProject(project)).toBe(
      buildProjectFolderLabel("N<ew>", "A/B")
    );
  });
});
