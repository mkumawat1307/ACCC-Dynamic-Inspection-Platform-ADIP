jest.mock("expo-sqlite");

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, isDirectory: false }),
  readAsStringAsync: jest.fn().mockResolvedValue("BASE64DATA"),
  copyAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/utils/storageManager", () => ({
  writePhotoUnique: jest.fn(),
  buildPhotoFolderDisplayPath: (label: string) =>
    `Download/ACCC Dynamic Inspection/${label}/`,
  deletePhoto: jest.fn(),
}));

jest.mock("react-native-webview", () => {
  const RN = require("react-native");
  return { WebView: () => RN.View };
});

jest.mock("@/src/native/WatermarkEncoder", () => ({
  hasNativeWatermarkEncoder: jest.fn(() => false),
  hasNativeOverlayEncoder: jest.fn(() => false),
  encodeWatermarkJpeg: jest.fn(),
  encodeWatermarkOverlay: jest.fn(),
}));

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  PhotoStatesProvider,
  usePhotoStates,
} from "@/src/context/PhotoStatesContext";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import { makePhotoStateKey } from "@/src/components/inspection/photoUtils";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { clearActiveProject, getDatabase, setActiveProject } from "@/src/database/db";
import { writePhotoUnique } from "@/src/utils/storageManager";
import { Project } from "@/src/models/Project";

type HookApi = ReturnType<typeof useWatermarkProcessor>;

let projectCounter = 0;

function uniqueProjectPath(): string {
  projectCounter += 1;
  return `/mock/documents/Projects/Isolate${projectCounter}/inspection.db`;
}

function projectFor(dbPath: string): Project {
  return {
    ProjectID: projectCounter,
    ProjectName: "Project Alpha",
    DistrictName: "New Delhi",
    DBPath: dbPath,
    SAFPath: null,
  } as unknown as Project;
}

async function createPhotosUntil(dbPath: string, count: number): Promise<number> {
  await setActiveProject(dbPath);
  let photoId = 0;
  for (let i = 1; i <= count; i += 1) {
    photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: `photo_${i}.jpg`,
      FilePath: `file:///mock/tmp/photo_${i}.jpg`,
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
  }
  return photoId;
}

describe("useWatermarkProcessor equal-PhotoID project isolation", () => {
  it("keeps equal PhotoID states separate per project DB path", async () => {
    const pathA = uniqueProjectPath();
    const pathB = uniqueProjectPath();
    const projectA = projectFor(pathA);
    const projectB = projectFor(pathB);
    const photoId = 15;
    (writePhotoUnique as jest.Mock).mockResolvedValue({
      contentUri: "content://media/x/photo.jpg",
      fileName: "photo.jpg",
    });

    await setActiveProject(pathA);
    const dbA = await getDatabase();

    const onPhotosUpdated = jest.fn();
    const resultA: { current: HookApi } = { current: undefined as unknown as HookApi };
    const resultB: { current: HookApi } = { current: undefined as unknown as HookApi };
    let tree!: ReturnType<typeof TestRenderer.create>;
    function ProbeA() {
      resultA.current = useWatermarkProcessor({ project: projectA, onPhotosUpdated });
      return null;
    }
    function ProbeB() {
      resultB.current = useWatermarkProcessor({ project: projectB, onPhotosUpdated });
      return null;
    }
    act(() => {
      tree = TestRenderer.create(
        <PhotoStatesProvider>
          <ProbeA />
          <ProbeB />
        </PhotoStatesProvider>
      );
    });

    act(() => {
      resultA.current.enqueueWatermark(
        photoId,
        "file:///mock/tmp/a.jpg",
        "a.jpg",
        ["line-a"]
      );
    });
    act(() => {
      resultB.current.enqueueWatermark(
        photoId,
        "file:///mock/tmp/b.jpg",
        "b.jpg",
        ["line-b"]
      );
    });

    const keyA = makePhotoStateKey(pathA, photoId);
    const keyB = makePhotoStateKey(pathB, photoId);
    expect(resultA.current.watermarkState[keyA]).toBe("pending");
    expect(resultA.current.watermarkState[keyB]).toBe("pending");
    expect(resultA.current.watermarkState[String(photoId)]).toBeUndefined();
    expect(Object.keys(resultA.current.watermarkState)).toHaveLength(2);

    const injectA = jest.fn();
    act(() => {
      resultA.current.webViewRef.current = { injectJavaScript: injectA } as never;
    });
    act(() => {
      resultA.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(resultA.current.watermarkState[keyA]).toBe("processing");

    act(() => {
      resultA.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId, base64: "BASE64DATA" }) },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(resultA.current.watermarkState[keyA]).toBe("completed");
    expect(resultA.current.watermarkState[keyB]).toBe("pending");

    const rowsInA = await dbA.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos"
    );
    expect(rowsInA).toHaveLength(0);

    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      await clearActiveProject();
    });
  });

  it("finalizes the owning project's DB row without touching the other project's state", async () => {
    const pathA = uniqueProjectPath();
    const pathB = uniqueProjectPath();
    const projectA = projectFor(pathA);
    (writePhotoUnique as jest.Mock).mockResolvedValue({
      contentUri: "content://media/x/photo.jpg",
      fileName: "photo.jpg",
    });

    const photoId = await createPhotosUntil(pathA, 15);
    const dbA = await getDatabase();
    const keyA = makePhotoStateKey(pathA, photoId);
    const keyB = makePhotoStateKey(pathB, photoId);

    const resultA: { current: HookApi } = { current: undefined as unknown as HookApi };
    const resultB: { current: HookApi } = { current: undefined as unknown as HookApi };
    let tree!: ReturnType<typeof TestRenderer.create>;
    function ProbeA() {
      resultA.current = useWatermarkProcessor({ project: projectA, onPhotosUpdated: jest.fn() });
      return null;
    }
    function ProbeB() {
      resultB.current = useWatermarkProcessor({ project: projectFor(pathB), onPhotosUpdated: jest.fn() });
      return null;
    }
    act(() => {
      tree = TestRenderer.create(
        <PhotoStatesProvider>
          <ProbeA />
          <ProbeB />
        </PhotoStatesProvider>
      );
    });

    act(() => {
      resultA.current.enqueueWatermark(
        photoId,
        "file:///mock/tmp/a.jpg",
        "a.jpg",
        ["line-a"]
      );
    });
    act(() => {
      resultB.current.enqueueWatermark(
        photoId,
        "file:///mock/tmp/b.jpg",
        "b.jpg",
        ["line-b"]
      );
    });

    const injectA = jest.fn();
    act(() => {
      resultA.current.webViewRef.current = { injectJavaScript: injectA } as never;
    });
    act(() => {
      resultA.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(resultA.current.watermarkState[keyA]).toBe("processing");

    act(() => {
      resultA.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId, base64: "BASE64DATA" }) },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(resultA.current.watermarkState[keyA]).toBe("completed");
    expect(resultA.current.watermarkState[keyB]).toBe("pending");

    const rowsInA = await dbA.getAllAsync<{
      PhotoID: number;
      ProcessingStatus: string;
      FileName: string;
    }>("SELECT PhotoID, ProcessingStatus, FileName FROM Photos");
    expect(rowsInA).toHaveLength(15);
    expect(rowsInA[14].PhotoID).toBe(photoId);
    expect(rowsInA[14].ProcessingStatus).toBe("completed");

    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      await clearActiveProject();
    });
  });

  it("clearWatermarkState removes only the owning project's state entry", async () => {
    const pathA = uniqueProjectPath();
    const pathB = uniqueProjectPath();
    const photoId = 15;
    const keyA = makePhotoStateKey(pathA, photoId);
    const keyB = makePhotoStateKey(pathB, photoId);

    const resultA: { current: HookApi } = { current: undefined as unknown as HookApi };
    const resultB: { current: HookApi } = { current: undefined as unknown as HookApi };
    let tree!: ReturnType<typeof TestRenderer.create>;
    function ProbeA() {
      resultA.current = useWatermarkProcessor({ project: projectFor(pathA), onPhotosUpdated: jest.fn() });
      return null;
    }
    function ProbeB() {
      resultB.current = useWatermarkProcessor({ project: projectFor(pathB), onPhotosUpdated: jest.fn() });
      return null;
    }
    act(() => {
      tree = TestRenderer.create(
        <PhotoStatesProvider>
          <ProbeA />
          <ProbeB />
        </PhotoStatesProvider>
      );
    });

    const injectA = jest.fn();
    const injectB = jest.fn();
    act(() => {
      resultA.current.webViewRef.current = { injectJavaScript: injectA } as never;
    });
    act(() => {
      resultB.current.webViewRef.current = { injectJavaScript: injectB } as never;
    });
    act(() => {
      resultA.current.enqueueWatermark(photoId, "file:///mock/tmp/a.jpg", "a.jpg", ["line-a"]);
    });
    act(() => {
      resultB.current.enqueueWatermark(photoId, "file:///mock/tmp/b.jpg", "b.jpg", ["line-b"]);
    });
    act(() => {
      resultA.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    act(() => {
      resultB.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(resultA.current.watermarkState[keyA]).toBe("processing");
    expect(resultA.current.watermarkState[keyB]).toBe("processing");

    act(() => {
      resultA.current.clearWatermarkState(photoId);
    });

    expect(resultA.current.watermarkState[keyA]).toBeUndefined();
    expect(resultB.current.watermarkState[keyB]).toBe("processing");

    await act(async () => {
      tree.unmount();
    });
  });

  it("mount recovery flips only the owning project's pending/processing states to failed", () => {
    const pathA = uniqueProjectPath();
    const pathB = uniqueProjectPath();
    const projectA = projectFor(pathA);
    const projectB = projectFor(pathB);

    const resultA: { current: HookApi } = { current: undefined as unknown as HookApi };
    let tree!: ReturnType<typeof TestRenderer.create>;
    function Seed() {
      const { setPhotoStates } = usePhotoStates();
      React.useEffect(() => {
        setPhotoStates({
          [makePhotoStateKey(pathA, 1)]: "processing",
          [makePhotoStateKey(pathA, 2)]: "pending",
          [makePhotoStateKey(pathB, 1)]: "pending",
          [makePhotoStateKey(pathB, 2)]: "completed",
          "3": "pending",
        });
      }, [setPhotoStates]);
      return null;
    }
    function ProbeA() {
      resultA.current = useWatermarkProcessor({ project: projectA, onPhotosUpdated: jest.fn() });
      return null;
    }
    act(() => {
      tree = TestRenderer.create(
        <PhotoStatesProvider>
          <Seed />
          <ProbeA />
        </PhotoStatesProvider>
      );
    });

    expect(resultA.current.watermarkState).toEqual({
      [makePhotoStateKey(pathA, 1)]: "failed",
      [makePhotoStateKey(pathA, 2)]: "failed",
      [makePhotoStateKey(pathB, 1)]: "pending",
      [makePhotoStateKey(pathB, 2)]: "completed",
      "3": "pending",
    });

    act(() => {
      tree.unmount();
    });
  });
});