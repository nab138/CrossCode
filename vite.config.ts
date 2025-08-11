import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";

// https://vitejs.dev/config/
const plugins = [react()];

export default defineConfig(async () => ({
  plugins: plugins,
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  worker: {
    format: "es" as const,
  },
  build: {
    rollupOptions: {
      input: {
        index: "./index.html",
        splash: "./splash.html",
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [importMetaUrlPlugin],
    },
    include: ["vscode-textmate", "vscode-oniguruma"],
  },
}));
