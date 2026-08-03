import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import { ActivityIndicator } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { DashboardService, CardWithCount } from "@/src/database/repositories/DashboardService";
import StatCard from "@/src/components/StatCard";
import StatBreakdownCard from "@/src/components/dashboard/StatBreakdownCard";
import useDashboardAutoRefresh from "@/src/hooks/useDashboardAutoRefresh";
import useSectionCollapse from "@/src/hooks/useSectionCollapse";
import { SECTION_LABEL_TODAY, SECTION_LABEL_TOTAL } from "@/src/database/seeds/dashboard-cards.seed";
import { COLORS, SPACING } from "@/src/constants/ui";

interface Props {
  projectId: number;
  reloadKey?: number;
  focused?: boolean;
}

const isBreakdown = (c: CardWithCount) =>
  c.CardMode === "dropdown" || c.CardMode === "datebreakdown";

export default function DashboardCardGrid({ projectId, reloadKey = 0, focused = true }: Props) {
  const [cards, setCards] = useState<CardWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const autoKey = useDashboardAutoRefresh(projectId, focused);
  const { isCollapsed, toggle } = useSectionCollapse(projectId);

  async function load() {
    setLoading(true);
    const loaded = await DashboardService.getEnabledCardsWithCounts(projectId);
    setCards(loaded);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId, reloadKey, autoKey]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No dashboard cards configured.</Text>
        <Text style={styles.emptyHint}>Use “Manage Cards” to add statistic cards.</Text>
      </View>
    );
  }

  const rows = [];
  let currentSection: string | null = null;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const section = card.SectionLabel ?? null;

    if (section !== currentSection) {
      currentSection = section;
      if (section) {
        const collapsible = section === SECTION_LABEL_TOTAL || section === SECTION_LABEL_TODAY;
        const collapsed = collapsible && isCollapsed(section);
        rows.push(
          <View key={`section-${section}-${i}`} style={styles.sectionBlock}>
            <Pressable
              style={styles.sectionHeaderButton}
              onPress={() => toggle(section)}
              disabled={!collapsible}
            >
              <Text style={styles.sectionHeader}>{section}</Text>
              {collapsible ? (
                <MaterialCommunityIcons
                  name={collapsed ? "chevron-down" : "chevron-up"}
                  size={20}
                  color={COLORS.textSecondary}
                />
              ) : null}
            </Pressable>
            <View style={styles.sectionDivider} />
          </View>
        );
        if (collapsed) {
          while (i + 1 < cards.length && (cards[i + 1].SectionLabel ?? null) === section) {
            i++;
          }
          continue;
        }
      }
    }

    if (isBreakdown(card)) {
      rows.push(
        <StatBreakdownCard
          key={card.CardID}
          title={card.Title}
          icon={card.Icon as keyof typeof MaterialCommunityIcons.glyphMap}
          color={card.Color}
          rows={card.breakdown ?? []}
        />
      );
      continue;
    }

    const next = cards[i + 1];
    if (next && !isBreakdown(next) && (next.SectionLabel ?? null) === section) {
      rows.push(
        <View key={`${card.CardID}-${next.CardID}`} style={styles.statRow}>
          <StatCard
            title={card.Title}
            value={card.count ?? 0}
            icon={card.Icon as keyof typeof MaterialCommunityIcons.glyphMap}
            color={card.Color}
          />
          <StatCard
            title={next.Title}
            value={next.count ?? 0}
            icon={next.Icon as keyof typeof MaterialCommunityIcons.glyphMap}
            color={next.Color}
          />
        </View>
      );
      i++;
    } else {
      rows.push(
        <View key={card.CardID} style={styles.statRow}>
          <StatCard
            title={card.Title}
            value={card.count ?? 0}
            icon={card.Icon as keyof typeof MaterialCommunityIcons.glyphMap}
            color={card.Color}
          />
        </View>
      );
    }
  }

  return <View style={styles.list}>{rows}</View>;
}

const styles = StyleSheet.create({
  list: {
    gap: SPACING.md,
  },

  statRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },

  sectionBlock: {
    marginTop: SPACING.lg,
  },

  sectionHeaderButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },

  sectionHeader: {
    fontWeight: "700",
    fontSize: 15,
    color: COLORS.textPrimary,
    textTransform: "uppercase",
  },

  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E0E0E0",
    marginBottom: SPACING.sm,
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
