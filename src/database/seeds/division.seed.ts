// src/database/seeds/division.seed.ts

import { getDatabase } from "../db";

export async function seedDivisions() {
    const db = await getDatabase();

    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM Divisions;
    `);

    if ((existing?.Count ?? 0) > 0) {
        console.log("✅ Divisions already seeded.");
        return;
    }

    console.log("🌱 Seeding Divisions & Districts...");

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

    for (const item of divisions) {

        const result = await db.runAsync(
            `
            INSERT INTO Divisions (DivisionName)
            VALUES (?);
            `,
            [item.division]
        );

        const divisionId = result.lastInsertRowId;

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

        }
    }

    console.log("✅ Divisions & Districts Seeded.");
}