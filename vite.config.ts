import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Base absoluta: o app é servido na raiz do Vercel e precisa disso para o PWA
  // (service worker + rotas profundas) resolver os assets corretamente.
  base: "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      // Duas páginas (28/10/2026): o APP BRATAN e o APP DO DOUTOR (/doutor/), que
      // leva só a ponte com o sistema (src/doutor/ponte.ts); o resto dele é a v22
      // estática em public/doutor/.
      input: {
        index: path.resolve(__dirname, "index.html"),
        doutor: path.resolve(__dirname, "doutor/index.html"),
      },
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
