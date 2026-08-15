jest.mock("expo-sqlite");

import { openDatabaseAsync } from "expo-sqlite";

const RELATIVE_PATH_COL = "RELATIVE_PATH";

function escapeLikeWildcards(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === "\\" || ch === "%" || ch === "_") {
      out += "\\";
    }
    out += ch;
  }
  return out;
}

function buildFolderHasFilesQuery(relative: string): {
  selection: string;
  selectionArgs: string[];
} {
  return {
    selection: `${RELATIVE_PATH_COL} LIKE ? ESCAPE '\\'`,
    selectionArgs: [`${escapeLikeWildcards(relative)}%`],
  };
}

function buildMoveQuery(oldPrefix: string): { selection: string; selectionArgs: string[] } {
  return {
    selection: `${RELATIVE_PATH_COL} LIKE ? ESCAPE '\\'`,
    selectionArgs: [`${escapeLikeWildcards(oldPrefix)}%`],
  };
}

async function seedRows(db: Awaited<ReturnType<typeof openDatabaseAsync>>, paths: string[]) {
  for (const path of paths) {
    await db.runAsync(`INSERT INTO MediaRows (${RELATIVE_PATH_COL}) VALUES (?)`, [path]);
  }
}

async function queryMatchingRows(
  db: Awaited<ReturnType<typeof openDatabaseAsync>>,
  query: { selection: string; selectionArgs: string[] }
): Promise<string[]> {
  const rows = await db.getAllAsync<Record<string, string>>(
    `SELECT ${RELATIVE_PATH_COL} FROM MediaRows WHERE ${query.selection}`,
    query.selectionArgs
  );
  return rows.map((row) => row[RELATIVE_PATH_COL]).sort();
}

const DOWNLOAD_ROOT = "Download/ACCC Dynamic Inspection/";

describe("Native MediaStore LIKE escaping (mirror of DownloadStorageModule.kt)", () => {
  it("builds the exact selection string the native module sends to SQLite", () => {
    const { selection } = buildFolderHasFilesQuery(`${DOWNLOAD_ROOT}Jaipur_AMC_2026/`);
    expect(selection).toBe("RELATIVE_PATH LIKE ? ESCAPE '\\'");
  });

  it("treats a literal underscore as a character, not a single-char wildcard", async () => {
    const db = await openDatabaseAsync("escape-underscore.db");
    await seedRows(db, [
      `${DOWNLOAD_ROOT}Jaipur_AMC_2026/a.jpg`,
      `${DOWNLOAD_ROOT}Jaipur_AMC 2026/a.jpg`,
      `${DOWNLOAD_ROOT}JaipurXAMC_2026/a.jpg`,
    ]);

    const matches = await queryMatchingRows(
      db,
      buildFolderHasFilesQuery(`${DOWNLOAD_ROOT}Jaipur_AMC_2026/`)
    );

    expect(matches).toEqual([`${DOWNLOAD_ROOT}Jaipur_AMC_2026/a.jpg`]);
  });

  it("does not match a sibling folder that differs by one character", async () => {
    const db = await openDatabaseAsync("escape-single-char.db");
    await seedRows(db, [
      `${DOWNLOAD_ROOT}Sikar_XYZ/a.jpg`,
      `${DOWNLOAD_ROOT}Sikar_XYX/a.jpg`,
      `${DOWNLOAD_ROOT}Sikar XYZ/a.jpg`,
    ]);

    const matches = await queryMatchingRows(
      db,
      buildFolderHasFilesQuery(`${DOWNLOAD_ROOT}Sikar_XYZ/`)
    );

    expect(matches).toEqual([`${DOWNLOAD_ROOT}Sikar_XYZ/a.jpg`]);
  });

  it("treats a literal percent sign as a character, not a multi-char wildcard", async () => {
    const db = await openDatabaseAsync("escape-percent.db");
    await seedRows(db, [
      `${DOWNLOAD_ROOT}Foo_100%/a.jpg`,
      `${DOWNLOAD_ROOT}Foo_100X/a.jpg`,
      `${DOWNLOAD_ROOT}Foo_100/a.jpg`,
    ]);

    const matches = await queryMatchingRows(
      db,
      buildFolderHasFilesQuery(`${DOWNLOAD_ROOT}Foo_100%/`)
    );

    expect(matches).toEqual([`${DOWNLOAD_ROOT}Foo_100%/a.jpg`]);
  });

  it("matches files directly inside the exact folder (folderHasFiles true case)", async () => {
    const db = await openDatabaseAsync("escape-exact-true.db");
    await seedRows(db, [`${DOWNLOAD_ROOT}Jaipur_AMC_2026/a.jpg`]);

    const matches = await queryMatchingRows(
      db,
      buildFolderHasFilesQuery(`${DOWNLOAD_ROOT}Jaipur_AMC_2026/`)
    );

    expect(matches).toEqual([`${DOWNLOAD_ROOT}Jaipur_AMC_2026/a.jpg`]);
  });

  it("returns nothing when only a sibling folder exists (folderHasFiles false case)", async () => {
    const db = await openDatabaseAsync("escape-exact-false.db");
    await seedRows(db, [`${DOWNLOAD_ROOT}Jaipur_AMC 2026/a.jpg`]);

    const matches = await queryMatchingRows(
      db,
      buildFolderHasFilesQuery(`${DOWNLOAD_ROOT}Jaipur_AMC_2026/`)
    );

    expect(matches).toEqual([]);
  });

  it("returns only rows whose RELATIVE_PATH starts with the exact old folder for the move query", async () => {
    const db = await openDatabaseAsync("escape-move.db");
    const oldPrefix = `${DOWNLOAD_ROOT}Jaipur_AMC_2026/`;
    await seedRows(db, [
      `${oldPrefix}a.jpg`,
      `${oldPrefix}sub/b.jpg`,
      `${DOWNLOAD_ROOT}Jaipur_AMC 2026/c.jpg`,
      `${DOWNLOAD_ROOT}Jaipur_AMC_2027/d.jpg`,
    ]);

    const matches = await queryMatchingRows(db, buildMoveQuery(oldPrefix));

    expect(matches).toEqual([`${oldPrefix}a.jpg`, `${oldPrefix}sub/b.jpg`]);
  });

  it("keeps projects with underscore-separated labels fully isolated", async () => {
    const db = await openDatabaseAsync("escape-isolation.db");
    await seedRows(db, [
      `${DOWNLOAD_ROOT}Jaipur_AMC_2026/a.jpg`,
      `${DOWNLOAD_ROOT}Jaipur_AMC 2026/b.jpg`,
      `${DOWNLOAD_ROOT}Sikar_XYZ/c.jpg`,
    ]);

    const jaipurMatches = await queryMatchingRows(
      db,
      buildFolderHasFilesQuery(`${DOWNLOAD_ROOT}Jaipur_AMC_2026/`)
    );
    const sikarMatches = await queryMatchingRows(
      db,
      buildFolderHasFilesQuery(`${DOWNLOAD_ROOT}Sikar_XYZ/`)
    );

    expect(jaipurMatches).toEqual([`${DOWNLOAD_ROOT}Jaipur_AMC_2026/a.jpg`]);
    expect(sikarMatches).toEqual([`${DOWNLOAD_ROOT}Sikar_XYZ/c.jpg`]);
  });

  it("regression: the unescaped legacy pattern WOULD match the sibling folder", async () => {
    const db = await openDatabaseAsync("escape-legacy-regression.db");
    await seedRows(db, [
      `${DOWNLOAD_ROOT}Jaipur_AMC_2026/a.jpg`,
      `${DOWNLOAD_ROOT}Jaipur_AMC 2026/b.jpg`,
    ]);

    const legacyPattern = `${DOWNLOAD_ROOT}Jaipur_AMC_2026/%`;
    const legacyRows = await db.getAllAsync<Record<string, string>>(
      `SELECT ${RELATIVE_PATH_COL} FROM MediaRows WHERE ${RELATIVE_PATH_COL} LIKE ?`,
      [legacyPattern]
    );

    expect(legacyRows.map((r) => r[RELATIVE_PATH_COL]).sort()).toEqual([
      `${DOWNLOAD_ROOT}Jaipur_AMC 2026/b.jpg`,
      `${DOWNLOAD_ROOT}Jaipur_AMC_2026/a.jpg`,
    ]);
  });
});
