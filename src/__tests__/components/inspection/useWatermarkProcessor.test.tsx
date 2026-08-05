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
