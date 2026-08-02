export type CardModeValue = "entitycount" | "dropdown" | "sum" | "fieldcount" | "datebreakdown";

export interface DashboardCard {
  CardID?: number;
  ProjectID: number;
  CardKey: string;
  Title: string;
  Icon: string;
  Color: string;
  EntityType: string;
  CounterType: string;
  FilterJson?: string | null;
  CountMode: "count" | "distinct";
  CardMode: CardModeValue;
  DistinctColumn?: string | null;
  BreakdownField?: string | null;
  SectionLabel?: string | null;
  AggregateField?: string | null;
  SortOrder: number;
  Enabled: number;
  IsDefault: number;
  CreatedAt?: string;
  UpdatedAt?: string;
}
