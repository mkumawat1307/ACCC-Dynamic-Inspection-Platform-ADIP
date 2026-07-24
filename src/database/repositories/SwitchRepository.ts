// frontend/src/database/repositories/SwitchRepository.ts

import { getDatabase } from "../db";
import { Switch } from "@/src/models/Switch";

export default class SwitchRepository {

  /**
   * Get all switches for an inspection
   */
  static async getByInspection(
    inspectionId: number
  ): Promise<Switch[]> {

    const db = await getDatabase();

    return await db.getAllAsync<Switch>(
      `
      SELECT *
      FROM Switches
      WHERE InspectionID = ?
      ORDER BY SwitchNo;
      `,
      [inspectionId]
    );

  }

  /**
   * Create a new switch entry
   */
  static async create(
    sw: Switch
  ): Promise<number> {

    const db = await getDatabase();

    const result = await db.runAsync(
      `
      INSERT INTO Switches
      (
        InspectionID,
        SwitchNo,
        SwitchType,
        SwitchStatus,
        SwitchMake,
        SwitchModel,
        SwitchIP,
        SwitchSerialNumber,
        SwitchSI
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        sw.InspectionID,
        sw.SwitchNo,
        sw.SwitchType ?? null,
        sw.SwitchStatus ?? null,
        sw.SwitchMake ?? null,
        sw.SwitchModel ?? null,
        sw.SwitchIP ?? null,
        sw.SwitchSerialNumber ?? null,
        sw.SwitchSI ?? null,
      ]
    );

    return result.lastInsertRowId as number;

  }

  /**
   * Update a switch entry
   */
  static async update(
    sw: Switch
  ): Promise<void> {

    const db = await getDatabase();

    await db.runAsync(
      `
      UPDATE Switches
      SET
        SwitchType = ?,
        SwitchStatus = ?,
        SwitchMake = ?,
        SwitchModel = ?,
        SwitchIP = ?,
        SwitchSerialNumber = ?,
        SwitchSI = ?,
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE SwitchID = ?;
      `,
      [
        sw.SwitchType ?? null,
        sw.SwitchStatus ?? null,
        sw.SwitchMake ?? null,
        sw.SwitchModel ?? null,
        sw.SwitchIP ?? null,
        sw.SwitchSerialNumber ?? null,
        sw.SwitchSI ?? null,
        sw.SwitchID ?? null,
      ]
    );

  }

  /**
   * Save a switch entry (create or update)
   */
  static async save(
    sw: Switch
  ): Promise<number> {

    if (sw.SwitchID) {
      await this.update(sw);
      return sw.SwitchID;
    }

    return await this.create(sw);

  }

  /**
   * Delete a switch entry
   */
  static async delete(
    switchId: number
  ): Promise<void> {

    const db = await getDatabase();

    await db.runAsync(
      `
      DELETE FROM Switches
      WHERE SwitchID = ?;
      `,
      [switchId]
    );

  }

  /**
   * Delete all switches for an inspection
   */
  static async deleteByInspection(
    inspectionId: number
  ): Promise<void> {

    const db = await getDatabase();

    await db.runAsync(
      `
      DELETE FROM Switches
      WHERE InspectionID = ?;
      `,
      [inspectionId]
    );

  }

  /**
   * Save multiple switches for an inspection (replaces all existing)
   */
  static async saveMultiple(
    inspectionId: number,
    switches: Switch[]
  ): Promise<void> {

    const db = await getDatabase();

    await db.withTransactionAsync(async () => {

      // Delete existing switches for this inspection
      await db.runAsync(
        `
        DELETE FROM Switches
        WHERE InspectionID = ?;
        `,
        [inspectionId]
      );

      // Insert new switches
      for (let i = 0; i < switches.length; i++) {

        const sw = switches[i];

        await db.runAsync(
          `
          INSERT INTO Switches
          (
            InspectionID,
            SwitchNo,
            SwitchType,
            SwitchStatus,
            SwitchMake,
            SwitchModel,
            SwitchIP,
            SwitchSerialNumber,
            SwitchSI
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          [
            inspectionId,
            sw.SwitchNo,
            sw.SwitchType ?? null,
            sw.SwitchStatus ?? null,
            sw.SwitchMake ?? null,
            sw.SwitchModel ?? null,
            sw.SwitchIP ?? null,
            sw.SwitchSerialNumber ?? null,
            sw.SwitchSI ?? null,
          ]
        );

      }

    });

  }

}