import { createPhotosTable } from "@/src/database/tables/photos.table";

describe("photos.table", () => {
  it("includes the nullable StoragePath column", () => {
    expect(createPhotosTable).toContain("StoragePath TEXT");
  });

  it("keeps StoragePath nullable (no NOT NULL constraint)", () => {
    expect(createPhotosTable).toMatch(/StoragePath TEXT,?\s*$/m);
  });

  it("includes the ProcessingStatus column defaulting to completed", () => {
    expect(createPhotosTable).toContain(
      "ProcessingStatus TEXT NOT NULL DEFAULT 'completed'"
    );
  });
});
