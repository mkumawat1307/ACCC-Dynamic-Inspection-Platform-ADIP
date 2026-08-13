import React from "react";
import { Pressable, Text } from "react-native";
import TestRenderer from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useSectionCollapse from "@/src/hooks/useSectionCollapse";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockedGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockedSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

const LABEL = "Total Summary";

function Probe({ projectId }: { projectId: number }) {
  const { isCollapsed, toggle } = useSectionCollapse(projectId);
  return (
    <>
      <Text>{String(isCollapsed(LABEL))}</Text>
      <Pressable onPress={() => toggle(LABEL)} />
    </>
  );
}

async function renderProbe(projectId: number) {
  let tree!: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<Probe projectId={projectId} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

function collapsedText(tree: ReturnType<typeof TestRenderer.create>): string {
  const text = tree.root.findByType(Text as never);
  return String((text as unknown as { props: { children: string } }).props.children);
}

function findPressable(tree: ReturnType<typeof TestRenderer.create>): { props: { onPress: () => void } } {
  let found: unknown;
  tree.root.findAll((node) => {
    const props = node.props as { onPress?: () => void };
    if (props && typeof props.onPress === "function") found = node;
    return false;
  });
  expect(found).toBeDefined();
  return found as { props: { onPress: () => void } };
}

describe("useSectionCollapse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetItem.mockResolvedValue(null);
    mockedSetItem.mockResolvedValue(undefined);
  });

  it("defaults to expanded when nothing is stored", async () => {
    const tree = await renderProbe(1);
    expect(collapsedText(tree)).toBe("false");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("reads collapsed labels from storage", async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([LABEL]));
    const tree = await renderProbe(1);
    expect(collapsedText(tree)).toBe("true");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("treats corrupt storage as expanded", async () => {
    mockedGetItem.mockResolvedValue("{not json");
    const tree = await renderProbe(1);
    expect(collapsedText(tree)).toBe("false");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("uses a project-scoped storage key", async () => {
    await renderProbe(7);
    expect(mockedGetItem).toHaveBeenCalledWith("accc_dash_collapsed_7");
  });

  it("re-reads storage when projectId changes", async () => {
    const tree = await renderProbe(1);
    await TestRenderer.act(async () => {
      mockedGetItem.mockResolvedValue(JSON.stringify([LABEL]));
      tree.update(<Probe projectId={2} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedGetItem).toHaveBeenCalledWith("accc_dash_collapsed_2");
    expect(collapsedText(tree)).toBe("true");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("toggle collapses then expands and persists", async () => {
    const tree = await renderProbe(1);
    const pressable = findPressable(tree);

    await TestRenderer.act(async () => {
      pressable.props.onPress();
    });
    expect(collapsedText(tree)).toBe("true");
    expect(mockedSetItem).toHaveBeenCalledWith("accc_dash_collapsed_1", JSON.stringify([LABEL]));

    await TestRenderer.act(async () => {
      pressable.props.onPress();
    });
    expect(collapsedText(tree)).toBe("false");
    expect(mockedSetItem).toHaveBeenLastCalledWith("accc_dash_collapsed_1", JSON.stringify([]));
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("swallows storage write errors", async () => {
    mockedSetItem.mockRejectedValueOnce(new Error("boom"));
    const tree = await renderProbe(1);
    const pressable = findPressable(tree);
    await expect(
      TestRenderer.act(async () => {
        pressable.props.onPress();
      })
    ).resolves.toBeUndefined();
    await TestRenderer.act(async () => { tree.unmount(); });
  });
});
