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
          // Sprint 68 (post-S67) — explicit splits for the markdown
          // stack so each piece loads at the right boundary:
          //
          //   vendor-markdown — react-markdown + the static unified
          //     processor + sanitize + parser utilities. Loads once
          //     for any page that renders prose; shared across all
          //     route chunks that import MarkdownRenderer.
          //
          //   vendor-katex — rehype-katex + katex runtime + symbol
          //     tables. Only loaded by the dynamic import in
          //     MarkdownRenderer.tsx when content contains $...$ math.
          //
          //   vendor-highlight — rehype-highlight + highlight.js.
          //     Same dynamic-import path; only loads when fenced
          //     code is rendered.
          //
          // Rollup emits a "Circular chunk" notice between
          // vendor-markdown and vendor-katex/highlight because the
          // unified mdast utilities are shared. The warning is
          // non-fatal — at runtime the chunks load in the right
          // order (markdown first via static import; katex/highlight
          // afterward via dynamic import).
          if (id.includes("/rehype-katex/") || id.includes("/katex/")) {
            return "vendor-katex";
          }
          if (
            id.includes("/rehype-highlight/") ||
            id.includes("/highlight.js/") ||
            id.includes("/lowlight/")
          ) {
            return "vendor-highlight";
          }
          if (
            id.includes("/react-markdown/") ||
            id.includes("/remark-") ||
            id.includes("/rehype-sanitize/") ||
            id.includes("/mdast-") ||
            id.includes("/hast-") ||
            id.includes("/unified/") ||
            id.includes("/micromark") ||
            id.includes("/vfile") ||
            id.includes("/unist-")
          ) {
            return "vendor-markdown";
          }
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
