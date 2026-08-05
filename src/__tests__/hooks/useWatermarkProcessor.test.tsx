jest.mock("@/src/database/helpers/ProjectDBManager");
jest.mock("@/src/database/db");
jest.mock("@/src/database/repositories/PhotoRepository", () => ({
  __esModule: true,
  default: { updateFilePath: jest.fn() },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));
jest.mock("@/src/utils/storageManager", () => ({
  writePhoto: jest.fn(),
  ensureTreeUri: jest.fn(),
  getProjectDir: jest.fn(),
}));
jest.mock("react-native-webview", () => {
  const RN = require("react-native");
  return { WebView: () => RN.View };
});

import React from "react";
import TestRenderer from "react-test-renderer";
import { InspectionProvider } from "@/src/context/InspectionContext";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import { Project } from "@/src/models/Project";
import { writePhoto, ensureTreeUri, getProjectDir } from "@/src/utils/storageManager";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import * as FileSystem from "expo-file-system/legacy";

const project = {
  ProjectID: 1,
  ProjectName: "Project Alpha",
  DistrictName: "New Delhi",
  DBPath: "/mock/db.db",
  SAFPath: null,
} as unknown as Project;

function renderHook<T>(hookFn: () => T) {
  const result: { current: T } = { current: undefined as unknown as T };
  let tree!: ReturnType<typeof TestRenderer.create>;
  function Probe() {
    result.current = hookFn();
    return null;
  }
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <InspectionProvider>
        <Probe />
      </InspectionProvider>
    );
  });
  return {
    result,
    unmount: () => TestRenderer.act(() => tree.unmount()),
  };
}

describe("useWatermarkProcessor folder target", () => {
  it("writes watermarked photos into the canonical <District>_<ProjectName> SAF folder", async () => {
    const treeUri = "content://tree/root";
    const projectDir = "content://tree/root/ACCC Inspection/New Delhi_Project Alpha";
    const fileUri = `${projectDir}/photo.jpg`;

    (ensureTreeUri as jest.Mock).mockResolvedValue(treeUri);
    (getProjectDir as jest.Mock).mockResolvedValue(projectDir);
    (writePhoto as jest.Mock).mockResolvedValue(fileUri);
    (PhotoRepository.updateFilePath as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("BASE64DATA");

    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated })
    );

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, base64: "BASE64DATA" }) },
      });
    });

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(getProjectDir).toHaveBeenCalledWith(treeUri, "New Delhi_Project Alpha");
    expect(writePhoto).toHaveBeenCalledWith(projectDir, "photo.jpg", "BASE64DATA");
    expect(PhotoRepository.updateFilePath).toHaveBeenCalledWith(1, fileUri);
    expect(onPhotosUpdated).toHaveBeenCalled();

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    unmount();
  });
});
