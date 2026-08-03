import { getDatabase } from "../db";
import { CardModeValue, DashboardCard } from "@/src/models/DashboardCard";
import { DashboardCardRepository } from "./DashboardCardRepository";
import { SECTION_LABEL_TODAY, SECTION_LABEL_TOTAL } from "../seeds/dashboard-cards.seed";

export interface SmartFormField {
  FieldID: number;
  FieldKey: string;
  FieldName: string;
  FieldType: string;
  Options: { label: string; value: string }[];
  source?: "inspection" | "device";
  DeviceType?: string;
  DeviceColumn?: string;
}

export type SmartCardKind = CardModeValue | "skip";

export interface SmartCardSpec {
  kind: SmartCardKind;
  fieldKey: string;
  fieldName: string;
  title: string;
  icon: string;
  color: string;
}

const TYPE_TO_MODE: Record<string, CardModeValue | "skip"> = {
  dropdown: "dropdown",
  switch: "dropdown",
  checkbox: "dropdown",
  number: "sum",
  text: "fieldcount",
  multiline: "fieldcount",
  date: "datebreakdown",
  date_auto: "datebreakdown",
  gps: "skip",
  device: "skip",
  camera: "skip",
  calculation: "skip",
};

function normalizeType(fieldType: string): string {
  return fieldType.toLowerCase();
}

function iconForType(type: string): string {
  switch (type) {
    case "number":
      return "counter";
    case "dropdown":
      return "chevron-down-circle";
    case "switch":
      return "toggle-switch";
    case "checkbox":
      return "checkbox-marked-outline";
    case "date":
    case "date_auto":
      return "calendar";
    case "time":
      return "clock-outline";
    case "text":
      return "format";
    case "multiline":
      return "format-align-left";
    default:
      return "chart-box-outline";
  }
}

function colorForType(type: string): string {
  switch (type) {
    case "number":
      return "#198754";
    case "switch":
    case "checkbox":
      return "#FD7E14";
    case "date":
    case "date_auto":
      return "#0D6EFD";
    case "time":
      return "#0B5ED7";
    case "text":
      return "#20C997";
    case "multiline":
      return "#6C757D";
    case "dropdown":
      return "#6F42C1";
    default:
      return "#0B5ED7";
  }
}

export class SmartCardGenerator {
  static async getFormFields(): Promise<SmartFormField[]> {
    const db = await getDatabase();

    const rows = await db.getAllAsync<{
      FieldID: number;
      FieldKey: string;
      FieldName: string;
      FieldType: string;
    }>(
      `SELECT f.FieldKey, f.FieldName, f.FieldType, f.FieldID
       FROM InspectionFields f
       INNER JOIN InspectionSections s ON f.SectionID = s.SectionID
       INNER JOIN InspectionTemplates t ON s.TemplateID = t.TemplateID
       WHERE t.IsDefault = 1
         AND s.IsActive = 1
         AND f.IsActive = 1
         AND f.IsVisible = 1
         AND f.FieldKey != 'remarks'
       ORDER BY s.DisplayOrder ASC, f.DisplayOrder ASC;`
    );

    const result: SmartFormField[] = [];
    for (const row of rows) {
      const options = await db.getAllAsync<{ OptionLabel: string; OptionValue: string }>(
        `SELECT OptionLabel, OptionValue
         FROM FieldOptions
         WHERE FieldID = ? AND IsActive = 1
         ORDER BY DisplayOrder;`,
        [row.FieldID]
      );
      const type = normalizeType(row.FieldType);
      result.push({
        FieldID: row.FieldID,
        FieldKey: row.FieldKey,
        FieldName: row.FieldName,
        FieldType: type,
        Options: options.map((o) => ({ label: o.OptionLabel, value: o.OptionValue })),
        source: "inspection",
      });
    }
    return result;
  }

  static async getDeviceFields(): Promise<SmartFormField[]> {
    const db = await getDatabase();

    const rows = await db.getAllAsync<{
      FieldDefID: number;
      DeviceType: string;
      FieldName: string;
      Label: string;
      FieldType: string;
    }>(
      `SELECT FieldDefID, DeviceType, FieldName, Label, FieldType
       FROM DeviceFieldDefinitions
       WHERE DeviceType IN ('Camera', 'Switch')
         AND FieldType IN ('dropdown', 'switch', 'checkbox')
         AND IsActive = 1
       ORDER BY DeviceType, DisplayOrder`
    );

    return rows.map((row) => ({
      FieldID: row.FieldDefID,
      FieldKey: `dev_${row.DeviceType}_${row.FieldName}`,
      FieldName: row.Label,
      FieldType: normalizeType(row.FieldType),
      Options: [],
      source: "device" as const,
      DeviceType: row.DeviceType,
      DeviceColumn: row.FieldName,
    }));
  }

  static getCardKind(fieldType: string): SmartCardKind {
    const mode = TYPE_TO_MODE[normalizeType(fieldType)];
    if (mode === undefined || mode === "entitycount") return "skip";
    return mode;
  }

  static getSpec(field: SmartFormField): SmartCardSpec {
    const kind = this.getCardKind(field.FieldType);
    const type = field.FieldType;
    return {
      kind,
      fieldKey: field.FieldKey,
      fieldName: field.FieldName,
      title: field.FieldName,
      icon: iconForType(type),
      color: colorForType(type),
    };
  }

  static generateCardsForField(
    field: SmartFormField,
    projectId: number,
    baseSortOrder: number = 0
  ): DashboardCard[] {
    const kind = this.getCardKind(field.FieldType);
    if (kind === "skip") return [];
    if (field.FieldKey === "remarks") return [];
    const isSum = kind === "sum";
    const isDevice = field.source === "device";
    const entityType = isDevice ? "devices" : "inspections";
    const targetField = isDevice ? field.DeviceColumn! : field.FieldKey;
    const keyBase = isDevice
      ? `smart_dev_${field.DeviceType}_${field.DeviceColumn}`
      : `smart_${field.FieldKey}`;
    const spec = this.getSpec(field);

    const totalCard: DashboardCard = {
      ProjectID: projectId,
      CardKey: `${keyBase}_total`,
      Title: field.FieldName,
      Icon: spec.icon,
      Color: spec.color,
      EntityType: entityType,
      DeviceType: isDevice ? field.DeviceType : null,
      CounterType: "total",
      FilterJson: null,
      CountMode: "count",
      DistinctColumn: null,
      CardMode: kind,
      BreakdownField: isSum ? null : targetField,
      AggregateField: isSum ? targetField : null,
      SectionLabel: SECTION_LABEL_TOTAL,
      SortOrder: baseSortOrder,
      Enabled: 1,
      IsDefault: 0,
    };

    const todayCard: DashboardCard = {
      ...totalCard,
      CardKey: `${keyBase}_today`,
      CounterType: "today",
      SectionLabel: SECTION_LABEL_TODAY,
      SortOrder: baseSortOrder + 1,
    };

    return [totalCard, todayCard];
  }

  static async getAvailableFields(projectId: number): Promise<SmartFormField[]> {
    const allFields = await this.getAllFields();
    const existingCards = await DashboardCardRepository.getAllCards(projectId);
    const existingKeys = new Set(existingCards.map((c) => c.CardKey));

    return allFields.filter((field) => {
      if (this.getCardKind(field.FieldType) === "skip") return false;
      const keyBase =
        field.source === "device"
          ? `smart_dev_${field.DeviceType}_${field.DeviceColumn}`
          : `smart_${field.FieldKey}`;
      const hasTotal = existingKeys.has(`${keyBase}_total`);
      const hasToday = existingKeys.has(`${keyBase}_today`);
      return !(hasTotal || hasToday);
    });
  }

  static async getNextSortOrder(projectId: number): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ max: number }>(
      `SELECT MAX(SortOrder) AS max FROM DashboardCards WHERE ProjectID = ?`,
      [projectId]
    );
    return (row?.max ?? -1) + 1;
  }

  static async addSmartCardsForField(
    projectId: number,
    fieldKey: string
  ): Promise<number[]> {
    const fields = await this.getAllFields();
    const field = fields.find((f) => f.FieldKey === fieldKey);
    if (!field) return [];

    const baseSortOrder = await this.getNextSortOrder(projectId);
    const cards = this.generateCardsForField(field, projectId, baseSortOrder);

    const existingCards = await DashboardCardRepository.getAllCards(projectId);
    const existingKeys = new Set(existingCards.map((c) => c.CardKey));

    const createdIds: number[] = [];
    for (const card of cards) {
      if (existingKeys.has(card.CardKey)) continue;
      const id = await DashboardCardRepository.createCard(card);
      createdIds.push(id);
    }
    await DashboardCardRepository.normalizeSections(projectId);
    return createdIds;
  }

  private static async getAllFields(): Promise<SmartFormField[]> {
    const inspectionFields = await this.getFormFields();
    const deviceFields = await this.getDeviceFields();
    return [...inspectionFields, ...deviceFields];
  }
}
