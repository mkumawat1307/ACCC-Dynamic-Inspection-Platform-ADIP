// src/database/seeds/repeatable-group-fields.seed.ts

import { getDatabase } from "../db";

export async function seedRepeatableGroupFields() {

    const db = await getDatabase();

    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM RepeatableGroupFields;
    `);

    if ((existing?.Count ?? 0) > 0) {
        console.log("✅ Repeatable Group Fields already seeded.");
        return;
    }

    const groups = await db.getAllAsync<{
        GroupID: number;
        GroupName: string;
    }>(`
        SELECT GroupID, GroupName
        FROM RepeatableGroups;
    `);

    const groupMap = new Map(
        groups.map(group => [group.GroupName, group.GroupID])
    );

    const fields = [

        // ===========================
        // CAMERA
        // ===========================

        {
            group: "Camera",
            name: "Camera Make",
            key: "camera_make",
            type: "dropdown",
            order: 1,
            required: 1,
        },
        {
            group: "Camera",
            name: "Camera Type",
            key: "camera_type",
            type: "dropdown",
            order: 2,
            required: 1,
        },
        {
            group: "Camera",
            name: "Camera Model",
            key: "camera_model",
            type: "text",
            order: 3,
            required: 0,
        },
        {
            group: "Camera",
            name: "Camera Serial Number",
            key: "camera_serial_number",
            type: "text",
            order: 4,
            required: 1,
        },
        {
            group: "Camera",
            name: "Camera Status",
            key: "camera_status",
            type: "dropdown",
            order: 5,
            required: 1,
        },
        {
            group: "Camera",
            name: "Live Status",
            key: "camera_live_status",
            type: "dropdown",
            order: 6,
            required: 1,
        },
        {
            group: "Camera",
            name: "IP Address",
            key: "camera_ip",
            type: "text",
            order: 7,
            required: 0,
        },
        {
            group: "Camera",
            name: "MAC Address",
            key: "camera_mac",
            type: "text",
            order: 8,
            required: 0,
        },
        {
            group: "Camera",
            name: "SD Card Installed",
            key: "camera_sd_card",
            type: "yesno",
            order: 9,
            required: 0,
        },
        {
            group: "Camera",
            name: "SD Card Capacity",
            key: "camera_sd_capacity",
            type: "text",
            order: 10,
            required: 0,
        },
        {
            group: "Camera",
            name: "Remarks",
            key: "camera_remarks",
            type: "textarea",
            order: 11,
            required: 0,
        },

        // ===========================
        // SWITCH
        // ===========================

        {
            group: "Switch",
            name: "Switch Make",
            key: "switch_make",
            type: "dropdown",
            order: 1,
            required: 1,
        },
        {
            group: "Switch",
            name: "Switch Model",
            key: "switch_model",
            type: "text",
            order: 2,
            required: 0,
        },
        {
            group: "Switch",
            name: "Switch Serial Number",
            key: "switch_serial_number",
            type: "text",
            order: 3,
            required: 1,
        },
        {
            group: "Switch",
            name: "Switch Status",
            key: "switch_status",
            type: "dropdown",
            order: 4,
            required: 1,
        },
        {
            group: "Switch",
            name: "No Of Ports",
            key: "switch_ports",
            type: "number",
            order: 5,
            required: 0,
        },
        {
            group: "Switch",
            name: "IP Address",
            key: "switch_ip",
            type: "text",
            order: 6,
            required: 0,
        },
        {
            group: "Switch",
            name: "MAC Address",
            key: "switch_mac",
            type: "text",
            order: 7,
            required: 0,
        },
        {
            group: "Switch",
            name: "Power Status",
            key: "switch_power_status",
            type: "dropdown",
            order: 8,
            required: 0,
        },
        {
            group: "Switch",
            name: "Remarks",
            key: "switch_remarks",
            type: "textarea",
            order: 9,
            required: 0,
        },
    ];

    console.log("🌱 Seeding Repeatable Group Fields...");

    for (const field of fields) {

        const groupID = groupMap.get(field.group);

        if (!groupID) {
            throw new Error(`Repeatable Group not found: ${field.group}`);
        }

        await db.runAsync(
            `
            INSERT INTO RepeatableGroupFields
            (
                GroupID,
                FieldName,
                FieldKey,
                FieldType,
                Placeholder,
                DefaultValue,
                HelpText,
                ValidationRule,
                DisplayOrder,
                IsRequired,
                IsVisible,
                IsReadOnly,
                IsActive
            )
            VALUES
            (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1
            );
            `,
            [
                groupID,
                field.name,
                field.key,
                field.type,
                "",
                "",
                "",
                "",
                field.order,
                field.required,
            ]
        );

    }

    console.log("✅ Repeatable Group Fields Seeded.");

}