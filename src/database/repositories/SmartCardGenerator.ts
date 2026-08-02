import { getDatabase } from "../db";
import { DashboardCard } from "@/src/models/DashboardCard";
import { DashboardCardRepository } from "./DashboardCardRepository";

export interface SmartFormField {
  FieldID: number;
  FieldKey: string;
  FieldName: string;
  FieldType: string;
  Options: { label: string; value: string }[];
}

export type SmartCardKind = "breakdown" | "aggregate" | "count" | "skip";

export interface SmartCardSpec {
  kind: SmartCardKind;
  fieldKey: string;
  fieldName: string;
  title: string;
  icon: string;
  color: string;
}

const BREAKDOWN_TYPES = new Set([
  "dropdown",
  "switch",
  "checkbox",
  "text",
  "multiline",
  "date",
  "date_auto",
  "time",
]);

const AGGREGATE_TYPES = new Set(["number"]);

const SKIP_TYPES = new Set(["gps", "device", "camera", "calculation"]);

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
      });
    }
    return result;
  }

  static getCardKind(fieldType: string): SmartCardKind {
    const type = normalizeType(fieldType);
    if (AGGREGATE_TYPES.has(type)) return "aggregate";
    if (BREAKDOWN_TYPES.has(type)) return "breakdown";
    if (SKIP_TYPES.has(type)) return "skip";
    return "skip";
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
    const spec = this.getSpec(field);
    if (spec.kind === "skip") return [];

    const isAggregate = spec.kind === "aggregate";

    const totalCard: DashboardCard = {
      ProjectID: projectId,
      CardKey: `smart_${spec.fieldKey}_total`,
      Title: spec.fieldName,
      Icon: spec.icon,
      Color: spec.color,
      EntityType: "inspections",
      CounterType: "total",
      FilterJson: null,
      CountMode: "count",
      DistinctColumn: null,
      BreakdownField: spec.kind === "breakdown" ? spec.fieldKey : null,
      SectionLabel: "Total",
      AggregateField: isAggregate ? spec.fieldKey : null,
      SortOrder: baseSortOrder,
      Enabled: 1,
      IsDefault: 0,
    };

    const todayCard: DashboardCard = {
      ...totalCard,
      CardKey: `smart_${spec.fieldKey}_today`,
      CounterType: "today",
      SectionLabel: "Today's",
      SortOrder: baseSortOrder + 1,
    };

    return [totalCard, todayCard];
  }

  static async getAvailableFields(projectId: number): Promise<SmartFormField[]> {
    const allFields = await this.getFormFields();
    const existingCards = await DashboardCardRepository.getAllCards(projectId);
    const existingKeys = new Set(existingCards.map((c) => c.CardKey));

    return allFields.filter((field) => {
      if (this.getCardKind(field.FieldType) === "skip") return false;
      const hasTotal = existingKeys.has(`smart_${field.FieldKey}_total`);
      const hasToday = existingKeys.has(`smart_${field.FieldKey}_today`);
      return !(hasTotal && hasToday);
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
    const fields = await this.getFormFields();
    const field = fields.find((f) => f.FieldKey === fieldKey);
    if (!field) return [];

    const baseSortOrder = await this.getNextSortOrder(projectId);
    const cards = this.generateCardsForField(field, projectId, baseSortOrder);

    const createdIds: number[] = [];
    for (const card of cards) {
      const id = await DashboardCardRepository.createCard(card);
      createdIds.push(id);
    }
    return createdIds;
  }
}
