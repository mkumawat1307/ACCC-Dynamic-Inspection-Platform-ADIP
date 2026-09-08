// frontend\src\__tests__\app\RootLayout.test.tsx
import React from "react";
import TestRenderer from "react-test-renderer";

const mockInitializeDatabase = jest.fn();
const mockGetInitError = jest.fn().mockReturnValue(null);
const mockEnsureRootFolder = jest.fn().mockResolvedValue(undefined);

jest.mock("@/src/database", () => ({
  get __esModule() {
    return true;
  },
  initializeDatabase: (...args: unknown[]) => mockInitializeDatabase(...args),
  getInitError: () => mockGetInitError(),
}));

jest.mock("@/src/utils/storageManager", () => ({
  get __esModule() {
    return true;
  },
  ensureRootFolder: () => mockEnsureRootFolder(),
}));

jest.mock("@/src/hooks/use-icon-fonts", () => ({
  get __esModule() {
    return true;
  },
  useIconFonts: () => [true, null],
}));

jest.mock("expo-splash-screen", () => {
  const mod: Record<string, unknown> = {
    preventAutoHideAsync: jest.fn(),
    hideAsync: jest.fn(),
  };
  return {
    get __esModule() {
      return true;
    },
    default: mod,
    ...mod,
  };
});

jest.mock("expo-system-ui", () => {
  const mod: Record<string, unknown> = {
    setBackgroundColorAsync: jest.fn(),
  };
  return {
    get __esModule() {
      return true;
    },
    default: mod,
    ...mod,
  };
});

jest.mock("expo-status-bar", () => {
  return {
    get __esModule() {
      return true;
    },
    StatusBar: () => null,
  };
});

jest.mock("react-native-paper", () => {
  const React = require("react");
  return {
    get __esModule() {
      return true;
    },
    PaperProvider: ({ children }: { children: React.ReactNode }) => children,
    Text: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("Text", props, children),
    Button: ({
      onPress,
      children,
      ...props
    }: {
      onPress?: () => void;
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement("Button", { ...props, onPress }, children),
  };
});

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  return {
    get __esModule() {
      return true;
    },
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    get __esModule() {
      return true;
    },
    Stack: () => React.createElement("View", { testID: "Stack" }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: () => {},
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  };
});

jest.mock("@/src/context/InspectionContext", () => ({
  get __esModule() {
    return true;
  },
  InspectionProvider: ({ children }: { children: React.ReactNode }) => children,
  useInspection: () => ({
    project: null,
    openProject: jest.fn(),
    closeProject: jest.fn(),
    isProjectOpen: false,
  }),
}));

jest.mock("@/src/context/PhotoStatesContext", () => ({
  get __esModule() {
    return true;
  },
  PhotoStatesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/context/WatermarkSettingsContext", () => ({
  get __esModule() {
    return true;
  },
  WatermarkSettingsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    disable: jest.fn(),
  },
}));

jest.mock("expo-file-system", () => {
  const mod: Record<string, unknown> = {
    documentDirectory: "file:///mock/documents/",
    cacheDirectory: "file:///mock/cache/",
    readDirectoryAsync: jest.fn().mockResolvedValue([]),
    makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
    deleteAsync: jest.fn().mockResolvedValue(undefined),
    readAsStringAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
    copyAsync: jest.fn(),
    moveAsync: jest.fn(),
    getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
    createDownloadResumable: jest.fn(),
  };
  return {
    get __esModule() {
      return true;
    },
    default: mod,
    ...mod,
    EncodingType: { Base64: "base64", UTF8: "utf8" },
  };
});

jest.mock("expo-sqlite", () => {
  const db = {
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue(null),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    execAsync: jest.fn().mockResolvedValue(null),
    closeAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(),
  };
  return {
    get __esModule() {
      return true;
    },
    default: {
      openDatabaseAsync: jest.fn().mockResolvedValue(db),
    },
    openDatabaseAsync: jest.fn().mockResolvedValue(db),
  };
});

describe("RootLayout error-path", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInitError.mockReturnValue(null);
    mockInitializeDatabase.mockResolvedValue(undefined);
  });

  type RendererTree = ReturnType<typeof TestRenderer.create>;

  function findAllByType(root: RendererTree["root"], type: string) {
    return root.findAll(
      (node) => (node as { type?: unknown }).type === type
    );
  }

  function textContents(root: RendererTree["root"]): string[] {
    return findAllByType(root, "Text")
      .map((node) => node.props?.children)
      .filter((c): c is string => typeof c === "string");
  }

  function hasStack(root: RendererTree["root"]): boolean {
    return findAllByType(root, "View").some(
      (n) => n.props?.testID === "Stack"
    );
  }

  it("shows an explicit error screen when initializeDatabase fails", async () => {
    mockInitializeDatabase.mockRejectedValueOnce(new Error("schema creation failed"));
    mockGetInitError.mockReturnValue("schema creation failed");

    const RootLayout = require("@/app/_layout").default;

    let renderer!: RendererTree;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(<RootLayout />);
    });

    const contents = textContents(renderer.root);
    expect(contents).toContain("Database Initialization Failed");
    expect(contents).toContain("schema creation failed");
    expect(findAllByType(renderer.root, "Button").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the app stack when init succeeds with zero projects (valid empty state)", async () => {
    mockInitializeDatabase.mockResolvedValue(undefined);

    const RootLayout = require("@/app/_layout").default;

    let renderer!: RendererTree;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(<RootLayout />);
    });

    expect(hasStack(renderer.root)).toBe(true);
    expect(textContents(renderer.root)).not.toContain("Database Initialization Failed");
  });

  it("retry re-runs initialization and clears the error on success", async () => {
    mockInitializeDatabase
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce(undefined);
    mockGetInitError
      .mockReturnValueOnce("transient failure")
      .mockReturnValueOnce(null);

    const RootLayout = require("@/app/_layout").default;

    let renderer!: RendererTree;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(<RootLayout />);
    });

    expect(textContents(renderer.root)).toContain("Database Initialization Failed");

    await TestRenderer.act(async () => {
      const button = findAllByType(renderer.root, "Button")[0];
      (button.props.onPress as () => void)();
    });

    await TestRenderer.act(async () => {
      expect(
        hasStack(renderer.root)
      ).toBe(true);
    });

    expect(mockInitializeDatabase).toHaveBeenCalledTimes(2);
  });
});
