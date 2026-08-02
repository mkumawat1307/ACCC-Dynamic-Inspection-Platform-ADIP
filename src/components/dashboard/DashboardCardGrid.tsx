import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { ActivityIndicator } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { DashboardService, CardWithCount } from "@/src/database/repositories/DashboardService";
import StatCard from "@/src/components/StatCard";
import StatBreakdownCard from "@/src/components/dashboard/StatBreakdownCard";

interface Props {
  projectId: number;
  reloadKey?: number;
}

export default function DashboardCardGrid({ projectId, reloadKey = 0 }: Props) {
  const [cards, setCards] = useState<CardWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const loaded = await DashboardService.getEnabledCardsWithCounts(projectId);
    setCards(loaded);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId, reloadKey]);

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
        <Text style={styles.emptyHint}>Use \u201CManage Cards\u201D to add statistic cards.</Text>
      </View>
    );
  }

  const rows = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    if (card.BreakdownField) {
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
    if (next && !next.BreakdownField) {
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

  return <View>{rows}</View>;
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  centered: {
    alignItems: "center",
    paddingVertical: 16,
  },

  emptyTitle: {
    fontWeight: "700",
    marginBottom: 4,
  },

  emptyHint: {
    color: "#666",
    fontSize: 12,
  },
});
