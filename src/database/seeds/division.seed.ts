// src/database/seeds/division.seed.ts

import { getGlobalDatabase } from "../db";

export async function seedDivisions() {
    console.log("🌱 [division.seed] seedDivisions() — START");

    const db = await getGlobalDatabase();
    console.log("[division.seed] Got DB handle");

    console.log("[division.seed] Checking if Divisions already seeded...");
    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM Divisions;
    `);

    console.log(`[division.seed] Divisions count: ${existing?.Count ?? 0}`);

    if ((existing?.Count ?? 0) > 0) {
        console.log("✅ [division.seed] Divisions already seeded, skipping.");
        console.log("[division.seed] seedDivisions() — END (skipped)");
        return;
    }

    console.log("🌱 [division.seed] Seeding Divisions & Districts...");

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

    let totalDistricts = 0;

    for (const item of divisions) {
        console.log(`[division.seed] Inserting division: ${item.division}`);

        const result = await db.runAsync(
            `
            INSERT INTO Divisions (DivisionName)
            VALUES (?);
            `,
            [item.division]
        );

        const divisionId = result.lastInsertRowId;
        console.log(`[division.seed] Division ${item.division} inserted with ID ${divisionId}`);

        for (const district of item.districts) {
            await db.runAsync(
                `
                INSERT INTO Districts
                (
                    DivisionID,
                    DistrictName
                )
                VALUES
                (
                    ?, ?
                );
                `,
                [
                    divisionId,
                    district
                ]
            );
            totalDistricts++;
        }

        console.log(`[division.seed] Inserted ${item.districts.length} districts for ${item.division}`);
    }

    console.log(`[division.seed] Total divisions: ${divisions.length}, Total districts: ${totalDistricts}`);
    console.log("✅ [division.seed] seedDivisions() — END");
}
