jest.mock("@/src/database/helpers/ProjectDBManager");
jest.mock("@/src/database/db");

import React from "react";
import TestRenderer from "react-test-renderer";
import { InspectionProvider, useInspection } from "@/src/context/InspectionContext";
import { PhotoStatesProvider } from "@/src/context/PhotoStatesContext";
import { openProjectDb, deleteProjectDb } from "@/src/database/helpers/ProjectDBManager";
import { clearActiveProject } from "@/src/database/db";
import {
  useProjectActivation,
  ProjectActivationState,
} from "@/src/hooks/useProjectActivation";
import { Project } from "@/src/models/Project";

const DB_PATH_A = "/db/alpha.db";
const DB_PATH_B = "/db/beta.db";

function makeProject(id: number, name: string, dbPath: string | null = DB_PATH_A): Project {
  return {
    ProjectID: id,
    ProjectName: name,
    DistrictID: 1,
    DivisionName: "North",
    DistrictName: "District A",
    Block: "B1",
    Client: "Client X",
    Description: "Test",
    InspectorName: "Alice",
    DBPath: dbPath,
    SAFPath: "/saf/",
    CreatedAt: "2024-01-01",
    UpdatedAt: "2024-01-01",
  };
}

const projectA = makeProject(1, "Alpha", DB_PATH_A);
const projectB = makeProject(2, "Beta", DB_PATH_B);
const projectNoDb = makeProject(3, "NoDb", null);

interface Latest {
  state: ProjectActivationState;
  contextProject: Project | null;
}

function Probe(props: { project: Project | null; latest: Latest }) {
  const state = useProjectActivation(props.project);
  const { project: contextProject } = useInspection();
  props.latest.state = state;
  props.latest.contextProject = contextProject;
  return null;
}

function renderProbe(project: Project | null) {
  const latest: Latest = { state: { ready: false, error: null }, contextProject: null };
  let renderer!: ReturnType<typeof TestRenderer.create>;
  const element = (
    <PhotoStatesProvider>
      <InspectionProvider>
        <Probe project={project} latest={latest} />
      </InspectionProvider>
    </PhotoStatesProvider>
  );
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element);
  });
  return {
    renderer,
    latest,
    flush: async () => {
      await TestRenderer.act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });
    },
    update: (next: Project | null) => {
      TestRenderer.act(() => {
        renderer.update(
          <PhotoStatesProvider>
            <InspectionProvider>
              <Probe project={next} latest={latest} />
            </InspectionProvider>
          </PhotoStatesProvider>
        );
      });
    },
    unmount: () => {
      TestRenderer.act(() => {
        renderer.unmount();
      });
    },
  };
}

describe("useProjectActivation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (openProjectDb as jest.Mock).mockResolvedValue(undefined);
    (clearActiveProject as jest.Mock).mockResolvedValue(undefined);
    (deleteProjectDb as jest.Mock).mockResolvedValue(undefined);
  });

  it("activates the exact project DB on cold mount and reaches ready", async () => {
    const h = renderProbe(projectA);
    await h.flush();
    expect(openProjectDb).toHaveBeenCalledTimes(1);
    expect(openProjectDb).toHaveBeenCalledWith(DB_PATH_A, 1);
    expect(h.latest.state.ready).toBe(true);
    expect(h.latest.state.error).toBeNull();
    expect(h.latest.contextProject?.ProjectName).toBe("Alpha");
  });

  it("switches DB activation when the project identity changes A -> B", async () => {
    const h = renderProbe(projectA);
    await h.flush();
    await h.flush();

    h.update(projectB);
    await h.flush();

    expect(openProjectDb).toHaveBeenCalledTimes(2);
    expect(openProjectDb).toHaveBeenNthCalledWith(1, DB_PATH_A, 1);
    expect(openProjectDb).toHaveBeenNthCalledWith(2, DB_PATH_B, 2);
    expect(h.latest.state.ready).toBe(true);
    expect(h.latest.contextProject?.ProjectName).toBe("Beta");
  });

  it("ignores a late-resolving activation of a superseded project", async () => {
    let resolveA!: (value: undefined) => void;
    const deferredA = new Promise<undefined>((resolve) => {
      resolveA = resolve;
    });
    (openProjectDb as jest.Mock).mockImplementationOnce(() => deferredA);

    const h = renderProbe(projectA);
    await h.flush();

    h.update(projectB);
    await h.flush();

    expect(h.latest.state.ready).toBe(true);
    expect(h.latest.contextProject?.ProjectName).toBe("Beta");

    await TestRenderer.act(async () => {
      resolveA(undefined);
    });
    await h.flush();

    expect(h.latest.state.ready).toBe(true);
    expect(h.latest.state.error).toBeNull();
    expect(h.latest.contextProject?.ProjectName).toBe("Beta");
    expect(openProjectDb).toHaveBeenCalledTimes(2);
  });

  it("fails explicitly with zero DB calls when identity is missing", async () => {
    const h = renderProbe(null);
    await h.flush();
    expect(h.latest.state.ready).toBe(false);
    expect(h.latest.state.error).toBe("Project identity is missing.");
    expect(openProjectDb).not.toHaveBeenCalled();
  });

  it("fails explicitly with zero DB calls when project has no database path", async () => {
    const h = renderProbe(projectNoDb);
    await h.flush();
    expect(h.latest.state.ready).toBe(false);
    expect(h.latest.state.error).toBe("Project has no database path.");
    expect(openProjectDb).not.toHaveBeenCalled();
  });

  it("sets a late openProjectDb rejection as the error state", async () => {
    (openProjectDb as jest.Mock).mockRejectedValue(new Error("Inspection database is missing or invalid"));
    const h = renderProbe(projectA);
    await h.flush();
    expect(h.latest.state.ready).toBe(false);
    expect(h.latest.state.error).toContain("Inspection database is missing or invalid");
  });

  it("does not re-activate when the same identity is rendered repeatedly", async () => {
    const h = renderProbe(projectA);
    await h.flush();
    h.update({ ...projectA });
    await h.flush();
    h.unmount();
    expect(openProjectDb).toHaveBeenCalledTimes(1);
  });
});