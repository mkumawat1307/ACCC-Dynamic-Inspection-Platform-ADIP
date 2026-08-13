import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { WatermarkState } from "@/src/components/inspection/photoUtils";

export interface PhotoStatesContextType {
  photoStates: Record<number, WatermarkState>;
  setPhotoStates: React.Dispatch<React.SetStateAction<Record<number, WatermarkState>>>;
  getPhotoStates: () => Record<number, WatermarkState>;
}

const PhotoStatesContext = createContext<PhotoStatesContextType | undefined>(undefined);
const PhotosProcessingContext = createContext<boolean>(false);

export function PhotoStatesProvider({ children }: { children: React.ReactNode }) {
  const [photoStates, setPhotoStatesState] = useState<Record<number, WatermarkState>>({});
  const photoStatesRef = useRef<Record<number, WatermarkState>>({});

  const setPhotoStates = useCallback(
    (updater: React.SetStateAction<Record<number, WatermarkState>>) => {
      setPhotoStatesState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: Record<number, WatermarkState>) => Record<number, WatermarkState>)(prev)
            : updater;
        photoStatesRef.current = next;
        return next;
      });
    },
    []
  );

  const getPhotoStates = useCallback(() => photoStatesRef.current, []);

  const photosProcessing = useMemo(
    () =>
      Object.values(photoStates).some(
        (state) => state === "processing" || state === "pending"
      ),
    [photoStates]
  );

  const value = useMemo(
    () => ({ photoStates, setPhotoStates, getPhotoStates }),
    [photoStates, setPhotoStates, getPhotoStates]
  );

  return (
    <PhotoStatesContext.Provider value={value}>
      <PhotosProcessingContext.Provider value={photosProcessing}>
        {children}
      </PhotosProcessingContext.Provider>
    </PhotoStatesContext.Provider>
  );
}

export function usePhotoStates(): PhotoStatesContextType {
  const context = useContext(PhotoStatesContext);

  if (!context) {
    throw new Error("usePhotoStates must be used inside PhotoStatesProvider.");
  }

  return context;
}

export function usePhotosProcessing(): boolean {
  return useContext(PhotosProcessingContext);
}
