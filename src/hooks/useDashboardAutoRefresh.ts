import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";

const POLL_INTERVAL_MS = 60_000;

function msUntilNextMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export default function useDashboardAutoRefresh(
  projectId: number,
  focused: boolean
): number {
  const [reloadKey, setReloadKey] = useState(0);
  const bump = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    const unsubscribe = InspectionDataBus.subscribe((event) => {
      if (event.projectId === projectId) {
        bump();
      }
    });
    return unsubscribe;
  }, [projectId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        bump();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        bump();
        schedule();
      }, msUntilNextMidnight(new Date()));
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!focused) return;
    const interval = setInterval(bump, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [focused]);

  return reloadKey;
}
