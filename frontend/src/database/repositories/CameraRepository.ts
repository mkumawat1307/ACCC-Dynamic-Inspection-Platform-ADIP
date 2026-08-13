// frontend/src/database/repositories/CameraRepository.ts

import { getDatabase } from "../db";
import { Camera } from "@/src/models/Camera";

export default class CameraRepository {

  /**
   * Get all cameras for an inspection
   */
  static async getByInspection(
    inspectionId: number
  ): Promise<Camera[]> {

    const db = await getDatabase();

    return await db.getAllAsync<Camera>(
      `
      SELECT *
      FROM Cameras
      WHERE InspectionID = ?
      ORDER BY CameraNo;
      `,
      [inspectionId]
    );

  }

  /**
   * Create a new camera entry
   */
  static async create(
    camera: Camera
  ): Promise<number> {

    const db = await getDatabase();

    const result = await db.runAsync(
      `
      INSERT INTO Cameras
      (
        InspectionID,
        CameraNo,
        CameraType,
        CameraStatus,
        CameraMake,
        CameraModel,
        CameraIP,
        CameraSerialNumber,
        CameraSI,
        SDCardCapacity,
        SDCardStatus
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        camera.InspectionID,
        camera.CameraNo,
        camera.CameraType ?? null,
        camera.CameraStatus ?? null,
        camera.CameraMake ?? null,
        camera.CameraModel ?? null,
        camera.CameraIP ?? null,
        camera.CameraSerialNumber ?? null,
        camera.CameraSI ?? null,
        camera.SDCardCapacity ?? null,
        camera.SDCardStatus ?? null,
      ]
    );

    return result.lastInsertRowId as number;

  }

  /**
   * Update a camera entry
   */
  static async update(
    camera: Camera
  ): Promise<void> {

    const db = await getDatabase();

    await db.runAsync(
      `
      UPDATE Cameras
      SET
        CameraType = ?,
        CameraStatus = ?,
        CameraMake = ?,
        CameraModel = ?,
        CameraIP = ?,
        CameraSerialNumber = ?,
        CameraSI = ?,
        SDCardCapacity = ?,
        SDCardStatus = ?,
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE CameraID = ?;
      `,
      [
        camera.CameraType ?? null,
        camera.CameraStatus ?? null,
        camera.CameraMake ?? null,
        camera.CameraModel ?? null,
        camera.CameraIP ?? null,
        camera.CameraSerialNumber ?? null,
        camera.CameraSI ?? null,
        camera.SDCardCapacity ?? null,
        camera.SDCardStatus ?? null,
        camera.CameraID ?? null,
      ]
    );

  }

  /**
   * Save a camera entry (create or update)
   */
  static async save(
    camera: Camera
  ): Promise<number> {

    if (camera.CameraID) {
      await this.update(camera);
      return camera.CameraID;
    }

    return await this.create(camera);

  }

  /**
   * Delete a camera entry
   */
  static async delete(
    cameraId: number
  ): Promise<void> {

    const db = await getDatabase();

    await db.runAsync(
      `
      DELETE FROM Cameras
      WHERE CameraID = ?;
      `,
      [cameraId]
    );

  }

  /**
   * Delete all cameras for an inspection
   */
  static async deleteByInspection(
    inspectionId: number
  ): Promise<void> {

    const db = await getDatabase();

    await db.runAsync(
      `
      DELETE FROM Cameras
      WHERE InspectionID = ?;
      `,
      [inspectionId]
    );

  }

  /**
   * Save multiple cameras for an inspection (replaces all existing)
   */
  static async saveMultiple(
    inspectionId: number,
    cameras: Camera[]
  ): Promise<void> {

    const db = await getDatabase();

    await db.withTransactionAsync(async () => {

      // Delete existing cameras for this inspection
      await db.runAsync(
        `
        DELETE FROM Cameras
        WHERE InspectionID = ?;
        `,
        [inspectionId]
      );

      // Insert new cameras
      for (let i = 0; i < cameras.length; i++) {

        const camera = cameras[i];

        await db.runAsync(
          `
          INSERT INTO Cameras
          (
            InspectionID,
            CameraNo,
            CameraType,
            CameraStatus,
            CameraMake,
            CameraModel,
            CameraIP,
            CameraSerialNumber,
            CameraSI,
            SDCardCapacity,
            SDCardStatus
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          [
            inspectionId,
            camera.CameraNo,
            camera.CameraType ?? null,
            camera.CameraStatus ?? null,
            camera.CameraMake ?? null,
            camera.CameraModel ?? null,
            camera.CameraIP ?? null,
            camera.CameraSerialNumber ?? null,
            camera.CameraSI ?? null,
            camera.SDCardCapacity ?? null,
            camera.SDCardStatus ?? null,
          ]
        );

      }

    });

  }

}