import React from "react";
import { Text } from "react-native";
import TestRenderer from "react-test-renderer";
import { captureFlowReducer, initialState, useCaptureFlow } from "@/src/components/camera/useCaptureFlow";

const pending = {
  photoId: 1,
  tempUri: "file:///tmp/a.jpg",
  fileName: "a.jpg",
  lines: ["P-101", "North, B3", "04-Aug-2026 10:00 AM", "34.05, -118.25"],
  timestamp: "2026-08-04T10:00:00.000Z",
};

describe("captureFlowReducer", () => {
  it("starts in preview with no pending photo", () => {
    expect(captureFlowReducer(initialState, { type: "DISCARD" })).toEqual({
      phase: "preview",
      pending: null,
    });
  });

  it("BEGIN_CAPTURE moves preview -> merging and stores the pending photo", () => {
    const state = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    expect(state.phase).toBe("merging");
    expect(state.pending).toEqual(pending);
  });

  it("MERGE_COMPLETED moves merging -> saved, retaining pending", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const state = captureFlowReducer(merging, { type: "MERGE_COMPLETED" });
    expect(state.phase).toBe("saved");
    expect(state.pending).toEqual(pending);
  });

  it("MERGE_FAILED moves merging -> failed, retaining pending", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const state = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    expect(state.phase).toBe("failed");
    expect(state.pending).toEqual(pending);
  });

  it("SAVED_TIMEOUT moves saved -> preview and clears pending", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const saved = captureFlowReducer(merging, { type: "MERGE_COMPLETED" });
    const state = captureFlowReducer(saved, { type: "SAVED_TIMEOUT" });
    expect(state).toEqual({ phase: "preview", pending: null });
  });

  it("RETRY moves failed -> merging", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const failed = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    const state = captureFlowReducer(failed, { type: "RETRY" });
    expect(state.phase).toBe("merging");
  });

  it("DISCARD moves failed -> preview and clears pending", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const failed = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    const state = captureFlowReducer(failed, { type: "DISCARD" });
    expect(state).toEqual({ phase: "preview", pending: null });
  });

  it("ignores SAVED_TIMEOUT and RETRY outside their valid source phases", () => {
    const preview = captureFlowReducer(initialState, { type: "SAVED_TIMEOUT" });
    expect(preview.phase).toBe("preview");
    const retryFromPreview = captureFlowReducer(initialState, { type: "RETRY" });
    expect(retryFromPreview.phase).toBe("preview");
  });
});

describe("useCaptureFlow", () => {
  it("drives preview -> merging -> saved -> preview via the hook", async () => {
    let flowRef: ReturnType<typeof useCaptureFlow> | null = null;
    function Probe() {
      flowRef = useCaptureFlow();
      return <Text>{flowRef.phase}</Text>;
    }
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Probe />);
    });
    expect(flowRef!.phase).toBe("preview");

    await TestRenderer.act(async () => {
      flowRef!.beginCapture(pending);
    });
    expect(flowRef!.phase).toBe("merging");

    await TestRenderer.act(async () => {
      flowRef!.markMergeCompleted();
    });
    expect(flowRef!.phase).toBe("saved");

    await TestRenderer.act(async () => {
      flowRef!.savedTimeout();
    });
    expect(flowRef!.phase).toBe("preview");

    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });
});