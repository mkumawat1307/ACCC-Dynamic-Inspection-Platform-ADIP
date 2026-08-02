# Dashboard UI Refinement — Design

**Status: ✅ Approved** (2026-08-02)

## Purpose

Polish the Project Dashboard UI with a "Clean Material refinement": keep the
react-native-paper look but fix spacing, alignment, and visual grouping so the
screen stops feeling cramped and inconsistent.

**Scope:** `app/projects/dashboard.tsx` plus the dashboard components it renders —
`DashboardCardGrid`, `StatCard`, `StatBreakdownCard`, `DashboardActionCard` — and a
new small design-tokens module shared by them.

**Out of scope:** `app/projects/dashboard-settings.tsx` (Manage Cards screen),
dashboard data/logic layers (repositories, services, SmartCardGenerator),
dark mode.

## Current problems

- Stat cards use `margin: 6` inside a padded "Statistics" Card wrapper
  (`Card.Content`), producing double padding and asymmetric gaps between pairs.
- Paired stat rows rely on margins rather than a layout `gap`.
- "Statistics" is a wrapping Card with no visual relationship to the card grid
  it contains; section headers ("Total" / "Today's") are plain text with weak
  spacing.
- The Project Information block is a running text wall instead of aligned
  label/value rows.
- The empty state renders a literal `\u201C` escape (JSX text does not interpret
  `\u` escapes) — the hint reads `\u201CManage Cards\u201D`.
- Action cards use ad-hoc spacing; the unused non-compact variant of
  `DashboardActionCard` is dead code.
- Hardcoded colors/spacing scattered across files; no single source of truth.
- `app/projects/dashboard.tsx` has mangled indentation from earlier edits.

## Design decisions

### 1. Design tokens (new module)

Add `src/constants/ui.ts` exporting:

- `SPACING` — `xs: 4`, `sm: 8`, `md: 12`, `lg: 16`, `xl: 24`
- `COLORS` — `background: "#F5F5F5"`, `surface: "#FFFFFF"`,
  `primary: "#0B5ED7"`, `textPrimary: "#333"`, `textSecondary: "#666"`,
  `textMuted: "#999"`
- `RADIUS` — `md: 12`

All dashboard components import from this module instead of scattering
hardcoded values.

### 2. Screen layout (`app/projects/dashboard.tsx`)

- Appbar unchanged (back action + "Project Dashboard").
- `ScrollView` padding: horizontal `lg` (16), vertical rhythm of `xl` (24)
  between sections, `lg` bottom padding.
- **Project Information** — compact labeled card: small info icon + bold
  "Project Information" header; body is a label/value grid with aligned pairs:
  `Division | District` and `Inspector | Client` (gray small labels, bold
  values), `Description` full-width beneath with a gray label.
- **Statistics** — no longer nested in a Card; a styled section header
  "Statistics", then `DashboardCardGrid` renders its cards directly on the
  page background.
- **Manage Cards** — full-width compact `DashboardActionCard` directly under
  the Statistics grid (it configures the stat cards).
- **Quick Actions** — styled section header + the existing 2×2 grid
  (New Inspection, Inspection List, Settings, Reports).
- Fix the mangled indentation of the whole file.

### 3. Stat cards (`StatCard`, `StatBreakdownCard`)

- `StatCard`: `flex: 1` to fill the row; spacing via parent `gap: 12` (drop
  `margin: 6`). Centered content: icon (28, accent), bold value, gray title.
  Consistent inner padding, radius 12.
- `StatBreakdownCard`: full-width, radius 12; header (icon + bold title),
  thin divider, rows as label-left / bold-accent-count-right, muted
  "No data" empty state.

### 4. Grid (`DashboardCardGrid`)

- Pairing logic unchanged (non-breakdown cards render 2-across); spacing via
  `gap: 12` instead of margins.
- Section headers: bold gray, clear top margin (e.g. `marginTop: 16`,
  `marginBottom: 8`).
- Empty state: replace the literal `\u201C`/`\u201D` escapes with real curly
  quotes so the hint renders as “Manage Cards”. No test asserts the old string.
- Loading state unchanged.

### 5. Action cards (`DashboardActionCard`)

- All five usages on the dashboard screen use `compact`, so simplify the
  component to the compact layout only (remove the dead non-compact branch):
  centered icon (28, blue), bold centered title, gray subtitle, radius 12,
  consistent padding.

### 6. Tests & verification

- No data-flow changes; repository/service logic untouched.
- Existing component tests must stay green (they assert content, not styles).
- Run `npx jest` (full suite), `npx tsc --noEmit`, and lint on the changed
  files before finishing.

## Files touched

| File | Change |
|------|--------|
| `src/constants/ui.ts` | **NEW** — design tokens (SPACING, COLORS, RADIUS) |
| `app/projects/dashboard.tsx` | Layout restructure, tokens, indentation fix |
| `src/components/dashboard/DashboardCardGrid.tsx` | Spacing via gap, section headers, empty-state quotes, tokens |
| `src/components/StatCard.tsx` | Spacing/gap, tokens |
| `src/components/dashboard/StatBreakdownCard.tsx` | Divider, spacing, tokens |
| `src/components/dashboard/DashboardActionCard.tsx` | Compact-only simplification, tokens |

## Non-goals

- No change to dashboard card data, card modes, or the smart-card generator.
- No change to the Manage Cards screen (`dashboard-settings.tsx`).
- No dark-mode support.
- No changes to repositories, services, or tests other than keeping them green.
