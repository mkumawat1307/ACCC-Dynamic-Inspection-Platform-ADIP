// src/database/seeds/division.seed.ts

import { getGlobalDatabase } from "../db";

import { logger } from "@/src/utils/logger";

export async function seedDivisions() {
    const db = await getGlobalDatabase();

    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM Divisions;
    `);

    if ((existing?.Count ?? 0) > 0) {
        return;
    }

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
            totalDistricts++;
        }
    }

    logger.debug(`[division.seed] Seeded ${divisions.length} divisions, ${totalDistricts} districts`);
}
