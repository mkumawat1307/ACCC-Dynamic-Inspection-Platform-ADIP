export {};

declare module "expo-location" {
  export function __setPermissionStatus(status: "granted" | "denied" | "undetermined"): void;
  export function __setMockLocation(latitude: number, longitude: number): void;
  export function __resetLocationState(): void;
}

declare module "expo-document-picker" {
  export function __setMockResult(result: { canceled: boolean; assets?: { uri: string; name?: string; size?: number }[] }): void;
  export function __resetPickerState(): void;
}

declare module "react-test-renderer" {
  import { ComponentType, ReactElement } from "react";
  interface TestRenderer {
    create(element: ReactElement, options?: object): TestInstance;
    act(callback: () => void | Promise<void>): void;
  }
  interface TestInstance {
    root: TestInstance;
    toJSON(): unknown;
    toTree(): unknown;
    update(element: ReactElement): void;
    unmount(): void;
    findByType(type: ComponentType<unknown>): TestInstance;
    find(predicate: (instance: TestInstance) => boolean): TestInstance;
    findAll(predicate: (instance: TestInstance) => boolean, options?: { deep: boolean }): TestInstance[];
    props: Record<string, unknown>;
    children: (TestInstance | string)[];
  }
  const renderer: TestRenderer;
  export default renderer;
  export function create(element: ReactElement, options?: object): TestInstance;
  export function act(callback: () => void | Promise<void>): void;
}
