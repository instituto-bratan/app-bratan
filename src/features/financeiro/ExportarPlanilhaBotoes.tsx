// BOTÕES "EXCEL" + "PDF" para uma mesma planilha derivada (09/09/2026). O par
// aparece no PDCA, em Impostos & NFs e na Poupança — o mesmo XlsxSheet vira
// .xlsx (para quem trabalha na planilha) ou PDF em formato de planilha (para
// quem só quer conferir/assinar). Desabilita quando o mês não tem linhas.
import { useEffect, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imprimirPlanilhas } from "@/lib/planilhaImpressao";
import { mensagemDoSalvamento } from "@/lib/salvarArquivo";
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
  // Depois de salvar, diz ONDE ficou (Lucas não achava o arquivo baixado).
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => setAviso(""), 12_000);
    return () => window.clearTimeout(timer);
  }, [aviso]);
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {rotulo ? <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-brand-oliva">{rotulo}</span> : null}
      <Button type="button" variant="outline" size="sm" disabled={vazio} title={`Excel · ${dica}`} onClick={() => void baixarXlsx(arquivo, abas).then((resultado) => setAviso(mensagemDoSalvamento(resultado)))}>
        <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Excel
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={vazio} title={`PDF em formato de planilha · ${dica}`} onClick={() => imprimirPlanilhas(arquivo, abas)}>
        <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
        PDF
      </Button>
      {vazio ? null : <span className="text-xs text-muted-foreground">({linhas})</span>}
      {aviso ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700" role="status">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {aviso}
        </span>
      ) : null}
    </div>
  );
}
