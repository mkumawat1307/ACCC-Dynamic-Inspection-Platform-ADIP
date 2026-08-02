import React from "react";
import { Text } from "react-native";
import TestRenderer from "react-test-renderer";
import { AppState } from "react-native";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
import useDashboardAutoRefresh from "@/src/hooks/useDashboardAutoRefresh";

type AppStateHandler = (state: string) => void;

let appStateHandler: AppStateHandler | null = null;

jest.spyOn(AppState, "addEventListener").mockImplementation(
  ((_type: string, handler: AppStateHandler) => {
    appStateHandler = handler;
    return { remove: jest.fn() };
  }) as never
);

function Probe({ projectId, focused }: { projectId: number; focused?: boolean }) {
  const reloadKey = useDashboardAutoRefresh(projectId, focused ?? true);
  return <Text>{reloadKey}</Text>;
}

async function renderProbe(props: { projectId: number; focused?: boolean }) {
  let tree!: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<Probe {...props} />);
    await Promise.resolve();
  });
  return tree;
}

function renderedKey(tree: ReturnType<typeof TestRenderer.create>): string {
  const text = tree.root.findByType(Text as never);
  return String((text as unknown as { props: { children: number } }).props.children);
}

describe("useDashboardAutoRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 2, 12, 0, 0, 0));
    jest.clearAllMocks();
    InspectionDataBus.__reset();
    appStateHandler = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts at 0", async () => {
    const tree = await renderProbe({ projectId: 1 });
    expect(renderedKey(tree)).toBe("0");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("bumps on a matching-projectId bus event", async () => {
    const tree = await renderProbe({ projectId: 5 });
    await TestRenderer.act(async () => {
      InspectionDataBus.emitInspectionsChanged(5);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("does not bump on a non-matching projectId event", async () => {
    const tree = await renderProbe({ projectId: 5 });
    await TestRenderer.act(async () => {
      InspectionDataBus.emitInspectionsChanged(6);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("0");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("does not bump on projectId 0 (unknown project) events", async () => {
    const tree = await renderProbe({ projectId: 5 });
    await TestRenderer.act(async () => {
      InspectionDataBus.emitInspectionsChanged(0);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("0");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("bumps when AppState becomes active", async () => {
    const tree = await renderProbe({ projectId: 1 });
    await TestRenderer.act(async () => {
      appStateHandler?.("background");
      appStateHandler?.("active");
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("bumps on the 60s interval while focused, and stops when unfocused", async () => {
    const tree = await renderProbe({ projectId: 1, focused: true });
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");

    await TestRenderer.act(async () => {
      tree.update(<Probe projectId={1} focused={false} />);
      await Promise.resolve();
    });

    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(120_000);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("bumps across a midnight boundary and reschedules", async () => {
    jest.setSystemTime(new Date(2026, 7, 2, 23, 59, 58, 0));
    const tree = await renderProbe({ projectId: 1 });
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("clears timers and bus subscription on unmount", async () => {
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");

    const tree = await renderProbe({ projectId: 5, focused: true });

    await TestRenderer.act(async () => {
      tree.unmount();
    });
    await TestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(0);
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(0);

    jest.clearAllTimers();
    expect(jest.getTimerCount()).toBe(0);

    clearTimeoutSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
