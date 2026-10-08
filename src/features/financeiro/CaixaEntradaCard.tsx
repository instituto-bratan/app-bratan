// CAIXA DE ENTRADA (02/09/2026) — o que chegou e ainda não virou conta.
// Solte vários boletos/NFs/e-mails de uma vez: cada um vira um item lido
// (valor, vencimento, beneficiário) esperando "Virar conta" ou "Descartar".
// A busca automática no Outlook/Gmail/Mercado Livre depende de acesso às APIs
// deles (autorização que só o Lucas pode dar); até lá, a ponte é salvar os
// arquivos e soltar aqui — em lote.
// Papel & Musgo (08/10/2026): bloco de folha, contador musgo no título, linhas
// com fio leve e as ações na ordem Virar conta → Ler com IA … Descartar na ponta.
import { useRef, useState } from "react";
import { Inbox, Sparkles, Trash2, Upload } from "lucide-react";
import { BlocoFolha, Botao, Contador } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import type { FinInboxItem } from "@/lib/remoteData";
import { moneyFin } from "./financeiroData";
import { AJUDA, CABECA_DA_FOLHA, TituloDoBloco } from "./pecasDiaPagar";

export function CaixaEntradaCard({
  itens,
  readOnly,
  carregando,
  onReceber,
  onVirarConta,
  onDescartar,
  onAbrirArquivo,
  onLerComIA,
}: {
  itens: FinInboxItem[];
  readOnly: boolean;
  carregando: boolean;
  onReceber: (arquivos: File[]) => Promise<void>;
  onVirarConta: (item: FinInboxItem) => void;
  onDescartar: (item: FinInboxItem) => void;
  onAbrirArquivo: (item: FinInboxItem) => void;
  /** CAIXA DE ENTRADA INTELIGENTE (14/09/2026): pede a leitura por IA de um item. */
  onLerComIA?: (item: FinInboxItem) => Promise<void>;
}) {
  const [arrastando, setArrastando] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [lendoIA, setLendoIA] = useState<string | null>(null);
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
    <BlocoFolha
      as="section"
      aria-labelledby="caixa-entrada-titulo"
      className={cn("min-w-0 transition-[box-shadow,background-color] duration-150", arrastando && "bg-musgo-claro shadow-[inset_0_0_0_2px_rgb(var(--musgo-rgb))]")}
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
      <div className={CABECA_DA_FOLHA}>
        <TituloDoBloco id="caixa-entrada-titulo" icone={<Inbox className="h-4 w-4" aria-hidden="true" />}>
          Caixa de entrada
        </TituloDoBloco>
        <Contador valor={novos.length} rotulo={`${novos.length} esperando virar conta`} />
        <InfoTip title="O que chegou e falta lançar">
          Solte aqui, de uma vez, os boletos e notas que chegaram por e-mail, WhatsApp ou Mercado Livre (PDF, .eml ou
          .txt). O app lê cada um e deixa na lista até você clicar em &quot;Virar conta&quot; — que preenche o formulário —
          ou &quot;Descartar&quot;. O arquivo fica guardado ligado ao item. Puxar direto do Outlook/Gmail/Mercado Livre exige
          autorização nas contas deles; enquanto isso, salvar e soltar aqui já evita o esquecimento.
        </InfoTip>
        {readOnly ? null : (
          <div className="ml-auto flex items-center gap-2">
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
            <Botao variante="secundario" tamanho="pq" disabled={recebendo} carregando={recebendo} icone={<Upload className="h-4 w-4" aria-hidden="true" />} onClick={() => inputArquivo.current?.click()}>
              {recebendo ? "Lendo…" : "Soltar arquivos"}
            </Botao>
          </div>
        )}
      </div>
      <div className="grid gap-3 p-6 max-md:p-4">
        <p className={AJUDA}>{arrastando ? "Solte para ler os arquivos." : "Arraste os PDFs para cá ou use o botão. Vários de uma vez."}</p>
        {erro ? <p className="text-[13px] font-bold leading-5 text-atencao">{erro}</p> : null}

        {carregando && !itens.length ? <p className={AJUDA}>Carregando a caixa…</p> : null}
        {!carregando && !novos.length ? (
          <p className="rounded-controle bg-saber px-4 py-3 text-center text-[13px] font-medium leading-5 text-tinta-2">
            Nada esperando. O que chegar aparece aqui até virar conta.
          </p>
        ) : null}
        {novos.length ? (
          <ul className="grid">
            {novos.map((item) => {
              const leitura = item.leitura as { valor?: number; vencimento?: string; beneficiario?: string; tipo?: string; numeroDocumento?: string; descricao?: string; ia?: { confianca?: number; validacoes?: string[]; revisar?: boolean; observacoes?: string } };
              const ia = leitura.ia;
              return (
                <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-fio py-3 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold leading-5 text-tinta">
                      {leitura.beneficiario || item.fileName || "Documento sem nome"}
                      <span className="ml-2 text-[13px] font-medium text-tinta-2">
                        {leitura.tipo === "NOTA_FISCAL" ? "nota fiscal" : leitura.tipo === "PIX" ? "PIX" : leitura.tipo === "GUIA" ? "guia" : leitura.tipo === "BOLETO" ? "boleto" : "documento"}
                        {leitura.numeroDocumento ? ` nº ${leitura.numeroDocumento}` : ""}
                      </span>
                    </p>
                    <p className="text-[13px] font-medium leading-5 text-tinta-2">
                      {leitura.vencimento ? `vence ${leitura.vencimento.split("-").reverse().join("/")}` : "sem vencimento lido"}
                      {" · "}
                      {item.fileName ? (
                        <button type="button" className="font-semibold text-musgo underline-offset-[3px] hover:underline" onClick={() => onAbrirArquivo(item)}>
                          {item.fileName}
                        </button>
                      ) : (
                        "texto colado"
                      )}
                      {" · "}recebido {item.createdAt.slice(8, 10)}/{item.createdAt.slice(5, 7)}
                    </p>
                    {ia ? (
                      <p className={cn("mt-0.5 flex flex-wrap items-center gap-1 text-[13px] font-semibold leading-5", ia.revisar ? "text-atencao" : "text-ok")} title={(ia.validacoes ?? []).join(" · ")}>
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        lido pela IA · confiança {Math.round(ia.confianca ?? 0)}%{leitura.descricao ? ` · ${leitura.descricao}` : ""}
                        {ia.revisar ? " · confira antes de virar conta" : ""}
                        {ia.observacoes ? ` · ${ia.observacoes}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <span className={cn("justify-self-end whitespace-nowrap text-sm font-bold tabular-nums", leitura.valor ? "text-tinta" : "text-tinta-2")}>
                    {leitura.valor ? moneyFin(leitura.valor) : "valor?"}
                  </span>
                  {readOnly ? null : (
                    <div className="col-span-full flex flex-wrap gap-1">
                      <Botao variante="suave" tamanho="pq" onClick={() => onVirarConta(item)}>
                        Virar conta
                      </Botao>
                      {onLerComIA ? (
                        <Botao
                          variante="fantasma"
                          tamanho="pq"
                          disabled={lendoIA === item.id}
                          carregando={lendoIA === item.id}
                          icone={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                          title={ia ? "Ler de novo com a IA" : "Ler valor, vencimento e beneficiário com a IA"}
                          onClick={() => {
                            setLendoIA(item.id);
                            void onLerComIA(item).finally(() => setLendoIA((atual) => (atual === item.id ? null : atual)));
                          }}
                        >
                          {lendoIA === item.id ? "Lendo…" : ia ? "Reler" : "Ler com IA"}
                        </Botao>
                      ) : null}
                      <Botao variante="perigo" tamanho="pq" className="ml-auto" icone={<Trash2 className="h-4 w-4" aria-hidden="true" />} onClick={() => onDescartar(item)} aria-label="Descartar">
                        Descartar
                      </Botao>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        {resolvidos.length ? (
          <details className="text-[13px] font-medium leading-5 text-tinta-2">
            <summary className="cursor-pointer font-semibold text-tinta">Últimos resolvidos ({resolvidos.length})</summary>
            <ul className="mt-2 grid gap-1">
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
    </BlocoFolha>
  );
}
