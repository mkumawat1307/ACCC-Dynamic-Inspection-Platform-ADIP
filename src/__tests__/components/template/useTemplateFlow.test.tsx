import React, { useEffect } from "react";
import { Text, View } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { useTemplateFlow } from "@/src/components/template/useTemplateFlow";

jest.mock("@/src/utils/templateData", () => ({
  exportTemplates: jest.fn(),
  shareTemplateFile: jest.fn().mockResolvedValue(true),
  pickAndParseTemplate: jest.fn(),
  applyTemplateImport: jest.fn(),
}));

jest.mock("@/src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const {
  exportTemplates,
  shareTemplateFile,
  pickAndParseTemplate,
  applyTemplateImport,
} = require("@/src/utils/templateData");

type Flow = ReturnType<typeof useTemplateFlow>;

const exportResult = {
  fileUri: "file:///mock/template.json",
  fileName: "template.json",
  summary: { templateCount: 1, sectionCount: 1, fieldCount: 1, deviceTypeCount: 0, deviceOptionCount: 0 },
};

const parsedFile = {
  data: { version: "2.0", exportedAt: "2024-01-01", templates: [], projectDeviceTypes: [] },
  summary: { templateCount: 1, sectionCount: 1, fieldCount: 1, deviceTypeCount: 0, deviceOptionCount: 0 },
};

function Host({ flowRef }: { flowRef: { current: Flow | null } }) {
  const flow = useTemplateFlow();
  useEffect(() => {
    flowRef.current = flow;
  }, [flow, flowRef]);
  return (
    <View>
      <Text testID="phase">{flow.state.phase}</Text>
      {flow.state.phase === "exported" && <Text testID="summary">{flow.state.result.summary.sectionCount}</Text>}
      {flow.state.phase === "confirming" && <Text testID="summary">{flow.state.parsed.summary.sectionCount}</Text>}
      {flow.state.phase === "imported" && <Text testID="message">{flow.state.message}</Text>}
      {flow.state.phase === "error" && <Text testID="message">{flow.state.message}</Text>}
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
  return String(root.find((n) => n.props.testID === testID).props.children);
}

describe("useTemplateFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (exportTemplates as jest.Mock).mockResolvedValue(exportResult);
    (pickAndParseTemplate as jest.Mock).mockResolvedValue({ status: "ready", parsed: parsedFile });
    (applyTemplateImport as jest.Mock).mockResolvedValue({ success: true, message: "Imported 1 template." });
  });

  it("exports to success and shares", async () => {
    const { root, flowRef } = renderHost();

    await act(async () => {
      await flowRef.current!.beginExport();
    });
    expect(find(root, "phase")).toBe("exported");
    expect(find(root, "summary")).toBe("1");
    expect(exportTemplates).toHaveBeenCalledTimes(1);

    await act(async () => {
      await flowRef.current!.shareExported();
    });
    expect(shareTemplateFile).toHaveBeenCalledWith(exportResult);
  });

  it("surfaces export error and retry recovers", async () => {
    (exportTemplates as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    const { root, flowRef } = renderHost();

    await act(async () => {
      await flowRef.current!.beginExport();
    });
    expect(find(root, "phase")).toBe("error");
    expect(find(root, "message")).toContain("export");

    await act(async () => {
      await flowRef.current!.retry();
    });
    expect(find(root, "phase")).toBe("exported");
  });

  it("shows null export as an error", async () => {
    (exportTemplates as jest.Mock).mockResolvedValueOnce(null);
    const { root, flowRef } = renderHost();
    await act(async () => {
      await flowRef.current!.beginExport();
    });
    expect(find(root, "phase")).toBe("error");
  });

  it("imports via confirm after parsing", async () => {
    const { root, flowRef } = renderHost();

    await act(async () => {
      await flowRef.current!.beginImport();
    });
    expect(find(root, "phase")).toBe("confirming");
    expect(find(root, "summary")).toBe("1");

    await act(async () => {
      await flowRef.current!.confirmImport();
    });
    expect(find(root, "phase")).toBe("imported");
    expect(find(root, "message")).toBe("Imported 1 template.");
    expect(applyTemplateImport).toHaveBeenCalledWith(parsedFile.data);
  });

  it("returns to idle on cancel and canceled picker", async () => {
    const { root, flowRef } = renderHost();
    await act(async () => {
      await flowRef.current!.beginImport();
      flowRef.current!.cancelImport();
    });
    expect(find(root, "phase")).toBe("idle");

    (pickAndParseTemplate as jest.Mock).mockResolvedValueOnce({ status: "canceled" });
    await act(async () => {
      await flowRef.current!.beginImport();
    });
    expect(find(root, "phase")).toBe("idle");
  });

  it("handles import error", async () => {
    (applyTemplateImport as jest.Mock).mockResolvedValueOnce({ success: false, message: "Failed to import template. x" });
    const { root, flowRef } = renderHost();
    await act(async () => {
      await flowRef.current!.beginImport();
      await flowRef.current!.confirmImport();
    });
    expect(find(root, "phase")).toBe("error");
    expect(find(root, "message")).toContain("Failed to import");
  });
});
