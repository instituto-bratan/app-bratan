// Exportação de relatórios em PDF com a identidade visual do Instituto Bratan.
// Abre uma janela de impressão já formatada (verde musgo, dourado, creme) e
// dispara o diálogo do navegador — "Salvar como PDF" gera o arquivo final.

export type PdfSection = {
  heading: string;
  lines?: string[];
  table?: { headers: string[]; rows: string[][] };
};

export type BrandedPdfOptions = {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  footerNote?: string;
  author?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function exportBrandedPdf(options: BrandedPdfOptions) {
  const printWindow = window.open("", "_blank", "width=900,height=1100");
  if (!printWindow) return false;

  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });
  const sectionsHtml = options.sections
    .map((section) => {
      const lines = (section.lines ?? [])
        .map((line) =>
          line.trim()
            ? `<p class="line">${escapeHtml(line)}</p>`
            : `<div class="spacer"></div>`,
        )
        .join("");
      const table = section.table
        ? `<table><thead><tr>${section.table.headers
            .map((header) => `<th>${escapeHtml(header)}</th>`)
            .join("")}</tr></thead><tbody>${section.table.rows
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
            )
            .join("")}</tbody></table>`
        : "";
      return `<section><h2>${escapeHtml(section.heading)}</h2>${lines}${table}</section>`;
    })
    .join("");

  printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)}</title>
<style>
  :root {
    --musgo: #4A5D3A;
    --oliva: #7A8450;
    --dourado: #C6A862;
    --creme: #F4EFE4;
    --tinta: #2B2B26;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--tinta); background: #fff; padding: 48px 52px; }
  header { border-bottom: 3px solid var(--dourado); padding-bottom: 18px; margin-bottom: 26px; display: flex; justify-content: space-between; align-items: flex-end; }
  .brand { font-size: 12px; letter-spacing: 0.28em; text-transform: uppercase; color: var(--oliva); font-weight: 700; }
  h1 { font-size: 26px; color: var(--musgo); margin-top: 6px; line-height: 1.2; }
  .subtitle { margin-top: 4px; font-size: 13px; color: var(--oliva); }
  .stamp { text-align: right; font-size: 11px; color: var(--oliva); }
  section { margin-bottom: 22px; break-inside: avoid; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--musgo); background: var(--creme); border-left: 4px solid var(--dourado); padding: 7px 12px; border-radius: 0 8px 8px 0; margin-bottom: 10px; }
  .line { font-size: 13px; line-height: 1.65; padding-left: 4px; }
  .spacer { height: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
  th { text-align: left; background: var(--musgo); color: var(--creme); padding: 7px 9px; font-weight: 600; }
  td { padding: 6px 9px; border-bottom: 1px solid #e4e0d2; }
  tbody tr:nth-child(even) { background: #faf8f1; }
  footer { margin-top: 34px; border-top: 1px solid var(--dourado); padding-top: 10px; font-size: 10px; color: var(--oliva); display: flex; justify-content: space-between; }
  @media print { body { padding: 24px 28px; } }
</style>
</head>
<body>
  <header>
    <div>
      <div class="brand">Instituto Bratan · APP BRATAN</div>
      <h1>${escapeHtml(options.title)}</h1>
      ${options.subtitle ? `<div class="subtitle">${escapeHtml(options.subtitle)}</div>` : ""}
    </div>
    <div class="stamp">Gerado em<br/>${escapeHtml(generatedAt)}${options.author ? `<br/>por ${escapeHtml(options.author)}` : ""}</div>
  </header>
  ${sectionsHtml}
  <footer>
    <span>${escapeHtml(options.footerNote ?? "Documento interno — Instituto Bratan.")}</span>
    <span>institutobratan.com.br</span>
  </footer>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>
</body>
</html>`);
  printWindow.document.close();
  return true;
}
