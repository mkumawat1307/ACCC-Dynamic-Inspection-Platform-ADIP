import React from "react";
import TestRenderer from "react-test-renderer";
import ReportTablePreview from "@/src/components/reports/ReportTablePreview";
import { ReportTable } from "@/src/utils/exportData";

const fixture: ReportTable = {
  sections: [
    {
      index: 0,
      name: "Pole Info",
      sectionKey: "pole_info",
      isRepeatable: false,
      columns: [{ key: "pole_id", label: "Pole ID", isDeviceColumn: false, sectionIndex: 0 }],
    },
    {
      index: 1,
      name: "Camera Info",
      sectionKey: "camera_information",
      isRepeatable: true,
      deviceType: "camera",
      columns: [{ key: "device_no", label: "Device No", isDeviceColumn: true, sectionIndex: 1 }],
    },
  ],
  headers: ["Pole ID", "Device No"],
  rows: [
    { cells: ["P001", "-"], isDeviceRow: false },
    { cells: ["P001", "3"], isDeviceRow: true },
    { cells: ["P002", "1"], isDeviceRow: true },
  ],
};

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
    return out;
  }
  if (node && typeof node === "object") {
    const children = (node as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const child of children) collectStrings(child, out);
    }
  }
  return out;
}

describe("ReportTablePreview", () => {
  it("renders band, header, and data cells", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<ReportTablePreview table={fixture} />);
    });
    const strings = collectStrings(tree!.toJSON());
    const count = (value: string) => strings.filter((s) => s === value).length;
    expect(count("Pole Info")).toBe(1);
    expect(count("Camera Info")).toBe(1);
    expect(count("Pole ID")).toBe(1);
    expect(count("Device No")).toBe(1);
    expect(count("P001")).toBe(2);
    expect(count("P002")).toBe(1);
    expect(count("1")).toBe(1);
    expect(count("3")).toBe(1);
    expect(count("-")).toBe(1);
  });

  it("does not emit duplicate-key warnings for rows sharing first cell and column count", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let errorCalls: string[] = [];
    let warnCalls: string[] = [];
    try {
      let tree: ReturnType<typeof TestRenderer.create>;
      TestRenderer.act(() => {
        tree = TestRenderer.create(<ReportTablePreview table={fixture} />);
      });
      expect(tree!.toJSON()).not.toBeNull();
    } finally {
      errorCalls = errorSpy.mock.calls.map((args) => args.join(" "));
      warnCalls = warnSpy.mock.calls.map((args) => args.join(" "));
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
    const messages = [...errorCalls, ...warnCalls];
    expect(messages.some((m) => m.includes("two children with the same key"))).toBe(false);
  });
});
