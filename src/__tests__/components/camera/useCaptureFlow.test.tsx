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
    expect(captureFlowReducer(initialState, { type: "RETAKE" })).toEqual({
      phase: "preview",
      pending: null,
    });
  });

  it("BEGIN_CAPTURE moves preview -> merging and stores the pending photo", () => {
    const state = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    expect(state.phase).toBe("merging");
    expect(state.pending).toEqual(pending);
  });

  it("MERGE_COMPLETED moves merging -> confirm", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const state = captureFlowReducer(merging, { type: "MERGE_COMPLETED" });
    expect(state.phase).toBe("confirm");
    expect(state.pending).toEqual(pending);
  });

  it("MERGE_FAILED moves merging -> failed", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const state = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    expect(state.phase).toBe("failed");
  });

  it("RETRY moves failed -> merging", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const failed = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    const state = captureFlowReducer(failed, { type: "RETRY" });
    expect(state.phase).toBe("merging");
  });

  it("RETAKE clears pending and returns to preview from confirm", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const confirm = captureFlowReducer(merging, { type: "MERGE_COMPLETED" });
    const state = captureFlowReducer(confirm, { type: "RETAKE" });
    expect(state).toEqual({ phase: "preview", pending: null });
  });

  it("ignores MERGE_COMPLETED outside merging", () => {
    expect(captureFlowReducer(initialState, { type: "MERGE_COMPLETED" })).toEqual(initialState);
  });
});

describe("useCaptureFlow", () => {
  it("drives the preview -> merging -> confirm -> preview cycle via the hook", async () => {
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
    expect(flowRef!.pending).toEqual(pending);

    await TestRenderer.act(async () => {
      flowRef!.markMergeCompleted();
    });
    expect(flowRef!.phase).toBe("confirm");

    await TestRenderer.act(async () => {
      flowRef!.retake();
    });
    expect(flowRef!.phase).toBe("preview");

    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });
});
