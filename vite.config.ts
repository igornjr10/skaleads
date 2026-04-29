import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("react-dom") || id.includes("react-router-dom") || id.includes("react/")) {
            return "react-vendor";
          }

          if (id.includes("@tanstack/") || id.includes("@supabase/")) {
            return "data-vendor";
          }

          if (id.includes("@radix-ui/")) {
            return "radix-vendor";
          }

          if (id.includes("recharts")) {
            return "charts-vendor";
          }

          if (id.includes("@react-pdf/renderer")) {
            return "pdf-vendor";
          }

          if (id.includes("react-markdown")) {
            return "markdown-vendor";
          }

          if (id.includes("lucide-react")) {
            return "icons-vendor";
          }

          if (id.includes("date-fns")) {
            return "date-vendor";
          }

          if (id.includes("class-variance-authority") || id.includes("clsx") || id.includes("tailwind-merge") || id.includes("tailwindcss-animate")) {
            return "style-vendor";
          }

          if (id.includes("sonner") || id.includes("next-themes")) {
            return "app-ui-vendor";
          }

          return;
        },
      },
    },
  },
}));
