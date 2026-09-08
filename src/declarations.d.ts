// Ambient declarations for build plugins and non-TS modules


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
