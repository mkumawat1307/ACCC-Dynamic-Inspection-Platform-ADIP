import { useReducer } from "react";

export type CapturePhase = "preview" | "merging" | "confirm" | "failed";

export interface PendingPhoto {
  photoId: number;
  tempUri: string;
  fileName: string;
  lines: string[];
  timestamp: string;
}

export interface CaptureFlowState {
  phase: CapturePhase;
  pending: PendingPhoto | null;
}

export type CaptureFlowAction =
  | { type: "BEGIN_CAPTURE"; photo: PendingPhoto }
  | { type: "MERGE_COMPLETED" }
  | { type: "MERGE_FAILED" }
  | { type: "RETAKE" }
  | { type: "RETRY" };

export const initialState: CaptureFlowState = { phase: "preview", pending: null };

export function captureFlowReducer(
  state: CaptureFlowState,
  action: CaptureFlowAction
): CaptureFlowState {
  switch (action.type) {
    case "BEGIN_CAPTURE":
      return { phase: "merging", pending: action.photo };
    case "MERGE_COMPLETED":
      return state.phase === "merging" && state.pending
        ? { ...state, phase: "confirm" }
        : state;
    case "MERGE_FAILED":
      return state.phase === "merging" && state.pending
        ? { ...state, phase: "failed" }
        : state;
    case "RETRY":
      return state.phase === "failed" && state.pending
        ? { ...state, phase: "merging" }
        : state;
    case "RETAKE":
      return { phase: "preview", pending: null };
    default:
      return state;
  }
}

export function useCaptureFlow() {
  const [state, dispatch] = useReducer(captureFlowReducer, initialState);
  return {
    ...state,
    beginCapture: (photo: PendingPhoto) => dispatch({ type: "BEGIN_CAPTURE", photo }),
    markMergeCompleted: () => dispatch({ type: "MERGE_COMPLETED" }),
    markMergeFailed: () => dispatch({ type: "MERGE_FAILED" }),
    retake: () => dispatch({ type: "RETAKE" }),
    retry: () => dispatch({ type: "RETRY" }),
  };
}
