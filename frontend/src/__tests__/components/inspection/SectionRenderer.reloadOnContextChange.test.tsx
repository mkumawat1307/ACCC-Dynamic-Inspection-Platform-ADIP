import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("react-native-paper", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    TextInput: (props: any) => R.createElement(RN.TextInput, props),
    HelperText: (props: any) => R.createElement(RN.Text, null, props.children),
  };
});

jest.mock("react-native-element-dropdown", () => ({
  Dropdown: (props: any) => {
    const R = require("react");
    return R.createElement("Dropdown", props);
  },
}));

jest.mock("@/src/database/repositories/InspectionFieldRepository", () => ({
  __esModule: true,
  default: {
    getFieldsBySection: jest.fn().mockResolvedValue([]),
    getFieldOptions: jest.fn().mockResolvedValue([]),
    getFieldOptionsBySection: jest.fn().mockResolvedValue(new Map()),
  },
}));

jest.mock("@/src/database/repositories/InspectionValueRepository", () => ({
  __esModule: true,
  default: {
    saveValue: jest.fn().mockResolvedValue(undefined),
    getValue: jest.fn().mockResolvedValue(null),
    getValuesByInspection: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("@/src/database/repositories/DeviceFieldDefinitionsRepository", () => ({
  __esModule: true,
  default: { getDeviceTypes: jest.fn().mockResolvedValue([]) },
}));

jest.mock("@/src/database/repositories/ProjectDeviceTypesRepository", () => ({
  __esModule: true,
  default: { getRequired: jest.fn().mockResolvedValue([]) },
}));

jest.mock("@/src/context/InspectionContext", () => ({
  useInspection: () => ({ poleId: "P123" }),
}));

jest.mock("@/src/context/InspectionScrollContext", () => ({
  useInspectionScroll: () => ({
    scrollViewRef: { current: { scrollTo: jest.fn() } },
    scrollOffsetRef: { current: 0 },
    setDropdownOpen: jest.fn(),
    scrollFocusedFieldIntoView: jest.fn(),
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/components/inspection/DeviceSection", () => {
  const R = require("react");
  return { __esModule: true, default: () => R.createElement("DeviceSection") };
});

jest.mock("@/src/components/inspection/PhotoSection", () => {
  const R = require("react");
  return { __esModule: true, default: () => R.createElement("PhotoSection") };
});

jest.mock("@/src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import SectionRenderer from "@/src/components/inspection/SectionRenderer";
import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";

const getFieldsBySection = InspectionFieldRepository.getFieldsBySection as jest.Mock;
const getDeviceTypes = DeviceFieldDefinitionsRepository.getDeviceTypes as jest.Mock;

describe("SectionRenderer reloads when template/existing context changes while mounted", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("templateId change re-runs the section load with the new template", async () => {
    let tree!: ReturnType<typeof TestRenderer.create>;

    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer inspectionId={7} sectionId={3} sectionKey="rf" templateId={1} />
      );
    });

    // Initial mount loads the section once with the original template context.
    expect(getFieldsBySection).toHaveBeenCalledTimes(1);
    expect(getDeviceTypes).toHaveBeenLastCalledWith(1, false);

    await act(async () => {
      tree.update(
        <SectionRenderer inspectionId={7} sectionId={3} sectionKey="rf" templateId={2} />
      );
    });

    // A mounted section must reload against the new template context.
    expect(getFieldsBySection).toHaveBeenCalledTimes(2);
    expect(getDeviceTypes).toHaveBeenLastCalledWith(2, false);
  });

  it("existing flag change re-runs the section load with the new existing context", async () => {
    let tree!: ReturnType<typeof TestRenderer.create>;

    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer inspectionId={7} sectionId={3} sectionKey="rf" templateId={1} />
      );
    });

    expect(getFieldsBySection).toHaveBeenCalledTimes(1);
    expect(getDeviceTypes).toHaveBeenLastCalledWith(1, false);

    await act(async () => {
      tree.update(
        <SectionRenderer inspectionId={7} sectionId={3} sectionKey="rf" templateId={1} existing />
      );
    });

    expect(getFieldsBySection).toHaveBeenCalledTimes(2);
    expect(getDeviceTypes).toHaveBeenLastCalledWith(1, true);
  });

  it("sectionId change re-runs the load (original trigger still works)", async () => {
    let tree!: ReturnType<typeof TestRenderer.create>;

    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer inspectionId={7} sectionId={3} sectionKey="rf" templateId={1} />
      );
    });

    expect(getFieldsBySection).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.update(
        <SectionRenderer inspectionId={7} sectionId={4} sectionKey="rf" templateId={1} />
      );
    });

    expect(getFieldsBySection).toHaveBeenCalledTimes(2);
    expect(getFieldsBySection).toHaveBeenLastCalledWith(4, 7);
  });

  it("unrelated re-render with identical context does NOT reload the section", async () => {
    let forceUpdate = () => {};

    const Probe = ({ children }: { children: React.ReactNode }) => {
      const [, setTick] = React.useState(0);
      forceUpdate = () => setTick((t) => t + 1);
      return <>{children}</>;
    };

    await act(async () => {
      TestRenderer.create(
        <Probe>
          <SectionRenderer inspectionId={7} sectionId={3} sectionKey="rf" templateId={1} />
        </Probe>
      );
    });

    expect(getFieldsBySection).toHaveBeenCalledTimes(1);

    // Force an unrelated parent re-render; the section props are unchanged.
    await act(async () => {
      forceUpdate();
    });

    expect(getFieldsBySection).toHaveBeenCalledTimes(1);
  });
});