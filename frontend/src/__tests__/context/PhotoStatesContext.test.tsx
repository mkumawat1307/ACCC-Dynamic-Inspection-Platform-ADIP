jest.mock("@/src/database/helpers/ProjectDBManager");
jest.mock("@/src/database/db");
jest.mock("@/src/utils/folderManager", () => ({
  migrateProjectPhotoFolder: jest.fn(),
}));
jest.mock("@/src/utils/logger", () => ({
  logger: { warn: jest.fn() },
}));

import React from "react";
import TestRenderer from "react-test-renderer";
import {
  InspectionProvider,
  useInspection,
} from "@/src/context/InspectionContext";
import {
  PhotoStatesProvider,
  usePhotoStates,
  usePhotosProcessing,
} from "@/src/context/PhotoStatesContext";
import { openProjectDb, deleteProjectDb } from "@/src/database/helpers/ProjectDBManager";
import { clearActiveProject } from "@/src/database/db";
import { migrateProjectPhotoFolder } from "@/src/utils/folderManager";
import { WatermarkState } from "@/src/components/inspection/photoUtils";

type SetStates = React.Dispatch<React.SetStateAction<Record<number, WatermarkState>>>;

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

describe("PhotoStatesContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (openProjectDb as jest.Mock).mockResolvedValue(undefined);
    (clearActiveProject as jest.Mock).mockResolvedValue(undefined);
    (deleteProjectDb as jest.Mock).mockResolvedValue(undefined);
    (migrateProjectPhotoFolder as jest.Mock).mockResolvedValue(undefined);
  });

  it("initializes photoStates as empty", () => {
    const result = renderHookInProvider(() => usePhotoStates());
    expect(result.current.photoStates).toEqual({});
  });

  it("sets photoStates", () => {
    const result = renderHookInProvider(() => usePhotoStates());
    TestRenderer.act(() => {
      result.current.setPhotoStates({ 1: "completed", 2: "processing" });
    });
    expect(result.current.photoStates).toEqual({ 1: "completed", 2: "processing" });
  });

  it("exposes a ref-based getter that reflects the latest photoStates", () => {
    let getStates: (() => Record<number, WatermarkState>) | null = null;
    let setStates: SetStates | null = null;
    function Probe() {
      getStates = usePhotoStates().getPhotoStates;
      setStates = usePhotoStates().setPhotoStates;
      return null;
    }
    TestRenderer.act(() => {
      TestRenderer.create(
        <PhotoStatesProvider>
          <Probe />
        </PhotoStatesProvider>
      );
    });
    expect(getStates!()).toEqual({});
    TestRenderer.act(() => setStates!({ 1: "completed" }));
    expect(getStates!()).toEqual({ 1: "completed" });
  });

  it("exposes the getter through the meta context for save-time reads", async () => {
    let metaGetter: (() => Record<number, WatermarkState>) | null = null;
    let setStates: SetStates | null = null;
    function Probe() {
      metaGetter = useInspection().getPhotoStates;
      setStates = usePhotoStates().setPhotoStates;
      return null;
    }
    TestRenderer.act(() => {
      TestRenderer.create(
        <PhotoStatesProvider>
          <InspectionProvider>
            <Probe />
          </InspectionProvider>
        </PhotoStatesProvider>
      );
    });
    TestRenderer.act(() => setStates!({ 5: "pending" }));
    expect(metaGetter!()).toEqual({ 5: "pending" });
  });

  it("clears photoStates when closing the project", async () => {
    let photoStatesValue: Record<number, WatermarkState> = {};
    let setStates: SetStates | null = null;
    let closeProject: (() => Promise<void>) | null = null;
    function Probe() {
      photoStatesValue = usePhotoStates().photoStates;
      setStates = usePhotoStates().setPhotoStates;
      closeProject = useInspection().closeProject;
      return null;
    }
    TestRenderer.act(() => {
      TestRenderer.create(
        <PhotoStatesProvider>
          <InspectionProvider>
            <Probe />
          </InspectionProvider>
        </PhotoStatesProvider>
      );
    });
    TestRenderer.act(() => setStates!({ 1: "completed" }));
    expect(photoStatesValue).toEqual({ 1: "completed" });
    await TestRenderer.act(async () => {
      await closeProject!();
    });
    expect(photoStatesValue).toEqual({});
  });
});

describe("usePhotosProcessing derived boolean", () => {
  it("reports true while any photo is pending or processing, then false when all settle", () => {
    let processingValue = false;
    function ProcessingProbe() {
      processingValue = usePhotosProcessing();
      return null;
    }
    let setStates: SetStates | null = null;
    function CaptureSet() {
      const { setPhotoStates } = usePhotoStates();
      setStates = setPhotoStates;
      return null;
    }
    TestRenderer.act(() => {
      TestRenderer.create(
        <PhotoStatesProvider>
          <CaptureSet />
          <ProcessingProbe />
        </PhotoStatesProvider>
      );
    });
    expect(processingValue).toBe(false);

    TestRenderer.act(() => setStates!({ 1: "processing", 2: "completed" }));
    expect(processingValue).toBe(true);

    TestRenderer.act(() => setStates!({ 1: "completed", 2: "completed" }));
    expect(processingValue).toBe(false);
  });

  it("reports false when only completed or failed photos exist", () => {
    let processingValue = true;
    function ProcessingProbe() {
      processingValue = usePhotosProcessing();
      return null;
    }
    let setStates: SetStates | null = null;
    function CaptureSet() {
      const { setPhotoStates } = usePhotoStates();
      setStates = setPhotoStates;
      return null;
    }
    TestRenderer.act(() => {
      TestRenderer.create(
        <PhotoStatesProvider>
          <CaptureSet />
          <ProcessingProbe />
        </PhotoStatesProvider>
      );
    });
    TestRenderer.act(() => setStates!({ 1: "completed", 2: "failed" }));
    expect(processingValue).toBe(false);
  });
});

describe("photoStates render isolation", () => {
  it("does not re-render a usePhotosProcessing consumer when an unrelated photo transitions between completed states", () => {
    let processingRenders = 0;
    let mapRenders = 0;

    function ProcessingProbe() {
      processingRenders++;
      usePhotosProcessing();
      return null;
    }

    function MapProbe() {
      mapRenders++;
      usePhotoStates();
      return null;
    }

    let setStates: SetStates | null = null;
    function CaptureSet() {
      const { setPhotoStates } = usePhotoStates();
      setStates = setPhotoStates;
      return null;
    }

    TestRenderer.act(() => {
      TestRenderer.create(
        <PhotoStatesProvider>
          <CaptureSet />
          <ProcessingProbe />
          <MapProbe />
        </PhotoStatesProvider>
      );
    });

    const initial = { processingRenders, mapRenders };

    TestRenderer.act(() => {
      setStates!({ 1: "completed" });
    });
    TestRenderer.act(() => {
      setStates!((prev) => ({ ...prev, 2: "completed" }));
    });

    expect(processingRenders - initial.processingRenders).toBe(0);
    expect(mapRenders - initial.mapRenders).toBe(2);
  });
});