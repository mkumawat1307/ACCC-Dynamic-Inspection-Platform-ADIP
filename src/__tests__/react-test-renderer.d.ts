declare module "react-test-renderer" {
  import { ReactElement } from "react";
  interface TestRenderer {
    create(element: ReactElement): TestInstance;
    act(callback: () => void | Promise<void>): Promise<void>;
  }
  interface TestInstance {
    toJSON(): unknown;
    unmount(): void;
  }
  const renderer: TestRenderer;
  export default renderer;
  export function create(element: ReactElement): TestInstance;
  export function act(callback: () => void | Promise<void>): Promise<void>;
}
