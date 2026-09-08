jest.mock("@/src/utils/exportData", () => ({
  buildReportTable: jest.fn(),
  exportInspections: jest.fn(),
}));

jest.mock("@/src/components/reports/ReportTablePreview", () => {
  return () => null;
});

jest.mock("@/src/hooks/useProjectActivation", () => ({
  useProjectActivation: () => ({ ready: true, error: null }),
}));

const mockRouter = { back: jest.fn(), push: jest.fn() };
const mockParamsHolder: { current: Record<string, string | undefined> } = {
  current: {},
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParamsHolder.current,
  useRouter: () => mockRouter,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(cb, [cb]);
  },
}));

import React from "react";
import TestRenderer from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ReportsScreen from "@/app/reports";
import { buildReportTable } from "@/src/utils/exportData";
import { ReportTable } from "@/src/utils/exportData";

function renderScreen() {
  const element = (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 375, height: 812 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ReportsScreen />
    </SafeAreaProvider>
  );
  let renderer!: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element);
  });
  return {
    renderer,
    flush: async () => {
      await TestRenderer.act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });
    },
    text: () => {
      const json = renderer.toJSON();
      return json ? JSON.stringify(json) : "";
    },
    unmount: () => {
      TestRenderer.act(() => {
        renderer.unmount();
      });
    },
  };
}

const EMPTY_TABLE: ReportTable = {
  sections: [],
  headers: ["Pole ID"],
  rows: [{ cells: ["P001"], isDeviceRow: false }],
  inspectionCount: 1,
};

describe("ReportsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParamsHolder.current = {};
    (buildReportTable as jest.Mock).mockReset();
  });

  it("renders the report preview when the table builds successfully", async () => {
    mockParamsHolder.current = { projectId: "1", projectName: "Alpha" };
    (buildReportTable as jest.Mock).mockResolvedValue(EMPTY_TABLE);

    const h = renderScreen();
    await h.flush();

    expect(buildReportTable).toHaveBeenCalledWith(1);
    expect(h.text()).toContain("Total Inspections:");
    expect(h.text()).toContain("Total Rows:");
    expect(h.text()).not.toContain("Unable to load the report preview.");
    h.unmount();
  });

  it("shows a distinct failure message instead of 'No inspection data to preview.' when the preview build fails", async () => {
    mockParamsHolder.current = { projectId: "1", projectName: "Alpha" };
    (buildReportTable as jest.Mock).mockRejectedValue(new Error("boom"));

    const h = renderScreen();
    await h.flush();

    expect(h.text()).toContain("Unable to load the report preview.");
    expect(h.text()).not.toContain("No inspection data to preview.");
    expect(h.text()).not.toContain("Total Inspections");
    h.unmount();
  });

  it("warns that device data was omitted when the report is degraded, without treating it as an empty report", async () => {
    mockParamsHolder.current = { projectId: "1", projectName: "Alpha" };
    (buildReportTable as jest.Mock).mockResolvedValue({
      ...EMPTY_TABLE,
      deviceDataErrors: ["DeviceFieldDefinitions"],
    });

    const h = renderScreen();
    await h.flush();

    expect(h.text()).toContain("Total Inspections:");
    expect(h.text()).toContain("Some device data could not be loaded");
    expect(h.text()).not.toContain("No inspection data to preview.");
    h.unmount();
  });
});