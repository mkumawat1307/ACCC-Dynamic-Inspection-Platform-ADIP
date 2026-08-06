/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|@shopify/react-native-skia)",
  ],
  testPathIgnorePatterns: [
    "src/__tests__/.*\\.d\\.ts",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/tables/*.table.ts",
    "!src/**/seeds/*.seed.ts",
  ],
  coverageThreshold: {
    "src/database/db.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/schema.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/seed.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/utils/exportData.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/utils/location.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/utils/logger.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/utils/templateData.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/repositories/ProjectRepository.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/components/inspection/photoUtils.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/utils/date.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/utils/watermarkHtml.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/utils/watermarkSettings.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/utils/watermarkLayout.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/repositories/FieldRepository.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/repositories/InspectionRepository.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/repositories/DashboardCardRepository.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/repositories/StatisticCountService.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/repositories/DashboardService.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/components/dashboard/DashboardCardManager.tsx": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/DatabaseService.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/database/helpers/ProjectDBManager.ts": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    "src/context/InspectionContext.tsx": {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
  },
};
