// FORMULÁRIO "NOVO PEDIDO" (06/10/2026) — passo 1 do fluxograma POP-COMP-001:
// o setor diz o que falta (do estoque dele ou escrito à mão), quanto, para
// quando e por quê. O mesmo formulário serve o "Ajustar e reenviar" de um
// pedido devolvido (vem preenchido, com o motivo da devolução em cima).
//
// A validação é a do motor (validarPedido), que tem as mesmas frases do banco:
// o que a tela recusa é exatamente o que o banco recusaria.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, PackagePlus, PencilLine, Plus, Search, Send, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseMoneyBR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { saldoDoItem, setorNomes, type EstoqueItem, type EstoqueMovimento, type EstoqueSetor } from "@/features/estoque/estoqueData";
import type { FinPurchase } from "@/features/financeiro/financeiroData";
import {
  LIMITES_DO_PEDIDO,
  numeroDoPedido,
  validarPedido,
  valorEstimado,
  type PedidoCompra,
  type RascunhoItem,
  type RascunhoPedido,
} from "./comprasData";
import { Gaveta } from "./Gaveta";
import { itensDoEstoqueParaPedido, linhaDoEstoque, numeroDigitado, oQueJaVemDoItem } from "./pedidoTela";

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtdBR = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Linha = {
  chave: string;
  estoqueItemRef: string | null;
  descricao: string;
  quantidade: string;
  unidade: string;
  valorUnitario: string;
  link: string;
};

let sequencia = 0;
const novaChave = () => `linha-${++sequencia}`;

function linhaDoRascunho(item: RascunhoItem): Linha {
  return {
    chave: novaChave(),
    estoqueItemRef: item.estoqueItemRef,
    descricao: item.descricao,
    quantidade: Number.isFinite(item.quantidade) ? qtdBR(item.quantidade).replace(/\./g, "") : "",
    unidade: item.unidade || "un",
    valorUnitario:
      item.valorUnitario !== null && item.valorUnitario !== undefined && Number.isFinite(item.valorUnitario)
        ? item.valorUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "",
    link: item.link ?? "",
  };
}

function itemDaLinha(linha: Linha): RascunhoItem {
  const valor = linha.valorUnitario.trim();
  return {
    estoqueItemRef: linha.estoqueItemRef,
    descricao: linha.descricao,
    quantidade: numeroDigitado(linha.quantidade),
    unidade: linha.unidade,
    valorUnitario: valor ? parseMoneyBR(valor) : null,
    link: linha.link,
  };
}

export type InicioDoFormulario = {
  setor: EstoqueSetor | "";
  rascunho?: Partial<RascunhoPedido>;
  /** Itens do estoque pedidos pela URL (botão "Pedir compra" do Estoque): entram quando o estoque carregar. */
  refsDoEstoque?: string[];
};

export function NovoPedidoForm({
  aberta,
  onFechar,
  setores,
  inicio,
  existente,
  estoqueItens,
  moves,
  compras = [],
  pedidos,
  salvando,
  onEnviar,
}: {
  aberta: boolean;
  onFechar: () => void;
  /** Os setores para os quais a pessoa pode pedir (o dela primeiro). */
  setores: EstoqueSetor[];
  inicio: InicioDoFormulario;
  /** Pedido devolvido sendo ajustado (reenviar); null = pedido novo. */
  existente: PedidoCompra | null;
  estoqueItens: EstoqueItem[];
  moves: EstoqueMovimento[];
  /** As compras do estoque (07/10/2026): item já comprado não é "em falta" de novo. */
  compras?: FinPurchase[];
  pedidos: PedidoCompra[];
  salvando: boolean;
  onEnviar: (rascunho: RascunhoPedido, existente: PedidoCompra | null) => Promise<PedidoCompra | null>;
}) {
  const [setor, setSetor] = useState<EstoqueSetor | "">(inicio.setor || setores[0] || "");
  const [linhas, setLinhas] = useState<Linha[]>(() => (inicio.rascunho?.itens ?? []).map(linhaDoRascunho));
  const [justificativa, setJustificativa] = useState(inicio.rascunho?.justificativa ?? "");
  const [urgente, setUrgente] = useState(inicio.rascunho?.urgencia === "URGENTE");
  const [precisaAte, setPrecisaAte] = useState(inicio.rascunho?.precisaAte ?? "");
  const [busca, setBusca] = useState("");
  const [mostrarProblemas, setMostrarProblemas] = useState(false);
  const problemasRef = useRef<HTMLDivElement>(null);
  const ultimaDescricaoRef = useRef<HTMLInputElement>(null);
  const [focarUltima, setFocarUltima] = useState(false);

  // Os itens que vieram pela URL entram quando o estoque terminar de carregar (uma vez só).
  const refsPendentes = useRef(inicio.refsDoEstoque ?? []);
  useEffect(() => {
    if (!refsPendentes.current.length || !setor || !estoqueItens.length) return;
    const novos = itensDoEstoqueParaPedido(refsPendentes.current, estoqueItens, moves, setor);
    refsPendentes.current = [];
    if (!novos.length) return;
    setLinhas((atuais) => {
      const ja = new Set(atuais.map((linha) => linha.estoqueItemRef).filter(Boolean));
      return [...atuais, ...novos.filter((item) => !ja.has(item.estoqueItemRef)).map(linhaDoRascunho)];
    });
  }, [estoqueItens, moves, setor]);

  useEffect(() => {
    if (focarUltima) {
      ultimaDescricaoRef.current?.focus();
      setFocarUltima(false);
    }
  }, [focarUltima, linhas.length]);

  const doSetor = useMemo(() => estoqueItens.filter((item) => item.setor === setor), [estoqueItens, setor]);
  const noPedido = useMemo(() => new Set(linhas.map((linha) => linha.estoqueItemRef).filter(Boolean) as string[]), [linhas]);

  const sugestoes = useMemo(() => {
    const termo = semAcento(busca.trim());
    // Item que já tem pedido aberto (menos este, se for ajuste): a tela avisa para não pedir duas vezes.
    const outrosPedidos = existente ? pedidos.filter((pedido) => pedido.id !== existente.id) : pedidos;
    const comSaldo = doSetor.map((item) => {
      const saldo = saldoDoItem(moves, item.id);
      // 07/10/2026: o que já está vindo (compra a caminho ou outro pedido aberto)
      // não é "em falta" — era a compra em dobro que o A_CAMINHO do Estoque evita.
      const jaVem = oQueJaVemDoItem(item.id, moves, compras, outrosPedidos);
      const emFalta = (saldo <= 0 || (item.minimo > 0 && saldo <= item.minimo)) && !jaVem;
      return { item, saldo, emFalta, jaVem };
    });
    const achados = termo
      ? comSaldo.filter(({ item }) => semAcento(`${item.nome} ${item.categoria} ${item.codigoBarras}`).includes(termo))
      : comSaldo.filter(({ emFalta }) => emFalta);
    return achados
      .sort((a, b) => Number(b.emFalta) - Number(a.emFalta) || a.item.nome.localeCompare(b.item.nome, "pt-BR"))
      .slice(0, 8);
  }, [busca, doSetor, moves, compras, pedidos, existente]);

  const rascunho: RascunhoPedido = {
    setor,
    // Sem campo de título: o banco monta ("Luva nitrílica M e mais 2"), também no reenvio (os itens podem ter mudado).
    titulo: "",
    justificativa,
    urgencia: urgente ? "URGENTE" : "NORMAL",
    precisaAte: precisaAte || null,
    itens: linhas.map(itemDaLinha),
  };
  const total = valorEstimado(rascunho.itens);
  const problemas = validarPedido(rascunho, estoqueItens.length ? estoqueItens : undefined);

  function trocarSetor(proximo: EstoqueSetor) {
    if (proximo === setor) return;
    const doEstoque = linhas.filter((linha) => linha.estoqueItemRef);
    setSetor(proximo);
    if (doEstoque.length) {
      // Item do estoque é de UM setor: ao trocar, os itens do estoque antigo saem (o banco recusaria).
      setLinhas((atuais) => atuais.filter((linha) => !linha.estoqueItemRef));
      toast(`${doEstoque.length === 1 ? "1 item do estoque saiu" : `${doEstoque.length} itens do estoque saíram`} do pedido: eles são do estoque de ${setorNomes[setor as EstoqueSetor] ?? "outro setor"}.`, { tom: "atencao", duracaoMs: 6000 });
    }
  }

  function adicionarDoEstoque(item: EstoqueItem) {
    if (noPedido.has(item.id)) return;
    setLinhas((atuais) => [...atuais, linhaDoRascunho(linhaDoEstoque(item, moves))]);
    setBusca("");
  }

  function adicionarItemNovo() {
    setLinhas((atuais) => [...atuais, { chave: novaChave(), estoqueItemRef: null, descricao: busca.trim(), quantidade: "1", unidade: "un", valorUnitario: "", link: "" }]);
    setBusca("");
    setFocarUltima(true);
  }

  function mudarLinha(chave: string, campo: keyof Linha, valor: string) {
    setLinhas((atuais) => atuais.map((linha) => (linha.chave === chave ? { ...linha, [campo]: valor } : linha)));
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    if (problemas.length) {
      setMostrarProblemas(true);
      window.setTimeout(() => problemasRef.current?.focus(), 30);
      return;
    }
    const gravado = await onEnviar(rascunho, existente);
    if (gravado) {
      toast(`Pedido ${numeroDoPedido(gravado.numero)} ${existente ? "reenviado" : "enviado"} — aguardando aprovação.`, { tom: "ok", duracaoMs: 5000 });
      onFechar();
    }
  }

  const formId = "novo-pedido-de-compra";
  const nomeDoSetorAtual = setor ? setorNomes[setor] : "";

  return (
    <Gaveta
      aberta={aberta}
      onFechar={onFechar}
      titulo={existente ? `Ajustar o pedido ${numeroDoPedido(existente.numero)}` : "Novo pedido de compra"}
      subtitulo={existente ? "Corrija o que foi pedido e reenvie para aprovação." : "Diga o que falta, quanto e por quê. O Gestor Financeiro aprova."}
      rodape={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {total > 0 ? (
              <>
                Estimado <span className="font-semibold tabular-nums text-brand-tinta">{brl(total)}</span>
              </>
            ) : linhas.length ? (
              "Sem valor estimado (opcional)"
            ) : (
              "Nenhum item ainda"
            )}
          </p>
          <Button type="submit" form={formId} disabled={salvando} className="h-12 w-full sm:h-11 sm:w-auto sm:px-6">
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {salvando ? "Enviando…" : existente ? "Reenviar para aprovação" : "Enviar pedido"}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={enviar} className="grid gap-6" noValidate>
        {existente?.decisaoNota ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 [overflow-wrap:anywhere]">
            <span className="font-semibold">O que pediram para ajustar: </span>
            {existente.decisaoNota}
          </p>
        ) : null}

        {/* Setor: só os que a pessoa pode pedir; o dela vem primeiro. */}
        {setores.length > 1 && !existente ? (
          <div className="grid gap-2">
            <Label htmlFor="pedido-setor">Para qual setor</Label>
            <select
              id="pedido-setor"
              value={setor}
              onChange={(event) => trocarSetor(event.target.value as EstoqueSetor)}
              className="h-12 w-full rounded-md border border-input bg-white/80 px-3 text-base text-brand-tinta sm:h-11 sm:text-sm"
            >
              {setores.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {setorNomes[opcao]}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-brand-tinta">
            Setor: <span className="font-semibold">{nomeDoSetorAtual || "—"}</span>
          </p>
        )}

        {/* Itens */}
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold text-brand-tinta">O que precisa</legend>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  // Um achado no estoque: entra ele. Nada no estoque: o que foi escrito vira item novo.
                  if (busca.trim() && sugestoes.length === 1) adicionarDoEstoque(sugestoes[0].item);
                  else if (busca.trim() && !sugestoes.length) adicionarItemNovo();
                }
              }}
              placeholder={doSetor.length ? `Buscar no estoque de ${nomeDoSetorAtual}` : "Escreva o item e toque em “Item novo”"}
              aria-label="Buscar item do estoque"
              className="pl-9"
              autoComplete="off"
            />
          </div>

          {doSetor.length && (busca.trim() || sugestoes.length) ? (
            <div className="rounded-lg border border-brand-oliva/15 bg-white/60">
              <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground">
                {busca.trim() ? (sugestoes.length ? "No estoque do setor" : "Nada com esse nome no estoque do setor") : "Em falta no estoque do setor"}
              </p>
              <ul className="divide-y divide-brand-oliva/10">
                {sugestoes.map(({ item, saldo, emFalta, jaVem }) => {
                  const ja = noPedido.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={ja}
                        onClick={() => adicionarDoEstoque(item)}
                        className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-brand-creme/50 disabled:cursor-default disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-brand-tinta [overflow-wrap:anywhere]">{item.nome}</span>
                          <span className={cn("block text-xs tabular-nums", emFalta ? "text-amber-800" : "text-muted-foreground")}>
                            tem {qtdBR(saldo)} {item.unidade || "un"}
                            {item.minimo > 0 ? ` · mínimo ${qtdBR(item.minimo)}` : ""}
                            {jaVem ? ` · ${jaVem}` : ""}
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-musgo">
                          {ja ? "No pedido" : (
                            <>
                              <Plus className="h-4 w-4" aria-hidden="true" />
                              Pedir
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <Button type="button" variant="outline" onClick={adicionarItemNovo} className="h-12 justify-start sm:h-10">
            <PencilLine className="mr-2 h-4 w-4" aria-hidden="true" />
            {busca.trim() && !sugestoes.length ? `Item novo: “${busca.trim()}”` : "Item novo (fora do estoque)"}
          </Button>

          {linhas.length ? (
            <ul className="grid gap-3">
              {linhas.map((linha, indice) => (
                <li key={linha.chave} className="rounded-lg border border-brand-oliva/15 bg-white/70 p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {linha.estoqueItemRef ? (
                        <p className="text-sm font-semibold text-brand-tinta [overflow-wrap:anywhere]">
                          {linha.descricao}
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-brand-oliva/20 bg-brand-creme/60 px-2 py-0.5 text-xs font-semibold text-brand-musgo">
                            <PackagePlus className="h-3 w-3" aria-hidden="true" />
                            do estoque
                          </span>
                        </p>
                      ) : (
                        <>
                          <Label htmlFor={`${linha.chave}-desc`} className="sr-only">
                            O que é o item {indice + 1}
                          </Label>
                          <Input
                            id={`${linha.chave}-desc`}
                            ref={indice === linhas.length - 1 ? ultimaDescricaoRef : undefined}
                            value={linha.descricao}
                            maxLength={LIMITES_DO_PEDIDO.descricao}
                            onChange={(event) => mudarLinha(linha.chave, "descricao", event.target.value)}
                            placeholder="O que é (ex.: Luva nitrílica M)"
                          />
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinhas((atuais) => atuais.filter((outra) => outra.chave !== linha.chave))}
                      aria-label={`Tirar ${linha.descricao || `o item ${indice + 1}`} do pedido`}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] items-end gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`${linha.chave}-qtd`} className="text-xs text-muted-foreground">
                        Quantidade
                      </Label>
                      <Input
                        id={`${linha.chave}-qtd`}
                        value={linha.quantidade}
                        inputMode="decimal"
                        onChange={(event) => mudarLinha(linha.chave, "quantidade", event.target.value)}
                        className="tabular-nums"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`${linha.chave}-un`} className="text-xs text-muted-foreground">
                        Unidade
                      </Label>
                      <Input
                        id={`${linha.chave}-un`}
                        value={linha.unidade}
                        maxLength={LIMITES_DO_PEDIDO.unidade}
                        onChange={(event) => mudarLinha(linha.chave, "unidade", event.target.value)}
                        placeholder="un, cx, pct"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`${linha.chave}-valor`} className="text-xs text-muted-foreground">
                        Valor de cada
                      </Label>
                      <Input
                        id={`${linha.chave}-valor`}
                        value={linha.valorUnitario}
                        inputMode="decimal"
                        onChange={(event) => mudarLinha(linha.chave, "valorUnitario", event.target.value)}
                        placeholder="R$ (opcional)"
                        className="tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1">
                    <Label htmlFor={`${linha.chave}-link`} className="text-xs text-muted-foreground">
                      Link ou fornecedor sugerido (opcional)
                    </Label>
                    <Input
                      id={`${linha.chave}-link`}
                      value={linha.link}
                      maxLength={LIMITES_DO_PEDIDO.link}
                      onChange={(event) => mudarLinha(linha.chave, "link", event.target.value)}
                      placeholder="https://… ou o nome da loja"
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-brand-oliva/25 px-3 py-4 text-center text-sm text-muted-foreground">
              Nenhum item ainda. Busque no estoque do setor ou escreva um item novo.
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="pedido-para-quando">Para quando (opcional)</Label>
            <Input id="pedido-para-quando" type="date" value={precisaAte} onChange={(event) => setPrecisaAte(event.target.value)} />
          </div>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 self-end rounded-md border border-input bg-white/70 px-3 py-2 text-sm text-brand-tinta">
            <input type="checkbox" checked={urgente} onChange={(event) => setUrgente(event.target.checked)} className="h-5 w-5 accent-[var(--bratan-musgo)]" />
            <span>
              <span className="block font-semibold">Urgente</span>
              <span className="block text-xs text-muted-foreground">vai para o topo da aprovação</span>
            </span>
          </label>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="pedido-por-que">Por quê</Label>
          <textarea
            id="pedido-por-que"
            value={justificativa}
            maxLength={LIMITES_DO_PEDIDO.justificativa}
            onChange={(event) => setJustificativa(event.target.value)}
            rows={3}
            placeholder="Ex.: acaba antes da próxima entrega; a semana tem 18 aplicações."
            className="w-full rounded-md border border-input bg-white/80 px-3.5 py-2.5 text-base text-brand-tinta placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
          <p className="text-right text-xs tabular-nums text-muted-foreground">
            {justificativa.trim().length}/{LIMITES_DO_PEDIDO.justificativa}
          </p>
        </div>

        {mostrarProblemas && problemas.length ? (
          <div ref={problemasRef} tabIndex={-1} role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 outline-none">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Falta pouco para enviar:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {problemas.slice(0, 6).map((problema) => (
                <li key={problema}>{problema}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>
    </Gaveta>
  );
}
