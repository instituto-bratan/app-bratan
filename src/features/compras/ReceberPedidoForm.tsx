// "CHEGOU? CONFIRMAR RECEBIMENTO" (06/10/2026) — passos 7 e 8 do fluxograma:
// o setor confere quantidade (e, na Enfermagem, lote e validade) e confirma.
// Confirmar dá a ENTRADA no estoque do setor na hora — no banco, na mesma
// transação (compra_pedido_receber); na prévia, no estoque do aparelho.
// "Algo não bateu?" vira um registro na linha do tempo do pedido — e, desde
// 07/10/2026, é OBRIGATÓRIO quando chegou quantidade diferente da pedida
// (fluxograma, passo 7: anotar a divergência; o Financeiro vê na Fila do dia).
import { useState, type FormEvent } from "react";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { nomeDoSetor, numeroDoPedido, type PedidoCompra, type Recebimento } from "./comprasData";
import { Gaveta } from "./Gaveta";
import { numeroDigitado, previsaoTexto, recebimentoDasLinhas, recebimentoDiferente, recebimentoInicial, type LinhaDeRecebimento } from "./pedidoTela";

const qtdBR = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const FORM_ID = "receber-pedido-de-compra";

export function ReceberPedidoGaveta({
  pedido,
  salvando,
  onFechar,
  onReceber,
}: {
  pedido: PedidoCompra | null;
  salvando: boolean;
  onFechar: () => void;
  onReceber: (pedido: PedidoCompra, recebimento: Recebimento) => Promise<PedidoCompra | null>;
}) {
  return (
    <Gaveta
      aberta={Boolean(pedido)}
      onFechar={onFechar}
      titulo={pedido ? `Chegou o pedido ${numeroDoPedido(pedido.numero)}?` : "Confirmar recebimento"}
      subtitulo={
        pedido
          ? `${nomeDoSetor(pedido.setor)}${pedido.fornecedor ? ` · comprado em ${pedido.fornecedor}` : ""} · ${previsaoTexto(pedido.previsaoEntrega, todayISO())}`
          : null
      }
      rodape={
        <Button type="submit" form={FORM_ID} disabled={salvando} className="h-12 w-full sm:h-11">
          <PackageCheck className="mr-2 h-4 w-4" aria-hidden="true" />
          {salvando ? "Gravando…" : "Confirmar recebimento"}
        </Button>
      }
    >
      {pedido ? <CorpoDoRecebimento key={pedido.id} pedido={pedido} salvando={salvando} onFechar={onFechar} onReceber={onReceber} /> : null}
    </Gaveta>
  );
}

function CorpoDoRecebimento({
  pedido,
  salvando,
  onFechar,
  onReceber,
}: {
  pedido: PedidoCompra;
  salvando: boolean;
  onFechar: () => void;
  onReceber: (pedido: PedidoCompra, recebimento: Recebimento) => Promise<PedidoCompra | null>;
}) {
  const [linhas, setLinhas] = useState<LinhaDeRecebimento[]>(() => recebimentoInicial(pedido));
  const [divergencia, setDivergencia] = useState("");
  const diferente = recebimentoDiferente(linhas);
  const entradas = linhas.filter((linha) => linha.entraNoEstoque && numeroDigitado(linha.qtdRecebida) > 0).length;

  function mudar(itemId: string, campo: "qtdRecebida" | "lote" | "validade", valor: string) {
    setLinhas((atuais) => atuais.map((linha) => (linha.itemId === itemId ? { ...linha, [campo]: valor } : linha)));
  }

  const faltaContar = diferente && divergencia.trim().length < 3;
  const [mostrarFalta, setMostrarFalta] = useState(false);

  async function confirmar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    if (faltaContar) {
      // A mesma trava da máquina e do banco, antes de chamar o servidor.
      setMostrarFalta(true);
      document.getElementById("receber-divergencia")?.focus();
      toast("Chegou quantidade diferente da pedida: conte o que não bateu (pelo menos 3 letras).", { tom: "atencao", duracaoMs: 7000 });
      return;
    }
    const recebido = await onReceber(pedido, recebimentoDasLinhas(linhas, divergencia));
    if (!recebido) return; // o aviso com o motivo já apareceu
    toast(
      entradas
        ? `Recebido. ${entradas === 1 ? "1 entrada" : `${entradas} entradas`} no estoque de ${nomeDoSetor(pedido.setor)}.`
        : `Recebido. Os itens escritos à mão não entram no estoque.`,
      { tom: "ok", duracaoMs: 6000 },
    );
    onFechar();
  }

  return (
    <form id={FORM_ID} onSubmit={confirmar} className="grid gap-5" noValidate>
      <p className="text-sm leading-6 text-brand-tinta">
        Confira a caixa: quantidade{pedido.setor === "ENFERMAGEM" ? ", lote, validade" : ""} e nota fiscal. A quantidade já vem com o que foi pedido — mude se chegou diferente.
      </p>
      <ul className="grid gap-3">
        {linhas.map((linha) => (
          <li key={linha.itemId} className="rounded-lg border border-brand-oliva/15 bg-white/70 p-3">
            <p className="text-sm font-semibold text-brand-tinta [overflow-wrap:anywhere]">{linha.descricao}</p>
            <p className="text-xs text-muted-foreground">
              pedido: <span className="tabular-nums">{qtdBR(linha.pedida)}</span> {linha.unidade}
              {linha.entraNoEstoque ? "" : " · item escrito à mão: não entra no estoque"}
            </p>
            <div className={linha.pedeLote ? "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" : "mt-3 grid grid-cols-2 gap-2"}>
              <div className="grid gap-1">
                <Label htmlFor={`receber-${linha.itemId}-qtd`} className="text-xs text-muted-foreground">
                  Chegou ({linha.unidade})
                </Label>
                <Input
                  id={`receber-${linha.itemId}-qtd`}
                  value={linha.qtdRecebida}
                  inputMode="decimal"
                  onChange={(event) => mudar(linha.itemId, "qtdRecebida", event.target.value)}
                  className="tabular-nums"
                />
              </div>
              {linha.pedeLote ? (
                <>
                  <div className="grid gap-1">
                    <Label htmlFor={`receber-${linha.itemId}-lote`} className="text-xs text-muted-foreground">
                      Lote
                    </Label>
                    <Input id={`receber-${linha.itemId}-lote`} value={linha.lote} maxLength={60} onChange={(event) => mudar(linha.itemId, "lote", event.target.value)} />
                  </div>
                  <div className="col-span-2 grid gap-1 sm:col-span-1">
                    <Label htmlFor={`receber-${linha.itemId}-validade`} className="text-xs text-muted-foreground">
                      Validade
                    </Label>
                    <Input id={`receber-${linha.itemId}-validade`} type="date" value={linha.validade} onChange={(event) => mudar(linha.itemId, "validade", event.target.value)} />
                  </div>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="grid gap-2">
        <Label htmlFor="receber-divergencia">{diferente ? "O que não bateu? (obrigatório)" : "Algo não bateu? (opcional)"}</Label>
        {diferente ? (
          <p className="flex items-start gap-1.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Chegou quantidade diferente da pedida — conte o que aconteceu. Fica registrado no pedido e o Financeiro vê, para conferir a nota e
            cobrar o fornecedor.
          </p>
        ) : null}
        <textarea
          id="receber-divergencia"
          value={divergencia}
          maxLength={1000}
          onChange={(event) => setDivergencia(event.target.value)}
          rows={3}
          aria-invalid={mostrarFalta && faltaContar ? true : undefined}
          aria-required={diferente || undefined}
          placeholder="Ex.: veio 1 caixa a menos; a nota fiscal não veio na caixa."
          className={cn(
            "w-full rounded-md border border-input bg-white/80 px-3.5 py-2.5 text-base text-brand-tinta placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
            mostrarFalta && faltaContar && "border-amber-400",
          )}
        />
      </div>
    </form>
  );
}
