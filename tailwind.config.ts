import type { Config } from "tailwindcss";

// PAPEL & MUSGO (08/10/2026): cor nova = canal RGB da variável CSS, para aceitar
// opacidade (bg-musgo/10, border-fio/60). Os valores moram em src/styles/globals.css,
// nos dois temas; aqui só se dá nome a eles.
const canal = (nome: string) => `rgb(var(--${nome}-rgb) / <alpha-value>)`;

// Família das letras. Fraunces SÓ em título de página, número principal e data;
// Manrope em todo o resto (menu, botão, tabela, lista). Arquivos self-hosted
// (@font-face em globals.css) porque a CSP só aceita font-src 'self'.
const SANS = ["Manrope", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"];
const SERIFA = ["Fraunces", "Georgia", "Times New Roman", "serif"];

const config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1200px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Nomes ANTIGOS (~70 telas). Continuam valendo e agora apontam para a
        // paleta nova (globals.css). Ficam sem opacidade DE PROPÓSITO: hoje
        // ~1.400 classes como `border-brand-oliva/20` e `bg-brand-creme/40` não
        // geram CSS nenhum (a borda cai no --border, o fundo fica transparente) e
        // as telas foram desenhadas vendo esse resultado. Ligar a opacidade aqui
        // mudaria todas elas de uma vez, sem conferência. Tela redesenhada usa
        // os nomes novos abaixo, que aceitam /opacidade.
        brand: {
          musgo: "var(--bratan-musgo)",
          oliva: "var(--bratan-oliva)",
          dourado: "var(--bratan-dourado)",
          creme: "var(--bratan-creme)",
          papel: "var(--bratan-papel)",
          tinta: "var(--bratan-tinta)",
        },

        // ---- Papel & Musgo (nomes NOVOS) ----
        // Superfícies, da mais funda à mais alta: mesa (menu) · papel (fundo) ·
        // saber (bloco de leitura, sem borda) · folha (bloco de decisão, com borda).
        mesa: canal("mesa"),
        papel: canal("papel"),
        saber: canal("saber"),
        folha: canal("folha"),
        fio: { DEFAULT: canal("fio"), 2: canal("fio-2") },
        "borda-campo": canal("borda-campo"),
        // Texto: tinta (principal) e tinta-2 (secundário, 5,8:1).
        tinta: { DEFAULT: canal("tinta"), 2: canal("tinta-2") },
        "sobre-musgo": canal("sobre-musgo"),
        // Musgo = ação, foco, link.
        musgo: {
          DEFAULT: canal("musgo"),
          forte: canal("musgo-forte"),
          fundo: canal("musgo-fundo"),
          claro: canal("musgo-claro"),
          "claro-2": canal("musgo-claro-2"),
          noite: canal("musgo-noite"),
        },
        // Oliva = SÓ ícone. Dourado = SÓ enfeite. Nenhum dos dois vira texto
        // (3,5:1 e 2,2:1) — o teste redesenho-fundacao confere nos componentes.
        oliva: canal("oliva"),
        dourado: canal("dourado"),
        // O ouro marca o agora: `ouro-fio` é o traço (aba, subitem, relógio);
        // `ouro` é o ouro quando vira texto (5,3:1).
        ouro: { DEFAULT: canal("ouro"), fio: canal("ouro-fio"), claro: canal("ouro-claro") },
        creme: canal("creme"),
        marca: canal("marca"),
        // Situações — sempre com palavra ao lado, nunca só a cor.
        atencao: { DEFAULT: canal("atencao"), claro: canal("atencao-claro") },
        erro: { DEFAULT: canal("erro"), claro: canal("erro-claro") },
        ok: { DEFAULT: canal("ok"), claro: canal("ok-claro") },
        petroleo: { DEFAULT: canal("petroleo"), claro: canal("petroleo-claro") }, // só "a caminho"
        aviso: { fundo: canal("aviso-fundo"), texto: canal("aviso-texto"), acao: canal("aviso-acao") },
        foco: canal("foco"),
      },
      // Os nomes antigos como COR DE TEXTO passam no AA (08/10/2026): o oliva vira
      // a tinta 2 e o dourado vira o ouro de texto. Fundo, borda e anel continuam
      // com o oliva/dourado de sempre (só a utilitária text-* muda).
      textColor: {
        brand: {
          oliva: "var(--tinta-2)",
          dourado: "var(--ouro)",
        },
      },
      fontFamily: {
        // `heading` era a SF Pro Display; hoje é a mesma Manrope do texto (o
        // título com serifa é só o do componente Cabecalho).
        heading: SANS,
        sans: SANS,
        serifa: SERIFA,
      },
      // Escala de letra 12/13/14/16/20/24/32/40: os tamanhos do Tailwind já são
      // os do guia em 12 (text-xs), 14 (text-sm), 16 (text-base), 20 (text-xl) e
      // 24 (text-2xl); 13, 32 e 40 vão como text-[13px], text-[32px], text-[40px].
      // NÃO crie chaves como `text-14`: o tailwind-merge do `cn()` entende
      // `text-14` como COR e apaga a outra cor da mesma lista (text-tinta-2).
      // Espaço 4–64: a escala padrão do Tailwind já é a do guia
      // (1=4 · 2=8 · 3=12 · 4=16 · 6=24 · 8=32 · 12=48 · 16=64).
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
        // Raio do guia: 6 controle (botão, campo, selo) · 10 bloco (folha,
        // saber, aviso) · 16 painel (janela, barra do celular).
        controle: "6px",
        bloco: "10px",
        painel: "16px",
      },
      boxShadow: {
        calm: "0 18px 40px rgba(43, 46, 36, 0.08)",
        ios: "0 22px 55px rgba(43, 46, 36, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.68)",
        "ios-dock": "0 22px 60px rgba(43, 46, 36, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
        // Sombra só no que flutua: painel de detalhe, ⌘K, aviso com Desfazer, barra do celular.
        flutua: "var(--sombra-flutua)",
      },
      transitionTimingFunction: {
        papel: "cubic-bezier(.2, .7, .2, 1)",
      },
      keyframes: {
        spotlight: {
          "0%": { opacity: "0", transform: "translate(-72%, -62%) scale(0.5)" },
          "100%": { opacity: "1", transform: "translate(-50%, -40%) scale(1)" },
        },
      },
      animation: {
        spotlight: "spotlight 2s ease 0.75s 1 forwards",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
