// frontend/src/__tests__/hooks/useInspectionProgress.test.tsx

import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { InspectionProgress } from "@/src/database/repositories/InspectionProgressService";
import { InspectionProgressService } from "@/src/database/repositories/InspectionProgressService";
import useInspectionProgress from "@/src/hooks/useInspectionProgress";
import { logger } from "@/src/utils/logger";

jest.mock("@/src/database/repositories/InspectionProgressService", () => ({
  InspectionProgressService: {
    getInspectionProgress: jest.fn(),
  },
}));

jest.mock("@/src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const getProgressMock = InspectionProgressService.getInspectionProgress as jest.Mock;

function sampleProgress(completed: number, total = 6): InspectionProgress {
  return {
    completed,
    total,
    remaining: total > 0 ? total - completed : 0,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    groups: [
      {
        key: "general_information",
        label: "General Information",
        completed,
        total,
        remaining: total > 0 ? total - completed : 0,
        percentage: 100,
      },
      {
        key: "default_sections",
        label: "Default Sections",
        completed: 0,
        total: 0,
        remaining: 0,
        percentage: 0,
      },
      {
        key: "default_devices",
        label: "Default Device Type",
        completed: 0,
        total: 0,
        remaining: 0,
        percentage: 0,
      },
      {
        key: "custom_devices",
        label: "Custom Device Types",
        completed: 0,
        total: 0,
        remaining: 0,
        percentage: 0,
      },
      {
        key: "custom_sections",
        label: "Custom Sections",
        completed: 0,
        total: 0,
        remaining: 0,
        percentage: 0,
      },
    ],
    sections: [],
  };
}

interface ProbeProps {
  inspectionId: number | null;
  templateId?: number;
  refreshKey: number;
  onValue: (p: InspectionProgress | null) => void;
}

function Probe({ inspectionId, templateId, refreshKey, onValue }: ProbeProps) {
  const progress = useInspectionProgress(inspectionId, templateId, refreshKey);
  useEffect(() => {
    onValue(progress);
  }, [progress, onValue]);
  return null;
}

function waitFor(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("useInspectionProgress", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("null inspectionId → computes config-only progress via the service", async () => {
    getProgressMock.mockResolvedValue(sampleProgress(0, 23));
    const values: (InspectionProgress | null)[] = [];
    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <Probe inspectionId={null} templateId={1} refreshKey={0} onValue={(v) => values.push(v)} />
      );
    });
    await act(async () => {
      await waitFor();
    });

    expect(getProgressMock).toHaveBeenCalledWith(null, 1);
    expect(values[values.length - 1]).toEqual(sampleProgress(0, 23));
    await act(async () => {
      tree!.unmount();
    });
  });

  it("resolves progress and sets it", async () => {
    getProgressMock.mockResolvedValue(sampleProgress(4, 6));
    const values: (InspectionProgress | null)[] = [];
    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <Probe inspectionId={42} templateId={1} refreshKey={0} onValue={(v) => values.push(v)} />
      );
    });
    await act(async () => {
      await waitFor();
    });

    expect(getProgressMock).toHaveBeenCalledWith(42, 1);
    expect(values[values.length - 1]).toEqual(sampleProgress(4, 6));
    await act(async () => {
      tree!.unmount();
    });
  });

  it("refreshKey bump recomputes (live update contract, no polling)", async () => {
    getProgressMock
      .mockResolvedValueOnce(sampleProgress(1, 6))
      .mockResolvedValueOnce(sampleProgress(6, 6));
    const values: (InspectionProgress | null)[] = [];
    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <Probe inspectionId={42} templateId={1} refreshKey={0} onValue={(v) => values.push(v)} />
      );
    });
    await act(async () => {
      await waitFor();
    });

    await act(async () => {
      tree!.update(
        <Probe inspectionId={42} templateId={1} refreshKey={1} onValue={(v) => values.push(v)} />
      );
    });
    await act(async () => {
      await waitFor();
    });

    expect(getProgressMock).toHaveBeenCalledTimes(2);
    expect(values[values.length - 1]).toEqual(sampleProgress(6, 6));
    await act(async () => {
      tree!.unmount();
    });
  });

  it("unmount before resolve cancels the update (no state write after unmount)", async () => {
    let resolveFn!: (p: InspectionProgress) => void;
    getProgressMock.mockReturnValue(
      new Promise<InspectionProgress>((resolve) => {
        resolveFn = resolve;
      })
    );
    const values: (InspectionProgress | null)[] = [];
    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <Probe inspectionId={42} templateId={1} refreshKey={0} onValue={(v) => values.push(v)} />
      );
    });
    await act(async () => {
      tree!.unmount();
    });
    tree = undefined;

    await act(async () => {
      resolveFn(sampleProgress(6, 6));
      await waitFor();
    });

    expect(values.every((v) => v === null)).toBe(true);
  });

  it("service rejection → null + logged error", async () => {
    getProgressMock.mockRejectedValue(new Error("db exploded"));
    const values: (InspectionProgress | null)[] = [];
    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <Probe inspectionId={42} templateId={1} refreshKey={0} onValue={(v) => values.push(v)} />
      );
    });
    await act(async () => {
      await waitFor();
    });

    expect(logger.error).toHaveBeenCalled();
    expect(values[values.length - 1]).toBeNull();
    await act(async () => {
      tree!.unmount();
    });
  });
});