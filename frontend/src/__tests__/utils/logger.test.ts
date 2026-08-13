const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalTrace = console.trace;

let logCalls: unknown[][] = [];
let warnCalls: unknown[][] = [];
let errorCalls: unknown[][] = [];
let traceCalls: unknown[][] = [];

beforeEach(() => {
  logCalls = [];
  warnCalls = [];
  errorCalls = [];
  traceCalls = [];
  console.log = (...args: unknown[]) => { logCalls.push(args); };
  console.warn = (...args: unknown[]) => { warnCalls.push(args); };
  console.error = (...args: unknown[]) => { errorCalls.push(args); };
  console.trace = (...args: unknown[]) => { traceCalls.push(args); };
});

afterEach(() => {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
  console.trace = originalTrace;
  jest.resetModules();
});

it("logs info when __DEV__ is true", () => {
  global.__DEV__ = true;
  const { logger } = require("@/src/utils/logger");
  logger.info("test info", 42);
  expect(logCalls).toEqual([["test info", 42]]);
});

it("does not log info when __DEV__ is false", () => {
  global.__DEV__ = false;
  const { logger } = require("@/src/utils/logger");
  logger.info("should not appear");
  expect(logCalls).toEqual([]);
});

it("logs warn when __DEV__ is true", () => {
  global.__DEV__ = true;
  const { logger } = require("@/src/utils/logger");
  logger.warn("warning");
  expect(warnCalls).toEqual([["warning"]]);
});

it("does not log warn when __DEV__ is false", () => {
  global.__DEV__ = false;
  const { logger } = require("@/src/utils/logger");
  logger.warn("should not appear");
  expect(warnCalls).toEqual([]);
});

it("always logs error regardless of __DEV__", () => {
  global.__DEV__ = false;
  const { logger } = require("@/src/utils/logger");
  logger.error("crash", new Error("fail"));
  expect(errorCalls).toHaveLength(1);
  expect(errorCalls[0][0]).toBe("crash");
});

it("always logs error when __DEV__ is true", () => {
  global.__DEV__ = true;
  const { logger } = require("@/src/utils/logger");
  logger.error("crash", new Error("fail"));
  expect(errorCalls).toHaveLength(1);
});

it("logs debug when __DEV__ is true", () => {
  global.__DEV__ = true;
  const { logger } = require("@/src/utils/logger");
  logger.debug("debug info");
  expect(logCalls).toEqual([["debug info"]]);
});

it("does not log debug when __DEV__ is false", () => {
  global.__DEV__ = false;
  const { logger } = require("@/src/utils/logger");
  logger.debug("should not appear");
  expect(logCalls).toEqual([]);
});

it("logs trace when __DEV__ is true", () => {
  global.__DEV__ = true;
  const { logger } = require("@/src/utils/logger");
  logger.trace("trace info");
  expect(traceCalls).toEqual([["trace info"]]);
});

it("does not log trace when __DEV__ is false", () => {
  global.__DEV__ = false;
  const { logger } = require("@/src/utils/logger");
  logger.trace("should not appear");
  expect(traceCalls).toEqual([]);
});
