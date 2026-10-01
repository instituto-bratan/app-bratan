// BUILD DO APP DO PACIENTE (01/10/2026): o portal sozinho, sem o sistema da
// clínica, para virar o app da App Store (Capacitor, pasta dist-portal).
//  · entrada própria (portal.html → src/portal/main.tsx), que só importa o portal;
//  · a pasta public/ NÃO vai inteira: ela tem os fluxogramas e POPs internos.
//    Vão só as fontes e os ícones do portal.
//  · a página sai como index.html, que é o que o app nativo abre.
import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const ARQUIVOS_PUBLICOS_DO_PORTAL = [
  "fonts/Inter-variable.woff2",
  "fonts/Nunito-variable.woff2",
  "meu-192x192.png",
  "meu-512x512.png",
  "meu-apple-touch-icon.png",
  "meu-maskable-512x512.png",
  "meu.webmanifest",
];

function soOQueOPortalUsa(): Plugin {
  return {
    name: "portal-so-o-que-usa",
    apply: "build",
    closeBundle() {
      const pasta = path.resolve(__dirname, "dist-portal");
      const pagina = path.join(pasta, "portal.html");
      if (fs.existsSync(pagina)) fs.renameSync(pagina, path.join(pasta, "index.html"));
      for (const arquivo of ARQUIVOS_PUBLICOS_DO_PORTAL) {
        const de = path.resolve(__dirname, "public", arquivo);
        const para = path.resolve(__dirname, "dist-portal", arquivo);
        fs.mkdirSync(path.dirname(para), { recursive: true });
        fs.copyFileSync(de, para);
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  base: "/",
  plugins: [react(), soOQueOPortalUsa()],
  // Em desenvolvimento serve a pasta pública inteira (é só a máquina de quem programa).
  publicDir: command === "serve" ? "public" : false,
  build: {
    outDir: "dist-portal",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "portal.html"),
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
}));
