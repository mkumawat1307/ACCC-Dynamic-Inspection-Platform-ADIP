//frontend\src\database\seeds\inspection-fields.seed.ts
export interface InspectionFieldSeed {
  SectionID: number;
  FieldName: string;
  FieldKey: string;
  FieldType: string;
  DisplayOrder: number;
  IsRequired: number;
}

export const inspectionFields: InspectionFieldSeed[] = [
  // ===========================
  // General Information
  // SectionID = 1
  // ===========================

  {
    SectionID: 1,
    FieldName: "Inspection Date",
    FieldKey: "InspectionDate",
    FieldType: "TEXT",
    DisplayOrder: 1,
    IsRequired: 1,
  },
  {
    SectionID: 1,
    FieldName: "Division",
    FieldKey: "Division",
    FieldType: "TEXT",
    DisplayOrder: 2,
    IsRequired: 1,
  },
  {
    SectionID: 1,
    FieldName: "District",
    FieldKey: "District",
    FieldType: "TEXT",
    DisplayOrder: 3,
    IsRequired: 1,
  },
  {
    SectionID: 1,
    FieldName: "Block",
    FieldKey: "Block",
    FieldType: "TEXT",
    DisplayOrder: 4,
    IsRequired: 0,
  },
  {
    SectionID: 1,
    FieldName: "Pole ID",
    FieldKey: "PoleID",
    FieldType: "TEXT",
    DisplayOrder: 5,
    IsRequired: 1,
  },
  {
    SectionID: 1,
    FieldName: "Location Address",
    FieldKey: "LocationAddress",
    FieldType: "TEXT",
    DisplayOrder: 6,
    IsRequired: 0,
  },
  {
    SectionID: 1,
    FieldName: "Latitude",
    FieldKey: "Latitude",
    FieldType: "TEXT",
    DisplayOrder: 7,
    IsRequired: 1,
  },
  {
    SectionID: 1,
    FieldName: "Longitude",
    FieldKey: "Longitude",
    FieldType: "TEXT",
    DisplayOrder: 8,
    IsRequired: 1,
  },
];