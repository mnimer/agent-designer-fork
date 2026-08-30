declare namespace JSX {
  interface Element {
    type: any;
    props: any;
    key: any;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module 'react' {
  export = React;
  export as namespace React;
  namespace React {
    type ReactNode = any;
    interface Context<T> {
      Provider: FC<{ value: T; children?: any }>;
      Consumer: FC<{ children: (value: T) => any }>;
    }
    type JSXElementConstructor<P> = ((props: P) => any) | (new (props: P) => any);
    interface ReactElement<P = any, T = any> {
      type: T;
      props: P;
      key: any;
    }
    interface Component<P = {}, S = {}> {}
    interface FunctionComponent<P = {}> {
      (props: P, context?: any): any;
      displayName?: string;
    }
    interface FC<P = {}> extends FunctionComponent<P> {}
    type CSSProperties = Record<string, any>;
    type MouseEvent<T = Element> = any;
    type ChangeEvent<T = Element> = any;
    type DragEvent<T = Element> = any;
    function createContext<T>(defaultValue: T): Context<T>;
    function useContext<T>(context: Context<T>): T;
    function useState<T>(initialState: T | (() => T)): [T, (newState: T | ((prevState: T) => T)) => void];
    function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
    function useMemo<T>(factory: () => T, deps: readonly any[] | undefined): T;
    function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly any[]): T;
    function useRef<T>(initialValue: T): { current: T };
    function memo<T extends React.ComponentType<any>>(Component: T): T;
    const StrictMode: FC<{ children?: any }>;
    namespace JSX {
      interface Element {
        type: any;
        props: any;
        key: any;
      }
      interface IntrinsicElements {
        [elemName: string]: any;
      }
    }
  }
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
  export namespace JSX {
    interface Element {
      type: any;
      props: any;
      key: any;
    }
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

declare module 'react-dom/client' {
  export interface Root {
    render(children: any): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare module 'vite' {
  export function defineConfig(config: any): any;
}

declare module 'vitest/config' {
  export function defineConfig(config: any): any;
}

declare module '@vitejs/plugin-react' {
  const plugin: () => any;
  export default plugin;
}

declare module '@tailwindcss/vite' {
  const plugin: () => any;
  export default plugin;
}
