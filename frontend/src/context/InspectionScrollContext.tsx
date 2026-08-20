import React, { createContext, useContext, useRef } from "react";

interface InspectionScrollContextType {
  scrollViewRef: React.RefObject<any>;
  scrollOffsetRef: React.RefObject<number>;
  setDropdownOpen: (open: boolean) => void;
}

const InspectionScrollContext = createContext<InspectionScrollContextType | null>(null);

export function InspectionScrollProvider({
  children,
  scrollViewRef: providedRef,
  scrollOffsetRef: providedOffsetRef,
  setDropdownOpen,
}: {
  children: React.ReactNode;
  scrollViewRef?: React.RefObject<any>;
  scrollOffsetRef?: React.RefObject<number>;
  setDropdownOpen: (open: boolean) => void;
}) {
  const internalRef = useRef<any>(null);
  const scrollViewRef = providedRef ?? internalRef;
  const internalOffsetRef = useRef<number>(0);
  const scrollOffsetRef = providedOffsetRef ?? internalOffsetRef;
  return (
    <InspectionScrollContext.Provider value={{ scrollViewRef, scrollOffsetRef, setDropdownOpen }}>
      {children}
    </InspectionScrollContext.Provider>
  );
}

export function useInspectionScroll() {
  const context = useContext(InspectionScrollContext);
  if (!context) {
    throw new Error("useInspectionScroll must be used within InspectionScrollProvider");
  }
  return context;
}