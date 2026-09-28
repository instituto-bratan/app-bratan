// ESTILO DO PLANO ALIMENTAR IMPRESSO (28/09/2026).
//
// Um CSS só, usado na prévia da tela e no PDF da estação: é o que garante que
// a prévia e o PDF sejam a mesma página. Pedidos da Dra. Géssica (áudio):
// profissional e elegante, didático e lúdico, bolinha verde ao lado de cada
// alimento, espaçamento adequado entre as linhas ("nada muito apertado, mas
// também sem muito espaço em branco"), refeição nunca partida entre páginas e
// espaço elegante no cabeçalho e no rodapé. Identidade do Instituto Bratan
// (Musgo, Oliva, Dourado); fontes Fraunces e Manrope até as oficiais chegarem.
import fraunces400 from "@fontsource/fraunces/files/fraunces-latin-400-normal.woff2?url";
import fraunces500 from "@fontsource/fraunces/files/fraunces-latin-500-normal.woff2?url";
import fraunces600 from "@fontsource/fraunces/files/fraunces-latin-600-normal.woff2?url";
import manrope400 from "@fontsource/manrope/files/manrope-latin-400-normal.woff2?url";
import manrope600 from "@fontsource/manrope/files/manrope-latin-600-normal.woff2?url";
import manrope700 from "@fontsource/manrope/files/manrope-latin-700-normal.woff2?url";

export const FONTES: { familia: string; peso: number; url: string }[] = [
  { familia: "Plano Fraunces", peso: 400, url: fraunces400 },
  { familia: "Plano Fraunces", peso: 500, url: fraunces500 },
  { familia: "Plano Fraunces", peso: 600, url: fraunces600 },
  { familia: "Plano Manrope", peso: 400, url: manrope400 },
  { familia: "Plano Manrope", peso: 600, url: manrope600 },
  { familia: "Plano Manrope", peso: 700, url: manrope700 },
];

export function cssDasFontes(fontes: { familia: string; peso: number; url: string }[]): string {
  return fontes
    .map((f) => `@font-face{font-family:"${f.familia}";font-style:normal;font-weight:${f.peso};font-display:block;src:url("${f.url}") format("woff2");}`)
    .join("\n");
}

/** Medidas da folha em milímetros: a paginação usa as mesmas. */
export const FOLHA = { larguraMm: 210, alturaMm: 297, margemLateralMm: 18, cabecalhoMm: 30, rodapeMm: 16, espacoEntreBlocosPx: 14 };

export const CSS_DO_DOCUMENTO = `
.plano-doc { --pd-musgo:#4D563B; --pd-oliva:#7A895E; --pd-dourado:#C6A862; --pd-tinta:#2B2E24; --pd-suave:#6B705F; --pd-linha:#E6E2D3; --pd-creme:#FBF6E2;
  color: var(--pd-tinta); font-family: "Plano Manrope", "Manrope", system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
.plano-doc * { box-sizing: border-box; }
.plano-doc .pd-pagina { position: relative; width: ${FOLHA.larguraMm}mm; height: ${FOLHA.alturaMm}mm; background: #fff; overflow: hidden;
  padding: ${FOLHA.cabecalhoMm}mm ${FOLHA.margemLateralMm}mm ${FOLHA.rodapeMm}mm; }
.plano-doc .pd-cabecalho { position: absolute; top: 0; left: ${FOLHA.margemLateralMm}mm; right: ${FOLHA.margemLateralMm}mm; height: ${FOLHA.cabecalhoMm - 8}mm;
  display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 0.3mm solid var(--pd-linha); padding-bottom: 3mm; }
.plano-doc .pd-logo { height: 11mm; width: auto; display: block; }
.plano-doc .pd-logo-vazio { height: 11mm; width: 42mm; border: 0.3mm dashed var(--pd-oliva); border-radius: 2mm; display:flex; align-items:center; justify-content:center; font-size: 7pt; color: var(--pd-suave); letter-spacing: .08em; }
.plano-doc .pd-cab-direita { text-align: right; font-size: 7.5pt; color: var(--pd-suave); letter-spacing: .12em; text-transform: uppercase; }
.plano-doc .pd-corpo { display: flex; flex-direction: column; gap: ${FOLHA.espacoEntreBlocosPx}px; }
.plano-doc .pd-rodape { position: absolute; bottom: 0; left: ${FOLHA.margemLateralMm}mm; right: ${FOLHA.margemLateralMm}mm; height: ${FOLHA.rodapeMm - 6}mm;
  display: flex; align-items: flex-start; justify-content: space-between; border-top: 0.3mm solid var(--pd-linha); padding-top: 2.5mm; font-size: 7.5pt; color: var(--pd-suave); }
.plano-doc .pd-rodape span:last-child { font-variant-numeric: tabular-nums; }

.plano-doc .pd-titulo { font-family: "Plano Fraunces", "Fraunces", Georgia, serif; font-weight: 500; font-size: 21pt; line-height: 1.12; color: var(--pd-musgo); margin: 0; letter-spacing: -0.005em; }
.plano-doc .pd-nome { margin: 1.6mm 0 0; font-size: 11.5pt; font-weight: 600; color: var(--pd-tinta); }
.plano-doc .pd-filete { width: 14mm; height: 0.7mm; background: var(--pd-dourado); border-radius: 1mm; margin-top: 3mm; }

.plano-doc .pd-refeicao { border-top: 0.3mm solid var(--pd-linha); padding-top: 3.2mm; }
.plano-doc .pd-ref-titulo { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; margin: 0 0 2mm; }
.plano-doc .pd-ref-nome { font-family: "Plano Fraunces", "Fraunces", Georgia, serif; font-weight: 500; font-size: 14pt; color: var(--pd-musgo); line-height: 1.2; }
.plano-doc .pd-ref-emoji { margin-right: 1.8mm; font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif; font-size: 12pt; }
.plano-doc .pd-ref-opcional { font-family: "Plano Manrope", sans-serif; font-size: 9pt; font-weight: 600; color: var(--pd-suave); margin-left: 2mm; }
.plano-doc .pd-ref-hora { font-size: 9.5pt; font-weight: 700; color: var(--pd-oliva); font-variant-numeric: tabular-nums; white-space: nowrap; }
.plano-doc .pd-itens { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.6mm; }
.plano-doc .pd-item { display: grid; grid-template-columns: 3.4mm minmax(0, 1fr); column-gap: 2.2mm; font-size: 11pt; line-height: 1.45; }
.plano-doc .pd-bolinha { width: 2.3mm; height: 2.3mm; border-radius: 50%; background: var(--pd-oliva); margin-top: 1.55mm; }
.plano-doc .pd-item-nome { font-weight: 600; }
.plano-doc .pd-item-qtd { color: var(--pd-tinta); }
.plano-doc .pd-alt { grid-column: 2; font-size: 9.8pt; color: var(--pd-suave); margin-top: 0.4mm; }
.plano-doc .pd-alt b { font-weight: 600; color: var(--pd-tinta); }
.plano-doc .pd-obs { grid-column: 2; font-size: 9.8pt; font-style: italic; color: var(--pd-suave); margin-top: 0.4mm; }
.plano-doc .pd-ref-obs { margin: 2mm 0 0 5.6mm; font-size: 9.8pt; font-style: italic; color: var(--pd-suave); }

.plano-doc .pd-lista { border-top: 0.3mm solid var(--pd-linha); padding-top: 3.2mm; }
.plano-doc .pd-lista h3 { font-family: "Plano Fraunces", "Fraunces", Georgia, serif; font-weight: 500; font-size: 13pt; color: var(--pd-musgo); margin: 0 0 2mm; }
.plano-doc .pd-lista ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.2mm; }
.plano-doc .pd-lista li { display: grid; grid-template-columns: 3.4mm minmax(0,1fr); column-gap: 2.2mm; font-size: 10pt; line-height: 1.45; }
.plano-doc .pd-lista li .pd-bolinha { width: 1.9mm; height: 1.9mm; margin-top: 1.5mm; }
.plano-doc .pd-texto { font-size: 10.5pt; line-height: 1.5; color: var(--pd-tinta); background: var(--pd-creme); border-radius: 2mm; padding: 3mm 4mm; }

.plano-doc .pd-identificacao { border-top: 0.5mm solid var(--pd-dourado); padding-top: 3.5mm; font-size: 10pt; line-height: 1.55; }
.plano-doc .pd-identificacao .pd-id-nome { font-family: "Plano Fraunces", "Fraunces", Georgia, serif; font-weight: 600; font-size: 12.5pt; color: var(--pd-musgo); }

/* densidade compacta: só quando economiza uma página */
.plano-doc.pd-compacta .pd-item { font-size: 10.4pt; line-height: 1.38; }
.plano-doc.pd-compacta .pd-itens { gap: 1.1mm; }
.plano-doc.pd-compacta .pd-lista li { font-size: 9.5pt; line-height: 1.38; }
.plano-doc.pd-compacta .pd-refeicao, .plano-doc.pd-compacta .pd-lista { padding-top: 2.6mm; }

@page { size: A4; margin: 0; }
@media print {
  html, body { margin: 0; padding: 0; background: #fff; }
  .plano-doc .pd-pagina { break-after: page; page-break-after: always; }
  .plano-doc .pd-pagina:last-child { break-after: auto; page-break-after: auto; }
}
`;
