import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { ActivityIndicator } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { DashboardService, CardWithCount } from "@/src/database/repositories/DashboardService";
import StatCard from "@/src/components/StatCard";

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
  for (let i = 0; i < cards.length; i += 2) {
    rows.push(
      <View key={i} style={styles.statRow}>
        <StatCard
          title={cards[i].Title}
          value={cards[i].count}
          icon={cards[i].Icon as keyof typeof MaterialCommunityIcons.glyphMap}
          color={cards[i].Color}
        />
        {cards[i + 1] ? (
          <StatCard
            title={cards[i + 1].Title}
            value={cards[i + 1].count}
            icon={cards[i + 1].Icon as keyof typeof MaterialCommunityIcons.glyphMap}
            color={cards[i + 1].Color}
          />
        ) : null}
      </View>
    );
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
