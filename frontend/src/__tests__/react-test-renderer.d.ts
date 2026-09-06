declare module "react-test-renderer" {
  import { ComponentType, ReactElement } from "react";
  interface TestRenderer {
    create(element: ReactElement, options?: object): TestInstance;
    act(callback: () => void | Promise<void>): Promise<void>;
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
  export function act(callback: () => void | Promise<void>): Promise<void>;
}
