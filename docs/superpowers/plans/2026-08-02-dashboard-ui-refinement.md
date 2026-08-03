# Dashboard UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Project Dashboard UI — consistent spacing, alignment, and visual grouping via a shared design-tokens module, without changing any data flow.

**Architecture:** Add `src/constants/ui.ts` design tokens (SPACING/COLORS/RADIUS). Refine the dashboard stat cards, grid, and action card to consume tokens with `gap`-based spacing instead of ad-hoc margins; restructure `app/projects/dashboard.tsx` into clean sections (Project Information, full-bleed Statistics, Manage Cards, Quick Actions). No repository, service, or SQLite changes.

**Tech Stack:** React Native, react-native-paper v5, Expo Router, Jest (`jest-expo`, `react-test-renderer`).

## Global Constraints

- **No yarn on PATH — use `npx`:** `npx jest <pattern>`, `npx tsc --noEmit`, `npx expo lint`.
- **TypeScript strict; no `any`.** Do not introduce or keep `as any` — the `DashboardActionCard` icon prop is typed as `keyof typeof MaterialCommunityIcons.glyphMap` and the screen passes valid glyph names.
- **No code comments** unless the surrounding code already has them (preserve existing ones verbatim).
- **UI only:** never touch `src/database/**`, repositories, services, or the smart-card generator. Component props stay stable except `DashboardActionCard` (see Task 4).
- **Keep the tree green after every task:** each task ends with `npx tsc --noEmit` passing and the relevant Jest suites passing.
- **Do NOT commit the pre-existing dirty files:** `docs/02-Architecture.md`, `docs/04-Phases.md`, `docs/06-Memory.md`, `docs/superpowers/specs/2026-08-02-dashboard-auto-refresh-design.md`, `docs/superpowers/specs/2026-08-02-dashboard-cards-breakdown-design.md`, `docs/superpowers/specs/2026-08-02-dashboard-two-group-defaults-design.md`, and the untracked `docs/superpowers/plans/2026-08-02-dashboard-auto-refresh.md`. Only stage the exact files listed in each task plus `docs/07-Changelog.md` in Task 6.
- **Spec:** `docs/superpowers/specs/2026-08-02-dashboard-ui-refinement-design.md` (approved, already committed as `50fa4e7`). All requirements below come from it.
- `DashboardCardGrid.test.tsx` uses a `collectStrings` helper and `TestRenderer` — mirror that style for new component tests.

---

### Task 1: Design tokens module

**Files:**
- Create: `src/constants/ui.ts`
- Test: `src/__tests__/constants/ui.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `import { SPACING, COLORS, RADIUS } from "@/src/constants/ui"` — three `as const` frozen objects with these exact values, used by Tasks 2–5:
  - `SPACING`: `{ xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }`
  - `COLORS`: `{ background: "#F5F5F5", surface: "#FFFFFF", primary: "#0B5ED7", textPrimary: "#333", textSecondary: "#666", textMuted: "#999" }`
  - `RADIUS`: `{ md: 12 }`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/constants/ui.test.ts`:

```ts
import { SPACING, COLORS, RADIUS } from "@/src/constants/ui";

describe("ui design tokens", () => {
  it("defines the spacing scale", () => {
    expect(SPACING).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24 });
  });

  it("defines the color palette", () => {
    expect(COLORS).toEqual({
      background: "#F5F5F5",
      surface: "#FFFFFF",
      primary: "#0B5ED7",
      textPrimary: "#333",
      textSecondary: "#666",
      textMuted: "#999",
    });
  });

  it("defines the corner radius scale", () => {
    expect(RADIUS).toEqual({ md: 12 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/constants/ui.test.ts -v`
Expected: FAIL with "Cannot find module '@/src/constants/ui'".

- [ ] **Step 3: Create the tokens module**

Create `src/constants/ui.ts`:

```ts
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const COLORS = {
  background: "#F5F5F5",
  surface: "#FFFFFF",
  primary: "#0B5ED7",
  textPrimary: "#333",
  textSecondary: "#666",
  textMuted: "#999",
} as const;

export const RADIUS = {
  md: 12,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/constants/ui.test.ts -v`
Expected: PASS (3 tests). Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/constants/ui.ts src/__tests__/constants/ui.test.ts
git commit -m "feat(theme): add design tokens for dashboard UI"
```

---

### Task 2: Refine StatCard and StatBreakdownCard

**Files:**
- Modify: `src/components/StatCard.tsx`
- Modify: `src/components/dashboard/StatBreakdownCard.tsx`
- Test: `src/__tests__/components/dashboard/StatCard.test.tsx`
- Test: `src/__tests__/components/dashboard/StatBreakdownCard.test.tsx`

**Interfaces:**
- Consumes: `SPACING`, `COLORS`, `RADIUS` from Task 1.
- Produces: `StatCard` props unchanged (`{ title: string; value: number | string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color?: string }`); `StatBreakdownCard` props unchanged (`{ title; icon; color?; rows: BreakdownRow[] }`). Task 3 consumes both.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/components/dashboard/StatCard.test.tsx`:

```tsx
import React from "react";
import { StyleSheet } from "react-native";
import TestRenderer from "react-test-renderer";
import { Card } from "react-native-paper";
import StatCard from "@/src/components/StatCard";

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

describe("StatCard", () => {
  it("renders its title and numeric value", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatCard title="Total Poles" value={12} icon="transmission-tower" />
      );
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total Poles");
    expect(strings).toContain("12");
  });

  it("renders a string value as-is", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatCard title="Status" value="Done" icon="check" />
      );
    });
    expect(collectStrings(tree!.toJSON())).toContain("Done");
  });

  it("stretches to fill its row without adding its own margin", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatCard title="Total Poles" value={12} icon="transmission-tower" />
      );
    });
    const card = tree!.root.findByType(Card);
    const style = StyleSheet.flatten(card.props.style);
    expect(style.flex).toBe(1);
    expect(style.margin).toBeUndefined();
  });
});
```

Create `src/__tests__/components/dashboard/StatBreakdownCard.test.tsx`:

```tsx
import React from "react";
import { StyleSheet } from "react-native";
import TestRenderer from "react-test-renderer";
import { Card } from "react-native-paper";
import StatBreakdownCard from "@/src/components/dashboard/StatBreakdownCard";

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

describe("StatBreakdownCard", () => {
  it("renders title and each breakdown row", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Foundation Condition"
          icon="home"
          rows={[
            { label: "Good", count: 42 },
            { label: "Bad", count: 7 },
          ]}
        />
      );
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Foundation Condition");
    expect(strings).toContain("Good");
    expect(strings).toContain("42");
    expect(strings).toContain("Bad");
    expect(strings).toContain("7");
  });

  it("shows a muted empty message when there are no rows", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard title="Foundation Condition" icon="home" rows={[]} />
      );
    });
    expect(collectStrings(tree!.toJSON()).join(" ")).toContain("No data");
  });

  it("renders full width without adding its own margin", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard title="Foundation Condition" icon="home" rows={[]} />
      );
    });
    const card = tree!.root.findByType(Card);
    const style = StyleSheet.flatten(card.props.style);
    expect(style.margin).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/components/dashboard/StatCard.test.tsx src/__tests__/components/dashboard/StatBreakdownCard.test.tsx -v`
Expected: the content tests PASS against current code, but the two style tests FAIL because both cards currently set `margin: 6` (assertion `expect(style.margin).toBeUndefined()` fails).

- [ ] **Step 3: Refine StatCard**

Rewrite `src/components/StatCard.tsx`:

```tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
}

export default function StatCard({
  title,
  value,
  icon,
  color = COLORS.primary,
}: StatCardProps) {
  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name={icon} size={28} color={color} />
        </View>

        <Text variant="headlineMedium" style={styles.value}>
          {value}
        </Text>

        <Text variant="bodyMedium" style={styles.title}>
          {title}
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: RADIUS.md,
  },

  content: {
    alignItems: "center",
  },

  iconContainer: {
    alignItems: "center",
    marginBottom: SPACING.sm,
  },

  value: {
    textAlign: "center",
    fontWeight: "bold",
  },

  title: {
    textAlign: "center",
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
});
```

- [ ] **Step 4: Refine StatBreakdownCard**

Rewrite `src/components/dashboard/StatBreakdownCard.tsx`:

```tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BreakdownRow } from "@/src/database/repositories/DashboardService";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

interface StatBreakdownCardProps {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
  rows: BreakdownRow[];
}

export default function StatBreakdownCard({
  title,
  icon,
  color = COLORS.primary,
  rows,
}: StatBreakdownCardProps) {
  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <MaterialCommunityIcons name={icon} size={24} color={color} />
          <Text variant="titleMedium" style={styles.title}>
            {title}
          </Text>
        </View>
        <View style={styles.divider} />
        {rows.length === 0 ? (
          <Text variant="bodyMedium" style={styles.empty}>
            No data
          </Text>
        ) : (
          rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text variant="bodyMedium" style={styles.rowLabel}>
                {row.label}
              </Text>
              <Text variant="bodyMedium" style={[styles.rowCount, { color }]}>
                {row.count}
              </Text>
            </View>
          ))
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },

  title: {
    marginLeft: SPACING.sm,
    fontWeight: "bold",
    flex: 1,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E0E0E0",
    marginBottom: SPACING.sm,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs,
  },

  rowLabel: {
    color: COLORS.textSecondary,
  },

  rowCount: {
    fontWeight: "bold",
  },

  empty: {
    color: COLORS.textMuted,
    textAlign: "center",
    paddingVertical: SPACING.sm,
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/StatCard.test.tsx src/__tests__/components/dashboard/StatBreakdownCard.test.tsx -v`
Expected: PASS (all 6 tests). Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/StatCard.tsx src/components/dashboard/StatBreakdownCard.tsx src/__tests__/components/dashboard/StatCard.test.tsx src/__tests__/components/dashboard/StatBreakdownCard.test.tsx
git commit -m "style(dashboard): refine StatCard and StatBreakdownCard"
```

---

### Task 3: Clean up the card grid

**Files:**
- Modify: `src/components/dashboard/DashboardCardGrid.tsx`
- Test: `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx` (add one test)

**Interfaces:**
- Consumes: `SPACING`, `COLORS` from Task 1; `StatCard`/`StatBreakdownCard` from Task 2.
- Produces: `DashboardCardGrid` props unchanged (`{ projectId: number; reloadKey?: number; focused?: boolean }`). Spacing moves from per-card margins to container `gap`; section headers get a consistent style; the empty-state hint renders real curly quotes.

- [ ] **Step 1: Write the failing test**

Add this test to `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx` (after the existing "shows the empty state when no cards are configured" test):

```tsx
  it("shows the Manage Cards hint with real curly quotes", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings.join(" ")).toContain("Use \u201CManage Cards\u201D to add statistic cards.");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx -v`
Expected: the new test FAILS — the current empty hint renders the literal text `\u201CManage Cards\u201D` (JSX text does not interpret `\u` escapes), so `\u201C` does not match the curly quote character.

- [ ] **Step 3: Refine DashboardCardGrid**

Edit `src/components/dashboard/DashboardCardGrid.tsx`:

1. Add the tokens import (next to the existing imports):

```tsx
import { COLORS, SPACING } from "@/src/constants/ui";
```

2. Replace the empty-state hint text so it uses real curly quotes (characters, not escapes):

```tsx
        <Text style={styles.emptyHint}>Use “Manage Cards” to add statistic cards.</Text>
```

3. Replace the root `<View>{rows}</View>` with a gap-based list container:

```tsx
  return <View style={styles.list}>{rows}</View>;
```

4. Replace the styles block with:

```tsx
const styles = StyleSheet.create({
  list: {
    gap: SPACING.md,
  },

  statRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },

  sectionHeader: {
    fontWeight: "700",
    fontSize: 15,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    color: COLORS.textPrimary,
  },

  centered: {
    alignItems: "center",
    paddingVertical: SPACING.lg,
  },

  emptyTitle: {
    fontWeight: "700",
    marginBottom: SPACING.xs,
    color: COLORS.textPrimary,
  },

  emptyHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx -v`
Expected: PASS — the full grid suite (existing 12 tests + the new one). Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DashboardCardGrid.tsx src/__tests__/components/dashboard/DashboardCardGrid.test.tsx
git commit -m "style(dashboard): clean up card grid spacing, headers, and empty-state quotes"
```

---

### Task 4: Simplify the action card to the compact variant

**Files:**
- Modify: `src/components/dashboard/DashboardActionCard.tsx`
- Modify: `app/projects/dashboard.tsx` (remove the five `compact` props — full restructure happens in Task 5)
- Test: `src/__tests__/components/dashboard/DashboardActionCard.test.tsx`

**Interfaces:**
- Consumes: `COLORS`, `RADIUS`, `SPACING` from Task 1.
- Produces: `DashboardActionCard` props become `{ title: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }` — the `compact?` prop is REMOVED. Task 5 consumes this new signature.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/dashboard/DashboardActionCard.test.tsx`:

```tsx
import React from "react";
import TestRenderer from "react-test-renderer";
import { Card } from "react-native-paper";
import DashboardActionCard from "@/src/components/dashboard/DashboardActionCard";

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

describe("DashboardActionCard", () => {
  it("renders title and subtitle and fires onPress", () => {
    const onPress = jest.fn();
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <DashboardActionCard
          title="New Inspection"
          subtitle="Start a pole inspection"
          icon="clipboard-plus"
          onPress={onPress}
        />
      );
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("New Inspection");
    expect(strings).toContain("Start a pole inspection");
    const card = tree!.root.findByType(Card);
    TestRenderer.act(() => {
      card.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify the current behavior**

Run: `npx jest src/__tests__/components/dashboard/DashboardActionCard.test.tsx -v`
Expected: PASS against current code (the non-compact branch also renders title + subtitle and forwards onPress). This test guards the refactor.

- [ ] **Step 3: Remove the `compact` prop from the screen**

Edit `app/projects/dashboard.tsx` and delete the `compact` line from each of the five `DashboardActionCard` usages (Manage Cards at ~line 149, New Inspection ~169, Inspection List ~186, Settings ~204, Reports ~213). Leave everything else in that file untouched for now.

- [ ] **Step 4: Rewrite DashboardActionCard**

Rewrite `src/components/dashboard/DashboardActionCard.tsx`:

```tsx
import React from "react";
import { StyleSheet } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

interface Props {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}

export default function DashboardActionCard({
  title,
  subtitle,
  icon,
  onPress,
}: Props) {
  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content style={styles.content}>
        <MaterialCommunityIcons name={icon} size={28} color={COLORS.primary} />
        <Text variant="titleSmall" style={styles.title}>
          {title}
        </Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          {subtitle}
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
  },

  content: {
    paddingVertical: SPACING.lg,
    alignItems: "center",
  },

  title: {
    marginTop: SPACING.sm,
    fontWeight: "700",
    textAlign: "center",
  },

  subtitle: {
    marginTop: SPACING.xs,
    textAlign: "center",
    color: COLORS.textSecondary,
    fontSize: 11,
  },
});
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx jest src/__tests__/components/dashboard/DashboardActionCard.test.tsx -v`
Expected: PASS. Then `npx tsc --noEmit` — exit 0 (would FAIL if any `compact` usage remained, since the prop no longer exists).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/DashboardActionCard.tsx app/projects/dashboard.tsx src/__tests__/components/dashboard/DashboardActionCard.test.tsx
git commit -m "style(dashboard): simplify action card to compact variant"
```

---

### Task 5: Restructure the project dashboard screen

**Files:**
- Modify: `app/projects/dashboard.tsx` (full rewrite of layout + styles; keeps the same `loadProject` logic)

**Interfaces:**
- Consumes: `DashboardCardGrid` (Task 3), `DashboardActionCard` (Task 4), `SPACING`/`COLORS`/`RADIUS` (Task 1), `MaterialCommunityIcons`.
- Produces: the screen with sections in order — Project Information card (aligned label/value grid), "Statistics" section header + `DashboardCardGrid`, "Manage Cards" full-width action card, "Quick Actions" section header + 2×2 action grid. No exported interface.

**Verification note:** `app/` screens are not included in `collectCoverageFrom` (`src/**/*.{ts,tsx}`), and the repo has no app-screen render tests (they would require mocking expo-router/navigation/context). This task is verified by the full Jest suite, `npx tsc --noEmit`, and `npx expo lint` on the file — the layout change carries no behavior change.

- [ ] **Step 1: Rewrite the screen**

Rewrite `app/projects/dashboard.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { Card, Text, ActivityIndicator, Appbar } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Project } from "@/src/models/Project";
import { useInspection } from "@/src/context/InspectionContext";
import DashboardActionCard from "@/src/components/dashboard/DashboardActionCard";
import DashboardCardGrid from "@/src/components/dashboard/DashboardCardGrid";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

export default function ProjectDashboard() {
  const { projectId, projectData: projectDataJson } = useLocalSearchParams<{
    projectId: string;
    projectData?: string;
  }>();
  const router = useRouter();
  const { project: contextProject } = useInspection();
  const [statReloadKey, setStatReloadKey] = useState(0);
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    loadProject();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      setStatReloadKey((k) => k + 1);
    }, [])
  );

  async function loadProject() {
    if (!projectId) return;

    if (projectDataJson) {
      try {
        const parsed = JSON.parse(projectDataJson) as Project;
        setProject(parsed);
        setLoading(false);
        return;
      } catch {
        // fall through
      }
    }

    if (contextProject && contextProject.ProjectID === Number(projectId)) {
      setProject(contextProject);
      setLoading(false);
      return;
    }

    setProject(null);
    setLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text>Project not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Project Dashboard" />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.card}>
          <Card.Title
            title="Project Information"
            titleVariant="titleMedium"
            left={() => (
              <MaterialCommunityIcons
                name="information-outline"
                size={22}
                color={COLORS.primary}
              />
            )}
          />
          <Card.Content>
            <View style={styles.infoGrid}>
              <InfoField label="Division" value={project.DivisionName || "-"} />
              <InfoField label="District" value={project.DistrictName || "-"} />
              <InfoField label="Inspector" value={project.InspectorName || "-"} />
              <InfoField label="Client" value={project.Client || "-"} />
            </View>
            <InfoField label="Description" value={project.Description || "-"} full />
          </Card.Content>
        </Card>

        <Text style={styles.sectionHeader}>Statistics</Text>
        <DashboardCardGrid
          projectId={project.ProjectID}
          reloadKey={statReloadKey}
          focused={isFocused}
        />

        <View style={styles.manageCard}>
          <DashboardActionCard
            title="Manage Cards"
            subtitle="Add, edit, reorder or disable dashboard cards"
            icon="tune-variant"
            onPress={() =>
              router.push({
                pathname: "/projects/dashboard-settings",
                params: {
                  projectId: project.ProjectID.toString(),
                },
              })
            }
          />
        </View>

        <Text style={styles.sectionHeader}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          <View style={styles.actionRow}>
            <View style={styles.actionHalf}>
              <DashboardActionCard
                title="New Inspection"
                subtitle="Start a new pole inspection"
                icon="clipboard-plus"
                onPress={() =>
                  router.push({
                    pathname: "/inspection/new",
                    params: {
                      projectId: project.ProjectID.toString(),
                      projectData: JSON.stringify(project),
                    },
                  })
                }
              />
            </View>
            <View style={styles.actionHalf}>
              <DashboardActionCard
                title="Inspection List"
                subtitle="View completed and draft inspections"
                icon="clipboard-list"
                onPress={() =>
                  router.push({
                    pathname: "/inspection",
                    params: {
                      projectId: project.ProjectID.toString(),
                    },
                  })
                }
              />
            </View>
          </View>
          <View style={styles.actionRow}>
            <View style={styles.actionHalf}>
              <DashboardActionCard
                title="Settings"
                subtitle="Templates, Sections and Fields"
                icon="cog"
                onPress={() => router.push("/settings")}
              />
            </View>
            <View style={styles.actionHalf}>
              <DashboardActionCard
                title="Reports"
                subtitle="Generate inspection reports"
                icon="file-chart"
                onPress={() =>
                  router.push({
                    pathname: "/reports",
                    params: {
                      projectId: project.ProjectID.toString(),
                      projectName: project.ProjectName,
                    },
                  })
                }
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoField({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <View style={full ? styles.infoFull : styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },

  card: {
    marginBottom: SPACING.xl,
    borderRadius: RADIUS.md,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  infoField: {
    width: "50%",
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },

  infoFull: {
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },

  infoLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },

  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },

  sectionHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },

  manageCard: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
  },

  actionGrid: {
    marginBottom: SPACING.lg,
  },

  actionRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },

  actionHalf: {
    flex: 1,
  },
});
```

- [ ] **Step 2: Verify the tree stays green**

Run: `npx jest src/__tests__/components/dashboard -v`
Expected: PASS (all dashboard component suites, including the untouched `DashboardCardManager.test.tsx`).

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx expo lint`
Expected: 0 errors (pre-existing warnings are acceptable).

- [ ] **Step 3: Commit**

```bash
git add app/projects/dashboard.tsx
git commit -m "style(dashboard): restructure project dashboard screen layout"
```

---

### Task 6: Whole-branch verification and changelog

**Files:**
- Modify: `docs/07-Changelog.md`

- [ ] **Step 1: Add the changelog entry**

In `docs/07-Changelog.md`, under `[Unreleased]` → `### Changed`, add this bullet (after the Smart Dashboard CardMode bullets, before `### Fixed`):

```markdown
- Project Dashboard UI refinement: consistent spacing, alignment, and grouping across the dashboard screen and its stat/action components via new design tokens (`src/constants/ui.ts`). Project Information is a compact aligned label/value grid, Statistics renders full-bleed with grouped stat cards, action tiles share one style, and the card-grid empty state no longer shows a literal `\u201C` escape.
```

- [ ] **Step 2: Run the full verification**

Run: `npx jest`
Expected: PASS — all 35 suites, including the new `ui.test.ts`, `StatCard.test.tsx`, `StatBreakdownCard.test.tsx`, `DashboardActionCard.test.tsx`, and the updated `DashboardCardGrid.test.tsx`.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx expo lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add docs/07-Changelog.md
git commit -m "docs: changelog for dashboard UI refinement"
```

---

## Self-Review

**Spec coverage:**
- Design tokens module (spec §1) → Task 1.
- Screen layout restructure: Project Information grid, full-bleed Statistics, Manage Cards, Quick Actions, indentation fix (spec §2) → Task 5.
- StatCard + StatBreakdownCard spacing/divider/radius (spec §3) → Task 2.
- Grid gap spacing, section headers, empty-state quotes (spec §4) → Task 3.
- Action card compact-only simplification (spec §5) → Task 4.
- Tests & verification: jest + tsc + lint per task, full suite in Task 6 (spec §6) → all tasks.

**Placeholder scan:** every step contains concrete code or an exact command; no TBD/TODO.

**Type consistency:** `SPACING`/`COLORS`/`RADIUS` are defined in Task 1 with the exact values used in Tasks 2–5. `DashboardActionCard` drops `compact` in Task 4 and the screen stops passing it in the same task (tsc gate); Task 5 consumes the new signature. `StatCard`/`StatBreakdownCard`/`DashboardCardGrid` props are unchanged throughout.
