import React from "react";
import TestRenderer from "react-test-renderer";
import PhotoPreviewModal from "@/src/components/inspection/PhotoPreviewModal";
import { resolvePhotoStoragePath } from "@/src/utils/photoStoragePath";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";

jest.mock("@/src/utils/photoStoragePath", () => ({
  resolvePhotoStoragePath: jest.fn(),
}));
jest.mock("@/src/database/repositories/PhotoRepository", () => ({
  __esModule: true,
  default: { updateStoragePath: jest.fn() },
}));

const mockResolve = resolvePhotoStoragePath as jest.Mock;
const mockUpdateStoragePath = PhotoRepository.updateStoragePath as jest.Mock;

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

function render(props: Partial<React.ComponentProps<typeof PhotoPreviewModal>>) {
  let tree: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <PhotoPreviewModal
        photo={null}
        visible
        onClose={() => {}}
        contextPoleId="P1"
        block=""
        {...props}
      />
    );
  });
  return tree!;
}

const photo = {
  PhotoID: 1,
  InspectionID: 1,
  PhotoType: "Pole",
  FileName: "Jaipur_AMC 2026_P1_15AUG2026_112948.jpg",
  FilePath:
    "content://media/Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/Jaipur_AMC 2026_P1_15AUG2026_112948.jpg",
  Latitude: 26.9124,
  Longitude: 75.7873,
  CapturedAt: "2026-08-15T11:29:48.000Z",
  Remarks: null,
  StoragePath: "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PhotoPreviewModal", () => {
  it("renders the file name", () => {
    const strings = collectStrings(render({ photo }).toJSON());
    expect(strings).toContain("Jaipur_AMC 2026_P1_15AUG2026_112948.jpg");
  });

  it("renders the saved location from StoragePath without a project prop", () => {
    const strings = collectStrings(render({ photo }).toJSON());
    const joined = strings.join(" ");
    expect(joined).toContain("Saved Location:");
    expect(joined).toContain("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("does not render GPS coordinates", () => {
    const strings = collectStrings(render({ photo }).toJSON());
    expect(strings.join(" ")).not.toContain("26.912400");
    expect(strings.join(" ")).not.toContain("75.787300");
  });

  it("renders empty file name and no saved location when the photo is null", () => {
    const strings = collectStrings(render({ photo: null }).toJSON());
    expect(strings.join(" ")).toContain("File Name:");
    expect(strings.join(" ")).not.toContain("Saved Location:");
  });

  it("lazily resolves and persists StoragePath when it is missing", async () => {
    const missing = { ...photo, StoragePath: undefined };
    mockResolve.mockResolvedValue("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");

    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <PhotoPreviewModal
          visible
          photo={missing}
          onClose={() => {}}
          contextPoleId="P1"
          block=""
        />
      );
    });
    await TestRenderer.act(async () => {
      await Promise.resolve();
    });

    const strings = collectStrings(tree!.toJSON());
    expect(strings.join(" ")).toContain("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
    expect(mockResolve).toHaveBeenCalledWith(missing);
    expect(mockUpdateStoragePath).toHaveBeenCalledWith(
      1,
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );
  });

  it("shows no saved location when resolution returns null", async () => {
    const missing = { ...photo, StoragePath: undefined };
    mockResolve.mockResolvedValue(null);

    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <PhotoPreviewModal
          visible
          photo={missing}
          onClose={() => {}}
          contextPoleId="P1"
          block=""
        />
      );
    });
    await TestRenderer.act(async () => {
      await Promise.resolve();
    });

    const strings = collectStrings(tree!.toJSON());
    expect(strings.join(" ")).not.toContain("Saved Location:");
    expect(mockUpdateStoragePath).not.toHaveBeenCalled();
  });
});
