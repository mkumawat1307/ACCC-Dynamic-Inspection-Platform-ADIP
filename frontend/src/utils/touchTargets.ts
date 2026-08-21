import { Platform, Insets } from "react-native";

const BASE_HIT_SLOP: Insets = Platform.select({
  android: { top: 8, bottom: 8, left: 8, right: 8 },
  ios: { top: 6, bottom: 6, left: 6, right: 6 },
  default: { top: 6, bottom: 6, left: 6, right: 6 },
});

export const TOUCH_TARGETS = {
  hitSlop: BASE_HIT_SLOP,

  compactHitSlop: Platform.select({
    android: { top: 6, bottom: 6, left: 6, right: 6 },
    ios: { top: 4, bottom: 4, left: 4, right: 4 },
    default: { top: 4, bottom: 4, left: 4, right: 4 },
  }) as Insets,

  sectionHeaderPadding: Platform.select({
    android: 14,
    ios: 12,
    default: 12,
  }) as number,

  dropdownHitSlop: Platform.select({
    android: { top: 10, bottom: 10, left: 4, right: 4 },
    ios: { top: 8, bottom: 8, left: 4, right: 4 },
    default: { top: 8, bottom: 8, left: 4, right: 4 },
  }) as Insets,
};
