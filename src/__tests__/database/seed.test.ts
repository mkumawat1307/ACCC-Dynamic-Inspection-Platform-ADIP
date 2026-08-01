jest.mock("@/src/database/seeds/division.seed", () => ({
  seedDivisions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/inspection-template.seed", () => ({
  seedInspectionTemplate: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/inspection-sections.seed", () => ({
  seedInspectionSections: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/inspection-fields.seed", () => ({
  seedInspectionFields: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/field-options.seed", () => ({
  seedFieldOptions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/repeatable-groups.seed", () => ({
  seedRepeatableGroups: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/repeatable-group-fields.seed", () => ({
  seedRepeatableGroupFields: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/device-options.seed", () => ({
  seedDeviceOptions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/device-field-definitions.seed", () => ({
  seedDeviceFieldDefinitions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/database/db", () => ({
  getDatabase: jest.fn().mockResolvedValue({}),
  getGlobalDatabase: jest.fn().mockResolvedValue({}),
}));

import { seedDivisions } from "@/src/database/seeds/division.seed";
import { seedInspectionTemplate } from "@/src/database/seeds/inspection-template.seed";
import { seedInspectionSections } from "@/src/database/seeds/inspection-sections.seed";
import { seedInspectionFields } from "@/src/database/seeds/inspection-fields.seed";
import { seedFieldOptions } from "@/src/database/seeds/field-options.seed";

describe("seed.ts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("seedGlobalDatabase calls getGlobalDatabase and seedDivisions", async () => {
    const { seedGlobalDatabase } = require("@/src/database/seed");
    await seedGlobalDatabase();

    expect(seedDivisions).toHaveBeenCalled();
  });

  it("seedProjectDatabase calls all project seed functions", async () => {
    const { seedProjectDatabase } = require("@/src/database/seed");
    await seedProjectDatabase();

    expect(seedInspectionTemplate).toHaveBeenCalled();
    expect(seedInspectionSections).toHaveBeenCalled();
    expect(seedInspectionFields).toHaveBeenCalled();
    expect(seedFieldOptions).toHaveBeenCalled();
  });

  it("seedDatabase calls all seed functions", async () => {
    const { seedDatabase } = require("@/src/database/seed");
    await seedDatabase();

    expect(seedDivisions).toHaveBeenCalled();
    expect(seedInspectionTemplate).toHaveBeenCalled();
    expect(seedInspectionSections).toHaveBeenCalled();
    expect(seedInspectionFields).toHaveBeenCalled();
    expect(seedFieldOptions).toHaveBeenCalled();
  });
});
