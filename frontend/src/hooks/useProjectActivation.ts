import { useEffect, useRef, useState } from "react";
import { Project } from "@/src/models/Project";
import { useInspection } from "@/src/context/InspectionContext";

export interface ProjectActivationState {
  ready: boolean;
  error: string | null;
}

const MISSING_IDENTITY_ERROR = "Project identity is missing.";
const MISSING_DB_PATH_ERROR = "Project has no database path.";

function sameProjectIdentity(a: Project, b: Project | null): boolean {
  return (
    b != null &&
    a.ProjectID === b.ProjectID &&
    (a.DBPath ?? "") === (b.DBPath ?? "")
  );
}

export function useProjectActivation(
  project: Project | null
): ProjectActivationState {
  const { openProject } = useInspection();
  const [state, setState] = useState<ProjectActivationState>({
    ready: false,
    error: null,
  });
  const requestedProjectIdRef = useRef<number | null>(null);
  const lastProjectRef = useRef<Project | null>(null);

  useEffect(() => {
    const projectId = project?.ProjectID ?? null;
    requestedProjectIdRef.current = projectId;

    const prev = lastProjectRef.current;
    lastProjectRef.current = project;
    if (prev != null && project != null && sameProjectIdentity(project, prev)) {
      return;
    }

    let cancelled = false;

    if (!project) {
      setState({ ready: false, error: MISSING_IDENTITY_ERROR });
      return;
    }
    if (!project.DBPath) {
      setState({ ready: false, error: MISSING_DB_PATH_ERROR });
      return;
    }

    setState({ ready: false, error: null });
    void (async () => {
      try {
        await openProject(project);
        if (!cancelled && requestedProjectIdRef.current === projectId) {
          setState({ ready: true, error: null });
        }
      } catch (e) {
        if (!cancelled && requestedProjectIdRef.current === projectId) {
          setState({
            ready: false,
            error:
              e instanceof Error && e.message
                ? e.message
                : "Unable to open project database.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project, openProject]);

  return state;
}