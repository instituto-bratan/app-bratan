// "CHEGOU? CONFIRMAR RECEBIMENTO" (06/10/2026) — passos 7 e 8 do fluxograma:
// o setor confere quantidade (e, na Enfermagem, lote e validade) e confirma.
// Confirmar dá a ENTRADA no estoque do setor na hora — no banco, na mesma
// transação (compra_pedido_receber); na prévia, no estoque do aparelho.
// "Algo não bateu?" vira um registro na linha do tempo do pedido — e, desde
// 07/10/2026, é OBRIGATÓRIO quando chegou quantidade diferente da pedida
// (fluxograma, passo 7: anotar a divergência; o Financeiro vê na Fila do dia).
//
// 08/10/2026 (redesenho Papel & Musgo): mesmos campos e travas, na forma nova —
// cada item numa folha, campos com contorno de 3:1 e o aviso da divergência
// numa faixa de atenção (a palavra diz; a cor só reforça).
import { useState, type FormEvent } from "react";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/fundacao";
import { todayISO } from "@/lib/localStore";
import { nomeDoSetor, numeroDoPedido, type PedidoCompra, type Recebimento } from "./comprasData";
import { Gaveta } from "./Gaveta";
import { Campo, CampoArea, CampoTexto, Recado } from "./pecas";
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
      sobrancelha={pedido ? `Pedido ${numeroDoPedido(pedido.numero)} · ${nomeDoSetor(pedido.setor)}` : null}
      titulo={pedido ? `Chegou o pedido ${numeroDoPedido(pedido.numero)}?` : "Confirmar recebimento"}
      subtitulo={
        pedido
          ? `${nomeDoSetor(pedido.setor)}${pedido.fornecedor ? ` · comprado em ${pedido.fornecedor}` : ""} · ${previsaoTexto(pedido.previsaoEntrega, todayISO())}`
          : null
      }
      rodape={
        <Botao
          type="submit"
          form={FORM_ID}
          variante="primario"
          bloco
          carregando={salvando}
          icone={<PackageCheck className="h-4 w-4" aria-hidden="true" />}
          className="h-11 max-sm:h-[52px] max-sm:text-base"
        >
          {salvando ? "Gravando…" : "Confirmar recebimento"}
        </Botao>
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
    <form id={FORM_ID} onSubmit={confirmar} className="grid gap-5 font-sans" noValidate>
      <p className="text-sm font-medium leading-6 text-tinta">
        Confira a caixa: quantidade{pedido.setor === "ENFERMAGEM" ? ", lote, validade" : ""} e nota fiscal. A quantidade já vem com o que foi pedido — mude se chegou diferente.
      </p>
      <ul className="grid gap-3">
        {linhas.map((linha) => (
          <li key={linha.itemId} className="rounded-bloco border border-fio bg-folha p-3">
            <p className="text-sm font-bold text-tinta [overflow-wrap:anywhere]">{linha.descricao}</p>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              pedido: <span className="tabular-nums">{qtdBR(linha.pedida)}</span> {linha.unidade}
              {linha.entraNoEstoque ? "" : " · item escrito à mão: não entra no estoque"}
            </p>
            <div className={linha.pedeLote ? "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" : "mt-3 grid grid-cols-2 gap-2"}>
              <Campo id={`receber-${linha.itemId}-qtd`} rotulo={`Chegou (${linha.unidade})`}>
                <CampoTexto
                  id={`receber-${linha.itemId}-qtd`}
                  value={linha.qtdRecebida}
                  inputMode="decimal"
                  onChange={(event) => mudar(linha.itemId, "qtdRecebida", event.target.value)}
                  className="tabular-nums"
                />
              </Campo>
              {linha.pedeLote ? (
                <>
                  <Campo id={`receber-${linha.itemId}-lote`} rotulo="Lote">
                    <CampoTexto id={`receber-${linha.itemId}-lote`} value={linha.lote} maxLength={60} onChange={(event) => mudar(linha.itemId, "lote", event.target.value)} />
                  </Campo>
                  <Campo id={`receber-${linha.itemId}-validade`} rotulo="Validade" className="col-span-2 sm:col-span-1">
                    <CampoTexto id={`receber-${linha.itemId}-validade`} type="date" value={linha.validade} onChange={(event) => mudar(linha.itemId, "validade", event.target.value)} />
                  </Campo>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <Campo id="receber-divergencia" rotulo={diferente ? "O que não bateu? (obrigatório)" : "Algo não bateu? (opcional)"}>
        {diferente ? (
          <Recado tom="atencao" icone={<AlertTriangle aria-hidden="true" />}>
            <strong>Chegou quantidade diferente da pedida</strong> — conte o que aconteceu. Fica registrado no pedido e o Financeiro vê, para conferir a nota e cobrar o
            fornecedor.
          </Recado>
        ) : null}
        <CampoArea
          id="receber-divergencia"
          value={divergencia}
          maxLength={1000}
          onChange={(event) => setDivergencia(event.target.value)}
          rows={3}
          aria-invalid={mostrarFalta && faltaContar ? true : undefined}
          aria-required={diferente || undefined}
          placeholder="Ex.: veio 1 caixa a menos; a nota fiscal não veio na caixa."
        />
      </Campo>
    </form>
  );
}
