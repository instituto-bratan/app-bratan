// Rota preguiçosa do guia visual (08/10/2026): o guia só baixa quando alguém abre
// /ajustes/guia-visual. Mora aqui (e não em lib/routePreload.ts) para o App.tsx
// ganhar só duas linhas nesta etapa do redesenho.
import { lazy } from "react";

export const GuiaVisualPagina = lazy(() => import("./guia-visual").then((modulo) => ({ default: modulo.GuiaVisualPagina })));
