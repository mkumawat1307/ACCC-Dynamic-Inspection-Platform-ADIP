import { StyleSheet } from "react-native";
import { Card, Text } from "react-native-paper";

interface Props {
  poleId: string;
  district: string;
  date: string;
}

export default function RecentInspectionCard({
  poleId,
  district,
  date,
}: Props) {
  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium">{poleId}</Text>

        <Text variant="bodyMedium">
          {district}
        </Text>

        <Text variant="bodySmall">
          {date}
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
  },
});