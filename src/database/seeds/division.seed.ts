// src/database/seeds/division.seed.ts

import { getGlobalDatabase } from "../db";

import { logger } from "@/src/utils/logger";

export async function seedDivisions() {
    logger.info("ðŸŒ± [division.seed] seedDivisions() â€” START");

    const db = await getGlobalDatabase();
    logger.info("[division.seed] Got DB handle");

    logger.info("[division.seed] Checking if Divisions already seeded...");
    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM Divisions;
    `);

    logger.info(`[division.seed] Divisions count: ${existing?.Count ?? 0}`);

    if ((existing?.Count ?? 0) > 0) {
        logger.info("âœ… [division.seed] Divisions already seeded, skipping.");
        logger.info("[division.seed] seedDivisions() â€” END (skipped)");
        return;
    }

    logger.info("ðŸŒ± [division.seed] Seeding Divisions & Districts...");

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
        logger.info(`[division.seed] Inserting division: ${item.division}`);

        const result = await db.runAsync(
            `
            INSERT INTO Divisions (DivisionName)
            VALUES (?);
            `,
            [item.division]
        );

        const divisionId = result.lastInsertRowId;
        logger.info(`[division.seed] Division ${item.division} inserted with ID ${divisionId}`);

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

        logger.info(`[division.seed] Inserted ${item.districts.length} districts for ${item.division}`);
    }

    logger.info(`[division.seed] Total divisions: ${divisions.length}, Total districts: ${totalDistricts}`);
    logger.info("âœ… [division.seed] seedDivisions() â€” END");
}

