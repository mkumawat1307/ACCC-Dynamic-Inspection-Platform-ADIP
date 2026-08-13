export async function deleteInspectionData(db: any, inspectionId: number) {
  await db.runAsync(`DELETE FROM Photos WHERE InspectionID = ?`, [inspectionId]);
  await db.runAsync(`DELETE FROM Cameras WHERE InspectionID = ?`, [inspectionId]);
  await db.runAsync(`DELETE FROM Switches WHERE InspectionID = ?`, [inspectionId]);
  await db.runAsync(`DELETE FROM InspectionValues WHERE InspectionID = ?`, [inspectionId]);
  await db.runAsync(`DELETE FROM Inspections WHERE InspectionID = ?`, [inspectionId]);
}
