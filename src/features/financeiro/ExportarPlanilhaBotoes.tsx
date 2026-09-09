// BOTÕES "EXCEL" + "PDF" para uma mesma planilha derivada (09/09/2026). O par
// aparece no PDCA, em Impostos & NFs e na Poupança — o mesmo XlsxSheet vira
// .xlsx (para quem trabalha na planilha) ou PDF em formato de planilha (para
// quem só quer conferir/assinar). Desabilita quando o mês não tem linhas.
import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imprimirPlanilhas } from "@/lib/planilhaImpressao";
import { baixarXlsx, type XlsxSheet } from "@/lib/xlsxWriter";
import { cn } from "@/lib/utils";

export function ExportarPlanilhaBotoes({
  arquivo,
  abas,
  rotulo,
  className,
}: {
  /** Nome do arquivo sem extensão (também vira o título do PDF). */
  arquivo: string;
  abas: XlsxSheet[];
  /** Rótulo curto antes dos botões (ex.: "Consulta"). */
  rotulo?: string;
  className?: string;
}) {
  const linhas = abas.reduce((total, aba) => total + aba.rows.length, 0);
  const vazio = linhas === 0;
  const dica = vazio ? "Nada neste mês para exportar." : `${linhas} linha(s).`;
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {rotulo ? <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-brand-oliva">{rotulo}</span> : null}
      <Button type="button" variant="outline" size="sm" disabled={vazio} title={`Excel · ${dica}`} onClick={() => baixarXlsx(arquivo, abas)}>
        <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Excel
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={vazio} title={`PDF em formato de planilha · ${dica}`} onClick={() => imprimirPlanilhas(arquivo, abas)}>
        <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
        PDF
      </Button>
      {vazio ? null : <span className="text-xs text-muted-foreground">({linhas})</span>}
    </div>
  );
}
