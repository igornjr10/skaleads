import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // O client do Supabase exige as duas no import. No CI nao ha .env, e os
    // testes que so importam um modulo que usa o client quebravam antes de
    // rodar. Valores ficticios: nenhum teste fala com o banco de verdade.
    env: {
      VITE_SUPABASE_URL: "https://teste.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "chave-de-teste",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
