import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { __resetFsState } from "expo-file-system/legacy";
import {
  ensureTreeUri,
  resolveInspectionRootDir,
  getProjectDir,
  getSafCacheState,
  resetStorageCaches,
} from "@/src/utils/storageManager";

jest.mock("expo-file-system/legacy", () =>
  jest.requireActual("../../../__mocks__/expo-file-system")
);
jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireMock("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

beforeEach(async () => {
  __resetFsState();
  await AsyncStorage.clear();
  resetStorageCaches();
});

describe("ensureTreeUri", () => {
  it("reuses the persisted tree URI without requesting permission again", async () => {
    await AsyncStorage.setItem("accc_saf_tree_uri", "content://mock/tree/seeded");
    const first = await ensureTreeUri();
    expect(first).toBe("content://mock/tree/seeded");
  });

  it("reuses the in-session cached tree URI without re-reading storage or re-requesting permission", async () => {
    await AsyncStorage.setItem("accc_saf_tree_uri", "content://mock/tree/seeded");
    const first = await ensureTreeUri();
    await AsyncStorage.clear();
    const second = await ensureTreeUri();
    expect(first).toBe("content://mock/tree/seeded");
    expect(second).toBe(first);
  });

  it("requests a fresh permission and persists it when nothing is stored", async () => {
    const tree = await ensureTreeUri();
    expect(tree).toBe("content://mock/tree/");
    expect(await AsyncStorage.getItem("accc_saf_tree_uri")).toBe(tree);
  });
});

describe("resolveInspectionRootDir", () => {
  it("creates the ACCC Inspection root once and caches it within a session", async () => {
    const tree = await ensureTreeUri();
    const first = await resolveInspectionRootDir(tree);
    expect(first).toContain("ACCC Inspection");

    __resetFsState();
    const second = await resolveInspectionRootDir(tree);
    expect(second).toBe(first);
  });

  it("reuses an existing ACCC Inspection folder when the cache is lost", async () => {
    const tree = await ensureTreeUri();
    const created = await resolveInspectionRootDir(tree);
    expect(created).toContain("ACCC Inspection");

    await AsyncStorage.clear();
    resetStorageCaches();

    const makeSpy = jest.fn(FileSystem.StorageAccessFramework.makeDirectoryAsync);
    FileSystem.StorageAccessFramework.makeDirectoryAsync = makeSpy as typeof FileSystem.StorageAccessFramework.makeDirectoryAsync;

    const resolved = await resolveInspectionRootDir(tree);
    expect(resolved).toBe(created);
    expect(makeSpy).not.toHaveBeenCalled();
  });
});

describe("getProjectDir", () => {
  it("creates and returns separate dirs for different project labels", async () => {
    const tree = await ensureTreeUri();
    const a = await getProjectDir(tree, "New Delhi_Project Alpha");
    const b = await getProjectDir(tree, "Mumbai_Project Beta");
    expect(a).toContain("ACCC Inspection");
    expect(a.endsWith("New Delhi_Project Alpha")).toBe(true);
    expect(b.endsWith("Mumbai_Project Beta")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("returns the cached project dir without re-verifying the file system", async () => {
    const tree = await ensureTreeUri();
    const first = await getProjectDir(tree, "New Delhi_Project Alpha");

    __resetFsState();
    const second = await getProjectDir(tree, "New Delhi_Project Alpha");
    expect(second).toBe(first);
  });

  it("reuses an existing project dir when its cache is lost", async () => {
    const tree = await ensureTreeUri();
    const created = await getProjectDir(tree, "New Delhi_Project Alpha");

    await AsyncStorage.clear();
    resetStorageCaches();

    const makeSpy = jest.fn(FileSystem.StorageAccessFramework.makeDirectoryAsync);
    FileSystem.StorageAccessFramework.makeDirectoryAsync = makeSpy as typeof FileSystem.StorageAccessFramework.makeDirectoryAsync;

    const resolved = await getProjectDir(tree, "New Delhi_Project Alpha");
    expect(resolved).toBe(created);
    expect(makeSpy).not.toHaveBeenCalled();
  });
});

describe("getSafCacheState", () => {
  it("reports MISS on first resolution and HIT on subsequent calls", async () => {
    const tree = await ensureTreeUri();
    await getProjectDir(tree, "New Delhi_Project Alpha");
    expect(getSafCacheState()).toEqual({ treeUriHit: false, projectDirHit: false });

    await ensureTreeUri();
    await getProjectDir(tree, "New Delhi_Project Alpha");
    expect(getSafCacheState()).toEqual({ treeUriHit: true, projectDirHit: true });
  });

  it("reports a project dir MISS for a label not yet resolved", async () => {
    const tree = await ensureTreeUri();
    await getProjectDir(tree, "New Delhi_Project Alpha");

    await ensureTreeUri();
    await getProjectDir(tree, "Mumbai_Project Beta");
    expect(getSafCacheState()).toEqual({ treeUriHit: true, projectDirHit: false });
  });
});

describe("resetStorageCaches", () => {
  it("clears the in-session caches so the next call re-resolves", async () => {
    await AsyncStorage.setItem("accc_saf_tree_uri", "content://mock/tree/seeded");
    expect(await ensureTreeUri()).toBe("content://mock/tree/seeded");

    resetStorageCaches();
    await AsyncStorage.clear();

    expect(await ensureTreeUri()).toBe("content://mock/tree/");
  });
});
