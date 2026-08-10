import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from "react";

import { Project } from "@/src/models/Project";
import { openProjectDb, deleteProjectDb } from "@/src/database/helpers/ProjectDBManager";
import { clearActiveProject } from "@/src/database/db";
import { WatermarkState } from "@/src/components/inspection/photoUtils";
import { migrateProjectPhotoFolder } from "@/src/utils/folderManager";
import { logger } from "@/src/utils/logger";
import { requestAndroidBackup } from "@/src/utils/androidBackup";

export interface InspectionContextType {
  project: Project | null;
  setProject: (project: Project | null) => void;
  openProject: (project: Project) => Promise<void>;
  closeProject: () => Promise<void>;
  removeProject: (project: Project) => Promise<void>;

  inspectionDate: string;
  setInspectionDate: (date: string) => void;

  inspectionId: number | null;
  setInspectionId: (id: number | null) => void;

  poleId: string;
  setPoleId: (poleId: string) => void;

  photoStates: Record<number, WatermarkState>;
  setPhotoStates: React.Dispatch<React.SetStateAction<Record<number, WatermarkState>>>;
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
const [photoStates, setPhotoStates] = useState<Record<number, WatermarkState>>({});

const openProject = useCallback(async (p: Project) => {
  if (p.DBPath) {
    await openProjectDb(p.DBPath, p.ProjectID);
  }
  setProject(p);
  migrateProjectPhotoFolder(p).catch((err) => {
    logger.warn(`[FolderManager] Migration failed for project ${p.ProjectName}:`, err);
  });
}, []);

const closeProject = useCallback(async () => {
  await clearActiveProject();
  setProject(null);
  setInspectionId(null);
  setPoleId("");
  setInspectionDate("");
  setPhotoStates({});
}, []);

const removeProject = useCallback(async (p: Project) => {
  if (project?.ProjectID === p.ProjectID) {
    await closeProject();
  }
  if (p.DBPath) {
    await deleteProjectDb(p.DBPath);
  }
  requestAndroidBackup();
}, [project, closeProject]);

const value = useMemo(
  () => ({
    project,
    setProject,
    openProject,
    closeProject,
    removeProject,

    inspectionDate,
    setInspectionDate,

    inspectionId,
    setInspectionId,

    poleId,
    setPoleId,

    photoStates,
    setPhotoStates,
  }),
  [project, inspectionDate, inspectionId, poleId, photoStates, openProject, closeProject, removeProject]
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
