jest.mock("@/src/database/helpers/ProjectDBManager");
jest.mock("@/src/database/db");

import React from "react";
import TestRenderer from "react-test-renderer";
import {
  InspectionProvider,
  useInspection,
} from "@/src/context/InspectionContext";
import { PhotoStatesProvider } from "@/src/context/PhotoStatesContext";
import { openProjectDb, deleteProjectDb } from "@/src/database/helpers/ProjectDBManager";
import { clearActiveProject } from "@/src/database/db";

const mockProject = {
  ProjectID: 1,
  ProjectName: "Test Project",
  DistrictID: 1,
  DivisionName: "North",
  DistrictName: "District A",
  Block: "B1",
  Client: "Client X",
  Description: "Test",
  InspectorName: "Alice",
  DBPath: "/db/test.db",
  SAFPath: "/saf/",
  CreatedAt: "2024-01-01",
  UpdatedAt: "2024-01-01",
};

function renderHookInProvider<T>(hookFn: () => T) {
  const result: { current: T } = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hookFn();
    return null;
  }
  TestRenderer.act(() => {
    TestRenderer.create(
      <PhotoStatesProvider>
        <InspectionProvider>
          <TestComponent />
        </InspectionProvider>
      </PhotoStatesProvider>
    );
  });
  return result;
}

describe("InspectionProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (openProjectDb as jest.Mock).mockResolvedValue(undefined);
    (clearActiveProject as jest.Mock).mockResolvedValue(undefined);
    (deleteProjectDb as jest.Mock).mockResolvedValue(undefined);
  });

  it("initializes with null project and empty fields", () => {
    const result = renderHookInProvider(() => useInspection());
    expect(result.current.project).toBeNull();
    expect(result.current.inspectionDate).toBe("");
    expect(result.current.inspectionId).toBeNull();
    expect(result.current.poleId).toBe("");
  });

  it("opens a project and sets it in state", async () => {
    const result = renderHookInProvider(() => useInspection());
    await TestRenderer.act(async () => {
      await result.current.openProject(mockProject);
    });
    expect(openProjectDb).toHaveBeenCalledWith("/db/test.db", 1);
    expect(result.current.project?.ProjectName).toBe("Test Project");
  });

  it("does not call openProjectDb when project has no DBPath", async () => {
    const result = renderHookInProvider(() => useInspection());
    const noDbProject = { ...mockProject, DBPath: null };
    await TestRenderer.act(async () => {
      await result.current.openProject(noDbProject);
    });
    expect(openProjectDb).not.toHaveBeenCalled();
    expect(result.current.project).toBeTruthy();
  });

  it("closes the project and resets state", async () => {
    const result = renderHookInProvider(() => useInspection());
    await TestRenderer.act(async () => {
      await result.current.openProject(mockProject);
    });
    await TestRenderer.act(async () => {
      await result.current.closeProject();
    });
    expect(clearActiveProject).toHaveBeenCalled();
    expect(result.current.project).toBeNull();
    expect(result.current.inspectionId).toBeNull();
    expect(result.current.poleId).toBe("");
    expect(result.current.inspectionDate).toBe("");
  });

  it("removes a project and closes if currently open", async () => {
    const result = renderHookInProvider(() => useInspection());
    await TestRenderer.act(async () => {
      await result.current.openProject(mockProject);
    });
    await TestRenderer.act(async () => {
      await result.current.removeProject(mockProject);
    });
    expect(clearActiveProject).toHaveBeenCalled();
    expect(deleteProjectDb).toHaveBeenCalledWith("/db/test.db");
    expect(result.current.project).toBeNull();
  });

  it("removes a project without closing if different project is open", async () => {
    const otherProject = { ...mockProject, ProjectID: 2, DBPath: "/db/other.db" };
    const result = renderHookInProvider(() => useInspection());
    await TestRenderer.act(async () => {
      await result.current.openProject(mockProject);
    });
    await TestRenderer.act(async () => {
      await result.current.removeProject(otherProject);
    });
    expect(clearActiveProject).not.toHaveBeenCalled();
    expect(deleteProjectDb).toHaveBeenCalledWith("/db/other.db");
  });

  it("prevents concurrent open of the same project while opening", async () => {
    // Reproduce the home-screen double-tap: `project` is still null while the
    // first open is in flight, so a guard keyed on the active project state
    // would fall through and issue a second concurrent openProjectDb call on
    // the same SQLite handle.
    let resolveFirst: (() => void) | null = null;
    (openProjectDb as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        })
    );

    const result = renderHookInProvider(() => useInspection());

    const firstOpen = result.current.openProject(mockProject);
    const secondOpen = result.current.openProject(mockProject);

    // Same-project double-open must not issue a second DB open.
    expect(openProjectDb).toHaveBeenCalledTimes(1);

    await TestRenderer.act(async () => {
      resolveFirst?.();
      await firstOpen;
      await secondOpen;
    });
    expect(result.current.project?.ProjectID).toBe(1);
    expect(openProjectDb).toHaveBeenCalledTimes(1);

    // Guard is released after completion: a later open is allowed again.
    await TestRenderer.act(async () => {
      await result.current.openProject(mockProject);
    });
    expect(openProjectDb).toHaveBeenCalledTimes(2);
  });

  it("allows a different project to open while one is in flight", async () => {
    let resolveFirst: (() => void) | null = null;
    (openProjectDb as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        })
    );

    const result = renderHookInProvider(() => useInspection());
    const projectB = { ...mockProject, ProjectID: 2, DBPath: "/db/other.db" };

    const openA = result.current.openProject(mockProject);
    const openB = result.current.openProject(projectB);

    expect(openProjectDb).toHaveBeenCalledTimes(2);

    await TestRenderer.act(async () => {
      resolveFirst?.();
      await openA;
      await openB;
    });

    // The stale A completion is cancelled by the activation sequence; B wins.
    expect(result.current.project?.ProjectID).toBe(2);
  });

  it("releases the open guard when opening fails", async () => {
    (openProjectDb as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const result = renderHookInProvider(() => useInspection());

    await TestRenderer.act(async () => {
      await expect(result.current.openProject(mockProject)).rejects.toThrow(
        "boom"
      );
    });
    expect(result.current.project).toBeNull();

    // A retry of the same project must be allowed after the failure.
    await TestRenderer.act(async () => {
      await result.current.openProject(mockProject);
    });
    expect(openProjectDb).toHaveBeenCalledTimes(2);
    expect(result.current.project?.ProjectID).toBe(1);
  });

  it("sets inspection date", () => {
    const result = renderHookInProvider(() => useInspection());
    TestRenderer.act(() => {
      result.current.setInspectionDate("2024-06-15");
    });
    expect(result.current.inspectionDate).toBe("2024-06-15");
  });

  it("sets inspection ID", () => {
    const result = renderHookInProvider(() => useInspection());
    TestRenderer.act(() => {
      result.current.setInspectionId(42);
    });
    expect(result.current.inspectionId).toBe(42);
  });

  it("sets pole ID", () => {
    const result = renderHookInProvider(() => useInspection());
    TestRenderer.act(() => {
      result.current.setPoleId("P001");
    });
    expect(result.current.poleId).toBe("P001");
  });
});

describe("useInspection", () => {
  it("throws when used outside InspectionProvider", () => {
    const captured: string[] = [];
    class ErrorBoundary extends React.Component<{ children: React.ReactNode }> {
      componentDidCatch(error: Error) { captured.push(error.message); }
      render() { return this.props.children; }
    }
    function TestComponent() {
      useInspection();
      return null;
    }
    TestRenderer.act(() => {
      TestRenderer.create(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );
    });
    expect(captured[0]).toContain("useInspection must be used inside InspectionProvider.");
  });
});
