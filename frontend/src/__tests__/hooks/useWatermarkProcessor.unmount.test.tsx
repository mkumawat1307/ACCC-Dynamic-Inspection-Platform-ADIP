jest.mock("@/src/database/helpers/ProjectDBManager");
jest.mock("@/src/database/db");
jest.mock("@/src/database/repositories/PhotoRepository", () => ({
  __esModule: true,
  default: {
    updateFinalPath: jest.fn(),
    updateFilePathAndStoragePath: jest.fn(),
    updateFileNameAndPath: jest.fn(),
    updateStoragePath: jest.fn(),
    setProcessingStatus: jest.fn().mockResolvedValue(undefined),
  },
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
import TestRenderer from "react-test-renderer";
import { InspectionProvider } from "@/src/context/InspectionContext";
import { PhotoStatesProvider } from "@/src/context/PhotoStatesContext";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import { makePhotoStateKey } from "@/src/components/inspection/photoUtils";
import { Project } from "@/src/models/Project";
import { writePhotoUnique, deletePhoto } from "@/src/utils/storageManager";
import { getActiveProjectPath } from "@/src/database/db";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import * as FileSystem from "expo-file-system/legacy";
import { WebView } from "react-native-webview";

const project = {
  ProjectID: 1,
  ProjectName: "Project Alpha",
  DistrictName: "New Delhi",
  DBPath: "/mock/db.db",
  SAFPath: null,
} as unknown as Project;

const keyOf = (photoId: number) => makePhotoStateKey(project.DBPath, photoId);
const FOLDER_LABEL = "New Delhi_Project Alpha";
const finalUri = `content://media/Download/ACCC Dynamic Inspection/${FOLDER_LABEL}/photo.jpg`;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await TestRenderer.act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function renderHook(onPhotosUpdated: () => void) {
  const result: {
    current: ReturnType<typeof useWatermarkProcessor>;
  } = { current: undefined as unknown as ReturnType<typeof useWatermarkProcessor> };
  let tree!: ReturnType<typeof TestRenderer.create>;
  function Probe() {
    result.current = useWatermarkProcessor({ project, onPhotosUpdated });
    return null;
  }
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <PhotoStatesProvider>
        <InspectionProvider>
          <Probe />
        </InspectionProvider>
      </PhotoStatesProvider>
    );
  });
  return {
    result,
    unmount: () => TestRenderer.act(() => tree.unmount()),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getActiveProjectPath as jest.Mock).mockReturnValue(project.DBPath);
  (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("BASE64DATA");
  (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  (writePhotoUnique as jest.Mock).mockResolvedValue({
    contentUri: finalUri,
    fileName: "photo.jpg",
  });
  (PhotoRepository.updateFinalPath as jest.Mock).mockResolvedValue(undefined);
  (PhotoRepository.setProcessingStatus as jest.Mock).mockResolvedValue(undefined);
});

describe("useWatermarkProcessor unmount lifecycle", () => {
  it("ignores a late WebView payload after unmount: no file write, no DB finalize, no refresh, state stays processing", async () => {
    const injectJavaScript = jest.fn();
    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(onPhotosUpdated);

    TestRenderer.act(() => {
      result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await flush();
    expect(injectJavaScript).toHaveBeenCalledTimes(1);
    expect(result.current.watermarkState[keyOf(1)]).toBe("processing");

    unmount();

    const statusCallsAfterReady = (PhotoRepository.setProcessingStatus as jest.Mock)
      .mock.calls.length;

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, base64: "BASE64DATA" }) },
      });
    });
    await flush();

    expect(writePhotoUnique).not.toHaveBeenCalled();
    expect(PhotoRepository.updateFinalPath).not.toHaveBeenCalled();
    expect(onPhotosUpdated).not.toHaveBeenCalled();
    expect((PhotoRepository.setProcessingStatus as jest.Mock).mock.calls.length).toBe(
      statusCallsAfterReady
    );
    expect(result.current.watermarkState[keyOf(1)]).toBe("processing");
  });

  it("abandons a pending base64 read after unmount and never starts the queued job", async () => {
    const readDeferred = deferred<string>();
    (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(
      () => readDeferred.promise
    );
    const injectJavaScript = jest.fn();
    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(onPhotosUpdated);

    TestRenderer.act(() => {
      result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;
      result.current.enqueueWatermark(1, "file:///tmp/one.jpg", "one.jpg", ["line"]);
      result.current.enqueueWatermark(2, "file:///tmp/two.jpg", "two.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await flush();
    expect(injectJavaScript).not.toHaveBeenCalled();

    unmount();

    await TestRenderer.act(async () => {
      readDeferred.resolve("BASE64DATA");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(injectJavaScript).not.toHaveBeenCalled();
    expect(writePhotoUnique).not.toHaveBeenCalled();
    expect(PhotoRepository.updateFinalPath).not.toHaveBeenCalled();
    expect(result.current.watermarkState[keyOf(2)]).toBe("pending");
  });

  it("cleans up its own orphan file and skips DB finalize when unmounted while the SAF write is in flight", async () => {
    const writeDeferred = deferred<{ contentUri: string; fileName: string }>();
    (writePhotoUnique as jest.Mock).mockImplementation(() => writeDeferred.promise);
    const injectJavaScript = jest.fn();
    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(onPhotosUpdated);
    const inputPath = "file:///tmp/one.jpg";

    TestRenderer.act(() => {
      result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;
      result.current.enqueueWatermark(1, inputPath, "one.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await flush();

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, base64: "BASE64DATA" }) },
      });
    });
    await flush();
    expect(writePhotoUnique).toHaveBeenCalledTimes(1);

    unmount();

    const statusCallsAtUnmount = (PhotoRepository.setProcessingStatus as jest.Mock)
      .mock.calls.length;

    await TestRenderer.act(async () => {
      writeDeferred.resolve({ contentUri: finalUri, fileName: "one.jpg" });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(deletePhoto).toHaveBeenCalledWith(finalUri);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(inputPath, { idempotent: true });
    expect(PhotoRepository.updateFinalPath).not.toHaveBeenCalled();
    expect(onPhotosUpdated).not.toHaveBeenCalled();
    expect((PhotoRepository.setProcessingStatus as jest.Mock).mock.calls.length).toBe(
      statusCallsAtUnmount
    );
  });

  it("still completes a watermarked photo through the normal mounted flow", async () => {
    const injectJavaScript = jest.fn();
    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(onPhotosUpdated);

    TestRenderer.act(() => {
      result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await flush();
    expect(injectJavaScript).toHaveBeenCalledTimes(1);

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, base64: "BASE64DATA" }) },
      });
    });
    await flush();

    expect(writePhotoUnique).toHaveBeenCalledWith(FOLDER_LABEL, "photo.jpg", "BASE64DATA");
    expect(PhotoRepository.updateFinalPath).toHaveBeenCalledWith(
      1,
      "photo.jpg",
      finalUri,
      `Download/ACCC Dynamic Inspection/${FOLDER_LABEL}/`
    );
    expect(onPhotosUpdated).toHaveBeenCalledTimes(1);
    expect(result.current.watermarkState[keyOf(1)]).toBe("completed");

    unmount();
  });

  it("keeps the retry-after-failure flow working while mounted", async () => {
    (writePhotoUnique as jest.Mock)
      .mockRejectedValueOnce(new Error("E1"))
      .mockRejectedValueOnce(new Error("E2"))
      .mockResolvedValueOnce({ contentUri: finalUri, fileName: "photo.jpg" });
    const injectJavaScript = jest.fn();
    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(onPhotosUpdated);

    TestRenderer.act(() => {
      result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await flush();
    expect(injectJavaScript).toHaveBeenCalledTimes(1);

    const base64Message = () =>
      TestRenderer.act(() => {
        result.current.handleWebViewMessage({
          nativeEvent: { data: JSON.stringify({ photoId: 1, base64: "BASE64DATA" }) },
        });
      });

    await base64Message();
    await flush();
    await flush();
    expect(result.current.watermarkState[keyOf(1)]).toBe("processing");

    await base64Message();
    await flush();
    expect(result.current.watermarkState[keyOf(1)]).toBe("failed");

    let retried = false;
    TestRenderer.act(() => {
      retried = result.current.retryWatermark(1);
    });
    expect(retried).toBe(true);
    await flush();
    expect(injectJavaScript).toHaveBeenCalledTimes(3);

    await base64Message();
    await flush();

    expect(writePhotoUnique).toHaveBeenCalledTimes(3);
    expect(PhotoRepository.updateFinalPath).toHaveBeenCalledTimes(1);
    expect(onPhotosUpdated).toHaveBeenCalledTimes(1);
    expect(result.current.watermarkState[keyOf(1)]).toBe("completed");

    unmount();
  });
});