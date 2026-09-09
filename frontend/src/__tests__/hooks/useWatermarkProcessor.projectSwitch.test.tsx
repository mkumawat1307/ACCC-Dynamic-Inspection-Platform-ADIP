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
import { PhotoStatesProvider } from "@/src/context/PhotoStatesContext";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { clearActiveProject, getDatabase, setActiveProject } from "@/src/database/db";
import { writePhotoUnique } from "@/src/utils/storageManager";
import { Project } from "@/src/models/Project";

type HookApi = ReturnType<typeof useWatermarkProcessor>;

let projectCounter = 0;

function uniqueProjectPath(): string {
  projectCounter += 1;
  return `/mock/documents/Projects/Swap${projectCounter}/inspection.db`;
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

function renderHook(project: Project, onPhotosUpdated: () => void) {
  const result: { current: HookApi } = { current: undefined as unknown as HookApi };
  let tree!: ReturnType<typeof TestRenderer.create>;
  function Probe() {
    result.current = useWatermarkProcessor({ project, onPhotosUpdated });
    return null;
  }
  act(() => {
    tree = TestRenderer.create(
      <PhotoStatesProvider>
        <Probe />
      </PhotoStatesProvider>
    );
  });
  return {
    result,
    unmount: () => act(() => tree.unmount()),
  };
}

describe("useWatermarkProcessor project-switch isolation", () => {
  it("does not persist a watermark status into another project when the project switches before save", async () => {
    const pathA = uniqueProjectPath();
    const pathB = uniqueProjectPath();
    const projectA = projectFor(pathA);

    await setActiveProject(pathA);
    const dbA = await getDatabase();
    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_a.jpg",
      FilePath: "file:///mock/tmp/pole_a.jpg",
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });

    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(projectA, onPhotosUpdated);

    act(() => {
      result.current.enqueueWatermark(
        photoId,
        "file:///mock/tmp/pole_a.jpg",
        "pole_a.jpg",
        ["line"]
      );
    });

    await act(async () => {
      await clearActiveProject();
    });
    await act(async () => {
      await setActiveProject(pathB);
    });
    const dbB = await getDatabase();

    act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId, base64: "BASE64DATA" }) },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const rowsInB = await dbB.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos"
    );
    expect(rowsInB).toHaveLength(0);

    const rowsInA = await dbA.getAllAsync<{
      PhotoID: number;
      ProcessingStatus: string;
    }>("SELECT PhotoID, ProcessingStatus FROM Photos");
    expect(rowsInA).toEqual([{ PhotoID: photoId, ProcessingStatus: "captured" }]);

    unmount();
    await act(async () => {
      await clearActiveProject();
    });
  });

  it("finalizes a watermarked photo with a single atomic updateFinalPath call", async () => {
    const pathA = uniqueProjectPath();
    const projectA = projectFor(pathA);
    const fileUri =
      "content://media/Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/pole_b.jpg";
    (writePhotoUnique as jest.Mock).mockResolvedValue({
      contentUri: fileUri,
      fileName: "pole_b.jpg",
    });

    await setActiveProject(pathA);
    const dbA = await getDatabase();
    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_b.jpg",
      FilePath: "file:///mock/tmp/pole_b.jpg",
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
    const updateSpy = jest.spyOn(PhotoRepository, "updateFinalPath");

    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(projectA, onPhotosUpdated);

    act(() => {
      result.current.enqueueWatermark(
        photoId,
        "file:///mock/tmp/pole_b.jpg",
        "pole_b.jpg",
        ["line"]
      );
    });
    act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId, base64: "BASE64DATA" }) },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(
      photoId,
      "pole_b.jpg",
      fileUri,
      "Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/"
    );
    expect(onPhotosUpdated).toHaveBeenCalled();

    const dbRow = await dbA.getAllAsync<{
      FileName: string;
      FilePath: string;
      StoragePath: string;
      ProcessingStatus: string;
    }>("SELECT FileName, FilePath, StoragePath, ProcessingStatus FROM Photos");
    expect(dbRow).toEqual([
      {
        FileName: "pole_b.jpg",
        FilePath: fileUri,
        StoragePath: "Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/",
        ProcessingStatus: "completed",
      },
    ]);

    updateSpy.mockRestore();
    unmount();
    await act(async () => {
      await clearActiveProject();
    });
  });
});