import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = (projectId: number) => `accc_dash_collapsed_${projectId}`;

function readCollapsed(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

export default function useSectionCollapse(projectId: number) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY(projectId))
      .then((raw) => {
        if (!cancelled) setCollapsed(readCollapsed(raw));
      })
      .catch(() => {
        if (!cancelled) setCollapsed(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const isCollapsed = (label: string) => collapsed.has(label);

  const toggle = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      AsyncStorage.setItem(STORAGE_KEY(projectId), JSON.stringify([...next])).catch(() => {});
      return next;
    });
  };

  return { isCollapsed, toggle };
}
