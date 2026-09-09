// PDF "EM FORMATO DE PLANILHA" (09/09/2026, pedido do Lucas): a contabilidade
// às vezes quer o PDF, não o Excel. Em vez de uma biblioteca de PDF (pesada e
// sem tabela decente), abrimos uma janela só com a(s) tabela(s) e chamamos a
// impressão do navegador — "Salvar como PDF" sai paisagem, com cabeçalho
// colorido, moeda e linha de total, igual ao .xlsx. Mesmo XlsxSheet alimenta os
// dois formatos: nunca há dois números diferentes.
import type { XlsxRow, XlsxSheet } from "./xlsxWriter";

const escape = (texto: string) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function formataCelula(valor: XlsxRow[number], kind: XlsxSheet["columns"][number]["kind"]) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (kind === "dinheiro" && typeof valor === "number") return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (kind === "data" && typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10).split("-").reverse().join("/");
  if (kind === "percentual" && typeof valor === "number") return `${(valor * 100).toFixed(1).replace(".", ",")}%`;
  if (kind === "numero" && typeof valor === "number") return valor.toLocaleString("pt-BR");
  return String(valor);
}

function tabelaHtml(aba: XlsxSheet) {
  const alinhamento = (kind: XlsxSheet["columns"][number]["kind"]) => (kind === "dinheiro" || kind === "numero" || kind === "percentual" ? ' class="num"' : "");
  const cabecalho = aba.columns.map((coluna) => `<th${alinhamento(coluna.kind)}>${escape(coluna.header)}</th>`).join("");
  const linha = (valores: XlsxRow, classe = "") =>
    `<tr${classe ? ` class="${classe}"` : ""}>${aba.columns
      .map((coluna, indice) => `<td${alinhamento(coluna.kind)}>${escape(formataCelula(valores[indice], coluna.kind))}</td>`)
      .join("")}</tr>`;
  const corpo = aba.rows.length
    ? aba.rows.map((valores) => linha(valores)).join("")
    : `<tr><td colspan="${aba.columns.length}" class="vazio">Sem lançamentos no período.</td></tr>`;
  const total = aba.totalRow ? linha(aba.totalRow, "total") : "";
  return `<section>
  ${aba.title ? `<h1>${escape(aba.title)}</h1>` : ""}
  ${aba.subtitle ? `<p class="sub">${escape(aba.subtitle)}</p>` : ""}
  <table${aba.columns.length > 9 ? ' class="larga"' : ""}><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody>${total ? `<tfoot>${total}</tfoot>` : ""}</table>
</section>`;
}

/** Monta o documento imprimível (exportado para teste). */
export function htmlDasPlanilhas(titulo: string, abas: XlsxSheet[]) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(titulo)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font: 11px/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2a1f; margin: 0; padding: 16px; }
  section { page-break-after: always; }
  section:last-child { page-break-after: auto; }
  h1 { font-size: 15px; margin: 0 0 2px; color: #3b4a2f; letter-spacing: .02em; }
  .sub { margin: 0 0 10px; color: #5f6b55; font-size: 10.5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #c9cfbf; padding: 4px 6px; vertical-align: top; }
  th { background: #3b4a2f; color: #fff; text-transform: uppercase; font-size: 10px; letter-spacing: .03em; text-align: left; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tbody tr:nth-child(even) td { background: #f4f6ef; }
  tfoot td { font-weight: 700; background: #e6ebd9; }
  table.larga { font-size: 9px; }
  table.larga th, table.larga td { padding: 3px 4px; }
  td.vazio { text-align: center; color: #7a8570; padding: 14px; }
  .barra { position: fixed; top: 8px; right: 12px; display: flex; gap: 8px; }
  .barra button { font: 600 12px inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid #3b4a2f; background: #3b4a2f; color: #fff; cursor: pointer; }
  .barra button.sec { background: #fff; color: #3b4a2f; }
  @media print { .barra { display: none; } body { padding: 0; } }
</style></head><body>
<div class="barra"><button type="button" onclick="window.print()">Salvar em PDF / Imprimir</button><button type="button" class="sec" onclick="window.close()">Fechar</button></div>
${abas.map(tabelaHtml).join("\n")}
</body></html>`;
}

/** Abre a janela de impressão com as abas. Se o navegador bloquear a janela, avisa. */
export function imprimirPlanilhas(titulo: string, abas: XlsxSheet[]) {
  const janela = window.open("", "_blank", "noopener,width=1200,height=800");
  if (!janela) {
    window.alert("O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.");
    return;
  }
  janela.document.open();
  janela.document.write(htmlDasPlanilhas(titulo, abas));
  janela.document.close();
  janela.focus();
  // Dá tempo de a fonte e a tabela renderizarem antes do diálogo de impressão.
  janela.setTimeout(() => janela.print(), 350);
}
