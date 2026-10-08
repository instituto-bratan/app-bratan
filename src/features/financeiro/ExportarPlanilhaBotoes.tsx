// BOTÕES "EXCEL" + "PDF" para uma mesma planilha derivada (09/09/2026). O par
// aparece no PDCA, em Impostos & NFs e na Poupança — o mesmo XlsxSheet vira
// .xlsx (para quem trabalha na planilha) ou PDF em formato de planilha (para
// quem só quer conferir/assinar). Desabilita quando o mês não tem linhas.
// Papel & Musgo (08/10/2026): o Botao da fundação (secundário, 32 px), sem vidro.
import { useEffect, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Printer } from "lucide-react";
import { Botao } from "@/components/ui/botao";
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
      {rotulo ? <span className="mr-1 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">{rotulo}</span> : null}
      <Botao
        variante="secundario"
        tamanho="pq"
        disabled={vazio}
        title={`Excel · ${dica}`}
        icone={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
        onClick={() => void baixarXlsx(arquivo, abas).then((resultado) => setAviso(mensagemDoSalvamento(resultado)))}
      >
        Excel
      </Botao>
      <Botao
        variante="secundario"
        tamanho="pq"
        disabled={vazio}
        title={`PDF em formato de planilha · ${dica}`}
        icone={<Printer className="h-4 w-4" aria-hidden="true" />}
        onClick={() => imprimirPlanilhas(arquivo, abas)}
      >
        PDF
      </Botao>
      {vazio ? null : <span className="text-[13px] font-medium tabular-nums text-tinta-2">({linhas})</span>}
      {aviso ? (
        <span className="inline-flex items-center gap-1 text-[13px] font-bold text-ok" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {aviso}
        </span>
      ) : null}
    </div>
  );
}
