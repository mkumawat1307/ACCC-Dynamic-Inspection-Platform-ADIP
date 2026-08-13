jest.mock("@/src/database/helpers/ProjectDBManager");
jest.mock("@/src/database/db");
jest.mock("@/src/database/repositories/PhotoRepository", () => ({
  __esModule: true,
  default: { updateFilePath: jest.fn() },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));
jest.mock("@/src/utils/storageManager", () => ({
  writePhoto: jest.fn(),
  getProjectDir: jest.fn(),
}));
jest.mock("react-native-webview", () => {
  const RN = require("react-native");
  return { WebView: () => RN.View };
});
jest.mock("@/src/native/WatermarkEncoder", () => ({
  hasNativeWatermarkEncoder: jest.fn(() => false),
  hasNativeOverlayEncoder: jest.fn(() => false),
  encodeWatermarkJpeg: jest.fn(),
  encodeWatermarkOverlay: jest.fn(),
}));

import React from "react";
import TestRenderer from "react-test-renderer";
import { Image } from "react-native";
import { InspectionProvider } from "@/src/context/InspectionContext";
import { PhotoStatesProvider, usePhotoStates } from "@/src/context/PhotoStatesContext";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import { WatermarkState } from "@/src/components/inspection/photoUtils";
import { Project } from "@/src/models/Project";
import { writePhoto, getProjectDir } from "@/src/utils/storageManager";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import * as FileSystem from "expo-file-system/legacy";
import { WebView } from "react-native-webview";
import { buildRenderWatermarkScript } from "@/src/utils/watermarkHtml";
import {
  hasNativeWatermarkEncoder,
  hasNativeOverlayEncoder,
  encodeWatermarkJpeg,
  encodeWatermarkOverlay,
} from "@/src/native/WatermarkEncoder";

const project = {
  ProjectID: 1,
  ProjectName: "Project Alpha",
  DistrictName: "New Delhi",
  DBPath: "/mock/db.db",
  SAFPath: null,
} as unknown as Project;

function renderHook<T>(hookFn: () => T) {
  const result: { current: T } = { current: undefined as unknown as T };
  let tree!: ReturnType<typeof TestRenderer.create>;
  function Probe() {
    result.current = hookFn();
    return null;
  }
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <PhotoStatesProvider>
        <InspectionProvider>
          <Probe />
        </InspectionProvider>
      </PhotoStatesProvider>
    );
  });
  return {
    result,
    unmount: () => TestRenderer.act(() => tree.unmount()),
  };
}

function renderHookWithStates<T>(
  hookFn: () => T,
  states: Record<number, WatermarkState>
) {
  const result: { current: T } = { current: undefined as unknown as T };
  let tree!: ReturnType<typeof TestRenderer.create>;
  function Seed() {
    const { setPhotoStates } = usePhotoStates();
    React.useEffect(() => {
      setPhotoStates(states);
    }, [states, setPhotoStates]);
    return null;
  }
  function Probe() {
    result.current = hookFn();
    return null;
  }
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <PhotoStatesProvider>
        <InspectionProvider>
          <Seed />
          <Probe />
        </InspectionProvider>
      </PhotoStatesProvider>
    );
  });
  return {
    result,
    unmount: () => TestRenderer.act(() => tree.unmount()),
  };
}

describe("useWatermarkProcessor folder target", () => {
  it("writes watermarked photos into the canonical <District>_<ProjectName> download folder", async () => {
    const projectDir = "New Delhi_Project Alpha";
    const fileUri = "content://media/Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/photo.jpg";

    (getProjectDir as jest.Mock).mockResolvedValue(projectDir);
    (writePhoto as jest.Mock).mockResolvedValue(fileUri);
    (PhotoRepository.updateFilePath as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("BASE64DATA");

    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated })
    );

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, base64: "BASE64DATA" }) },
      });
    });

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(getProjectDir).toHaveBeenCalledWith("New Delhi_Project Alpha");
    expect(writePhoto).toHaveBeenCalledWith(projectDir, "photo.jpg", "BASE64DATA");
    expect(PhotoRepository.updateFilePath).toHaveBeenCalledWith(1, fileUri);
    expect(onPhotosUpdated).toHaveBeenCalled();

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    unmount();
  });
});

describe("useWatermarkProcessor persistent renderer protocol", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("waits for webview __ready before sending a photo via injectJavaScript", async () => {
    jest.useFakeTimers();
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("BASE64DATA");
    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    await TestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(injectJavaScript).not.toHaveBeenCalled();

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(injectJavaScript).toHaveBeenCalledTimes(1);
    const script = injectJavaScript.mock.calls[0][0] as string;
    expect(script).toBe(buildRenderWatermarkScript(1, "BASE64DATA", ["line"]));
    expect(script).toContain("window.renderWatermarkFromJson(");
    expect(script).toContain('"base64":"BASE64DATA"');
    expect(script).toMatch(/true;$/);

    await TestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    unmount();
  });

  it("sets webViewReady when the __ready signal arrives", () => {
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    expect(result.current.webViewReady).toBe(false);
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    expect(result.current.webViewReady).toBe(true);
    unmount();
  });

  it("logs the renderer diag payload with toBlob/FileReader split timings", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("BASE64DATA");
    (writePhoto as jest.Mock).mockResolvedValue("content://tree/root/p.jpg");
    (PhotoRepository.updateFilePath as jest.Mock).mockResolvedValue(undefined);

    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({
            photoId: 1,
            base64: "BASE64DATA",
            diag: {
              instance: "i-abc123",
              created: 1700000000000,
              capture: 3,
              jobs: 1,
              uptimeMs: 4380,
              toBlobAtMs: 180,
              cbAtMs: 4380,
              imgWasResident: true,
              imgW: 4000,
              imgH: 3000,
              cvPrevW: 4000,
              cvPrevH: 3000,
              cvW: 4000,
              cvH: 3000,
              canvasReset: false,
              blobSize: 1234567,
              b64Len: 1646093,
              quality: 0.95,
              toBlobStart: 180,
              toBlobCb: 4380,
              frStart: 4381,
              frEnd: 4383,
              toBlobMs: 4200,
              frMs: 2,
              heapBefore: 251658240,
              heapAfter: 255852544,
              heapUsed: 255852544,
              heapLimit: 402653184,
              gcEvents: 1,
              gcMs: 37,
            },
          }),
        },
      });
    });

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });

    const lines = logSpy.mock.calls.map(args => args.join(" "));
    const diagLine = lines.find(l => l.includes("[Watermark:diag]"));
    expect(diagLine).toBeDefined();
    expect(diagLine).toContain("photo=1 instance=i-abc123 capture=3 jobs=1");
    expect(diagLine).toContain("uptime=4380ms toBlobAt=180ms cbAt=4380ms");
    expect(diagLine).toContain("img=4000x3000 resident=true");
    expect(diagLine).toContain("cv=4000x3000->4000x3000 reset=false");
    expect(diagLine).toContain("blob=1234567b b64=1646093 q=0.95");
    expect(diagLine).toContain("toBlob=4200ms fr=2ms");
    expect(diagLine).toContain("heap=251658240->255852544/402653184 gc=1/37ms");

    logSpy.mockRestore();
    unmount();
  });
});

describe("useWatermarkProcessor native encoder path", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("injects the native encode flag when the native module is present", async () => {
    jest.useFakeTimers();
    (hasNativeWatermarkEncoder as jest.Mock).mockReturnValue(true);
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("BASE64DATA");
    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"], undefined, "rgba");
    });
    await TestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(injectJavaScript).toHaveBeenCalledTimes(1);
    const script = injectJavaScript.mock.calls[0][0] as string;
    expect(script).toContain('"nativeEncode":true');

    await TestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    unmount();
  });

  it("encodes via the native module and saves the JPEG to the Downloads folder", async () => {
    (hasNativeWatermarkEncoder as jest.Mock).mockReturnValue(true);
    (encodeWatermarkJpeg as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.readAsStringAsync as jest.Mock).mockImplementation((path: string) =>
      Promise.resolve(path.endsWith(".wm.jpg") ? "WM_BASE64" : "BASE64DATA")
    );
    const projectDir = "New Delhi_Project Alpha";
    const fileUri = "content://media/Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/photo.jpg";
    (getProjectDir as jest.Mock).mockResolvedValue(projectDir);
    (writePhoto as jest.Mock).mockResolvedValue(fileUri);
    (PhotoRepository.updateFilePath as jest.Mock).mockResolvedValue(undefined);

    const onPhotosUpdated = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated })
    );

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"], undefined, "rgba");
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({
            photoId: 1,
            width: 4000,
            height: 3000,
            rgba: "RGBA_B64",
            perf: { decode: 10, draw: 80, encode: 700, total: 900 },
            diag: {
              instance: "i-abc123",
              capture: 1,
              jobs: 1,
              getDataMs: 120,
              b64Ms: 380,
              rgbaLen: 64000000,
              quality: 0.95,
              native: true,
            },
          }),
        },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });

    expect(encodeWatermarkJpeg).toHaveBeenCalledWith(
      4000, 3000, "RGBA_B64", 95, "file:///tmp/t.jpg.wm.jpg"
    );
    expect(writePhoto).toHaveBeenCalledWith(projectDir, "photo.jpg", "WM_BASE64");
    expect(PhotoRepository.updateFilePath).toHaveBeenCalledWith(1, fileUri);
    expect(onPhotosUpdated).toHaveBeenCalled();

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    unmount();
  });

  it("falls back to the toBlob path when the native module is absent", async () => {
    (hasNativeWatermarkEncoder as jest.Mock).mockReturnValue(false);
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("BASE64DATA");
    const projectDir = "New Delhi_Project Alpha";
    const fileUri = "content://media/Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/photo.jpg";
    (getProjectDir as jest.Mock).mockResolvedValue(projectDir);
    (writePhoto as jest.Mock).mockResolvedValue(fileUri);
    (PhotoRepository.updateFilePath as jest.Mock).mockResolvedValue(undefined);

    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(injectJavaScript).toHaveBeenCalledTimes(1);
    expect(injectJavaScript.mock.calls[0][0]).not.toContain("nativeEncode");

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, base64: "BASE64DATA" }) },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });

    expect(encodeWatermarkJpeg).not.toHaveBeenCalled();
    expect(writePhoto).toHaveBeenCalledWith(projectDir, "photo.jpg", "BASE64DATA");

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    unmount();
  });

  it("retries via toBlob when native encoding fails", async () => {
    (hasNativeWatermarkEncoder as jest.Mock).mockReturnValue(true);
    (encodeWatermarkJpeg as jest.Mock).mockRejectedValue(new Error("E_ENCODE_FAILED"));
    (FileSystem.readAsStringAsync as jest.Mock).mockImplementation((path: string) =>
      Promise.resolve(path.endsWith(".wm.jpg") ? "WM_BASE64" : "BASE64DATA")
    );
    const projectDir = "New Delhi_Project Alpha";
    const fileUri = "content://media/Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/photo.jpg";
    (getProjectDir as jest.Mock).mockResolvedValue(projectDir);
    (writePhoto as jest.Mock).mockResolvedValue(fileUri);
    (PhotoRepository.updateFilePath as jest.Mock).mockResolvedValue(undefined);

    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"], undefined, "rgba");
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(injectJavaScript).toHaveBeenCalledTimes(1);
    expect(injectJavaScript.mock.calls[0][0]).toContain("nativeEncode");

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({
            photoId: 1,
            width: 4000,
            height: 3000,
            rgba: "RGBA_B64",
          }),
        },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });

    expect(encodeWatermarkJpeg).toHaveBeenCalledTimes(1);
    expect(injectJavaScript.mock.calls.length).toBeGreaterThanOrEqual(2);
    const retryScript = injectJavaScript.mock.calls[1][0] as string;
    expect(retryScript).not.toContain("nativeEncode");

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    unmount();
  });
});

describe("useWatermarkProcessor overlay encoder stage", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function mockOverlayHappyPath() {
    (hasNativeWatermarkEncoder as jest.Mock).mockReturnValue(true);
    (hasNativeOverlayEncoder as jest.Mock).mockReturnValue(true);
    (encodeWatermarkOverlay as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(Image, "getSize").mockImplementation((_url: string, ok) => {
      (ok as (w: number, h: number) => void)(4000, 3000);
    });
    (FileSystem.readAsStringAsync as jest.Mock).mockImplementation((path: string) =>
      Promise.resolve(path.endsWith(".wm.jpg") ? "WM_BASE64" : "BASE64DATA")
    );
  }

  function mockSaveChain() {
    (getProjectDir as jest.Mock).mockResolvedValue("New Delhi_Project Alpha");
    (writePhoto as jest.Mock).mockResolvedValue(
      "content://media/Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/photo.jpg"
    );
    (PhotoRepository.updateFilePath as jest.Mock).mockResolvedValue(undefined);
  }

  it("measures text, renders the overlay PNG, and composites via the native overlay encoder", async () => {
mockOverlayHappyPath();
    mockSaveChain();
    const injectJavaScript = jest.fn();
    const onPhotosUpdated = jest.fn();
    const { result } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    // Now the real job's measure phase
    expect((Image.getSize as unknown as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    // Find the first call that's the real measure (not warmup, since warmup is disabled in tests)
    const realMeasureCall = injectJavaScript.mock.calls.find(
      (c) => !(c[0] as string).includes('"photoId":-1')
    );
    expect(realMeasureCall).toBeDefined();
    const measureScript = realMeasureCall![0] as string;
    expect(measureScript).toContain('"measure":true');
    expect(measureScript).toContain('"fontSize":');
    expect(measureScript).toContain('"lines":["line"]');

    // Measured text width returns from the renderer → render overlay with layout geometry.
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({ photoId: 1, maxTextWidth: 300 }),
        },
      });
    });
    expect(injectJavaScript).toHaveBeenCalledTimes(2);
    const overlayScript = injectJavaScript.mock.calls[1][0] as string;
    expect(overlayScript).toContain("window.renderWatermarkFromJson(");
    expect(overlayScript).toContain('"layout"');
    expect(overlayScript).toContain('"boxX":');
    expect(overlayScript).toContain('"overX":');
    expect(overlayScript).toMatch(/true;$/);

    // Overlay PNG arrives → composite and save.
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({
            photoId: 1,
            overlay: "PNG_B64",
            overlayX: 88,
            overlayY: 1843,
            overlayWidth: 550,
            overlayHeight: 1036,
          }),
        },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    expect(encodeWatermarkOverlay).toHaveBeenCalledWith(
      "file:///tmp/t.jpg",
      "PNG_B64",
      88,
      1843,
      95,
      "file:///tmp/t.jpg.wm.jpg"
    );
    expect(writePhoto).toHaveBeenCalledWith(
      "New Delhi_Project Alpha",
      "photo.jpg",
      "WM_BASE64"
    );
    expect(PhotoRepository.updateFilePath).toHaveBeenCalledWith(
      1,
      "content://media/Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/photo.jpg"
    );
    expect(onPhotosUpdated).toHaveBeenCalled();

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
  });

  it("logs a compact [Save] line with native stage and SAF/DB split timings", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    mockOverlayHappyPath();
    (encodeWatermarkOverlay as jest.Mock).mockResolvedValue({
      decodeOriginalMs: 220.5,
      decodeOverlayMs: 8.2,
      compositeMs: 12.4,
      jpegEncodeMs: 410.1,
    });
    mockSaveChain();
    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, maxTextWidth: 300 }) },
      });
    });

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({
            photoId: 1,
            overlay: "PNG_B64",
            overlayX: 88,
            overlayY: 1843,
            overlayWidth: 550,
            overlayHeight: 1036,
          }),
        },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });

    const lines = logSpy.mock.calls.map(args => args.join(" "));
    const saveLine = lines.find(l => l.includes("[Save]"));
    expect(saveLine).toBeDefined();
    const line = saveLine as string;
    expect(line).toContain("decode=220.5");
    expect(line).toContain("overlay=8.2");
    expect(line).toContain("composite=12.4");
    expect(line).toContain("encode=410.1");
    expect(line).toMatch(/read=\d+\.\d/);
    expect(line).toMatch(/saf=\d+\.\d/);
    expect(line).toMatch(/db=\d+\.\d/);
    expect(line).toMatch(/total=\d+\.\d/);

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    logSpy.mockRestore();
    unmount();
  });

  it("logs [Watermark:overlay] success with total render-to-save duration", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    mockOverlayHappyPath();
    mockSaveChain();
    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, maxTextWidth: 300 }) },
      });
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({
            photoId: 1,
            overlay: "PNG_B64",
            overlayX: 88,
            overlayY: 1843,
            overlayWidth: 550,
            overlayHeight: 1036,
          }),
        },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });

    const lines = logSpy.mock.calls.map(args => args.join(" "));
    const overlayLine = lines.find(l => l.includes("[Watermark:overlay] photo=1 success totalMs="));
    expect(overlayLine).toBeDefined();
    expect(overlayLine).toMatch(/totalMs=\d+\.\d/);

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    logSpy.mockRestore();
    unmount();
  });

  it("logs overlay composite diagnostics from the native build (position, size, alpha, applied)", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    mockOverlayHappyPath();
    mockSaveChain();
    // Debug native build returns composite diagnostics alongside per-stage timings.
    (encodeWatermarkOverlay as jest.Mock).mockResolvedValue({
      decodeOriginalMs: 220.5,
      decodeOverlayMs: 8.2,
      compositeMs: 12.4,
      jpegEncodeMs: 410.1,
      sourceWidth: 4000,
      sourceHeight: 3000,
      drawX: 88,
      drawY: 1843,
      overlayWidth: 550,
      overlayHeight: 1036,
      overlayAlphaNonZero: true,
      compositeApplied: true,
    });
    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, maxTextWidth: 300 }) },
      });
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({
            photoId: 1,
            overlay: "PNG_B64",
            overlayX: 88,
            overlayY: 1843,
            overlayWidth: 550,
            overlayHeight: 1036,
          }),
        },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });

    const lines = logSpy.mock.calls.map(args => args.join(" "));
    const overlayLines = lines.filter(l => l.includes("[Watermark:overlay] photo=1 "));
    const positionLine = overlayLines.find(l => l.includes("position=x="));
    expect(positionLine).toBeDefined();
    expect(positionLine as string).toContain("x=88,y=1843");
    expect(positionLine as string).toContain("size=550x1036");
    expect(positionLine as string).toContain("src=4000x3000");
    const appliedLine = overlayLines.find(l => l.includes("alphaNonZero="));
    expect(appliedLine).toBeDefined();
    expect(appliedLine as string).toContain("alphaNonZero=true compositeApplied=true");

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    logSpy.mockRestore();
    unmount();
  });

  it("logs overlay composite diagnostics when the native build reports a no-op composite", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    mockOverlayHappyPath();
    mockSaveChain();
    // A fully-transparent overlay produces alphaNonZero=false and compositeApplied=false.
    (encodeWatermarkOverlay as jest.Mock).mockResolvedValue({
      decodeOriginalMs: 205.1,
      decodeOverlayMs: 7.0,
      compositeMs: 10.9,
      jpegEncodeMs: 402.3,
      sourceWidth: 4000,
      sourceHeight: 3000,
      drawX: 88,
      drawY: 1843,
      overlayWidth: 550,
      overlayHeight: 1036,
      overlayAlphaNonZero: false,
      compositeApplied: false,
    });
    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, maxTextWidth: 300 }) },
      });
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({
            photoId: 1,
            overlay: "PNG_B64",
            overlayX: 88,
            overlayY: 1843,
            overlayWidth: 550,
            overlayHeight: 1036,
          }),
        },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });

    const lines = logSpy.mock.calls.map(args => args.join(" "));
    const appliedLine = lines.find(l => l.includes("[Watermark:overlay] photo=1 alphaNonZero="));
    expect(appliedLine).toBeDefined();
    expect(appliedLine as string).toContain("alphaNonZero=false compositeApplied=false");

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    logSpy.mockRestore();
    unmount();
  });

  it("falls back directly to toBlob when the overlay composite is unavailable or errors", async () => {
    mockOverlayHappyPath();
    // hasNativeOverlayEncoder returns true but the composite rejects like a missing native overlay.
    (encodeWatermarkOverlay as jest.Mock).mockRejectedValue(
      new Error("overlay composite is not available")
    );
    mockSaveChain();
    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.enqueueWatermark(1, "file:///tmp/t.jpg", "photo.jpg", ["line"]);
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    // Measure → render overlay.
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ photoId: 1, maxTextWidth: 300 }) },
      });
    });
    // Composite fails → scheduleStage(toblob) directly, no RGBA transfer.
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({
            photoId: 1,
            overlay: "PNG_B64",
            overlayX: 88,
            overlayY: 1843,
            overlayWidth: 550,
            overlayHeight: 1036,
          }),
        },
      });
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });

    expect(encodeWatermarkOverlay).toHaveBeenCalledTimes(1);
    expect(encodeWatermarkJpeg).not.toHaveBeenCalled();
    expect(injectJavaScript.mock.calls.length).toBeGreaterThanOrEqual(3);
    const retryScript = injectJavaScript.mock.calls[injectJavaScript.mock.calls.length - 1][0] as string;
    expect(retryScript).toContain("window.renderWatermarkFromJson(");
    expect(retryScript).not.toContain('"nativeEncode":true');

    await TestRenderer.act(async () => {
      await new Promise(r => setTimeout(r, 150));
    });
    unmount();
  });
});

describe("useWatermarkProcessor renderer lifecycle diagnostics", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("counts WebView loads and logs each onLoadEnd", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    TestRenderer.act(() => {
      result.current.handleWebViewLoadEnd();
    });
    TestRenderer.act(() => {
      result.current.handleWebViewLoadEnd();
    });
    const lines = logSpy.mock.calls.map(args => args.join(" "));
    expect(lines.filter(l => l.includes("[Watermark:lifecycle] onLoadEnd count=1"))).toHaveLength(1);
    expect(lines.filter(l => l.includes("[Watermark:lifecycle] onLoadEnd count=2"))).toHaveLength(1);
    logSpy.mockRestore();
    unmount();
  });

  it("logs renderer teardown announcements from the page", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: {
          data: JSON.stringify({ __unload: true, instance: "i-def456", created: 1700000000000, uptime: 5123 }),
        },
      });
    });
    const lines = logSpy.mock.calls.map(args => args.join(" "));
    expect(lines.find(l => l.includes("[Watermark:lifecycle] renderer unloaded instance=i-def456"))).toBeDefined();
    expect(lines.find(l => l.includes("uptime=5123ms"))).toBeDefined();
    logSpy.mockRestore();
    unmount();
  });

  it("detects when a new renderer instance re-registers ready", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    const ready = (instance: string, created: number) =>
      JSON.stringify({ __ready: true, instance, created });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({ nativeEvent: { data: ready("i-one", 100) } });
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({ nativeEvent: { data: ready("i-one", 100) } });
    });
    TestRenderer.act(() => {
      result.current.handleWebViewMessage({ nativeEvent: { data: ready("i-two", 200) } });
    });
    const lines = logSpy.mock.calls.map(args => args.join(" "));
    const readyLines = lines.filter(l => l.includes("[Watermark:lifecycle] renderer ready"));
    expect(readyLines).toHaveLength(3);
    expect(readyLines[0]).toContain("instance=i-one created=100 readyCount=1 loadCount=0 recreated=false");
    expect(readyLines[1]).toContain("instance=i-one created=100 readyCount=2 loadCount=0 recreated=false");
    expect(readyLines[2]).toContain("instance=i-two created=200 readyCount=3 loadCount=0 recreated=true");
    expect(result.current.webViewReady).toBe(true);
    logSpy.mockRestore();
    unmount();
  });

  it("logs when the Android WebView render process dies", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    TestRenderer.act(() => {
      result.current.handleRenderProcessGone({
        nativeEvent: { didCrash: true, reason: "crashed" },
      });
    });
    const lines = logSpy.mock.calls.map(args => args.join(" "));
    const goneLine = lines.find(l => l.includes("[Watermark:lifecycle] render process gone"));
    expect(goneLine).toBeDefined();
    expect(goneLine).toContain("didCrash=true reason=crashed");
    logSpy.mockRestore();
    unmount();
  });
});

describe("useWatermarkProcessor remount safety", () => {
  it("reconciles orphaned pending/processing states to failed on mount", () => {
    const { result, unmount } = renderHookWithStates(
      () => useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() }),
      { 1: "processing", 2: "pending", 3: "completed" }
    );

    expect(result.current.watermarkState).toEqual({
      1: "failed",
      2: "failed",
      3: "completed",
    });
    unmount();
  });

  it("leaves an empty state map untouched", () => {
    const { result, unmount } = renderHook(
      () => useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );

    expect(result.current.watermarkState).toEqual({});
    unmount();
  });
});

describe("useWatermarkProcessor style flow", () => {
  it("passes the style config into the injected render script", async () => {
    jest.useFakeTimers();
    (hasNativeWatermarkEncoder as jest.Mock).mockReturnValue(false);
    (hasNativeOverlayEncoder as jest.Mock).mockReturnValue(false);
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("b64data");
    const injectJavaScript = jest.fn();
    const { result, unmount } = renderHook(() =>
      useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() })
    );
    result.current.webViewRef.current = { injectJavaScript } as unknown as WebView;

    TestRenderer.act(() => {
      result.current.handleWebViewMessage({
        nativeEvent: { data: JSON.stringify({ __ready: true }) },
      } as never);
    });
    TestRenderer.act(() => {
      result.current.enqueueWatermark(9, "file:///tmp/a.jpg", "a.jpg", ["L1"], {
        fontScale: 1.25,
        position: "bottomRight",
        bgOpacity: 0.8,
        textColor: "#FFEB3B",
      });
    });
    await TestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"style":{"fontScale":1.25')
    );
    jest.useRealTimers();
    unmount();
  });
});
