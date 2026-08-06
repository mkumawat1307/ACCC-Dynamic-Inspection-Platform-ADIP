jest.mock("@/src/database/helpers/ProjectDBManager");
jest.mock("@/src/database/db");
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
}));
jest.mock("react-native-webview", () => {
  const RN = require("react-native");
  return { WebView: () => RN.View };
});

import React, { useEffect } from "react";
import TestRenderer from "react-test-renderer";
import * as FileSystemLegacy from "expo-file-system/legacy";
import {
  InspectionProvider,
  useInspection,
} from "@/src/context/InspectionContext";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import { Project } from "@/src/models/Project";
import { WatermarkState } from "@/src/components/inspection/photoUtils";

const project = {
  ProjectID: 1,
  ProjectName: "Alpha",
  DistrictName: "D1",
  DBPath: "/mock/db.db",
  SAFPath: null,
} as unknown as Project;

function Seed({ states }: { states: Record<number, WatermarkState> }) {
  const { setPhotoStates } = useInspection();
  useEffect(() => {
    setPhotoStates(states);
  }, [states, setPhotoStates]);
  return null;
}

function renderHookInProvider<T>(
  hookFn: () => T,
  seedStates?: Record<number, WatermarkState>
) {
  const result: { current: T } = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hookFn();
    return null;
  }
  TestRenderer.act(() => {
    TestRenderer.create(
      <InspectionProvider>
        {seedStates ? <Seed states={seedStates} /> : null}
        <TestComponent />
      </InspectionProvider>
    );
  });
  return result;
}

async function flushMicrotasks() {
  await TestRenderer.act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

describe("useWatermarkProcessor remount safety", () => {
  it("reconciles orphaned pending/processing states to failed on mount", () => {
    const result = renderHookInProvider(
      () => useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() }),
      { 1: "processing", 2: "pending", 3: "completed" }
    );

    expect(result.current.watermarkState).toEqual({
      1: "failed",
      2: "failed",
      3: "completed",
    });
  });

  it("leaves an empty state map untouched", () => {
    const result = renderHookInProvider(
      () => useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );

    expect(result.current.watermarkState).toEqual({});
  });
});

describe("useWatermarkProcessor style flow", () => {
  it("passes the style config into the injected render script", async () => {
    const result = renderHookInProvider(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    const webviewRef = result.current.webViewRef;
    const injectJavaScript = jest.fn();
    (webviewRef as unknown as { current: { injectJavaScript: jest.Mock } }).current = {
      injectJavaScript,
    } as never;
    (FileSystemLegacy.readAsStringAsync as jest.Mock).mockResolvedValueOnce("b64data");
    result.current.handleWebViewMessage({
      nativeEvent: { data: JSON.stringify({ __ready: true }) },
    } as never);
    result.current.enqueueWatermark(9, "file:///tmp/a.jpg", "a.jpg", ["L1"], {
      fontScale: 1.25,
      position: "bottomRight",
      bgOpacity: 0.8,
      textColor: "#FFEB3B",
    });
    await flushMicrotasks();
    expect(injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"style":{"fontScale":1.25')
    );
  });
});
