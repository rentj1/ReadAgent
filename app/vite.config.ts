import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Force a single copy of React and Remotion regardless of where the
    // composition source files (book-reader/src/) resolve their node_modules.
    dedupe: ["react", "react-dom", "remotion", "@remotion/player"],
    alias: {
      // Pin all React imports to the app's own copy
      react: path.resolve("./node_modules/react"),
      "react-dom": path.resolve("./node_modules/react-dom"),
      "@": path.resolve(appDir, "src"),
      "@compositions": path.resolve(appDir, "../src/compositions"),
    },
  },
  server: {
    port: 5173,
    fs: {
      // Allow imports from the parent book-reader/src/ Remotion compositions
      allow: [".."],
    },
    proxy: {
      "/api": "http://localhost:3001",
      "/audio": "http://localhost:3001",
      "/covers": "http://localhost:3001",
      "/outputs": "http://localhost:3001",
      "/book-cover.jpg": "http://localhost:3001",
    },
  },
});
