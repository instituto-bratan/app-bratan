// FORMULÁRIO "NOVO PEDIDO" (06/10/2026) — passo 1 do fluxograma POP-COMP-001:
// o setor diz o que falta (do estoque dele ou escrito à mão), quanto, para
// quando e por quê. O mesmo formulário serve o "Ajustar e reenviar" de um
// pedido devolvido (vem preenchido, com o motivo da devolução em cima).
//
// A validação é a do motor (validarPedido), que tem as mesmas frases do banco:
// o que a tela recusa é exatamente o que o banco recusaria.
//
// 08/10/2026 (redesenho Papel & Musgo): os mesmos campos, na forma aprovada —
// campo com contorno de 3:1 e foco em anel musgo, recados em faixa (sem âmbar
// e rosa soltos), "Urgente" na cor de erro e o botão principal no pé da gaveta.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, PackagePlus, PencilLine, Plus, Search, Send, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/fundacao";
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
import { Campo, CampoArea, CampoSelecao, CampoTexto, Recado, classeDoRotulo } from "./pecas";
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
      sobrancelha={existente ? `Pedido ${numeroDoPedido(existente.numero)} · devolvido para ajuste` : nomeDoSetorAtual ? `Compras e estoque · ${nomeDoSetorAtual}` : "Compras e estoque"}
      titulo={existente ? `Ajustar o pedido ${numeroDoPedido(existente.numero)}` : "Novo pedido de compra"}
      subtitulo={existente ? "Corrija o que foi pedido e reenvie para aprovação." : "Diga o que falta, quanto e por quê. O Gestor Financeiro aprova."}
      rodape={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            {total > 0 ? (
              <>
                Estimado <span className="text-sm font-bold tabular-nums text-tinta">{brl(total)}</span>
              </>
            ) : linhas.length ? (
              "Sem valor estimado (opcional)"
            ) : (
              "Nenhum item ainda"
            )}
          </p>
          <Botao
            type="submit"
            form={formId}
            variante="primario"
            carregando={salvando}
            icone={<Send className="h-4 w-4" aria-hidden="true" />}
            className="max-sm:h-[52px] max-sm:w-full max-sm:text-base"
          >
            {salvando ? "Enviando…" : existente ? "Reenviar para aprovação" : "Enviar pedido"}
          </Botao>
        </div>
      }
    >
      <form id={formId} onSubmit={enviar} className="grid gap-6 font-sans" noValidate>
        {existente?.decisaoNota ? (
          <Recado tom="atencao">
            <strong>O que pediram para ajustar: </strong>
            {existente.decisaoNota}
          </Recado>
        ) : null}

        {/* Setor: só os que a pessoa pode pedir; o dela vem primeiro. */}
        {setores.length > 1 && !existente ? (
          <Campo id="pedido-setor" rotulo="Para qual setor">
            <CampoSelecao id="pedido-setor" value={setor} onChange={(event) => trocarSetor(event.target.value as EstoqueSetor)}>
              {setores.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {setorNomes[opcao]}
                </option>
              ))}
            </CampoSelecao>
          </Campo>
        ) : (
          <p className="text-sm font-medium text-tinta-2">
            Setor: <span className="font-bold text-tinta">{nomeDoSetorAtual || "—"}</span>
          </p>
        )}

        {/* Itens */}
        <fieldset className="grid gap-3">
          <legend className={cn(classeDoRotulo, "mb-2")}>O que precisa</legend>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-tinta-2" aria-hidden="true" />
            <CampoTexto
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
            <div className="rounded-bloco border border-fio bg-folha">
              <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-[0.06em] text-tinta-2">
                {busca.trim() ? (sugestoes.length ? "No estoque do setor" : "Nada com esse nome no estoque do setor") : "Em falta no estoque do setor"}
              </p>
              <ul>
                {sugestoes.map(({ item, saldo, emFalta, jaVem }) => {
                  const ja = noPedido.has(item.id);
                  return (
                    <li key={item.id} className="border-t border-fio first:border-t-0">
                      <button
                        type="button"
                        disabled={ja}
                        onClick={() => adicionarDoEstoque(item)}
                        className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-saber focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span className="min-w-0">
                          <span className={cn("block font-bold [overflow-wrap:anywhere]", ja ? "text-tinta-2" : "text-tinta")}>{item.nome}</span>
                          <span className={cn("block text-[13px] leading-5 tabular-nums", emFalta ? "font-bold text-atencao" : "font-medium text-tinta-2")}>
                            tem {qtdBR(saldo)} {item.unidade || "un"}
                            {item.minimo > 0 ? ` · mínimo ${qtdBR(item.minimo)}` : ""}
                            {jaVem ? ` · ${jaVem}` : ""}
                          </span>
                        </span>
                        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[13px] font-bold", ja ? "text-tinta-2" : "text-musgo")}>
                          {ja ? (
                            "No pedido"
                          ) : (
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

          <Botao variante="secundario" onClick={adicionarItemNovo} icone={<PencilLine className="h-4 w-4" aria-hidden="true" />} className="justify-start max-md:h-11">
            {busca.trim() && !sugestoes.length ? `Item novo: “${busca.trim()}”` : "Item novo (fora do estoque)"}
          </Botao>

          {linhas.length ? (
            <ul className="grid gap-3">
              {linhas.map((linha, indice) => (
                <li key={linha.chave} className="rounded-bloco border border-fio bg-folha p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {linha.estoqueItemRef ? (
                        <p className="pt-2 text-sm font-bold text-tinta [overflow-wrap:anywhere]">
                          {linha.descricao}
                          <span className="ml-2 inline-flex h-5 items-center gap-1 rounded-controle bg-musgo-claro px-2 align-[1px] text-xs font-bold text-musgo">
                            <PackagePlus className="h-3 w-3" aria-hidden="true" />
                            do estoque
                          </span>
                        </p>
                      ) : (
                        <>
                          <label htmlFor={`${linha.chave}-desc`} className="sr-only">
                            O que é o item {indice + 1}
                          </label>
                          <CampoTexto
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
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-erro-claro hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] items-end gap-2">
                    <Campo id={`${linha.chave}-qtd`} rotulo="Quantidade">
                      <CampoTexto
                        id={`${linha.chave}-qtd`}
                        value={linha.quantidade}
                        inputMode="decimal"
                        onChange={(event) => mudarLinha(linha.chave, "quantidade", event.target.value)}
                        className="tabular-nums"
                      />
                    </Campo>
                    <Campo id={`${linha.chave}-un`} rotulo="Unidade">
                      <CampoTexto
                        id={`${linha.chave}-un`}
                        value={linha.unidade}
                        maxLength={LIMITES_DO_PEDIDO.unidade}
                        onChange={(event) => mudarLinha(linha.chave, "unidade", event.target.value)}
                        placeholder="un, cx, pct"
                      />
                    </Campo>
                    <Campo id={`${linha.chave}-valor`} rotulo="Valor de cada">
                      <CampoTexto
                        id={`${linha.chave}-valor`}
                        value={linha.valorUnitario}
                        inputMode="decimal"
                        onChange={(event) => mudarLinha(linha.chave, "valorUnitario", event.target.value)}
                        placeholder="R$ (opcional)"
                        className="tabular-nums"
                      />
                    </Campo>
                  </div>
                  <Campo id={`${linha.chave}-link`} rotulo="Link ou fornecedor sugerido (opcional)" className="mt-3">
                    <CampoTexto
                      id={`${linha.chave}-link`}
                      value={linha.link}
                      maxLength={LIMITES_DO_PEDIDO.link}
                      onChange={(event) => mudarLinha(linha.chave, "link", event.target.value)}
                      placeholder="https://… ou o nome da loja"
                    />
                  </Campo>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-bloco bg-saber px-3 py-4 text-center text-sm font-medium text-tinta-2">
              Nenhum item ainda. Busque no estoque do setor ou escreva um item novo.
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="pedido-para-quando" rotulo="Para quando (opcional)">
            <CampoTexto id="pedido-para-quando" type="date" value={precisaAte} onChange={(event) => setPrecisaAte(event.target.value)} />
          </Campo>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 self-end rounded-controle border border-borda-campo bg-folha px-3 py-2 text-sm text-tinta has-[:checked]:border-erro has-[:checked]:bg-erro-claro">
            <input type="checkbox" checked={urgente} onChange={(event) => setUrgente(event.target.checked)} className="h-5 w-5 accent-[rgb(var(--erro-rgb))]" />
            <span>
              <span className="block font-bold">Urgente</span>
              <span className="block text-[13px] font-medium text-tinta-2">vai para o topo da aprovação</span>
            </span>
          </label>
        </div>

        <Campo
          id="pedido-por-que"
          rotulo="Por quê"
          ajuda={
            <span className="block text-right tabular-nums">
              {justificativa.trim().length}/{LIMITES_DO_PEDIDO.justificativa}
            </span>
          }
        >
          <CampoArea
            id="pedido-por-que"
            value={justificativa}
            maxLength={LIMITES_DO_PEDIDO.justificativa}
            onChange={(event) => setJustificativa(event.target.value)}
            rows={3}
            placeholder="Ex.: acaba antes da próxima entrega; a semana tem 18 aplicações."
          />
        </Campo>

        {mostrarProblemas && problemas.length ? (
          <div ref={problemasRef} tabIndex={-1} role="alert" className="outline-none">
            <Recado tom="atencao" icone={<AlertTriangle aria-hidden="true" />}>
              <strong>Falta pouco para enviar:</strong>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {problemas.slice(0, 6).map((problema) => (
                  <li key={problema}>{problema}</li>
                ))}
              </ul>
            </Recado>
          </div>
        ) : null}
      </form>
    </Gaveta>
  );
}
