import { defineConfig } from "vite";

// Vite config tuned for Tauri v2.
// - fixed dev server port so tauri.conf.json can point at it
// - do not clear the screen on rebuild so Rust build logs stay visible
// - expose env vars prefixed with VITE_ and TAURI_
export default defineConfig({
  root: ".",
  publicDir: "public",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    outDir: "dist",
    emptyOutDir: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
