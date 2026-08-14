//frontend\src\database\repositories\PhotoRepository.ts
import { getDatabase } from "../db";
import { Photo } from "@/src/models/Photo";

export default class PhotoRepository {

  static async getByInspection(
    inspectionId: number
  ): Promise<Photo[]> {

    const db = await getDatabase();

    return await db.getAllAsync<Photo>(
      `
      SELECT *
      FROM Photos
      WHERE InspectionID = ?
      ORDER BY PhotoID;
      `,
      [inspectionId]
    );

  }

  static async getById(photoId: number): Promise<Photo | null> {

    const db = await getDatabase();

    return await db.getFirstAsync<Photo>(
      `
      SELECT *
      FROM Photos
      WHERE PhotoID = ?;
      `,
      [photoId]
    );

  }

  static async create(
    photo: Photo
  ): Promise<number> {

    const db = await getDatabase();

    const result = await db.runAsync(
      `
      INSERT INTO Photos
      (
        InspectionID,
        PhotoType,
        FileName,
        FilePath,
        Latitude,
        Longitude,
        CapturedAt,
        Remarks
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        photo.InspectionID,
        photo.PhotoType,
        photo.FileName,
        photo.FilePath,
        photo.Latitude,
        photo.Longitude,
        photo.CapturedAt,
        photo.Remarks,
      ]
    );

    return result.lastInsertRowId;

  }

  static async updateFilePath(photoId: number, filePath: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE Photos SET FilePath = ? WHERE PhotoID = ?`,
      [filePath, photoId]
    );
  }

  static async updateFileNameAndPath(photoId: number, fileName: string, filePath: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE Photos SET FileName = ?, FilePath = ? WHERE PhotoID = ?`,
      [fileName, filePath, photoId]
    );
  }

  static async remapFilePaths(uriMap: Record<string, string>): Promise<number> {
    const db = await getDatabase();
    let updated = 0;
    for (const [oldUri, newUri] of Object.entries(uriMap)) {
      const result = await db.runAsync(
        `UPDATE Photos SET FilePath = ? WHERE FilePath = ?`,
        [newUri, oldUri]
      );
      updated += result.changes;
    }
    return updated;
  }

  static async delete(
    photoId: number
  ): Promise<void> {

    const db = await getDatabase();

    await db.runAsync(
      `
      DELETE FROM Photos
      WHERE PhotoID = ?;
      `,
      [photoId]
    );

  }

  static async deleteByInspection(
    inspectionId: number
  ): Promise<void> {

    const db = await getDatabase();

    await db.runAsync(
      `
      DELETE FROM Photos
      WHERE InspectionID = ?;
      `,
      [inspectionId]
    );

  }

}