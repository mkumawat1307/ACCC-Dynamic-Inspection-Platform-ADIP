//frontend\src\database\seed.ts
import { getDatabase } from "./db";
import { inspectionFields } from "./seeds/inspection-fields.seed";

export async function seedDatabase() {
  const db = await getDatabase();

  // ===========================
  // Seed Districts
  // ===========================
  const districtCount = await db.getFirstAsync<{ Count: number }>(`
    SELECT COUNT(*) AS Count
    FROM Districts;
  `);

  if ((districtCount?.Count ?? 0) === 0) {
    console.log("🌱 Seeding Districts...");

const divisions = [
  {
    division: "Ajmer",
    districts: [
      "Ajmer",
      "Beawar",
      "Bhilwara",
      "Didwana-Kuchaman",
      "Nagaur",
      "Tonk",
    ],
  },
  {
    division: "Bharatpur",
    districts: [
      "Bharatpur",
      "Deeg",
      "Dholpur",
      "Karauli",
      "Sawai Madhopur",
    ],
  },
  {
    division: "Bikaner",
    districts: [
      "Bikaner",
      "Churu",
      "Hanumangarh",
      "Sri Ganganagar",
    ],
  },
  {
    division: "Jaipur",
    districts: [
      "Alwar",
      "Dausa",
      "Jaipur",
      "Jhunjhunu",
      "Khairthal-Tijara",
      "Kotputli-Behror",
      "Sikar",
    ],
  },
  {
    division: "Jodhpur",
    districts: [
      "Balotra",
      "Barmer",
      "Jaisalmer",
      "Jalore",
      "Jodhpur",
      "Pali",
      "Phalodi",
      "Sirohi",
    ],
  },
  {
    division: "Kota",
    districts: [
      "Baran",
      "Bundi",
      "Jhalawar",
      "Kota",
    ],
  },
  {
    division: "Udaipur",
    districts: [
      "Banswara",
      "Chittorgarh",
      "Dungarpur",
      "Pratapgarh",
      "Rajsamand",
      "Salumber",
      "Udaipur",
    ],
  },
];

for (const division of divisions) {

  const result = await db.runAsync(
    `INSERT INTO Divisions (DivisionName) VALUES (?);`,
    [division.division]
  );

  const divisionId = result.lastInsertRowId;

  for (const district of division.districts) {

    await db.runAsync(
      `
      INSERT INTO Districts
      (DivisionID, DistrictName)
      VALUES (?, ?);
      `,
      [divisionId, district]
    );

  }
}

    console.log("✅ Districts seeded.");
  }

// ===========================
// Seed Inspection Templates
// ===========================
const templateCount = await db.getFirstAsync<{ Count: number }>(`
  SELECT COUNT(*) AS Count
  FROM InspectionTemplates;
`);

if ((templateCount?.Count ?? 0) === 0) {

  console.log("🌱 Seeding Inspection Templates...");

  await db.runAsync(
    `
    INSERT INTO InspectionTemplates
    (
      TemplateName,
      Description,
      IsDefault
    )
    VALUES (?, ?, ?)
    `,
    [
      "Pole Inspection",
      "Default inspection template",
      1,
    ]
  );

  console.log("✅ Inspection Template seeded.");
}

  // ===========================
  // Seed Fields (Placeholder)
  // ===========================
  const sectionCount = await db.getFirstAsync<{ Count: number }>(`
    SELECT COUNT(*) AS Count
    FROM InspectionSections;
  `);

  if ((sectionCount?.Count ?? 0) === 0) {
    console.log("🌱 Seeding Inspection Sections...");

    const sections = [
      "General Information",
      "Pole Structure",
      "Junction Box",
      "Earthing",
      "Meter",
      "Connectivity",
      "Camera",
      "Switch",
      "Categorization",
      "Photos",
    ];

    for (let i = 0; i < sections.length; i++) {

      await db.runAsync(
        `
        INSERT INTO InspectionSections
        (
          TemplateID,
          SectionName,
          DisplayOrder
        )
        VALUES (?, ?, ?)
        `,
        [
          1,
          sections[i],
          i + 1,
        ]
      );

    }
  }
// ===========================
// Seed Inspection Fields
// ===========================
const fieldCount = await db.getFirstAsync<{ Count: number }>(`
  SELECT COUNT(*) AS Count
  FROM InspectionFields;
`);

if ((fieldCount?.Count ?? 0) === 0) {
  console.log("🌱 Seeding Inspection Fields...");

  for (const field of inspectionFields) {
    await db.runAsync(
      `
      INSERT INTO InspectionFields (
        SectionID,
        FieldName,
        FieldKey,
        FieldType,
        DisplayOrder,
        IsRequired,
        IsVisible,
        IsActive
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
      `,
      [
        field.SectionID,
        field.FieldName,
        field.FieldKey,
        field.FieldType,
        field.DisplayOrder,
        field.IsRequired,
      ]
    );
  }

  console.log("✅ Inspection Fields seeded.");
} // <-- closes the if block

} // <-- closes seedDatabase()