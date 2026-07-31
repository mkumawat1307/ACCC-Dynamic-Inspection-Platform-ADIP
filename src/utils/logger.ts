const IS_PROD = typeof __DEV__ === "undefined" ? false : !__DEV__;

export const logger = {
  info: (...args: unknown[]) => {
    if (!IS_PROD) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (!IS_PROD) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  debug: (...args: unknown[]) => {
    if (!IS_PROD) console.log(...args);
  },
};
