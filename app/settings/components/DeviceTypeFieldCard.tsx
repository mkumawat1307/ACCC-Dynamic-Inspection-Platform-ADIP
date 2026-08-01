import React from "react";
import { View } from "react-native";
import { Card, Text, IconButton, Button } from "react-native-paper";
import { DeviceFieldDefinition } from "../../../src/database/repositories/DeviceFieldDefinitionsRepository";

interface Props {
  item: DeviceFieldDefinition;
  index: number;
  fields: DeviceFieldDefinition[];
  onEdit: (field: DeviceFieldDefinition) => void;
  onDelete: (field: DeviceFieldDefinition) => void;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
  onNavigateOptions: (deviceType: string, fieldName: string) => void;
  cardStyle?: any;
  cardRowStyle?: any;
  cardInfoStyle?: any;
  subtitleStyle?: any;
  actionsStyle?: any;
}

function DeviceTypeFieldCard({
  item,
  index,
  fields,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onNavigateOptions,
  cardStyle,
  cardRowStyle,
  cardInfoStyle,
  subtitleStyle,
  actionsStyle,
}: Props) {
  return (
    <Card style={cardStyle}>
      <Card.Content>
        <View style={cardRowStyle}>
          <View style={cardInfoStyle}>
            <Text variant="titleMedium">{item.Label}</Text>
            <Text variant="bodySmall" style={subtitleStyle}>
              {item.FieldType}{item.IsRequired ? " \u2022 Required" : ""}
            </Text>
          </View>
          <View style={actionsStyle}>
            {item.FieldType === "dropdown" && (
              <Button
                mode="outlined"
                compact
                icon="format-list-bulleted"
                style={{ marginRight: 4 }}
                onPress={() => onNavigateOptions(item.DeviceType, item.FieldName)}
              >
                Options
              </Button>
            )}
            <IconButton icon="pencil" size={20} onPress={() => onEdit(item)} />
            <IconButton icon="delete" size={20} iconColor="#D32F2F" onPress={() => onDelete(item)} />
            <IconButton
              icon="chevron-up"
              size={20}
              disabled={index === 0}
              onPress={() => onMoveUp(item.FieldDefID!)}
            />
            <IconButton
              icon="chevron-down"
              size={20}
              disabled={index === fields.length - 1}
              onPress={() => onMoveDown(item.FieldDefID!)}
            />
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

export default React.memo(DeviceTypeFieldCard);
