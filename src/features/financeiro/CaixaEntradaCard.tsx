// CAIXA DE ENTRADA (02/09/2026) — o que chegou e ainda não virou conta.
// Solte vários boletos/NFs/e-mails de uma vez: cada um vira um item lido
// (valor, vencimento, beneficiário) esperando "Virar conta" ou "Descartar".
// A busca automática no Outlook/Gmail/Mercado Livre depende de acesso às APIs
// deles (autorização que só o Lucas pode dar); até lá, a ponte é salvar os
// arquivos e soltar aqui — em lote.
import { useRef, useState } from "react";
import { Inbox, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import type { FinInboxItem } from "@/lib/remoteData";
import { moneyFin } from "./financeiroData";

export function CaixaEntradaCard({
  itens,
  readOnly,
  carregando,
  onReceber,
  onVirarConta,
  onDescartar,
  onAbrirArquivo,
}: {
  itens: FinInboxItem[];
  readOnly: boolean;
  carregando: boolean;
  onReceber: (arquivos: File[]) => Promise<void>;
  onVirarConta: (item: FinInboxItem) => void;
  onDescartar: (item: FinInboxItem) => void;
  onAbrirArquivo: (item: FinInboxItem) => void;
}) {
  const [arrastando, setArrastando] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [erro, setErro] = useState("");
  const inputArquivo = useRef<HTMLInputElement>(null);
  const novos = itens.filter((item) => item.status === "NOVO");
  const resolvidos = itens.filter((item) => item.status !== "NOVO").slice(0, 8);

  async function receber(lista: File[]) {
    if (!lista.length) return;
    setRecebendo(true);
    setErro("");
    try {
      await onReceber(lista);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setRecebendo(false);
    }
  }

  return (
    <section
      className={cn("rounded-lg border p-4 transition", arrastando ? "border-brand-musgo bg-brand-creme/60" : "border-brand-oliva/20 bg-white/60")}
      onDragOver={(event) => {
        if (readOnly) return;
        event.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(event) => {
        if (readOnly) return;
        event.preventDefault();
        setArrastando(false);
        void receber([...event.dataTransfer.files]);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
          <Inbox className="h-5 w-5" aria-hidden="true" />
          Caixa de entrada
          {novos.length ? <span className="rounded-full bg-brand-dourado/80 px-2 py-0.5 text-xs font-bold text-white">{novos.length}</span> : null}
          <InfoTip title="O que chegou e falta lançar">
            Solte aqui, de uma vez, os boletos e notas que chegaram por e-mail, WhatsApp ou Mercado Livre (PDF, .eml ou
            .txt). O app lê cada um e deixa na lista até você clicar em &quot;Virar conta&quot; — que preenche o formulário —
            ou &quot;Descartar&quot;. O arquivo fica guardado ligado ao item. Puxar direto do Outlook/Gmail/Mercado Livre exige
            autorização nas contas deles; enquanto isso, salvar e soltar aqui já evita o esquecimento.
          </InfoTip>
        </h2>
        {readOnly ? null : (
          <div className="flex items-center gap-2">
            <input
              ref={inputArquivo}
              type="file"
              multiple
              accept="application/pdf,.pdf,.txt,.eml,text/plain,message/rfc822"
              className="hidden"
              onChange={(event) => {
                void receber([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={recebendo} onClick={() => inputArquivo.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {recebendo ? "Lendo…" : "Soltar arquivos"}
            </Button>
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {arrastando ? "Solte para ler os arquivos." : "Arraste os PDFs para cá ou use o botão. Vários de uma vez."}
      </p>
      {erro ? <p className="mt-2 text-xs font-semibold text-amber-800">{erro}</p> : null}

      <div className="mt-3 grid gap-2">
        {carregando && !itens.length ? <p className="text-xs text-muted-foreground">Carregando a caixa…</p> : null}
        {!carregando && !novos.length ? (
          <p className="rounded-md border border-dashed border-brand-oliva/30 bg-white/50 p-3 text-center text-xs text-muted-foreground">
            Nada esperando. O que chegar aparece aqui até virar conta.
          </p>
        ) : null}
        {novos.map((item) => {
          const leitura = item.leitura as { valor?: number; vencimento?: string; beneficiario?: string; tipo?: string; numeroDocumento?: string };
          return (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-oliva/15 bg-white/85 p-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-brand-tinta">
                  {leitura.beneficiario || item.fileName || "Documento sem nome"}
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    {leitura.tipo === "NOTA_FISCAL" ? "nota fiscal" : leitura.tipo === "PIX" ? "PIX" : leitura.tipo === "GUIA" ? "guia" : leitura.tipo === "BOLETO" ? "boleto" : "documento"}
                    {leitura.numeroDocumento ? ` nº ${leitura.numeroDocumento}` : ""}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {leitura.vencimento ? `vence ${leitura.vencimento.split("-").reverse().join("/")}` : "sem vencimento lido"}
                  {" · "}
                  {item.fileName ? (
                    <button type="button" className="underline underline-offset-2" onClick={() => onAbrirArquivo(item)}>
                      {item.fileName}
                    </button>
                  ) : (
                    "texto colado"
                  )}
                  {" · "}recebido {item.createdAt.slice(8, 10)}/{item.createdAt.slice(5, 7)}
                </p>
              </div>
              <span className="font-bold tabular-nums text-brand-musgo">{leitura.valor ? moneyFin(leitura.valor) : "valor?"}</span>
              {readOnly ? null : (
                <div className="flex gap-1">
                  <Button type="button" size="sm" className="h-8 px-2.5 text-xs" onClick={() => onVirarConta(item)}>
                    Virar conta
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => onDescartar(item)} aria-label="Descartar">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {resolvidos.length ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Últimos resolvidos ({resolvidos.length})</summary>
            <ul className="mt-1 grid gap-0.5">
              {resolvidos.map((item) => (
                <li key={item.id} className="truncate">
                  {item.status === "LANCADO" ? "✓ virou conta" : "— descartado"} · {(item.leitura as { beneficiario?: string }).beneficiario || item.fileName}
                  {(item.leitura as { valor?: number }).valor ? ` · ${moneyFin((item.leitura as { valor: number }).valor)}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
