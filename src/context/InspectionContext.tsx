import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import { Project } from "@/src/models/Project";

export interface InspectionContextType {
  project: Project | null;
  setProject: (project: Project | null) => void;

  inspectionDate: string;
  setInspectionDate: (date: string) => void;

  inspectionId: number | null;
  setInspectionId: (id: number | null) => void;

  poleId: string;
  setPoleId: (poleId: string) => void;
}

const InspectionContext = createContext<InspectionContextType | undefined>(
  undefined
);

export function InspectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [project, setProject] = useState<Project | null>(null);

const [inspectionDate, setInspectionDate] = useState("");
const [inspectionId, setInspectionId] = useState<number | null>(null);
const [poleId, setPoleId] = useState("");
const value = useMemo(
  () => ({
    project,
    setProject,

    inspectionDate,
    setInspectionDate,

    inspectionId,
    setInspectionId,

    poleId,
    setPoleId,
  }),
  [project, inspectionDate, inspectionId, poleId]
);

  return (
    <InspectionContext.Provider value={value}>
      {children}
    </InspectionContext.Provider>
  );
}

export function useInspection() {
  const context = useContext(InspectionContext);

  if (!context) {
    throw new Error(
      "useInspection must be used inside InspectionProvider."
    );
  }

  return context;
}