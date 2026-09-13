const mockRouter = { back: jest.fn(), push: jest.fn() };
const mockParamsHolder: { current: Record<string, string | undefined> } = {
  current: { inspectionId: "42" },
};

const mockSettings = {
  dateFormat: "yyyy-MM-dd",
  timeFormat: "HH:mm:ss",
  showGpsAccuracy: true,
  showAddress: true,
};

const mockUseGpsTracker = jest.fn();
const captureGpsMock = jest.fn();
const mockUseAddressLookup = jest.fn();
const getAddressForMock = jest.fn();
const resolveAddressMock = jest.fn();
const mockSaveLocationAddress = jest.fn();
const mockEnqueueWatermark = jest.fn();
const mockClearWatermarkState = jest.fn();
const mockRetryWatermark = jest.fn();
const mockPhotoCreate = jest.fn();
const mockPhotoDelete = jest.fn();
const mockUsePhotoStates = jest.fn();
const mockUseInspection = jest.fn();
const mockUseWatermarkSettings = jest.fn();
const mockCameraApi = {
  takePictureAsync: jest.fn(),
  getAvailablePictureSizesAsync: jest.fn(),
};

jest.mock("expo-camera", () => {
  const React = require("react");
  const { View } = require("react-native");
  const CameraView = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => mockCameraApi);
    return React.createElement(View);
  });
  CameraView.displayName = "CameraView";
  return {
    get __esModule() {
      return true;
    },
    CameraView,
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true },
      jest.fn(async () => ({ status: "granted", granted: true })),
    ],
  };
});

jest.mock("expo-file-system", () =>
  jest.requireActual("../../../../__mocks__/expo-file-system")
);

jest.mock("expo-file-system/legacy", () => {
  const mock = jest.requireMock("expo-file-system");
  return mock;
});

jest.mock("expo-router", () => ({
  get __esModule() {
    return true;
  },
  useLocalSearchParams: () => mockParamsHolder.current,
  useRouter: () => mockRouter,
}));

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    get __esModule() {
      return true;
    },
    SafeAreaView: ({ children, ...rest }: any) =>
      React.createElement(View, rest, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock("react-native-paper", () => {
  const React = require("react");
  const { Pressable } = require("react-native");
  const actual = jest.requireActual("react-native-paper");
  const MockButton = (props: any) =>
    React.createElement(Pressable, {
      testID: props.testID ?? "capture-button",
      disabled: props.disabled,
      accessibilityState: { busy: props.loading, disabled: props.disabled },
      onPress: props.onPress,
    });
  const MockBackAction = (props: any) =>
    React.createElement(Pressable, {
      testID: "capture-back",
      onPress: props.onPress,
    });
  return {
    ...actual,
    Appbar: {
      ...actual.Appbar,
      BackAction: MockBackAction,
    },
    Button: MockButton,
  };
});

jest.mock("@/src/context/InspectionContext", () => ({
  get __esModule() {
    return true;
  },
  useInspection: () => mockUseInspection(),
}));

jest.mock("@/src/context/PhotoStatesContext", () => ({
  get __esModule() {
    return true;
  },
  usePhotoStates: () => mockUsePhotoStates(),
}));

jest.mock("@/src/context/WatermarkSettingsContext", () => ({
  get __esModule() {
    return true;
  },
  useWatermarkSettings: () => mockUseWatermarkSettings(),
}));

jest.mock("@/src/components/camera/useGpsTracker", () => ({
  get __esModule() {
    return true;
  },
  useGpsTracker: (...args: unknown[]) => mockUseGpsTracker(...args),
}));

jest.mock("@/src/components/camera/useAddressLookup", () => ({
  get __esModule() {
    return true;
  },
  useAddressLookup: (...args: unknown[]) => mockUseAddressLookup(...args),
}));

jest.mock("@/src/components/camera/saveLocationAddress", () => ({
  get __esModule() {
    return true;
  },
  saveLocationAddress: (...args: unknown[]) => mockSaveLocationAddress(...args),
}));

jest.mock("@/src/components/inspection/useWatermarkProcessor", () => ({
  get __esModule() {
    return true;
  },
  useWatermarkProcessor: () => ({
    webViewRef: { current: null },
    handleWebViewMessage: jest.fn(),
    handleWebViewLoadEnd: jest.fn(),
    handleRenderProcessGone: jest.fn(),
    enqueueWatermark: (...args: unknown[]) => mockEnqueueWatermark(...args),
    clearWatermarkState: (...args: unknown[]) => mockClearWatermarkState(...args),
    retryWatermark: (...args: unknown[]) => mockRetryWatermark(...args),
  }),
}));

jest.mock("@/src/components/camera/WatermarkOverlay", () => {
  const React = require("react");
  return {
    get __esModule() {
      return true;
    },
    default: () => React.createElement("View", null),
  };
});

jest.mock("@/src/components/camera/WatermarkMergeWebView", () => {
  const React = require("react");
  return {
    get __esModule() {
      return true;
    },
    default: () => React.createElement("View", null),
  };
});

jest.mock("@/src/database/repositories/PhotoRepository", () => ({
  get __esModule() {
    return true;
  },
  default: {
    create: (...args: unknown[]) => mockPhotoCreate(...args),
    delete: (...args: unknown[]) => mockPhotoDelete(...args),
    setProcessingStatus: jest.fn(),
    updateFinalPath: jest.fn(),
  },
}));

jest.mock("@/src/database/repositories/InspectionRepository", () => ({
  get __esModule() {
    return true;
  },
  InspectionRepository: {
    getInspectionValues: jest.fn().mockResolvedValue({}),
  },
}));

import React from "react";
import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import TestRenderer from "react-test-renderer";
import CaptureScreen from "@/app/inspection/capture";
import type { GpsFix } from "@/src/components/camera/useGpsTracker";

const CAPTURE_URI = "file:///mock/camera/capture.jpg";

function makeFix(
  latitude = 34.05,
  longitude = -118.25,
  accuracyM = 12
): GpsFix {
  return { latitude, longitude, accuracyM, timestamp: Date.now() };
}

function baseGps(overrides: Partial<ReturnType<typeof mockUseGpsTracker>> = {}) {
  return {
    status: "fixed",
    coords: { latitude: 34.05, longitude: -118.25 },
    accuracyM: 12,
    ageMs: 0,
    currentFix: null,
    refreshing: false,
    captureGps: captureGpsMock,
    refreshNow: jest.fn(),
    ...overrides,
  };
}

async function flushAsync(times = 30) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe("capture lifecycle", () => {
  let tree: ReturnType<typeof TestRenderer.create> | null = null;
  let alertButtons: { text: string; onPress?: () => void | Promise<void> }[] = [];
  let alertSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    alertButtons = [];
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(
      (_title: string, _message?: string, buttons?: unknown[]) => {
        alertButtons = (buttons ?? []) as typeof alertButtons;
      }
    );
    mockUseInspection.mockReturnValue({
      project: { DistrictName: "Test District", DBPath: "file:///mock/project.db" },
      poleId: null,
    });
    mockUsePhotoStates.mockReturnValue({ photoStates: {}, setPhotoStates: jest.fn() });
    mockUseWatermarkSettings.mockReturnValue({ settings: mockSettings });
    mockUseGpsTracker.mockReturnValue(baseGps());
    clearAddressLookupMocks();
    captureGpsMock.mockResolvedValue(makeFix());
    mockPhotoCreate.mockResolvedValue(7);
    mockPhotoDelete.mockResolvedValue(undefined);
    mockSaveLocationAddress.mockResolvedValue(undefined);
    mockCameraApi.takePictureAsync.mockImplementation(async () => ({
      uri: CAPTURE_URI,
      width: 1080,
      height: 1920,
    }));
    mockCameraApi.getAvailablePictureSizesAsync.mockResolvedValue([
      "4000x3000",
      "1920x1080",
      "1280x720",
    ]);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (tree) {
      await TestRenderer.act(async () => {
        tree!.unmount();
        tree = null;
      });
    }
    jest.restoreAllMocks();
  });

  function clearAddressLookupMocks() {
    getAddressForMock.mockReturnValue(null);
    resolveAddressMock.mockResolvedValue(null);
    mockUseAddressLookup.mockReturnValue({
      lines: [],
      fullAddress: "",
      getAddressFor: getAddressForMock,
      resolveAddress: resolveAddressMock,
    });
  }

  async function renderScreen() {
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CaptureScreen />);
      await flushAsync();
    });
    return tree!;
  }

  function pressCapture() {
    const btn = tree!.root.find((n) => n.props.testID === "capture-button");
    (btn.props.onPress as () => void)();
  }

  function pressBack() {
    const back = tree!.root.find((n) => n.props.testID === "capture-back");
    (back.props.onPress as () => void)();
  }

  function captureButtonProps() {
    return tree!.root.find((n) => n.props.testID === "capture-button").props;
  }

  function hasText(text: string): boolean {
    return tree!.root
      .findAll((n) => typeof n.props?.children === "string")
      .some((n) => typeof n.props.children === "string" && n.props.children.includes(text));
  }

  it("writes the captured GPS snapshot and its address into the photo and watermark", async () => {
    mockUseGpsTracker.mockReturnValue(
      baseGps({
        status: "fixed",
        coords: { latitude: 99, longitude: -77 },
      })
    );
    getAddressForMock.mockReturnValue({
      latitude: 34.05,
      longitude: -118.25,
      lines: ["123 Main St"],
      fullAddress: "123 Main St",
    });
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });

    expect(captureGpsMock).toHaveBeenCalledTimes(1);
    expect(mockCameraApi.takePictureAsync).toHaveBeenCalledWith({
      quality: 0.8,
      skipProcessing: false,
    });
    expect(mockPhotoCreate).toHaveBeenCalledTimes(1);
    const photo = mockPhotoCreate.mock.calls[0][0];
    expect(photo.InspectionID).toBe(42);
    expect(photo.PhotoType).toBe("Pole");
    expect(photo.Latitude).toBe(34.05);
    expect(photo.Longitude).toBe(-118.25);
    expect(photo.FilePath).toBe(CAPTURE_URI);
    expect(Number.isNaN(Date.parse(photo.CapturedAt))).toBe(false);

    expect(getAddressForMock).toHaveBeenCalledWith(34.05, -118.25);
    expect(resolveAddressMock).not.toHaveBeenCalled();
    expect(mockSaveLocationAddress).toHaveBeenCalledWith(42, "123 Main St");

    expect(mockEnqueueWatermark).toHaveBeenCalledTimes(1);
    const lines = mockEnqueueWatermark.mock.calls[0][3] as string[];
    const joined = lines.join("\n");
    expect(joined).toContain("34.050000");
    expect(joined).toContain("118.250000W");
    expect(joined).toContain("123 Main St");
    expect(photo.Latitude).not.toBe(99);
  });

  it("stills writes a stale-but-present fix to the photo", async () => {
    mockUseGpsTracker.mockReturnValue(
      baseGps({ status: "stale", accuracyM: 30 })
    );
    captureGpsMock.mockResolvedValue(makeFix(34.05, -118.25, 30));
    getAddressForMock.mockReturnValue({
      latitude: 34.05,
      longitude: -118.25,
      lines: [],
      fullAddress: "",
    });
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });

    expect(mockPhotoCreate).toHaveBeenCalledTimes(1);
    const photo = mockPhotoCreate.mock.calls[0][0];
    expect(photo.Latitude).toBe(34.05);
    expect(photo.Longitude).toBe(-118.25);
    expect(hasText("Stale GPS")).toBe(true);
  });

  it("resolves the address asynchronously on a cache miss and saves it", async () => {
    getAddressForMock.mockReturnValue(null);
    resolveAddressMock.mockResolvedValue("456 Other St");
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });

    expect(getAddressForMock).toHaveBeenCalledWith(34.05, -118.25);
    expect(resolveAddressMock).toHaveBeenCalledWith(34.05, -118.25);
    expect(mockSaveLocationAddress).toHaveBeenCalledWith(42, "456 Other St");
  });

  it("never saves a late-resolved address after the screen has been left", async () => {
    getAddressForMock.mockReturnValue(null);
    let resolveAddress!: (v: string) => void;
    resolveAddressMock.mockImplementation(
      () => new Promise((res) => { resolveAddress = res; })
    );
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });
    expect(mockSaveLocationAddress).not.toHaveBeenCalled();

    pressBack();
    await TestRenderer.act(async () => {
      await flushAsync();
    });
    const leave = alertButtons.find((b) => b.text === "Discard & Leave");
    expect(leave).toBeDefined();
    await TestRenderer.act(async () => {
      await leave!.onPress!();
      await flushAsync();
    });

    await TestRenderer.act(async () => {
      resolveAddress("456 Other St");
      await flushAsync();
    });

    expect(mockSaveLocationAddress).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("disables capture while GPS has not settled", async () => {
    mockUseGpsTracker.mockReturnValue(
      baseGps({ status: "acquiring", coords: null, accuracyM: null })
    );
    await renderScreen();

    expect(captureButtonProps().disabled).toBe(true);
    captureGpsMock.mockClear();
  });

  it("shows an acquisition alert and captures nothing when no fix can be obtained", async () => {
    captureGpsMock.mockResolvedValue(null);
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });

    expect(alertButtons.some((b) => b.text === "Wait")).toBe(true);
    expect(mockCameraApi.takePictureAsync).not.toHaveBeenCalled();
    expect(mockPhotoCreate).not.toHaveBeenCalled();
  });

  it("aborts before the photo is taken when leaving mid-GPS", async () => {
    let resolveCaptureGps!: (v: GpsFix | null) => void;
    captureGpsMock.mockImplementation(
      () => new Promise((res) => { resolveCaptureGps = res; })
    );
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });
    expect(captureGpsMock).toHaveBeenCalledTimes(1);

    await TestRenderer.act(async () => {
      pressBack();
      await flushAsync();
    });
    expect(mockRouter.back).toHaveBeenCalled();

    await TestRenderer.act(async () => {
      resolveCaptureGps(makeFix());
      await flushAsync();
    });

    expect(mockCameraApi.takePictureAsync).not.toHaveBeenCalled();
    expect(mockPhotoCreate).not.toHaveBeenCalled();
    expect(mockSaveLocationAddress).not.toHaveBeenCalled();
    expect(hasText("Merging watermark…")).toBe(false);
  });

  it("deletes the temp photo when leaving mid-capture", async () => {
    let resolveTake!: (v: { uri: string; width: number; height: number }) => void;
    mockCameraApi.takePictureAsync.mockImplementation(
      () => new Promise((res) => { resolveTake = res; })
    );
    const deleteSpy = jest.spyOn(FileSystem, "deleteAsync");
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });
    expect(captureGpsMock).toHaveBeenCalledTimes(1);
    expect(mockCameraApi.takePictureAsync).toHaveBeenCalled();

    await TestRenderer.act(async () => {
      pressBack();
      await flushAsync();
    });

    await TestRenderer.act(async () => {
      resolveTake({ uri: CAPTURE_URI, width: 1080, height: 1920 });
      await flushAsync();
    });

    expect(deleteSpy).toHaveBeenCalledWith(
      CAPTURE_URI,
      expect.objectContaining({ idempotent: true })
    );
    expect(mockPhotoCreate).not.toHaveBeenCalled();
    expect(mockSaveLocationAddress).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("deletes the photo row and temp file when leaving mid-DB-insert", async () => {
    let resolveCreate!: (v: number) => void;
    mockPhotoCreate.mockImplementation(
      () => new Promise((res) => { resolveCreate = res; })
    );
    const deleteSpy = jest.spyOn(FileSystem, "deleteAsync");
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });
    expect(mockPhotoCreate).toHaveBeenCalled();

    await TestRenderer.act(async () => {
      pressBack();
      await flushAsync();
    });
    expect(hasText("Merging watermark…")).toBe(false);

    await TestRenderer.act(async () => {
      resolveCreate(7);
      await flushAsync();
    });

    expect(mockPhotoDelete).toHaveBeenCalledWith(7);
    expect(deleteSpy).toHaveBeenCalledWith(
      CAPTURE_URI,
      expect.objectContaining({ idempotent: true })
    );
    expect(mockEnqueueWatermark).not.toHaveBeenCalled();
    expect(mockSaveLocationAddress).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("discard-and-leave during merging cleans up the pending photo", async () => {
    getAddressForMock.mockReturnValue({
      latitude: 34.05,
      longitude: -118.25,
      lines: ["123 Main St"],
      fullAddress: "123 Main St",
    });
    const deleteSpy = jest.spyOn(FileSystem, "deleteAsync");
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });
    expect(hasText("Merging watermark…")).toBe(true);
    expect(mockEnqueueWatermark).toHaveBeenCalled();

    pressBack();
    await TestRenderer.act(async () => {
      await flushAsync();
    });
    const leave = alertButtons.find((b) => b.text === "Discard & Leave");
    expect(leave).toBeDefined();
    await TestRenderer.act(async () => {
      await leave!.onPress!();
      await flushAsync();
    });

    expect(deleteSpy).toHaveBeenCalledWith(
      CAPTURE_URI,
      expect.objectContaining({ idempotent: true })
    );
    expect(mockPhotoDelete).toHaveBeenCalledWith(7);
    expect(mockClearWatermarkState).toHaveBeenCalledWith(7);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("keep-processing during merging stays on the screen", async () => {
    getAddressForMock.mockReturnValue({
      latitude: 34.05,
      longitude: -118.25,
      lines: [],
      fullAddress: "",
    });
    await renderScreen();

    await TestRenderer.act(async () => {
      pressCapture();
      await flushAsync();
    });
    expect(hasText("Merging watermark…")).toBe(true);

    pressBack();
    await TestRenderer.act(async () => {
      await flushAsync();
    });
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(hasText("Merging watermark…")).toBe(true);
  });
});