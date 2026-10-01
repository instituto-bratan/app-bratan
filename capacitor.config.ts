// O APP DA APP STORE (01/10/2026): o portal do paciente (dist-portal, gerado
// pelo build:portal) embrulhado num app nativo de iPhone pelo Capacitor.
// O identificador (appId) vira permanente quando o app é registrado no App
// Store Connect: até lá dá para trocar aqui.
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.institutobratan.meubratan",
  appName: "Meu Bratan",
  webDir: "dist-portal",
  // a cor de fundo do portal no escuro: o app abre sem piscar branco
  backgroundColor: "#102019",
  ios: {
    // o portal já respeita o entalhe e a barra de baixo (env(safe-area-inset-*))
    contentInset: "never",
    // o portal não tem links para fora que precisem abrir dentro do app
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
