jest.mock("@/src/database/seeds/division.seed", () => ({
  seedDivisions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/database/db", () => ({
  getDatabase: jest.fn().mockResolvedValue({}),
  getGlobalDatabase: jest.fn().mockResolvedValue({}),
}));

import { seedDivisions } from "@/src/database/seeds/division.seed";

describe("seed.ts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("seedGlobalDatabase calls getGlobalDatabase and seedDivisions", async () => {
    const { seedGlobalDatabase } = require("@/src/database/seed");
    await seedGlobalDatabase();

    expect(seedDivisions).toHaveBeenCalled();
  });
});
