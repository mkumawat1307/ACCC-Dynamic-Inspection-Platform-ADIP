jest.mock("@/src/database/helpers/ProjectDBManager");
jest.mock("@/src/database/db");
jest.mock("@/src/utils/storageManager", () => ({
  ensureProjectFolder: jest.fn().mockResolvedValue(undefined),
}));

const mockRouter = { back: jest.fn(), push: jest.fn() };
const mockParamsHolder: { current: Record<string, string | undefined> } = {
  current: {},
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParamsHolder.current,
  useRouter: () => mockRouter,
}));

jest.mock("@react-navigation/native", () => ({
  useIsFocused: () => true,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(cb, [cb]);
  },
}));

jest.mock("@/src/components/dashboard/DashboardCardGrid", () => {
  return () => null;
});

jest.mock("@/src/components/dashboard/DashboardActionCard", () => {
  return function MockDashboardActionCard(props: { title?: string }) {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, props.title ?? "");
  };
});

import React from "react";
import TestRenderer from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import DashboardScreen from "@/app/projects/dashboard";
import { InspectionProvider, useInspection } from "@/src/context/InspectionContext";
import { PhotoStatesProvider } from "@/src/context/PhotoStatesContext";
import {
  openProjectDb,
  deleteProjectDb,
} from "@/src/database/helpers/ProjectDBManager";
import { clearActiveProject } from "@/src/database/db";
import { Project } from "@/src/models/Project";

const DB_PATH_A = "/db/alpha.db";
const DB_PATH_B = "/db/beta.db";

function makeProject(id: number, name: string, dbPath: string): Project {
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

function ContextProbe({ onProject }: { onProject: (p: Project | null) => void }) {
  const { project: ctx } = useInspection();
  onProject(ctx);
  return null;
}

function withProviders(element: React.ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 375, height: 812 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <PhotoStatesProvider>
        <InspectionProvider>{element}</InspectionProvider>
      </PhotoStatesProvider>
    </SafeAreaProvider>
  );
}

function renderSession(_project: Project | null, key = "dash") {
  const latestContextProject: { current: Project | null } = { current: null };
  const element = withProviders(
    <>
      <DashboardScreen key={key} />
      <ContextProbe onProject={(p) => (latestContextProject.current = p)} />
    </>
  );
  let renderer!: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element);
  });
  return {
    renderer,
    latestContextProject,
    flush: async () => {
      await TestRenderer.act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });
    },
    update: (nextElement: React.ReactElement) => {
      TestRenderer.act(() => {
        renderer.update(nextElement);
      });
    },
    unmount: () => {
      TestRenderer.act(() => {
        renderer.unmount();
      });
    },
    text: () => {
      const json = renderer.toJSON();
      return json ? JSON.stringify(json) : "";
    },
  };
}

describe("Dashboard project-DB activation (restore / deep-link / switching)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (openProjectDb as jest.Mock).mockResolvedValue(undefined);
    (clearActiveProject as jest.Mock).mockResolvedValue(undefined);
    (deleteProjectDb as jest.Mock).mockResolvedValue(undefined);
  });

  it("cold restore with projectData activates the exact project DB before content renders", async () => {
    mockParamsHolder.current = {
      projectId: "1",
      projectData: JSON.stringify(projectA),
    };
    const h = renderSession(projectA);
    await h.flush();

    expect(openProjectDb).toHaveBeenCalledTimes(1);
    expect(openProjectDb).toHaveBeenCalledWith(DB_PATH_A, 1);
    expect(h.latestContextProject.current?.ProjectID).toBe(1);
    expect(h.latestContextProject.current?.DBPath).toBe(DB_PATH_A);
    expect(h.text()).toContain("Alpha");
    expect(h.text()).not.toContain("Project not found.");
  });

  it("deep-link entry with no prior context (projectData only) still activates the DB", async () => {
    mockParamsHolder.current = {
      projectId: "99",
      projectData: JSON.stringify(projectB),
    };
    const h = renderSession(projectB, "deep");
    await h.flush();

    expect(openProjectDb).toHaveBeenCalledTimes(1);
    expect(openProjectDb).toHaveBeenCalledWith(DB_PATH_B, 2);
    expect(h.latestContextProject.current?.ProjectName).toBe("Beta");
    expect(h.text()).toContain("Beta");
  });

  it("switching sessions A -> B activates B and never re-activates A", async () => {
    mockParamsHolder.current = {
      projectId: "1",
      projectData: JSON.stringify(projectA),
    };
    const ha = renderSession(projectA, "a");
    await ha.flush();
    ha.unmount();

    mockParamsHolder.current = {
      projectId: "2",
      projectData: JSON.stringify(projectB),
    };
    const hb = renderSession(projectB, "b");
    await hb.flush();

    expect(openProjectDb).toHaveBeenCalledTimes(2);
    expect(openProjectDb).toHaveBeenNthCalledWith(1, DB_PATH_A, 1);
    expect(openProjectDb).toHaveBeenNthCalledWith(2, DB_PATH_B, 2);
    expect(hb.latestContextProject.current?.ProjectName).toBe("Beta");
    expect(hb.text()).toContain("Beta");
    expect(hb.text()).not.toContain("Alpha");
  });

  it("missing identity shows 'Project not found.' with zero DB activations", async () => {
    mockParamsHolder.current = { projectId: "1" };
    const h = renderSession(null);
    await h.flush();

    expect(h.text()).toContain("Project not found.");
    expect(openProjectDb).not.toHaveBeenCalled();
    expect(h.latestContextProject.current).toBeNull();
  });

  it("a restored route for an unmatching project never falls back to a different context project", async () => {
    mockParamsHolder.current = {
      projectId: "1",
      projectData: JSON.stringify(projectA),
    };
    const h = renderSession(projectA, "a");
    await h.flush();
    expect(openProjectDb).toHaveBeenCalledTimes(1);

    mockParamsHolder.current = { projectId: "3" };
    h.update(
      withProviders(<DashboardScreen key="remount" />
    ));
    await h.flush();

    expect(h.text()).toContain("Project not found.");
    expect(openProjectDb).toHaveBeenCalledTimes(1);
    expect(openProjectDb).not.toHaveBeenCalledWith(DB_PATH_B, 3);
  });
});