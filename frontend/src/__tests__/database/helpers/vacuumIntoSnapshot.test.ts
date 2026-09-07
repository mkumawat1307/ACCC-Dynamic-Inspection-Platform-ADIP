import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function sqlLiteral(p: string): string {
  return p.replace(/'/g, "''");
}

describe("VACUUM INTO as the backup snapshot mechanism", () => {
  let dir: string;
  const openHandles: { close(): void }[] = [];

  function openDb(p: string) {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(p);
    openHandles.push(db);
    return db;
  }

  beforeEach(() => {
    openHandles.length = 0;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "adip-vacuum-into-"));
  });

  afterEach(() => {
    for (const handle of openHandles) {
      try {
        handle.close();
      } catch {
        // already closed — fine
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("captures committed WAL data that a main-file-alone copy would lose", () => {
    const db = openDb(path.join(dir, "inspection.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA wal_autocheckpoint = 0;");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);");
    db.exec("PRAGMA wal_checkpoint(PASSIVE);");
    db.exec("INSERT INTO t (v) VALUES ('committed-in-wal');");

    const mainAlone = path.join(dir, "main-alone.db");
    fs.copyFileSync(path.join(dir, "inspection.db"), mainAlone);
    const stale = openDb(mainAlone);
    expect(stale.prepare("SELECT v FROM t WHERE id = 1").get()).toBeUndefined();

    const snapPath = path.join(dir, "snapshot.db");
    db.exec(`VACUUM INTO '${sqlLiteral(snapPath)}'`);
    const snap = openDb(snapPath);
    expect(snap.prepare("SELECT v FROM t WHERE id = 1").get()).toEqual({
      v: "committed-in-wal",
    });
    expect(snap.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
  });

  it("produces a standalone .db file with no WAL/SHM sidecars", () => {
    const db = openDb(path.join(dir, "inspection.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);");
    db.exec("INSERT INTO t (v) VALUES ('x');");

    const snapPath = path.join(dir, "snapshot.db");
    db.exec(`VACUUM INTO '${sqlLiteral(snapPath)}'`);

    expect(fs.readdirSync(dir).filter((f) => f.startsWith("snapshot.db"))).toEqual([
      "snapshot.db",
    ]);
  });

  it("fails when the output file already exists as a database", () => {
    const db = openDb(path.join(dir, "inspection.db"));
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);");

    const existingPath = path.join(dir, "out.db");
    const existing = openDb(existingPath);
    existing.exec("CREATE TABLE u (y INTEGER);");

    expect(() =>
      db.exec(`VACUUM INTO '${sqlLiteral(existingPath)}'`)
    ).toThrow(/already exists/);
  });

  it("fails from within a write transaction", () => {
    const db = openDb(path.join(dir, "inspection.db"));
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);");
    db.exec("BEGIN");

    expect(() =>
      db.exec(`VACUUM INTO '${sqlLiteral(path.join(dir, "out.db"))}'`)
    ).toThrow(/within a transaction/);
  });
});