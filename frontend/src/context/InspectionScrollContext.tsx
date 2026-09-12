import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, type View } from "react-native";

export const FOCUS_PADDING = 20;

interface InspectionScrollContextType {
  scrollViewRef: React.RefObject<any>;
  scrollOffsetRef: React.RefObject<number>;
  scrollViewTopRef: React.RefObject<number>;
  scrollViewHeightRef: React.RefObject<number>;
  setDropdownOpen: (open: boolean) => void;
  scrollFocusedFieldIntoView: (ref: React.RefObject<View | null> | View | null) => void;
  keyboardHeight: number;
}

export interface KeyboardScrollTargetInput {
  fieldTop: number;
  fieldHeight: number;
  scrollViewTop: number;
  scrollViewHeight: number;
  keyboardHeight: number;
  currentOffset: number;
  focusedPadding: number;
  maxScroll?: number;
}

// Pure scroll-target computation so the keyboard/bottom-field behaviour can be
// unit-tested. Returns null when no scroll is needed.
export function computeKeyboardScrollTarget(
  input: KeyboardScrollTargetInput
): number | null {
  const {
    fieldTop,
    fieldHeight,
    scrollViewTop,
    scrollViewHeight,
    keyboardHeight,
    currentOffset,
    focusedPadding,
    maxScroll,
  } = input;
  if (scrollViewHeight <= 0) {
    return null;
  }
  // The field position is measured against the window area that is actually
  // visible after the keyboard takes its space, never a hard-coded offset.
  const fieldBottom = fieldTop - scrollViewTop + fieldHeight;
  const visibleBottom = scrollViewHeight - keyboardHeight - focusedPadding;

  let target: number | null = null;
  if (keyboardHeight > 0) {
    if (fieldBottom > visibleBottom) {
      target = currentOffset + fieldBottom - visibleBottom;
    }
  } else if (fieldBottom > scrollViewHeight) {
    target = currentOffset + fieldBottom - scrollViewHeight;
  }

  if (target == null) {
    return null;
  }
  target = Math.max(0, target);
  if (maxScroll != null) {
    return Math.min(target, Math.max(0, maxScroll));
  }
  return target;
}

// Bottom content inset that only exists while the soft keyboard is up. This is
// what gives the ScrollView the extra scrollable height needed to bring a
// bottom field (e.g. Remarks) fully above the keyboard; without it the scroll
// hits the content's max offset first.
export function keyboardBottomInset(
  keyboardHeight: number,
  extra: number
): number {
  return keyboardHeight > 0 ? Math.max(0, keyboardHeight + extra) : 0;
}

const InspectionScrollContext = createContext<InspectionScrollContextType | null>(null);

export function InspectionScrollProvider({
  children,
  scrollViewRef: providedRef,
  scrollOffsetRef: providedOffsetRef,
  scrollViewTopRef: providedTopRef,
  scrollViewHeightRef: providedHeightRef,
  scrollContentHeightRef: providedContentHeightRef,
  setDropdownOpen,
  keyboardHeightRef: providedKeyboardHeightRef,
  focusedFieldRef: providedFocusedFieldRef,
}: {
  children: React.ReactNode;
  scrollViewRef?: React.RefObject<any>;
  scrollOffsetRef?: React.RefObject<number>;
  scrollViewTopRef?: React.RefObject<number>;
  scrollViewHeightRef?: React.RefObject<number>;
  scrollContentHeightRef?: React.RefObject<number>;
  setDropdownOpen: (open: boolean) => void;
  keyboardHeightRef?: React.RefObject<number>;
  focusedFieldRef?: React.RefObject<React.RefObject<View | null> | View | null>;
}) {
  const internalRef = useRef<any>(null);
  const scrollViewRef = providedRef ?? internalRef;
  const internalOffsetRef = useRef<number>(0);
  const scrollOffsetRef = providedOffsetRef ?? internalOffsetRef;
  const internalTopRef = useRef<number>(0);
  const scrollViewTopRef = providedTopRef ?? internalTopRef;
  const internalHeightRef = useRef<number>(0);
  const scrollViewHeightRef = providedHeightRef ?? internalHeightRef;
  const internalContentHeightRef = useRef<number>(0);
  const scrollContentHeightRef = providedContentHeightRef ?? internalContentHeightRef;
  const internalKeyboardHeightRef = useRef<number>(0);
  const keyboardHeightRef = providedKeyboardHeightRef ?? internalKeyboardHeightRef;
  const internalFocusedFieldRef = useRef<React.RefObject<View | null> | View | null>(null);
  const focusedFieldRef = providedFocusedFieldRef ?? internalFocusedFieldRef;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollFocusedFieldIntoView = useCallback(
    (ref: React.RefObject<View | null> | View | null) => {
      focusedFieldRef.current = ref ?? null;
      const scrollView = scrollViewRef.current;
      const node = (ref as React.RefObject<View>)?.current ?? (ref as View | null);
      if (!scrollView || !node || typeof scrollView.scrollTo !== "function") {
        return;
      }

      const height = keyboardHeightRef.current;
      const scrollViewTop = scrollViewTopRef.current ?? 0;
      const scrollViewHeight = scrollViewHeightRef.current ?? 0;
      if (scrollViewHeight <= 0) {
        return;
      }
      const contentHeight = scrollContentHeightRef.current ?? 0;
      const maxScroll =
        contentHeight > 0 ? Math.max(0, contentHeight - scrollViewHeight) : undefined;

      const measure = (x: number, y: number, _w: number, h: number) => {
        const target = computeKeyboardScrollTarget({
          fieldTop: y,
          fieldHeight: h,
          scrollViewTop,
          scrollViewHeight,
          keyboardHeight: height,
          currentOffset: scrollOffsetRef.current ?? 0,
          focusedPadding: FOCUS_PADDING,
          maxScroll,
        });
        if (target == null) {
          return;
        }
        scrollView.scrollTo({ x: 0, y: target, animated: true });
      };

      try {
        if (typeof node.measureInWindow === "function") {
          node.measureInWindow(measure);
        }
      } catch {
        // Measurement is best-effort; never let a focus gesture break the form.
      }
    },
    [
      focusedFieldRef,
      keyboardHeightRef,
      scrollContentHeightRef,
      scrollOffsetRef,
      scrollViewHeightRef,
      scrollViewRef,
      scrollViewTopRef,
    ]
  );

  // Stable indirection so effects can reach the latest scroll callback without
  // re-running the keyboard subscriptions on every render.
  const scrollFocusedFieldIntoViewRef = useRef(scrollFocusedFieldIntoView);
  scrollFocusedFieldIntoViewRef.current = scrollFocusedFieldIntoView;

  const onKeyboardDidShow = useCallback(
    (event?: { endCoordinates?: { height: number } }) => {
      const height =
        event?.endCoordinates?.height ?? Keyboard.metrics()?.height ?? 0;
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
    },
    [keyboardHeightRef]
  );

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", onKeyboardDidShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardHeightRef, onKeyboardDidShow]);

  // Scroll the focused field only after the keyboard height state has flushed.
  // By then the dynamic bottom inset has been laid out, so the max scroll
  // offset has grown and the focused field can be moved fully into the
  // keyboard-adjusted visible area (fixes the last/bottom field case).
  useEffect(() => {
    if (keyboardHeight <= 0) {
      return;
    }
    const focused = focusedFieldRef.current;
    if (focused) {
      scrollFocusedFieldIntoViewRef.current(focused);
    }
  }, [keyboardHeight]);

  return (
    <InspectionScrollContext.Provider
      value={{
        scrollViewRef,
        scrollOffsetRef,
        scrollViewTopRef,
        scrollViewHeightRef,
        setDropdownOpen,
        scrollFocusedFieldIntoView,
        keyboardHeight,
      }}
    >
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