import { Project } from "@/src/models/Project";
import {
  buildProjectFolderLabel,
  buildProjectPhotoFolderLabel,
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

describe("buildProjectPhotoFolderLabel", () => {
  it("is the human-readable district + project name with NO hash suffix", () => {
    expect(buildProjectPhotoFolderLabel("Sikar", "AMC 2026")).toBe("Sikar_AMC 2026");
  });

  it("never depends on the DBPath (hash is internal to the DB path only)", () => {
    expect(buildProjectPhotoFolderLabel("Sikar", "AMC 2026")).toBe("Sikar_AMC 2026");
  });

  it("treats null/undefined district and project as empty", () => {
    expect(buildProjectPhotoFolderLabel(null, "OnlyProject")).toBe("OnlyProject");
    expect(buildProjectPhotoFolderLabel(undefined, undefined)).toBe("");
  });

  it("delegates to buildProjectFolderLabel semantics", () => {
    expect(buildProjectPhotoFolderLabel("  N<ew> ", "A/B")).toBe(
      buildProjectFolderLabel("N<ew>", "A/B")
    );
  });

  it("matches photoStorageLabelForProject for the same project", () => {
    const project = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "AMC 2026",
      DBPath: "Projects/Jaipur_AMC 2026_a1b2c3d4/inspection.db",
    });
    expect(
      buildProjectPhotoFolderLabel(project.DistrictName, project.ProjectName)
    ).toBe(photoStorageLabelForProject(project));
  });
});

describe("photoStorageLabelForProject", () => {
  const dbPath = (folder: string) =>
    `file:///data/user/0/com.accc.app/files/Projects/${folder}/inspection.db`;

  it("returns the human-readable current district + project name (no hash)", () => {
    const project = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "ABC",
      DBPath: dbPath("Jaipur_ABC_1234abcd"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Jaipur_ABC");
  });

  it("accepts a relative Projects/ DBPath without a file:// prefix", () => {
    const project = makeProject({
      DBPath: "Projects/Karnal_Highway_00ffee77/inspection.db",
    });
    expect(photoStorageLabelForProject(project)).toBe("New Delhi_Project Alpha");
  });

  it("uses the CURRENT project name after a rename (no hash)", () => {
    const project = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "XYZ",
      DBPath: dbPath("Jaipur_ABC_a1b2c3d4"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Jaipur_XYZ");
  });

  it("uses the CURRENT district after a district change (no hash)", () => {
    const project = makeProject({
      DistrictName: "Sikar",
      ProjectName: "ABC",
      DBPath: dbPath("Jaipur_ABC_a1b2c3d4"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Sikar_ABC");
  });

  it("uses current district + name when both change (no hash)", () => {
    const project = makeProject({
      DistrictName: "Sikar",
      ProjectName: "XYZ",
      DBPath: dbPath("Jaipur_ABC_a1b2c3d4"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Sikar_XYZ");
  });

  it("rename-back deterministically resolves to the current name (no hash)", () => {
    const project = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "ABC",
      DBPath: dbPath("Jaipur_ABC_a1b2c3d4"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Jaipur_ABC");
    expect(photoStorageLabelForProject(project)).toBe("Jaipur_ABC");
  });

  it("never falls back to the historical DBPath label (no hash)", () => {
    const project = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "ABC",
      DBPath: dbPath("Jaipur_OLD_1234abcd"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Jaipur_ABC");
  });

  it("preserves a project name that itself ends in _<8hex>", () => {
    const project = makeProject({
      DistrictName: "Foo",
      ProjectName: "1a2b3c4d",
      DBPath: dbPath("Foo_1a2b3c4d_abcdef12"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Foo_1a2b3c4d");
  });

  it("is idempotent for the same current metadata", () => {
    const project = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "ABC",
      DBPath: dbPath("Jaipur_Project A (Copy)_11111111"),
    });
    expect(photoStorageLabelForProject(project)).toBe("Jaipur_ABC");
    expect(photoStorageLabelForProject(project)).toBe(photoStorageLabelForProject(project));
  });

  it("resolves purely from current district + name, so same-name projects share the label — the repo label-uniqueness guard prevents coexistence", () => {
    const original = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "ABC",
      DBPath: dbPath("Jaipur_ABC_11111111"),
    });
    const copy = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "ABC",
      DBPath: dbPath("Jaipur_ABC_22222222"),
    });

    expect(original.DBPath).not.toBe(copy.DBPath);
    expect(photoStorageLabelForProject(original)).toBe("Jaipur_ABC");
    expect(photoStorageLabelForProject(copy)).toBe("Jaipur_ABC");
    expect(photoStorageLabelForProject(copy)).toBe(photoStorageLabelForProject(original));
  });

  it("distinguishes projects by their current names — the copy owns its label while named (Copy), and follows a rename", () => {
    const original = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "Project A",
      DBPath: dbPath("Jaipur_Project A_11111111"),
    });
    const copyNamed = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "Project A (Copy)",
      DBPath: dbPath("Jaipur_Project A (Copy)_22222222"),
    });
    const copyRenamed = makeProject({
      DistrictName: "Jaipur",
      ProjectName: "XYZ",
      DBPath: dbPath("Jaipur_Project A (Copy)_22222222"),
    });

    expect(photoStorageLabelForProject(original)).toBe("Jaipur_Project A");
    expect(photoStorageLabelForProject(copyNamed)).toBe("Jaipur_Project A (Copy)");
    expect(photoStorageLabelForProject(copyNamed)).not.toBe(
      photoStorageLabelForProject(original)
    );
    expect(photoStorageLabelForProject(copyRenamed)).toBe("Jaipur_XYZ");
    expect(photoStorageLabelForProject(copyRenamed)).not.toBe(
      photoStorageLabelForProject(original)
    );
    expect(photoStorageLabelForProject(copyRenamed)).not.toBe(
      photoStorageLabelForProject(copyNamed)
    );
  });

  it("never appends the internal 8-hex hash to the label", () => {
    const labels = [
      photoStorageLabelForProject(makeProject({ DBPath: dbPath("Jaipur_ABC_1234abcd") })),
      photoStorageLabelForProject(
        makeProject({ DBPath: dbPath("Foo_1a2b3c4d_abcdef12") })
      ),
      photoStorageLabelForProject(makeProject({ DBPath: dbPath("Jaipur_OL_X_00ffee77") })),
    ];
    for (const label of labels) {
      expect(label).not.toMatch(/_([0-9a-f]{8})$/i);
    }
  });

  it("distinct identities can still sanitize to an identical label — this is why the repository guards folder-label uniqueness", () => {
    const colon = makeProject({ DistrictName: "SIKAR", ProjectName: "A:B" });
    const underscore = makeProject({ DistrictName: "SIKAR", ProjectName: "A_B" });
    expect(photoStorageLabelForProject(colon)).toBe("SIKAR_A_B");
    expect(photoStorageLabelForProject(underscore)).toBe("SIKAR_A_B");
  });

  it("falls back to canonicalProjectLabel when DBPath is null", () => {
    const project = makeProject({ DBPath: null });
    expect(photoStorageLabelForProject(project)).toBe(canonicalProjectLabel(project));
    expect(photoStorageLabelForProject(project)).toBe("New Delhi_Project Alpha");
  });

  it("is unaffected by an empty or unmatchable DBPath", () => {
    expect(photoStorageLabelForProject(makeProject({ DBPath: "" }))).toBe(
      "New Delhi_Project Alpha"
    );
    expect(photoStorageLabelForProject(makeProject({ DBPath: dbPath("Jaipur_Jaipur") }))).toBe(
      "New Delhi_Project Alpha"
    );
  });

  it.each([
    "not a path",
    "file:///data/user/0/com.accc.app/files/Projects/Jaipur_Jaipur_1234abcd",
    `file:///data/user/0/com.accc.app/files/Projects/Jaipur_Jaipur_GGGGGGGG/inspection.db`,
    `file:///data/user/0/com.accc.app/files/Projects/Jaipur/inspection.db`,
    `file:///data/user/0/com.accc.app/files/Other/Jaipur_Jaipur_1234abcd/inspection.db`,
    `file:///data/user/0/com.accc.app/files/Projects/_1234abcd/inspection.db`,
    `file:///data/user/0/com.accc.app/files/Projects/Jaipur_Jaipur_1234ab/inspection.db`,
  ])("ignores malformed DBPath %p (label never depends on it)", (badPath) => {
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

  it("sanitizes the current label using the canonical scheme (no hash)", () => {
    const project = makeProject({
      DistrictName: "N<ew>",
      ProjectName: "A/B",
      DBPath: dbPath("N_ew__A_B_1a2b3c4d"),
    });
    expect(photoStorageLabelForProject(project)).toBe("N_ew__A_B");
  });
});
