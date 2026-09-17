let accelerometerSubscription: { remove: () => void } | null = null;
let accelerometerCallback: ((data: { x: number; y: number; z: number }) => void) | null = null;
let updateInterval = 500;

export const Accelerometer = {
  setUpdateInterval: jest.fn((interval: number) => {
    updateInterval = interval;
  }),
  addListener: jest.fn((callback: (data: { x: number; y: number; z: number }) => void) => {
    accelerometerCallback = callback;
    return {
      remove: () => {
        accelerometerCallback = null;
      },
    };
  }),
  removeAllListeners: jest.fn(),
  __setMockAcceleration: (x: number, y: number, z: number) => {
    if (accelerometerCallback) {
      accelerometerCallback({ x, y, z });
    }
  },
  __reset: () => {
    accelerometerCallback = null;
    accelerometerSubscription = null;
  },
};