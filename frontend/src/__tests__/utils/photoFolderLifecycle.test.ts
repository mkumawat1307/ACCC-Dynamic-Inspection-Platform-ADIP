import { downloadStorage } from "@/src/utils/downloadStorage";
import { ensureProjectFolder, writePhoto, writePhotoUnique } from "@/src/utils/storageManager";

type Unit = { uri: string; bytes: string };

type State = {
  files: Map<string, Unit>;
  folderChecks: string[];
  folderCreates: string[];
  deletes: string[];
  renames: string[];
  failNextWrite: boolean;
};

jest.mock("@/src/utils/downloadStorage", () => {
  const state: State = {
    files: new Map<string, Unit>(),
    folderChecks: [],
    folderCreates: [],
    deletes: [],
    renames: [],
    failNextWrite: false,
  };
  let nextId = 1;

  const downloadStorage = {
    androidApiLevel: 35,
    ensureFolder: jest.fn(async (relativePath: string) => {
      state.folderChecks.push(relativePath);
      const exists = state.files.size > 0;
      if (!exists) {
        state.folderCreates.push(relativePath);
      }
      return exists;
    }),
    hasFiles: jest.fn(async () => state.files.size > 0),
    writeBase64: jest.fn(
      async (label: string, name: string, _mime: string, bytes: string) => {
        if (state.failNextWrite) {
          state.failNextWrite = false;
          throw new Error("E_IO_FAILED");
        }
        const key = `${label}/${name}`;
        const uri = `content://media/${label}/${name}#${nextId++}`;
        state.files.set(key, { uri, bytes });
        return uri;
      }
    ),
    writeUtf8: jest.fn(async () => undefined),
    readBase64: jest.fn(async () => ""),
    deleteFile: jest.fn(async (uri: string) => {
      state.deletes.push(uri);
      return true;
    }),
    renameFile: jest.fn(async (uri: string) => {
      state.renames.push(uri);
      return uri;
    }),
    findFile: jest.fn(async (label: string, name: string) => {
      return state.files.get(`${label}/${name}`)?.uri ?? null;
    }),
  };

  return { downloadStorage: { ...downloadStorage, __state: state } };
});

const state = (downloadStorage as unknown as { __state: State }).__state;

function seed(label: string, name: string, bytes: string): string {
  const uri = `content://media/${label}/${name}`;
  state.files.set(`${label}/${name}`, { uri, bytes });
  return uri;
}

describe("photo folder lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    state.files.clear();
    state.folderChecks = [];
    state.folderCreates = [];
    state.deletes = [];
    state.renames = [];
    state.failNextWrite = false;
  });

  it("ensuring an existing folder is idempotent and never deletes or recreates content", async () => {
    seed("Jaipur_ABC_1234abcd", "photo.jpg", "ORIGINAL");

    await ensureProjectFolder("Jaipur_ABC_1234abcd");
    await ensureProjectFolder("Jaipur_ABC_1234abcd");

    const labelCalls = (downloadStorage.ensureFolder as jest.Mock).mock.calls.filter(
      (c) => c[0] === "Jaipur_ABC_1234abcd"
    );
    expect(labelCalls).toHaveLength(2);
    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("Jaipur_ABC_1234abcd");
    expect(state.folderCreates).not.toContain("Jaipur_ABC_1234abcd");
    expect(state.deletes).toHaveLength(0);
    expect(state.renames).toHaveLength(0);
    expect(state.files.get("Jaipur_ABC_1234abcd/photo.jpg")?.bytes).toBe("ORIGINAL");
  });

  it("ensures the project folder at the save layer when writing a new capture", async () => {
    const { contentUri, fileName } = await writePhotoUnique(
      "Jaipur_ABC_1234abcd",
      "photo.jpg",
      "NEW"
    );

    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("Jaipur_ABC_1234abcd");
    expect(state.files.get("Jaipur_ABC_1234abcd/photo.jpg")?.bytes).toBe("NEW");
    expect(contentUri).toMatch(/^content:\/\/media\/Jaipur_ABC_1234abcd/);
    expect(fileName).toBe("photo.jpg");
  });

  it("does not run any folder check or rewrite when the final file already exists", async () => {
    seed("Jaipur_ABC_1234abcd", "photo.jpg", "FIRST");

    await writePhotoUnique("Jaipur_ABC_1234abcd", "photo.jpg", "SECOND");

    expect(downloadStorage.ensureFolder).not.toHaveBeenCalled();
    expect(downloadStorage.writeBase64).not.toHaveBeenCalled();
    expect(state.files.get("Jaipur_ABC_1234abcd/photo.jpg")?.bytes).toBe("FIRST");
  });

  it("projects with distinct hashes stay isolated (no cross-folder writes)", async () => {
    await writePhotoUnique("Jaipur_ABC_11111111", "photo.jpg", "A");
    await writePhotoUnique("Jaipur_ABC_22222222", "photo.jpg", "B");

    expect(state.files.get("Jaipur_ABC_11111111/photo.jpg")?.bytes).toBe("A");
    expect(state.files.get("Jaipur_ABC_22222222/photo.jpg")?.bytes).toBe("B");
    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("Jaipur_ABC_11111111");
    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("Jaipur_ABC_22222222");
    expect(state.files.get("Jaipur_ABC_11111111/photo.jpg")?.uri).not.toBe(
      state.files.get("Jaipur_ABC_22222222/photo.jpg")?.uri
    );
  });

  it("a write failure propagates without leaving partial state", async () => {
    state.failNextWrite = true;

    await expect(
      writePhotoUnique("Jaipur_ABC_1234abcd", "photo.jpg", "NEW")
    ).rejects.toThrow("E_IO_FAILED");

    expect(state.files.size).toBe(0);
  });

  it("never renames or deletes historical folders/files while writing to the current folder", async () => {
    const legacyUri = seed("Jaipur_OLD_1234abcd", "legacy.jpg", "LEGACY");

    await writePhotoUnique("Jaipur_ABC_1234abcd", "photo.jpg", "NEW");

    const legacy = state.files.get("Jaipur_OLD_1234abcd/legacy.jpg");
    expect(legacy?.uri).toBe(legacyUri);
    expect(legacy?.bytes).toBe("LEGACY");
    expect(state.renames).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
    expect(state.files.get("Jaipur_ABC_1234abcd/photo.jpg")?.bytes).toBe("NEW");
  });

  it("raw writes perform no folder checks (folder ops are confined to ensure/save paths)", async () => {
    await writePhoto("Jaipur_ABC_1234abcd", "photo.jpg", "RAW");

    expect(downloadStorage.ensureFolder).not.toHaveBeenCalled();
    expect(downloadStorage.findFile).not.toHaveBeenCalled();
    expect(state.files.get("Jaipur_ABC_1234abcd/photo.jpg")?.bytes).toBe("RAW");
  });
});