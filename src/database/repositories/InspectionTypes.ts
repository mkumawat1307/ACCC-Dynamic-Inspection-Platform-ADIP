export interface InspectionSection {
  SectionID: number;
  SectionName: string;
  SectionKey: string;
  DisplayOrder: number;
}

export interface InspectionField {
  FieldID: number;
  SectionID: number;

  FieldName: string;
  FieldKey: string;
  FieldType: string;

  Placeholder: string | null;
  DefaultValue: string | null;
  HelpText: string | null;
  ValidationRule: string | null;

  DisplayOrder: number;

  IsRequired: number;
  IsVisible: number;
  IsActive: number;

  CreatedAt: string;
  UpdatedAt: string;
}
