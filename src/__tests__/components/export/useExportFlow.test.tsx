import React, { useEffect } from "react";
import { Text, View } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { useExportFlow, ExportTarget } from "@/src/components/export/useExportFlow";

jest.mock("@/src/utils/exportData", () => ({
  createExportFile: jest.fn(),
  openExportFile: jest.fn().mockResolvedValue(true),
  shareExportFile: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { createExportFile, openExportFile, shareExportFile } = require("@/src/utils/exportData");

type Flow = ReturnType<typeof useExportFlow>;

const target: ExportTarget = { ids: [1, 2] };

function Host({ flowRef }: { flowRef: { current: Flow | null } }) {
  const flow = useExportFlow(1, "Project");
  useEffect(() => {
    flowRef.current = flow;
  }, [flow, flowRef]);
  return (
    <View>
      <Text testID="phase">{flow.state.phase}</Text>
      {flow.state.phase === "success" && <Text testID="fileName">{flow.state.result.fileName}</Text>}
      {flow.state.phase === "success" && <Text testID="rows">{flow.state.result.rowCount}</Text>}
      {flow.state.phase === "error" && <Text testID="error">{flow.state.message}</Text>}
    </View>
  );
}

function renderHost() {
  const flowRef: { current: Flow | null } = { current: null };
  let renderer: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(<Host flowRef={flowRef} />);
  });
  return { root: renderer!.root, flowRef };
}

function find(root: ReturnType<typeof TestRenderer.create>, testID: string) {
  return root.find((n) => n.props.testID === testID).props.children as string;
}

describe("useExportFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createExportFile as jest.Mock).mockResolvedValue({
      fileUri: "file:///mock/documents/report.xlsx",
      fileName: "report.xlsx",
      format: "excel",
      inspectionCount: 2,
      rowCount: 4,
      durationMs: 123,
    });
  });

  it("runs the export to success with the correct params and result", async () => {
    const { root, flowRef } = renderHost();

    await act(async () => {
      flowRef.current!.beginExport(target);
      flowRef.current!.runExport("excel");
    });

    expect(createExportFile).toHaveBeenCalledWith(1, "Project", [1, 2], "excel");
    expect(find(root, "phase")).toBe("success");
    expect(find(root, "fileName")).toBe("report.xlsx");
    expect(find(root, "rows")).toBe(4);
  });

  it("surfaces an error when the export throws and retry recovers", async () => {
    (createExportFile as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    const { root, flowRef } = renderHost();

    await act(async () => {
      flowRef.current!.beginExport(target);
      flowRef.current!.runExport("csv");
    });

    expect(find(root, "phase")).toBe("error");
    expect(find(root, "error")).toContain("Unable to generate the CSV report");

    await act(async () => {
      flowRef.current!.retry();
    });

    expect(createExportFile).toHaveBeenLastCalledWith(1, "Project", [1, 2], "csv");
    expect(find(root, "phase")).toBe("success");
  });

  it("reports an error when the export produces no rows", async () => {
    (createExportFile as jest.Mock).mockResolvedValueOnce(null);
    const { root, flowRef } = renderHost();

    await act(async () => {
      flowRef.current!.beginExport(target);
      flowRef.current!.runExport("excel");
    });

    expect(find(root, "phase")).toBe("error");
    expect(find(root, "error")).toContain("No inspection data found");
  });

  it("dismiss resets the flow to idle", async () => {
    const { root, flowRef } = renderHost();

    await act(async () => {
      flowRef.current!.beginExport(target);
    });
    expect(find(root, "phase")).toBe("choosing");

    await act(async () => {
      flowRef.current!.dismiss();
    });
    expect(find(root, "phase")).toBe("idle");
  });

  it("opens and shares the exported file from the success phase", async () => {
    const { flowRef } = renderHost();

    await act(async () => {
      flowRef.current!.beginExport(target);
      flowRef.current!.runExport("excel");
    });
    expect(findTestIdOrThrow(flowRef)).toBe("success");

    await act(async () => {
      flowRef.current!.open();
    });
    expect(openExportFile).toHaveBeenCalled();

    await act(async () => {
      flowRef.current!.share();
    });
    expect(shareExportFile).toHaveBeenCalled();
  });
});

function findTestIdOrThrow(flowRef: { current: Flow | null }): string {
  return flowRef.current!.state.phase;
}
