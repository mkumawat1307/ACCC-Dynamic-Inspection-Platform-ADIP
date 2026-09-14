import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Platform, StatusBar, type View } from "react-native";

export const FOCUS_PADDING = 20;
export const REVEAL_PADDING = 48;

export interface KeyboardViewportWindowInput {
  scrollViewTopWindow: number;
  scrollViewBottomWindow: number;
  keyboardHeight: number;
  keyboardTopScreenY: number | null;
  statusBarHeight: number;
  isAndroid: boolean;
}

// Derives a single-count effective viewport for computeKeyboardScrollTarget
// from the ScrollView frame measured in window coordinates plus the keyboard's
// authoritative top edge. The result is identical whether the ScrollView's
// onLayout has already shrunk (Android adjustResize) or not, because the fold
// is anchored to the keyboard's own coordinates instead of an assumed
// pre-keyboard ScrollView height.
export function effectiveKeyboardViewport(
  input: KeyboardViewportWindowInput
): { scrollViewTop: number; scrollViewHeight: number; keyboardHeight: number } {
  const {
    scrollViewTopWindow,
    scrollViewBottomWindow,
    keyboardHeight,
    keyboardTopScreenY,
    statusBarHeight,
    isAndroid,
  } = input;

  if (keyboardHeight <= 0) {
    return {
      scrollViewTop: scrollViewTopWindow,
      scrollViewHeight: Math.max(0, scrollViewBottomWindow - scrollViewTopWindow),
      keyboardHeight: 0,
    };
  }

  const keyboardTopWindow =
    isAndroid && keyboardTopScreenY != null
      ? Math.max(scrollViewTopWindow, keyboardTopScreenY - statusBarHeight)
      : Math.max(scrollViewTopWindow, scrollViewBottomWindow - keyboardHeight);

  return {
    scrollViewTop: scrollViewTopWindow,
    // (keyboardTopWindow - scrollViewTopWindow) is the true visible height, so
    // re-adding keyboardHeight keeps computeKeyboardScrollTarget's
    // `scrollViewHeight - keyboardHeight` calculation as a single count.
    scrollViewHeight: Math.max(0, keyboardTopWindow - scrollViewTopWindow + keyboardHeight),
    keyboardHeight,
  };
}

interface InspectionScrollContextType {
  scrollViewRef: React.RefObject<any>;
  scrollOffsetRef: React.RefObject<number>;
  scrollViewTopRef: React.RefObject<number>;
  scrollViewHeightRef: React.RefObject<number>;
  setDropdownOpen: (open: boolean) => void;
  scrollFocusedFieldIntoView: (ref: React.RefObject<View | null> | View | null) => void;
  scrollElementIntoView: (ref: React.RefObject<View | null> | View | null, padding?: number) => void;
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

export interface RevealScrollTargetInput {
  itemTop: number;
  itemHeight: number;
  scrollViewTop: number;
  scrollViewHeight: number;
  keyboardHeight: number;
  currentOffset: number;
  padding: number;
  maxScroll?: number;
}

// Pure scroll-target computation for a newly expanded element (e.g. a device
// body). Element coordinates are window-frame values produced by
// measureInWindow, matching the effectiveKeyboardViewport output shape.
// Returns null when the element is already fully visible in the
// keyboard-adjusted viewport (no scroll needed). Short elements that extend
// below the fold get a minimal reveal of their bottom edge; elements taller
// than the viewport or partially scrolled out at the top anchor on their top
// edge so their start stays reachable.
export function computeRevealScrollTarget(
  input: RevealScrollTargetInput
): number | null {
  const {
    itemTop,
    itemHeight,
    scrollViewTop,
    scrollViewHeight,
    keyboardHeight,
    currentOffset,
    padding,
    maxScroll,
  } = input;
  if (scrollViewHeight <= 0 || itemHeight <= 0) {
    return null;
  }
  const top = itemTop - scrollViewTop;
  const bottom = top + itemHeight;
  const viewportHeight = scrollViewHeight - keyboardHeight;

  if (top >= 0 && bottom <= viewportHeight) {
    return null;
  }

  let target: number | null;
  if (itemHeight > viewportHeight || top < 0) {
    target = currentOffset + top - padding;
  } else {
    target = currentOffset + bottom - viewportHeight + padding;
  }

  target = Math.max(0, target);
  if (maxScroll != null) {
    return Math.min(target, Math.max(0, maxScroll));
  }
  return target;
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
  const keyboardTopScreenYRef = useRef<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollFocusedFieldIntoView = useCallback(
    (ref: React.RefObject<View | null> | View | null) => {
      focusedFieldRef.current = ref ?? null;
      const scrollView = scrollViewRef.current;
      const node = (ref as React.RefObject<View>)?.current ?? (ref as View | null);
      if (!scrollView || !node || typeof scrollView.scrollTo !== "function") {
        return;
      }

      const height = keyboardHeightRef.current ?? 0;
      const fallbackTop = scrollViewTopRef.current ?? 0;
      const fallbackHeight = scrollViewHeightRef.current ?? 0;
      if (fallbackHeight <= 0) {
        return;
      }

      const scrollMeasuredField = (viewport: {
        scrollViewTop: number;
        scrollViewHeight: number;
        keyboardHeight: number;
      }) => {
        const contentHeight = scrollContentHeightRef.current ?? 0;
        const maxScroll =
          contentHeight > 0
            ? Math.max(0, contentHeight - viewport.scrollViewHeight)
            : undefined;

        const measure = (x: number, y: number, _w: number, h: number) => {
          const target = computeKeyboardScrollTarget({
            fieldTop: y,
            fieldHeight: h,
            scrollViewTop: viewport.scrollViewTop,
            scrollViewHeight: viewport.scrollViewHeight,
            keyboardHeight: viewport.keyboardHeight,
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
      };

      // Measure the ScrollView frame in window coordinates so the visible fold
      // is derived from the keyboard's actual position. This avoids the
      // Android adjustResize race where onLayout shrinks scrollViewHeightRef
      // while keyboardHeight is ALSO subtracted downstream (double count).
      if (typeof scrollView.measureInWindow === "function") {
        try {
          scrollView.measureInWindow((_x: number, y: number, _w: number, h: number) => {
            scrollMeasuredField(
              effectiveKeyboardViewport({
                scrollViewTopWindow: y,
                scrollViewBottomWindow: y + h,
                keyboardHeight: height,
                keyboardTopScreenY: keyboardTopScreenYRef.current ?? null,
                statusBarHeight: StatusBar.currentHeight ?? 0,
                isAndroid: Platform.OS === "android",
              })
            );
          });
          return;
        } catch {
          // Fall through to the ref-based viewport below.
        }
      }
      scrollMeasuredField({
        scrollViewTop: fallbackTop,
        scrollViewHeight: fallbackHeight,
        keyboardHeight: height,
      });
    },
    [
      focusedFieldRef,
      keyboardHeightRef,
      keyboardTopScreenYRef,
      scrollContentHeightRef,
      scrollOffsetRef,
      scrollViewHeightRef,
      scrollViewRef,
      scrollViewTopRef,
    ]
  );

  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTargetRef = useRef<number | null>(null);
  const revealStartOffsetRef = useRef(0);

  // Scrolls a newly expanded element (e.g. a device body) into the
  // keyboard-adjusted viewport with the minimal reveal needed. The trigger is
  // the onLayout of the element that only exists once expanded, so the
  // measurement is layout-settled rather than timing-based. The animated
  // target is re-asserted on the next tick because content can still be
  // growing below the fold when the first measurement runs (stale max scroll).
  const scrollElementIntoView = useCallback(
    (ref: React.RefObject<View | null> | View | null, padding: number = REVEAL_PADDING) => {
      if (revealTimeoutRef.current != null) {
        clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
      const scrollView = scrollViewRef.current;
      const node = (ref as React.RefObject<View>)?.current ?? (ref as View | null);
      if (
        !scrollView ||
        !node ||
        typeof scrollView.scrollTo !== "function" ||
        typeof node.measureInWindow !== "function"
      ) {
        return;
      }

      const maxScrollFor = (viewport: {
        scrollViewTop: number;
        scrollViewHeight: number;
        keyboardHeight: number;
      }) => {
        const contentHeight = scrollContentHeightRef.current ?? 0;
        return contentHeight > 0
          ? Math.max(0, contentHeight - viewport.scrollViewHeight)
          : undefined;
      };

      const revealOnce = () => {
        if (
          typeof scrollView.measureInWindow !== "function" ||
          typeof node.measureInWindow !== "function"
        ) {
          return;
        }
        try {
          scrollView.measureInWindow((_x: number, svY: number, _w: number, svH: number) => {
            const viewport = effectiveKeyboardViewport({
              scrollViewTopWindow: svY,
              scrollViewBottomWindow: svY + svH,
              keyboardHeight: keyboardHeightRef.current ?? 0,
              keyboardTopScreenY: keyboardTopScreenYRef.current ?? null,
              statusBarHeight: StatusBar.currentHeight ?? 0,
              isAndroid: Platform.OS === "android",
            });
            node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
              const desired = computeRevealScrollTarget({
                itemTop: y,
                itemHeight: h,
                scrollViewTop: viewport.scrollViewTop,
                scrollViewHeight: viewport.scrollViewHeight,
                keyboardHeight: viewport.keyboardHeight,
                currentOffset: scrollOffsetRef.current ?? 0,
                padding,
                maxScroll: maxScrollFor(viewport),
              });
              if (desired == null) {
                return;
              }
              const currentOffset = scrollOffsetRef.current ?? 0;
              const prevTarget = revealTargetRef.current;
              const prevStart = revealStartOffsetRef.current;
              // Position-independent guard: if the element's position relative
              // to the viewport is unchanged, the first (animated) scroll is
              // still in flight or already handled this pass - skip it.
              if (
                prevTarget != null &&
                Math.abs(desired - currentOffset - (prevTarget - prevStart)) < 1
              ) {
                return;
              }
              revealStartOffsetRef.current = currentOffset;
              revealTargetRef.current = desired;
              scrollView.scrollTo({ x: 0, y: desired, animated: true });
            });
          });
        } catch {
          // Measurement is best-effort; never let a reveal gesture break the form.
        }
      };

      revealOnce();
      if (revealTimeoutRef.current != null) {
        clearTimeout(revealTimeoutRef.current);
      }
      revealTimeoutRef.current = setTimeout(() => {
        revealTimeoutRef.current = null;
        revealOnce();
      }, 0);
    },
    [keyboardHeightRef, keyboardTopScreenYRef, scrollContentHeightRef, scrollOffsetRef, scrollViewRef]
  );

  useEffect(
    () => () => {
      if (revealTimeoutRef.current != null) {
        clearTimeout(revealTimeoutRef.current);
      }
    },
    []
  );

  // Stable indirection so effects can reach the latest scroll callback without
  // re-running the keyboard subscriptions on every render.
  const scrollFocusedFieldIntoViewRef = useRef(scrollFocusedFieldIntoView);
  scrollFocusedFieldIntoViewRef.current = scrollFocusedFieldIntoView;

  const onKeyboardDidShow = useCallback(
    (event?: { endCoordinates?: { height: number; screenY?: number } }) => {
      const end = event?.endCoordinates;
      const height = end?.height ?? Keyboard.metrics()?.height ?? 0;
      keyboardTopScreenYRef.current =
        typeof end?.screenY === "number"
          ? end.screenY
          : (Keyboard.metrics()?.screenY ?? null);
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
    },
    [keyboardHeightRef]
  );

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", onKeyboardDidShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeightRef.current = 0;
      keyboardTopScreenYRef.current = null;
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
    // The bottom content inset and the Android adjustResize shrink are applied
    // by the native side asynchronously after keyboardDidShow. Re-assert once
    // the layout settles so a bottom field reaches the corrected fold even if
    // the first pass ran against a stale max scroll.
    const retryTimer = setTimeout(() => {
      const latest = focusedFieldRef.current;
      if (latest) {
        scrollFocusedFieldIntoViewRef.current(latest);
      }
    }, 150);
    return () => clearTimeout(retryTimer);
  }, [focusedFieldRef, keyboardHeight]);

  return (
    <InspectionScrollContext.Provider
      value={{
        scrollViewRef,
        scrollOffsetRef,
        scrollViewTopRef,
        scrollViewHeightRef,
        setDropdownOpen,
        scrollFocusedFieldIntoView,
        scrollElementIntoView,
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