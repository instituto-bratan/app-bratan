// RECEBIMENTO NO KANBAN — o mesmo bloco nos dois momentos da tela
//
// Pedido do Lucas (17/08/2026): "melhore esse fluxo e deixe mais fácil de
// entender, e visualmente também muito mais fácil de entender."
//
// O que estava difícil: um bloco só, denso, com seis campos soltos e um parágrafo
// comprido no fim explicando para onde ia. Quem usa não lia — e não dava para
// saber, de relance, se faltava algo.
//
// O que mudou: TRÊS PASSOS numerados (quanto entrou → o que é → comprovante) e,
// embaixo, um quadro de DESTINOS com uma linha por lugar alimentado, cada uma
// com ✓ quando já está resolvida. Em vez de ler um parágrafo, a pessoa vê a
// lista se completando.
//
// Um componente só, usado pelo cadastro do paciente E pelo fechamento: assim os
// dois caminhos têm a mesma cara e a mesma explicação.
import { useRef } from "react";
import { Check, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { paymentMethodLabels, salePaymentMethods, type FinPaymentMethod } from "@/features/financeiro/financeiroData";
import {
  destinosDoRecebimento,
  quandoNotaLabels,
  tipoRecebimentoLabels,
  type QuandoNota,
  type TipoRecebimento,
} from "./recebimentoKanbanData";

export function RecebimentoNoKanban({
  valorTexto,
  onValorChange,
  valor,
  forma,
  onFormaChange,
  parcelas,
  onParcelasChange,
  tipo,
  onTipoChange,
  tiposDisponiveis,
  notaInstrucao,
  onNotaInstrucaoChange,
  quandoNota,
  onQuandoNotaChange,
  arquivo,
  onArquivoChange,
  pacienteNovo,
  regua,
  titulo,
}: {
  valorTexto: string;
  onValorChange: (valor: string) => void;
  valor: number;
  forma: FinPaymentMethod;
  onFormaChange: (forma: FinPaymentMethod) => void;
  parcelas: string;
  onParcelasChange: (parcelas: string) => void;
  tipo: TipoRecebimento;
  onTipoChange: (tipo: TipoRecebimento) => void;
  tiposDisponiveis: TipoRecebimento[];
  notaInstrucao: string;
  onNotaInstrucaoChange: (texto: string) => void;
  quandoNota: QuandoNota;
  onQuandoNotaChange: (quando: QuandoNota) => void;
  arquivo: File | null;
  onArquivoChange: (arquivo: File | null) => void;
  pacienteNovo: boolean;
  regua: string;
  titulo: string;
}) {
  const inputArquivo = useRef<HTMLInputElement>(null);
  const destinos = destinosDoRecebimento({
    valor,
    temArquivo: Boolean(arquivo),
    temNota: notaInstrucao.trim().length > 0,
    pacienteNovo,
    regua,
  });
  const prontos = destinos.filter((item) => item.pronto).length;

  return (
    <div className="grid gap-3 rounded-xl border-2 border-brand-dourado/50 bg-brand-creme/40 p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-brand-musgo">{titulo}</p>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">
          {prontos} de {destinos.length} destinos prontos
        </span>
      </div>

      {/* PASSO 1 — quanto entrou */}
      <div className="grid gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-oliva">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-brand-musgo text-[10px] text-white">1</span>
          Quanto entrou
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <Label>Valor recebido (R$)</Label>
            <Input value={valorTexto} onChange={(event) => onValorChange(event.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
          <div>
            <Label>Forma</Label>
            <select
              value={forma}
              onChange={(event) => onFormaChange(event.target.value as FinPaymentMethod)}
              className="mt-1 h-11 w-full rounded-md border border-input bg-white/80 px-3 text-sm"
            >
              {salePaymentMethods.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabels[method]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Parcelas</Label>
            <Input
              value={parcelas}
              onChange={(event) => onParcelasChange(event.target.value)}
              inputMode="numeric"
              disabled={forma !== "CARTAO_CREDITO"}
            />
          </div>
        </div>
      </div>

      {valor > 0 ? (
        <>
          {/* PASSO 2 — do que se trata e a nota */}
          <div className="grid gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-oliva">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-brand-musgo text-[10px] text-white">2</span>
              Do que se trata
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tiposDisponiveis.map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => onTipoChange(opcao)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    tipo === opcao
                      ? "border-brand-musgo bg-brand-musgo text-white"
                      : "border-brand-oliva/30 bg-white/70 text-brand-tinta hover:border-brand-musgo/50",
                  )}
                >
                  {tipoRecebimentoLabels[opcao]}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <Label>Do que se trata a nota e como emitir</Label>
                <Input
                  value={notaInstrucao}
                  onChange={(event) => onNotaInstrucaoChange(event.target.value)}
                  placeholder="Ex.: sinal de consulta, indicação — emitir junto com a consulta"
                />
              </div>
              <div>
                <Label>Emitir</Label>
                <select
                  value={quandoNota}
                  onChange={(event) => onQuandoNotaChange(event.target.value as QuandoNota)}
                  className="mt-1 h-11 w-full rounded-md border border-input bg-white/80 px-3 text-sm"
                >
                  {(Object.keys(quandoNotaLabels) as QuandoNota[]).map((quando) => (
                    <option key={quando} value={quando}>
                      {quandoNotaLabels[quando]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* PASSO 3 — comprovante */}
          <div className="grid gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-oliva">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-brand-musgo text-[10px] text-white">3</span>
              Comprovante
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputArquivo}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(event) => onArquivoChange(event.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => inputArquivo.current?.click()}>
                <Paperclip className="h-4 w-4" aria-hidden="true" /> {arquivo ? "Trocar arquivo" : "Anexar comprovante"}
              </Button>
              {arquivo ? (
                <span className="max-w-[16rem] truncate text-sm font-semibold text-brand-musgo">{arquivo.name}</span>
              ) : (
                <span className="text-xs text-muted-foreground">Sem arquivo fica como aguardando — e aparece nos avisos.</span>
              )}
            </div>
          </div>

          {/* PARA ONDE VAI — a lista se completando, em vez de um parágrafo */}
          <div className="grid gap-1 rounded-lg border border-brand-musgo/25 bg-brand-papel p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-oliva">
              Ao salvar, isto alimenta de uma vez
            </p>
            {destinos.map((destino) => (
              <span key={destino.titulo} className="flex items-start gap-2 text-sm">
                <span
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full",
                    destino.pronto ? "bg-brand-musgo text-white" : "border border-brand-oliva/30 bg-white",
                  )}
                >
                  {destino.pronto ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                </span>
                <span className={cn(destino.pronto ? "text-brand-tinta" : "text-muted-foreground")}>
                  <strong className="font-semibold">{destino.titulo}</strong>
                  <span className="text-muted-foreground"> — {destino.detalhe}</span>
                </span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs leading-snug text-muted-foreground">
          Informe o valor recebido para lançar a comanda e o comprovante daqui. Sem valor, este cadastro segue normal — só o
          paciente e o card no Kanban.
        </p>
      )}
    </div>
  );
}
