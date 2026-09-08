import {
  writePhotoUnique,
  withUniquePhotoSuffix,
  MAX_PHOTO_WRITE_ATTEMPTS,
} from "@/src/utils/storageManager";
import { downloadStorage } from "@/src/utils/downloadStorage";

type Unit = { uri: string; bytes: string };

type State = {
  rows: Map<string, Unit>;
  writes: Array<{ label: string; name: string; bytes: string }>;
  overwrites: Array<{ label: string; name: string }>;
  blockFinds: number;
  failNextWrite: boolean;
};

const state = (downloadStorage as unknown as { __state: State }).__state;

function seed(label: string, name: string, bytes: string): string {
  const uri = `content://media/${label}/${name}`;
  state.rows.set(`${label}/${name}`, { uri, bytes });
  return uri;
}

function getBytes(label: string, name: string): string | undefined {
  return state.rows.get(`${label}/${name}`)?.bytes;
}

jest.mock("@/src/utils/downloadStorage", () => {
  const state: State = {
    rows: new Map<string, Unit>(),
    writes: [],
    overwrites: [],
    blockFinds: 0,
    failNextWrite: false,
  };
  let nextId = 1;

  const downloadStorage = {
    androidApiLevel: 30,
    ensureFolder: jest.fn(async () => undefined),
    hasFiles: jest.fn(async () => state.rows.size > 0),
    writeBase64: jest.fn(async (label: string, name: string, _mime: string, bytes: string) => {
      if (state.failNextWrite) {
        state.failNextWrite = false;
        throw new Error("E_IO_FAILED");
      }
      const key = `${label}/${name}`;
      const existing = state.rows.get(key);
      const uri = existing?.uri ?? `content://media/${label}/${name}#${nextId++}`;
      state.rows.set(key, { uri, bytes });
      state.writes.push({ label, name, bytes });
      if (existing) {
        state.overwrites.push({ label, name });
      }
      return uri;
    }),
    writeUtf8: jest.fn(async () => undefined),
    readBase64: jest.fn(async () => ""),
    deleteFile: jest.fn(async () => undefined),
    renameFile: jest.fn(async () => ""),
    findFile: jest.fn(async (label: string, name: string) => {
      if (state.blockFinds > 0) {
        state.blockFinds--;
        return `content://media/${label}/${name}#blocked`;
      }
      return state.rows.get(`${label}/${name}`)?.uri ?? null;
    }),
  };

  return { downloadStorage: { ...downloadStorage, __state: state } };
});

describe("writePhotoUnique", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    state.rows.clear();
    state.writes = [];
    state.overwrites = [];
    state.blockFinds = 0;
    state.failNextWrite = false;
  });

  it("TEST 1 — stores a fresh capture and returns the uri + name for the DB", async () => {
    const base = "Sikar_SIK001_14AUG2026_112948.jpg";
    const result = await writePhotoUnique("Proj A", base, "B64A");

    expect(result.contentUri).toMatch(/^content:\/\/media\/Proj A\/Sikar_SIK001/);
    expect(result.fileName).toBe(base);
    expect(downloadStorage.findFile).toHaveBeenCalledWith("Proj A", base);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toEqual({ label: "Proj A", name: base, bytes: "B64A" });
    expect(state.overwrites).toHaveLength(0);
    expect(getBytes("Proj A", base)).toBe("B64A");
  });

  it("TEST 2 — forced collision is resolved to a different name and the existing photo is untouched", async () => {
    const base = "Sikar_SIK001_14AUG2026_112948.jpg";
    seed("Proj A", base, "OLD_BYTES");

    const result = await writePhotoUnique("Proj A", base, "NEW_BYTES");

    expect(result.fileName).not.toBe(base);
    expect(result.fileName).toMatch(/^Sikar_SIK001_14AUG2026_112948_[a-z0-9]{6}\.jpg$/);
    expect(result.contentUri).toMatch(/^content:\/\/media/);
    expect(getBytes("Proj A", base)).toBe("OLD_BYTES");
    expect(state.writes.every(w => w.name !== base)).toBe(true);
    expect(state.overwrites).toHaveLength(0);
  });

  it("TEST 3 — byte content of the pre-existing photo is preserved byte-for-byte", async () => {
    const base = "photo.jpg";
    const legacyBytes = "LEGACY_PHOTO_BYTES_0011223344";
    seed("Proj A", base, legacyBytes);

    await writePhotoUnique("Proj A", base, "NEW_PHOTO_BYTES");

    expect(getBytes("Proj A", base)).toBe(legacyBytes);
    const newName = state.writes[0].name;
    expect(getBytes("Proj A", newName)).toBe("NEW_PHOTO_BYTES");
    expect(state.overwrites).toHaveLength(0);
  });

  it("TEST 4 — rapid captures at the same second all get unique file names and uris", async () => {
    const base = "North_BlockA_P001_14AUG2026_112948.jpg";

    const a = await writePhotoUnique("Proj A", base, "B1");
    const b = await writePhotoUnique("Proj A", base, "B2");
    const c = await writePhotoUnique("Proj A", base, "B3");

    const names = [a.fileName, b.fileName, c.fileName];
    expect(new Set(names).size).toBe(3);
    expect(new Set([a.contentUri, b.contentUri, c.contentUri]).size).toBe(3);
    expect(names[0]).toBe(base);
    expect(names[1]).toMatch(/^North_BlockA_P001_14AUG2026_112948_[a-z0-9]{6}\.jpg$/);
    expect(names[2]).toMatch(/^North_BlockA_P001_14AUG2026_112948_[a-z0-9]{6}\.jpg$/);
    expect(state.writes).toHaveLength(3);
    expect(state.overwrites).toHaveLength(0);
  });

  it("TEST 5 — the same base name in another project folder is isolated and never collides", async () => {
    seed("Proj A", "photo.jpg", "A_BYTES");

    const result = await writePhotoUnique("Proj B", "photo.jpg", "B_BYTES");

    expect(result.fileName).toBe("photo.jpg");
    expect(getBytes("Proj A", "photo.jpg")).toBe("A_BYTES");
    expect(getBytes("Proj B", "photo.jpg")).toBe("B_BYTES");
    expect(state.overwrites).toHaveLength(0);
  });

  it("TEST 6 — repeated collision is retried (bounded) until a free name is found", async () => {
    const base = "photo.jpg";
    seed("Proj A", base, "OLD");
    state.blockFinds = 2;

    const result = await writePhotoUnique("Proj A", base, "NEW");

    expect(downloadStorage.findFile).toHaveBeenCalledTimes(3);
    expect(state.writes).toHaveLength(1);
    expect(state.overwrites).toHaveLength(0);
    expect(result.fileName).not.toBe(base);
    expect(result.fileName).toMatch(/^photo_[a-z0-9]{6}\.jpg$/);
    expect(getBytes("Proj A", base)).toBe("OLD");
  });

  it("TEST 7 — collision exhaustion fails clearly, writes nothing, leaves existing files alone", async () => {
    const base = "photo.jpg";
    seed("Proj A", base, "OLD");
    state.blockFinds = Number.MAX_SAFE_INTEGER;

    await expect(writePhotoUnique("Proj A", base, "NEW")).rejects.toThrow(
      /Cannot allocate a unique photo filename after 5 attempts/
    );

    expect(downloadStorage.findFile).toHaveBeenCalledTimes(MAX_PHOTO_WRITE_ATTEMPTS);
    expect(state.writes).toHaveLength(0);
    expect(state.overwrites).toHaveLength(0);
    expect(getBytes("Proj A", base)).toBe("OLD");
    expect(state.rows.size).toBe(1);
  });

  it("TEST 8 — pre-existing photo paths still resolve (no migration, rename, or delete of any file)", async () => {
    const legacyA = "content://media/Proj A/sikar_X_Y_112948.jpg";
    const legacyB = "content://media/Proj A/sikar_X_Z_113000.jpg";
    state.rows.set("Proj A/sikar_X_Y_112948.jpg", { uri: legacyA, bytes: "P1" });
    state.rows.set("Proj A/sikar_X_Z_113000.jpg", { uri: legacyB, bytes: "P2" });

    await writePhotoUnique("Proj A", "fresh_photo.jpg", "NEW");

    expect(getBytes("Proj A", "sikar_X_Y_112948.jpg")).toBe("P1");
    expect(getBytes("Proj A", "sikar_X_Z_113000.jpg")).toBe("P2");
    expect(state.rows.get("Proj A/sikar_X_Y_112948.jpg")?.uri).toBe(legacyA);
    expect(state.rows.get("Proj A/sikar_X_Z_113000.jpg")?.uri).toBe(legacyB);
    expect(downloadStorage.renameFile).not.toHaveBeenCalled();
    expect(downloadStorage.deleteFile).not.toHaveBeenCalled();
    expect(state.overwrites).toHaveLength(0);
  });

  it("TEST 9 — a write failure propagates and leaves no new file and no partial entry", async () => {
    seed("Proj A", "photo.jpg", "OLD");
    state.failNextWrite = true;

    await expect(writePhotoUnique("Proj A", "photo.jpg", "NEW")).rejects.toThrow(
      "E_IO_FAILED"
    );

    expect(state.writes).toHaveLength(0);
    expect(state.rows.size).toBe(1);
    expect(getBytes("Proj A", "photo.jpg")).toBe("OLD");
  });

  it("TEST 10 — extension handling preserves non-jpg suffixes and supports no-extension names", () => {
    expect(withUniquePhotoSuffix("photo.png", "a1b2c3")).toBe("photo_a1b2c3.png");
    expect(withUniquePhotoSuffix("photo.JPG", "a1b2c3")).toBe("photo_a1b2c3.JPG");
    expect(withUniquePhotoSuffix("photo.jpg", "a1b2c3")).toBe("photo_a1b2c3.jpg");
    expect(withUniquePhotoSuffix("photo", "a1b2c3")).toBe("photo_a1b2c3");
    expect(withUniquePhotoSuffix("photo.tar.gz", "a1b2c3")).toBe("photo.tar_a1b2c3.gz");
  });

  it("TEST 10 — non-jpg collision is resolved while preserving the extension", async () => {
    seed("Proj A", "photo.png", "OLD");

    const result = await writePhotoUnique("Proj A", "photo.png", "NEW");

    expect(result.fileName).toMatch(/^photo_[a-z0-9]{6}\.png$/);
    expect(result.fileName).not.toBe("photo.png");
    expect(getBytes("Proj A", "photo.png")).toBe("OLD");
    expect(state.overwrites).toHaveLength(0);
  });
});