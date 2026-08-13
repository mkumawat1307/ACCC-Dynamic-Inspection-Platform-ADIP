# AGENTS.md

## Project

ACCC Dynamic Inspection Platform (ADIP) — offline-first React Native (Expo) mobile app for infrastructure inspections. Android target. All code lives in `frontend/`.

## Commands

```bash
cd frontend
yarn start              # Expo dev server
yarn lint               # eslint via expo lint
yarn test               # Jest (507 tests across 41 suites)
npx tsc --noEmit        # Typecheck
```

## Key Architecture

- **Expo Router** file-based routing (`app/` directory). Screens are `app/**/*.tsx`.
- **Dual SQLite databases**: `accc_global.db` (Projects, Divisions, Districts, Blocks) + per-project `Projects/<Name>/inspection.db` (18 tables; 22 total).
- **Repository Pattern**: all DB access goes through `src/database/repositories/`. Never query SQLite from UI.
- **React Context**: `src/context/InspectionContext.tsx` holds project, inspection state.
- **Dynamic form engine**: inspection forms are rendered from DB config (templates → sections → fields), not hardcoded.

## Critical: expo-sqlite Android Bugs

expo-sqlite v16 on Android has confirmed bugs that **will break the app** if ignored:

1. **No dual connections**: opening two `SQLiteDatabase` handles simultaneously causes the second to point at the first file.
2. **Close+reopen corrupts**: `closeAsync()` doesn't fully release the native handle before `openDatabaseAsync()` reopens, causing the same file-mixing.
3. **ATTACH DATABASE DDL fails**: `execAsync` rejects dot-qualified DDL (`CREATE TABLE p.Name(...)`) with syntax error. ATTACH works for DML but not schema creation.

**The app uses a sequential open/close model** (`src/database/db.ts`): one `SQLiteDatabase` handle at a time, switched via `ensureGlobalDb()` / `ensureProjectDb()`. `cleanPath()` strips `file://` before comparison. This is the **only safe pattern** on Android.

**During the inspection flow, NEVER call `getGlobalDatabase()`** — it closes the project DB and reopens the global DB, corrupting the native handle. Project data is passed via navigation params + context to avoid DB switching mid-flow.

See `docs/09-Decisions.md` (ADR-014) for full reasoning.

## Path Aliases

`@/*` maps to `frontend/*` (configured in `tsconfig.json`).

## Package Manager

Yarn 1.22 (`yarn`). The `packageManager` field is pinned in `package.json`. `.npmrc` sets `save-exact=true`.

## Preinstall Guard

`scripts/cmd-guard.js` runs on `yarn install` via the `preinstall` hook. It blocks unsafe install commands on Windows (e.g., npm overrides). Don't bypass it.

## File Structure Quick Reference

| Path | Purpose |
|------|---------|
| `app/_layout.tsx` | Root layout — wraps everything in `InspectionProvider` |
| `app/index.tsx` | Home screen — project list |
| `app/projects/dashboard.tsx` | Per-project dashboard |
| `app/inspection/new.tsx` | New inspection form |
| `src/database/db.ts` | SQLite connection manager (sequential open/close) |
| `src/database/schema.ts` | DDL — `createGlobalSchema()` / `createProjectSchema()` |
| `src/database/seed.ts` | Seed orchestrator |
| `src/database/helpers/ProjectDBManager.ts` | Create/open/delete project DBs |
| `src/database/repositories/` | All 18 repositories (+ helpers) |
| `src/context/InspectionContext.tsx` | Shared inspection state |
| `src/utils/logger.ts` | Production-safe logger (console.log wrapper gated on `__DEV__`) |
| `src/__tests__/` | Jest test suites (41 suites, 507 tests, coverage thresholds per directory) |
| `__mocks__/expo-sqlite.ts` | In-memory SQLite mock for testing |
| `__mocks__/expo-file-system.ts` | Expo FileSystem mock |
| `jest.config.js` | Jest config (jest-expo preset, `@/` alias, per-glob coverage thresholds) |
| `jest.setup.ts` | Global `__DEV__ = true`, `global.alert = jest.fn()` |
| `docs/` | Architecture, rules, decisions, changelog |

## Isolation Requirements (MANDATORY — never skip)

Every code change, new table, or new feature MUST be fully isolated by design. Do not make the project do cross-contamination cleanup again — build isolation in from the start.

- **Per-project data goes in the project DB only.** Never add per-project tables, sections, fields, or seed rows to `accc_global.db`, and never reference project data across project DBs (no cross-DB joins; tables are standalone per file).
- **Respect the sequential open/close model.** Never open a second `SQLiteDatabase` handle while one is active, and never call `getGlobalDatabase()` during the inspection flow. Route all DB access through `src/database/repositories/` using the connection manager.
- **Every new feature that adds project-scoped data MUST ship with an isolation regression test** (mirror `src/__tests__/database/isolation.test.ts`): create data in Project A, open Project B, assert it does NOT appear there.
- **Mocks stay path-aware.** New test fixtures must use distinct DB paths/names. Never share a single mock handle or table set across tests unless the test explicitly asserts sharing.
- **Custom/admin data (`IsDefault=0` sections, device types, etc.) is created per-project, never seeded globally.**
- **Schema additions must include a migration** (`migrateProjectSchema()` pattern in `src/database/schema.ts`, wired into `ProjectDBManager.openProjectDb`) for existing project DBs — new columns/tables are never schema-only for fresh installs.
- **When removing a field/section, remove it from the form, the repository, AND the project list/search UI together** — partial removal leaves inconsistent state.

## Conventions

- TypeScript strict mode. Avoid `any`.
- PascalCase for components, repositories, interfaces, table names. camelCase for variables. UPPER_CASE for constants.
- No comments unless requested.
- DB tables are standalone per database file — no cross-DB joins.
- Each project DB is created with full seed data (template, sections, fields, options, devices).
- `IsDefault=1` sections appear in inspection forms; `IsDefault=0` are admin-only custom sections.
