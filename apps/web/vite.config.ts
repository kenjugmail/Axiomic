/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Sprint 67d — manualChunks for vendor splitting. The app
        // shell loads identical vendor code across every route; this
        // pulls them into named chunks so a app-only deploy doesn't
        // invalidate the user's cached vendor bundles.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-router")) return "vendor-router";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("zustand")) return "vendor-state";
          // Heavy markdown chain stays in the existing MarkdownRenderer
          // chunk; no need to override.
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    // Don't pull e2e specs into the unit-test runner.
    exclude: ["node_modules", "dist", "e2e/**"],
  },
});
