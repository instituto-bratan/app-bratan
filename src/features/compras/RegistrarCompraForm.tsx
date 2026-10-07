// "REGISTRAR COMPRA" DE UM PEDIDO APROVADO (06/10/2026) — passos 5 e 6 do
// fluxograma: o Financeiro cotou e comprou; aqui ele diz fornecedor, valor
// final, como pagou e quando chega. A compra é gravada com a MESMA regra da
// tela Compras (registrarCompra.ts: à vista vira conta paga com categoria da
// P12; crédito entra pela fatura; boleto se lança em Contas a Pagar), ligada
// ao pedido (pedidoRef) — e o gatilho do banco passa o pedido para "comprado".
//
// O useFinanceiro (pesado: comandas, contas, categorias…) só monta com a
// gaveta aberta, e só para quem compra (o financeiro completo).
//
// 07/10/2026: o MESMO formulário serve o "Já comprei" do Estoque
// (JaCompreiGaveta, mais abaixo). Antes aquele botão gravava a compra com PIX
// fixo, sem conta paga e sem categoria da P12; agora a forma de pagamento, a
// categoria e a conta paga do à vista saem daqui, iguais às do pedido. Só muda
// o que vem preenchido (de onde a compra nasce) e a frase sobre o estoque.
import { useMemo, useState, type FormEvent } from "react";
import { Info, ShoppingCart } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { ehCompraAVista } from "@/features/financeiro/compraAVista";
import { setorNomes, type EstoqueItem } from "@/features/estoque/estoqueData";
import {
  finGroupLabels,
  finGroupOrder,
  paymentMethodLabels,
  purchaseCardLabels,
  type FinPaymentMethod,
  type FinPurchase,
  type FinPurchaseCard,
} from "@/features/financeiro/financeiroData";
import {
  FORMAS_DE_COMPRA,
  compraDoItemDoEstoque,
  gravarCompra,
  montarCompra,
  ondeEntraNoP12,
  type CompraMontada,
  type FormularioDeCompra,
} from "@/features/financeiro/registrarCompra";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { nomeDoSetor, numeroDoPedido, podeComprar, resumoDoPedido, textoDoItem, type PedidoCompra } from "./comprasData";
import { Gaveta } from "./Gaveta";
import { compraDoPedido, podeRegistrarCompraDoPedido } from "./pedidoTela";

export type CompraRegistrada = { compraRef: string; fornecedor: string; valorFinal: number | null; previsaoEntrega: string | null };

const FORM_ID = "registrar-compra-do-pedido";
const FORM_ID_ESTOQUE = "ja-comprei-do-estoque";

type QuemRegistra = ReturnType<typeof useAuth>["pessoa"];

/** O que vem preenchido de onde a compra nasce (compraDoPedido ou compraDoItemDoEstoque). */
type BaseDaCompra = Pick<FormularioDeCompra, "description" | "supplier" | "estoqueSetor" | "estoqueItemRef" | "pedidoRef"> & { amount: string };

/**
 * De onde a compra nasce (07/10/2026): um pedido aprovado (/compras) ou um item
 * em falta do Estoque ("Já comprei"). O formulário e a regra são os mesmos.
 */
type OrigemDaCompra = {
  base: BaseDaCompra;
  /** O que foi comprado, em cima do formulário (os itens do pedido; vazio no item do estoque). */
  linhas: { chave: string; texto: string }[];
  /** O fim da faixa azul: o que acontece no estoque depois de gravar. */
  fraseDoEstoque: string;
  /** Ainda dá para gravar? null = sim; senão, a frase em português. */
  bloqueio: (pessoa: QuemRegistra) => string | null;
  /** O começo do aviso de sucesso (o resto é a regra do P12). */
  sucesso: string;
};

export function RegistrarCompraGaveta({
  pedido,
  onFechar,
  onRegistrada,
}: {
  pedido: PedidoCompra | null;
  onFechar: () => void;
  /** Depois de gravar: a tela recarrega o pedido (na prévia, faz o papel do gatilho). */
  onRegistrada: (pedido: PedidoCompra, compra: CompraRegistrada) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const origem = useMemo<OrigemDaCompra | null>(
    () =>
      pedido
        ? {
            base: compraDoPedido(pedido),
            linhas: pedido.itens.map((item) => ({ chave: item.id, texto: textoDoItem(item) })),
            fraseDoEstoque: `A compra vai para o estoque de ${nomeDoSetor(pedido.setor)}, que confirma quando chegar.`,
            bloqueio: (pessoa) => podeRegistrarCompraDoPedido(pedido, pessoa),
            sucesso: `Pedido ${numeroDoPedido(pedido.numero)} comprado.`,
          }
        : null,
    [pedido],
  );
  return (
    <Gaveta
      aberta={Boolean(pedido)}
      onFechar={onFechar}
      titulo={pedido ? `Registrar a compra do pedido ${numeroDoPedido(pedido.numero)}` : "Registrar compra"}
      subtitulo={pedido ? `${nomeDoSetor(pedido.setor)} · ${resumoDoPedido(pedido)}` : null}
      rodape={<BotaoDeRegistrar formId={FORM_ID} salvando={salvando} />}
    >
      {pedido && origem ? (
        <CorpoDaCompra
          key={pedido.id}
          formId={FORM_ID}
          origem={origem}
          salvando={salvando}
          setSalvando={setSalvando}
          onFechar={onFechar}
          onGravada={(montada) =>
            onRegistrada(pedido, {
              compraRef: montada.compra.id,
              fornecedor: montada.compra.supplier,
              valorFinal: montada.compra.amount,
              previsaoEntrega: montada.compra.deliveryEta,
            })
          }
        />
      ) : null}
    </Gaveta>
  );
}

/**
 * "JÁ COMPREI" DO ESTOQUE (07/10/2026) — o Financeiro comprou um item em falta
 * sem passar por pedido. A compra sai pela mesma regra do pedido (forma de
 * pagamento escolhida; à vista vira conta paga na categoria da P12) e fica
 * ligada ao item (estoqueItemRef) e ao setor (estoqueSetor), como antes —
 * é isso que deixa o item "a caminho" até alguém dar a entrada.
 */
export function JaCompreiGaveta({
  item,
  onFechar,
  onRegistrada,
}: {
  item: Pick<EstoqueItem, "id" | "nome" | "setor"> | null;
  onFechar: () => void;
  /** Depois de gravar: o Estoque recarrega as compras (na prévia, guarda no aparelho). */
  onRegistrada: (compra: FinPurchase) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const origem = useMemo<OrigemDaCompra | null>(
    () =>
      item
        ? {
            base: compraDoItemDoEstoque(item),
            linhas: [],
            fraseDoEstoque: `O item fica "a caminho" no estoque de ${setorNomes[item.setor]} até alguém dar a entrada da caixa.`,
            bloqueio: (pessoa) =>
              podeComprar(pessoa) ? null : 'Só o Financeiro registra a compra. Use "Pedir compra": o pedido vai para aprovação e o Financeiro compra.',
            sucesso: `${item.nome}: compra anotada, o item fica "a caminho".`,
          }
        : null,
    [item],
  );
  return (
    <Gaveta
      aberta={Boolean(item)}
      onFechar={onFechar}
      titulo={item ? `Já comprei: ${item.nome}` : "Já comprei"}
      subtitulo={item ? `Estoque de ${setorNomes[item.setor]} · a compra entra no Financeiro` : null}
      rodape={<BotaoDeRegistrar formId={FORM_ID_ESTOQUE} salvando={salvando} />}
    >
      {item && origem ? (
        <CorpoDaCompra
          key={item.id}
          formId={FORM_ID_ESTOQUE}
          origem={origem}
          salvando={salvando}
          setSalvando={setSalvando}
          onFechar={onFechar}
          onGravada={(montada) => onRegistrada(montada.compra)}
        />
      ) : null}
    </Gaveta>
  );
}

function BotaoDeRegistrar({ formId, salvando }: { formId: string; salvando: boolean }) {
  return (
    <Button type="submit" form={formId} disabled={salvando} className="h-12 w-full sm:h-11">
      <ShoppingCart className="mr-2 h-4 w-4" aria-hidden="true" />
      {salvando ? "Gravando…" : "Registrar compra"}
    </Button>
  );
}

function CorpoDaCompra({
  formId,
  origem,
  salvando,
  setSalvando,
  onFechar,
  onGravada,
}: {
  formId: string;
  origem: OrigemDaCompra;
  salvando: boolean;
  setSalvando: (valor: boolean) => void;
  onFechar: () => void;
  onGravada: (montada: CompraMontada) => void;
}) {
  const { pessoa } = useAuth();
  const hoje = todayISO();
  const financeiro = useFinanceiro(Number(hoje.slice(0, 4)));
  const base = origem.base;
  const [supplier, setSupplier] = useState(base.supplier);
  const [amount, setAmount] = useState(base.amount);
  const [purchaseDate, setPurchaseDate] = useState(hoje);
  const [method, setMethod] = useState<FinPaymentMethod>("CARTAO_CREDITO");
  const [card, setCard] = useState<FinPurchaseCard>("ITAU");
  const [installments, setInstallments] = useState("1");
  const [categoryRef, setCategoryRef] = useState("");
  const [deliveryEta, setDeliveryEta] = useState("");
  const [nfNote, setNfNote] = useState("");
  const [erro, setErro] = useState("");

  const ehCartao = method === "CARTAO_CREDITO" || method === "CARTAO_DEBITO";
  const aVista = ehCompraAVista(method);
  const categoriasPorGrupo = useMemo(
    () =>
      finGroupOrder
        .map((grupo) => ({ grupo, categorias: financeiro.categories.filter((categoria) => categoria.groupKey === grupo && categoria.active !== false) }))
        .filter((grupo) => grupo.categorias.length),
    [financeiro.categories],
  );

  async function registrar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    setErro("");
    const bloqueio = origem.bloqueio(pessoa);
    if (bloqueio) return setErro(bloqueio);
    const montada = montarCompra(
      { ...base, supplier, amount, purchaseDate, method, card, installments, categoryRef, deliveryEta: deliveryEta || null, nfNote },
      { categorias: financeiro.categories },
    );
    if (!montada.ok) return setErro(montada.erro);
    setSalvando(true);
    try {
      const gravacao = await gravarCompra(financeiro, montada, financeiro.remoto);
      if (!gravacao.compraGravada) {
        setErro(
          base.pedidoRef
            ? "A compra NÃO foi gravada (veja o aviso no canto da tela). O pedido continua aprovado — confira e tente de novo."
            : "A compra NÃO foi gravada (veja o aviso no canto da tela) — confira e tente de novo.",
        );
        return;
      }
      onGravada(montada);
      toast(`${origem.sucesso} ${montada.aviso}`, { tom: "ok", duracaoMs: 8000 });
      if (gravacao.contaGravada === false) {
        toast("A conta paga desta compra não foi gravada — lance em Contas a Pagar para ela entrar no P12.", { tom: "atencao", duracaoMs: 10000 });
      }
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form id={formId} onSubmit={registrar} className="grid gap-5" noValidate>
      {origem.linhas.length ? (
        <ul className="divide-y divide-brand-oliva/10 rounded-lg border border-brand-oliva/12 bg-white/60 text-sm">
          {origem.linhas.map((linha) => (
            <li key={linha.chave} className="px-3 py-2 text-brand-tinta [overflow-wrap:anywhere]">
              {linha.texto}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`${formId}-fornecedor`}>Fornecedor</Label>
          <Input id={`${formId}-fornecedor`} value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Ex.: Stin, Mercado Livre, Kalunga" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-valor`}>Valor final (R$)</Label>
          <Input id={`${formId}-valor`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Ex.: 486,00" className="text-lg font-semibold tabular-nums" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-data`}>Data da compra</Label>
          <Input id={`${formId}-data`} type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-brand-tinta">Como pagou</legend>
        <div className="flex flex-wrap gap-2">
          {FORMAS_DE_COMPRA.map((forma) => (
            <button
              key={forma}
              type="button"
              aria-pressed={method === forma}
              onClick={() => setMethod(forma)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                method === forma ? "border-brand-musgo bg-brand-musgo text-brand-papel" : "border-brand-oliva/25 bg-white/70 text-brand-tinta hover:bg-brand-creme/60",
              )}
            >
              {paymentMethodLabels[forma]}
            </button>
          ))}
        </div>
      </fieldset>

      {ehCartao ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-cartao`}>Cartão</Label>
            <select
              id={`${formId}-cartao`}
              value={card}
              onChange={(event) => setCard(event.target.value as FinPurchaseCard)}
              className="h-12 w-full rounded-md border border-input bg-white/80 px-3 text-base sm:h-11 sm:text-sm"
            >
              {(Object.keys(purchaseCardLabels) as FinPurchaseCard[]).map((opcao) => (
                <option key={opcao} value={opcao}>
                  {purchaseCardLabels[opcao]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-parcelas`}>Parcelas</Label>
            <Input id={`${formId}-parcelas`} value={installments} onChange={(event) => setInstallments(event.target.value)} inputMode="numeric" className="tabular-nums" />
          </div>
        </div>
      ) : null}

      {aVista ? (
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-categoria`}>Categoria da P12 (obrigatória no à vista)</Label>
          <select
            id={`${formId}-categoria`}
            value={categoryRef}
            onChange={(event) => setCategoryRef(event.target.value)}
            className="h-12 w-full rounded-md border border-input bg-white/80 px-3 text-base sm:h-11 sm:text-sm"
          >
            <option value="">Escolha a categoria…</option>
            {categoriasPorGrupo.map((grupo) => (
              <optgroup key={grupo.grupo} label={finGroupLabels[grupo.grupo]}>
                {grupo.categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.name}
                    {categoria.isCapex ? " · CAPEX" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-previsao`}>Previsão de entrega</Label>
          <Input id={`${formId}-previsao`} type="date" value={deliveryEta} onChange={(event) => setDeliveryEta(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-nf`}>Nota fiscal (nº ou situação)</Label>
          <Input id={`${formId}-nf`} value={nfNote} onChange={(event) => setNfNote(event.target.value)} placeholder="Ex.: 123, pedida, sem NF" />
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-700">
        <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {ondeEntraNoP12(method, ehCartao ? card : null)} {origem.fraseDoEstoque}
        </span>
      </p>

      {erro ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {erro}
        </p>
      ) : null}
    </form>
  );
}
