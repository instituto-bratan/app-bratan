// FATURA DO CARTÃO (29/09/2026) — pedido aprovado pelo Lucas.
//
// A fatura do Itaú deixa de ser um número só em Contas a Pagar: o Lucas solta o
// arquivo que o Itaú Empresas exporta, o app mostra linha a linha (categoria
// sugerida + a compra de Compras com que casou) e, ao confirmar, a fatura vira
// UMA conta a pagar com o total do boleto — atualizando a estimativa daquele
// cartão/mês em vez de criar outra. As regras moram em faturaCartao.ts (puro,
// testado em tests/fatura-cartao.test.mjs).
//
// REDESENHO PAPEL & MUSGO (08/10/2026): UM cabeçalho com a frase de em que pé
// está a fatura da vez (cartão e mês ao lado), importar e conferir em FOLHAS, o
// rateio da P12 num bloco SABER e o "Confirmar fatura de R$ …" com o valor no
// rótulo. Nenhuma regra mudou (mesmas travas, mesma conta a pagar, mesmo desfazer).
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardPaste, CreditCard, FileUp, Loader2, Undo2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { avisar, confirmar } from "@/components/ui/avisos";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canFinanceiroFull } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { lerLinhasDeXlsx } from "@/lib/planilhaLeitor";
import {
  confirmarRemoteFaturaCartao,
  desfazerRemoteFaturaCartao,
  listRemoteComprasDeCartao,
  listRemoteComprasJaNaFatura,
  listRemoteFaturasCartao,
  listRemoteItensDaFatura,
  mensagemDoErroDaFatura,
  updateRemoteCategoriaDoItem,
  type FaturaImportada,
  type ItemFaturaGravado,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import {
  CATEGORIA_FATURA,
  acharContaDaFatura,
  assinaturaDaFatura,
  cartaoConfig,
  cartoesFatura,
  casarComCompras,
  chaveDeUso,
  compraDeCartao,
  dataBR,
  diasEntre,
  lerFaturaDeConteudo,
  lerFaturaDeMatriz,
  lerFaturaDeTexto,
  rateioDaFatura,
  resumoDaFatura,
  sugerirCategoria,
  tipoLinhaLabels,
  travaDeImportacao,
  valorDaCelula,
  type CartaoFatura,
  type CompraParaCasar,
  type FaturaLida,
  type LinhaFatura,
} from "./faturaCartao";
import { createFinId, moneyFin, monthKeyLabel, type FinCategory } from "./financeiroData";
import { extrairLinhasPdf } from "./pdfTexto";
import { useFinanceiro } from "./useFinanceiro";
import {
  AJUDA,
  AvisoDaTela,
  CABECA_DA_FOLHA,
  CAMPO,
  CAMPO_PQ,
  CAMPO_TEXTO,
  Campo,
  Etiqueta,
  NumeroEmReais,
  RUBRICA,
  TD,
  TH,
  TituloDoBloco,
  quantos,
} from "./pecasDiaPagar";

function somarMeses(mesRef: string, delta: number) {
  const [ano, mes] = mesRef.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ultimoDia(mesRef: string) {
  const [ano, mes] = mesRef.split("-").map(Number);
  return `${mesRef}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Texto do arquivo: UTF-8 e, se vier com acento quebrado (CSV antigo do banco), Windows-1252. */
async function textoDoArquivo(arquivo: File) {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function valorParaCampo(valor: number | null) {
  return valor === null ? "" : valor.toFixed(2).replace(".", ",");
}

export function FinanceiroFaturaCartaoPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  // Gravar exige o financeiro completo também no banco (fin_expenses só aceita ele).
  const podeGravar = canEditModule(pessoa, "fin-fatura") && canFinanceiroFull(pessoa?.cargo);
  const queryClient = useQueryClient();
  const hoje = todayISO();
  // A fatura "da vez": depois do dia 20 os dois boletos do mês já venceram — a próxima é a do mês que vem.
  const [mesRef, setMesRef] = useState(() => (Number(hoje.slice(8, 10)) > 20 ? somarMeses(hoje.slice(0, 7), 1) : hoje.slice(0, 7)));
  const [cartao, setCartao] = useState<CartaoFatura>("ITAU_MASTER");
  const financeiro = useFinanceiro(Number(mesRef.slice(0, 4)));

  const [lida, setLida] = useState<FaturaLida | null>(null);
  const [textoBruto, setTextoBruto] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");
  const [colando, setColando] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [totalTexto, setTotalTexto] = useState("");
  const [categoriasEditadas, setCategoriasEditadas] = useState<Record<number, string>>({});
  const [manuais, setManuais] = useState<Record<number, string | null>>({});
  const [contaEscolhida, setContaEscolhida] = useState<string>("");
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const inputArquivo = useRef<HTMLInputElement>(null);

  // ---- dados do banco --------------------------------------------------------
  const faturasQuery = useQuery({ queryKey: ["fin-fatura-cartao"], queryFn: listRemoteFaturasCartao, enabled: useRemote, staleTime: 30_000 });
  const usadasQuery = useQuery({ queryKey: ["fin-fatura-usadas"], queryFn: listRemoteComprasJaNaFatura, enabled: useRemote, staleTime: 30_000 });
  // Parcela de até 12x vem de compra de até um ano antes do vencimento.
  const janelaCompras = useMemo(() => ({ de: `${somarMeses(mesRef, -13)}-01`, ate: ultimoDia(mesRef) }), [mesRef]);
  const comprasQuery = useQuery({
    queryKey: ["fin-fatura-compras", janelaCompras.de, janelaCompras.ate],
    queryFn: () => listRemoteComprasDeCartao(janelaCompras.de, janelaCompras.ate),
    enabled: useRemote,
    staleTime: 30_000,
  });
  const faturas: FaturaImportada[] = faturasQuery.data ?? [];
  const importada = faturas.find((fatura) => fatura.cartao === cartao && fatura.mesRef === mesRef) ?? null;
  const itensQuery = useQuery({
    queryKey: ["fin-fatura-itens", importada?.clientRef ?? ""],
    queryFn: () => listRemoteItensDaFatura(importada!.clientRef),
    enabled: useRemote && Boolean(importada),
    staleTime: 30_000,
  });

  const compras: CompraParaCasar[] = useMemo(() => {
    if (useRemote) return comprasQuery.data ?? [];
    // Modo demonstração: o que está no aparelho.
    return financeiro.purchases.filter((compra) => compraDeCartao(compra));
  }, [useRemote, comprasQuery.data, financeiro.purchases]);
  const compraPorId = useMemo(() => new Map(compras.map((compra) => [compra.id, compra])), [compras]);
  const jaUsadas = useMemo(() => new Set((usadasQuery.data ?? []).map((uso) => chaveDeUso(uso.purchaseRef, uso.parcelaNum))), [usadasQuery.data]);
  const categorias: FinCategory[] = useMemo(
    () => [...financeiro.categories].filter((categoria) => categoria.active && !categoria.id.startsWith("cat-poup-")).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [financeiro.categories],
  );
  const categoriaPorId = useMemo(() => new Map(financeiro.categories.map((categoria) => [categoria.id, categoria])), [financeiro.categories]);
  const categoriasValidas = useMemo(() => new Set(financeiro.categories.map((categoria) => categoria.id)), [financeiro.categories]);
  const nomeCategoria = (ref: string | null) => (ref ? categoriaPorId.get(ref)?.name ?? ref : "—");

  // ---- a fatura lida, linha a linha -----------------------------------------
  const casamentos = useMemo(() => (lida ? casarComCompras(lida.linhas, compras, { jaUsadas, manuais }) : new Map()), [lida, compras, jaUsadas, manuais]);
  const linhasComCategoria = useMemo(() => {
    if (!lida) return [];
    return lida.linhas.map((linha) => {
      const casada = casamentos.get(linha.ordem);
      const compra = casada ? compraPorId.get(casada.compraId) ?? null : null;
      const sugestao = sugerirCategoria(linha, cartao, compra, categoriasValidas);
      const editada = categoriasEditadas[linha.ordem];
      return {
        linha,
        casada,
        compra,
        sugestao,
        categoriaRef: linha.tipo === "PAGAMENTO" ? CATEGORIA_FATURA : editada ?? sugestao.categoriaRef,
        editada: Boolean(editada),
      };
    });
  }, [lida, casamentos, compraPorId, cartao, categoriasValidas, categoriasEditadas]);

  const total = valorDaCelula(totalTexto);
  const assinatura = useMemo(() => (lida ? assinaturaDaFatura(lida) : ""), [lida]);
  const resumo = useMemo(() => (lida ? resumoDaFatura(lida.linhas, casamentos, total) : null), [lida, casamentos, total]);
  const rateio = useMemo(
    () => (lida && total ? rateioDaFatura(linhasComCategoria.map((item) => ({ valor: item.linha.valor, tipo: item.linha.tipo, categoriaRef: item.categoriaRef })), total) : []),
    [lida, total, linhasComCategoria],
  );
  const aRevisar = linhasComCategoria.filter((item) => item.sugestao.revisar && !item.editada && item.linha.tipo !== "PAGAMENTO").length;

  // ---- a conta a pagar que recebe a fatura ----------------------------------
  const ligadas = useMemo(() => new Set(faturas.map((fatura) => fatura.expenseRef)), [faturas]);
  const contaDaFatura = useMemo(() => acharContaDaFatura(financeiro.expenses, cartao, mesRef, ligadas), [financeiro.expenses, cartao, mesRef, ligadas]);
  // Só re-sugere quando muda o conjunto de contas possíveis (cartão, mês, contas do mês) —
  // não a cada recarga do banco, para não desfazer a escolha da pessoa.
  const chaveDasCandidatas = `${cartao}|${mesRef}|${contaDaFatura.candidatas.map((expense) => expense.id).join(",")}`;
  useEffect(() => {
    setContaEscolhida(contaDaFatura.sugerida?.id ?? (contaDaFatura.candidatas.length ? "" : "NOVA"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDasCandidatas]);
  const contaSelecionada = contaEscolhida && contaEscolhida !== "NOVA" ? financeiro.expenses.find((expense) => expense.id === contaEscolhida) ?? null : null;

  const trava = useMemo(
    () => travaDeImportacao({ cartao, mesRef, assinatura: assinatura || "-", expenseRef: contaSelecionada?.id ?? null }, faturas),
    [cartao, mesRef, assinatura, contaSelecionada, faturas],
  );

  // O arquivo fala de um cartão e a pessoa escolheu o outro?
  const outraBandeira = useMemo(() => {
    if (!textoBruto) return null;
    const escolhido = cartaoConfig(cartao);
    const fala = (regex: RegExp) => regex.test(textoBruto);
    const outro = cartoesFatura.find((item) => item.id !== cartao);
    if (outro && fala(outro.id === "ITAU_VISA" ? /\bvisa\b/i : /master ?card|\bmaster\b/i) && !fala(escolhido.id === "ITAU_VISA" ? /\bvisa\b/i : /master ?card|\bmaster\b/i)) return outro;
    return null;
  }, [textoBruto, cartao]);

  const pendencias: string[] = [];
  if (lida) {
    if (!vencimento) pendencias.push("Escolha o vencimento do boleto.");
    else if (vencimento.slice(0, 7) !== mesRef) pendencias.push(`O vencimento (${dataBR(vencimento)}) é de ${monthKeyLabel(vencimento.slice(0, 7))}, mas o mês escolhido é ${monthKeyLabel(mesRef)}.`);
    if (!total || total <= 0) pendencias.push("Digite o total da fatura (o valor do boleto).");
    if (!contaEscolhida) pendencias.push("Escolha qual conta a pagar recebe a fatura (ou crie uma nova).");
    if (trava.bloqueada) pendencias.push(trava.motivo);
  }
  const avisosDaConta: string[] = [];
  if (contaDaFatura.duplicadas.length) {
    avisosDaConta.push(
      `Há ${contaDaFatura.duplicadas.length} contas deste cartão em ${monthKeyLabel(mesRef)} (${contaDaFatura.duplicadas.map((expense) => `${expense.description} · ${moneyFin(expense.amount)}`).join("; ")}). Provável duplicidade: escolha a que fica e exclua a outra em Contas a Pagar.`,
    );
  }
  if (contaSelecionada?.paidAt && total && Math.abs((contaSelecionada.amount || 0) - total) > 0.02) {
    avisosDaConta.push(
      `Esta conta já está paga (${dataBR(contaSelecionada.paidAt)}) por ${moneyFin(contaSelecionada.amount)}, e a fatura diz ${moneyFin(total)}. Confirmar troca o valor da conta paga — confira com o extrato.`,
    );
  }

  function limpar() {
    setLida(null);
    setTextoBruto("");
    setArquivoNome("");
    setVencimento("");
    setTotalTexto("");
    setCategoriasEditadas({});
    setManuais({});
    setTextoColado("");
    setColando(false);
  }

  function aplicarLeitura(resultado: FaturaLida, bruto: string, nome: string) {
    if (!resultado.linhas.length) {
      setErro(resultado.avisos[0] ?? "Não achei nenhuma compra neste arquivo.");
      return;
    }
    setLida(resultado);
    setTextoBruto(bruto);
    setArquivoNome(nome);
    setCategoriasEditadas({});
    setManuais({});
    setVencimento(resultado.vencimento ?? "");
    setTotalTexto(valorParaCampo(resultado.totalDeclarado ?? resultado.somaLinhas));
    if (resultado.vencimento && resultado.vencimento.slice(0, 7) !== mesRef) {
      setMesRef(resultado.vencimento.slice(0, 7));
      setFeedback(`Li ${resultado.linhas.length} linha(s). O vencimento é ${dataBR(resultado.vencimento)}, então o mês mudou para ${monthKeyLabel(resultado.vencimento.slice(0, 7))}.`);
    } else {
      setFeedback(`Li ${resultado.linhas.length} linha(s) de ${nome || "texto colado"}. Confira abaixo antes de confirmar.`);
    }
  }

  async function receberArquivo(arquivo: File) {
    setErro("");
    setFeedback("");
    setLendo(true);
    const referencia = ultimoDia(mesRef);
    try {
      const nome = arquivo.name.toLowerCase();
      if (nome.endsWith(".xls")) {
        throw new Error("O .xls antigo do Excel não abre aqui. Abra no Excel e use \"Salvar como\" .xlsx (ou CSV) — ou solte o PDF da fatura.");
      }
      if (nome.endsWith(".xlsx")) {
        const matriz = await lerLinhasDeXlsx(await arquivo.arrayBuffer());
        aplicarLeitura(lerFaturaDeMatriz(matriz, { referencia }, "XLSX"), matriz.map((linha) => linha.join(" ")).join("\n"), arquivo.name);
      } else if (nome.endsWith(".pdf") || arquivo.type === "application/pdf") {
        const texto = await extrairLinhasPdf(arquivo);
        const resultado = lerFaturaDeTexto(texto, { referencia }, "PDF");
        if (!resultado.linhas.length) {
          setColando(true);
          throw new Error("Não achei compras no texto deste PDF (pode ser imagem escaneada). Abra o PDF, copie o texto da fatura e cole no campo abaixo.");
        }
        aplicarLeitura(resultado, texto, arquivo.name);
      } else {
        const texto = await textoDoArquivo(arquivo);
        aplicarLeitura(lerFaturaDeConteudo(texto, arquivo.name, { referencia }), texto, arquivo.name);
      }
    } catch (falha) {
      setErro(`Não consegui ler o arquivo: ${(falha as Error).message}`);
    } finally {
      setLendo(false);
    }
  }

  function lerColado() {
    setErro("");
    setFeedback("");
    if (!textoColado.trim()) {
      setErro("Cole o texto da fatura primeiro.");
      return;
    }
    aplicarLeitura(lerFaturaDeConteudo(textoColado, "", { referencia: ultimoDia(mesRef) }), textoColado, "");
  }

  const confirmarMutation = useMutation({
    mutationFn: async () => {
      if (!lida || !total || !vencimento || !contaEscolhida) throw new Error("Falta vencimento, total ou a conta.");
      const cfg = cartaoConfig(cartao);
      const faturaRef = `fatura-${cartao.toLowerCase()}-${mesRef}-${(crypto.randomUUID?.() ?? String(Date.now())).slice(0, 8)}`;
      const acao = contaEscolhida === "NOVA" ? "CRIAR" : "ATUALIZAR";
      const contaRef = acao === "CRIAR" ? createFinId("fexp") : contaEscolhida;
      const anterior = acao === "ATUALIZAR" && contaSelecionada ? ` Estimativa anterior: ${moneyFin(contaSelecionada.amount)} com vencimento ${dataBR(contaSelecionada.dueDate)}.` : "";
      return confirmarRemoteFaturaCartao({
        clientRef: faturaRef,
        cartao,
        finalCartao: lida.finalCartao,
        mesRef,
        vencimento,
        fechamento: lida.fechamento,
        total,
        somaLinhas: lida.somaLinhas,
        assinatura,
        arquivoNome,
        arquivoFormato: lida.formato,
        observacao: resumo ? `${resumo.frase} ${resumo.complemento}`.trim() : "",
        conta: {
          acao,
          clientRef: contaRef,
          description: `Fatura cartão ${cfg.rotulo}${lida.finalCartao ? ` — final ${lida.finalCartao}` : ""}`,
          supplier: "Itaú",
          nota: `Fatura importada em ${dataBR(hoje)}: ${lida.linhas.length} linhas, total ${moneyFin(total)}.${anterior}`,
        },
        itens: linhasComCategoria.map((item) => ({
          clientRef: `${faturaRef}:${item.linha.ordem}`,
          ordem: item.linha.ordem,
          data: item.linha.data,
          descricao: item.linha.descricao,
          parcelaNum: item.linha.parcelaNum,
          parcelaTotal: item.linha.parcelaTotal,
          valor: item.linha.valor,
          tipo: item.linha.tipo,
          categoriaRef: item.categoriaRef,
          categoriaOrigem: item.editada ? "MANUAL" : item.sugestao.origem,
          purchaseRef: item.casada?.compraId ?? null,
          casamento: item.casada?.origem ?? null,
        })),
      });
    },
    onSuccess: () => {
      for (const chave of ["fin-fatura-cartao", "fin-fatura-usadas", "fin-fatura-rateio", "fin-expenses", "fin-fatura-itens"]) {
        void queryClient.invalidateQueries({ queryKey: [chave] });
      }
      const texto = `Fatura de ${monthKeyLabel(mesRef)} do ${cartaoConfig(cartao).rotulo} confirmada: ${moneyFin(total ?? 0)} ${contaEscolhida === "NOVA" ? "numa conta nova" : "na conta que era a estimativa"}.`;
      avisar(texto, "ok");
      setFeedback(texto);
      limpar();
    },
    onError: (falha: Error) => {
      const texto = `A fatura NÃO foi gravada: ${mensagemDoErroDaFatura(falha)}`;
      setErro(texto);
      avisar(texto, "erro");
    },
  });

  const desfazerMutation = useMutation({
    mutationFn: (ref: string) => desfazerRemoteFaturaCartao(ref),
    onSuccess: () => {
      for (const chave of ["fin-fatura-cartao", "fin-fatura-usadas", "fin-fatura-rateio", "fin-fatura-itens"]) {
        void queryClient.invalidateQueries({ queryKey: [chave] });
      }
      avisar("Importação desfeita. A conta a pagar ficou com o total que já tinha.", "ok");
    },
    onError: (falha: Error) => {
      const texto = `Não consegui desfazer: ${mensagemDoErroDaFatura(falha)}`;
      setErro(texto);
      avisar(texto, "erro");
    },
  });

  async function desfazer(fatura: FaturaImportada) {
    const ok = await confirmar(`Desfazer a importação da fatura de ${monthKeyLabel(fatura.mesRef)}?`, {
      corpo: "As linhas saem e a P12 volta a mostrar a fatura inteira na categoria do cartão. A conta a pagar continua, com o total que já tem.",
      confirmar: "Desfazer importação",
      destrutivo: true,
    });
    if (ok) desfazerMutation.mutate(fatura.clientRef);
  }

  const mudarCategoriaGravada = useMutation({
    mutationFn: (values: { item: ItemFaturaGravado; categoriaRef: string }) => updateRemoteCategoriaDoItem(values.item.clientRef, values.categoriaRef),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fin-fatura-itens"] });
      void queryClient.invalidateQueries({ queryKey: ["fin-fatura-rateio"] });
    },
    onError: (falha: Error) => {
      const texto = `A categoria NÃO foi salva: ${falha.message}`;
      setErro(texto);
      avisar(texto, "erro");
    },
  });

  const meses = useMemo(() => Array.from({ length: 14 }, (_, i) => somarMeses(hoje.slice(0, 7), 1 - i)), [hoje]);
  const podeConfirmar = Boolean(lida) && !pendencias.length && podeGravar && useRemote && !confirmarMutation.isPending;

  // ---- fatura já importada (tela de consulta) --------------------------------
  const itensGravados = itensQuery.data ?? [];
  const rateioGravado = useMemo(
    () => (importada ? rateioDaFatura(itensGravados.map((item) => ({ valor: item.valor, tipo: item.tipo, categoriaRef: item.categoriaRef })), importada.total) : []),
    [importada, itensGravados],
  );
  const resumoGravado = useMemo(() => {
    if (!importada) return null;
    const linhas: LinhaFatura[] = itensGravados.map((item) => ({ ordem: item.ordem, data: item.data, descricao: item.descricao, parcelaNum: item.parcelaNum, parcelaTotal: item.parcelaTotal, valor: item.valor, tipo: item.tipo }));
    const casadas = new Map(itensGravados.filter((item) => item.purchaseRef).map((item) => [item.ordem, { ordem: item.ordem, compraId: item.purchaseRef!, origem: item.casamento ?? "AUTO", diasDeDiferenca: 0 } as const]));
    return resumoDaFatura(linhas, casadas, importada.total);
  }, [importada, itensGravados]);
  const contaDaImportada = importada ? financeiro.expenses.find((expense) => expense.id === importada.expenseRef) ?? null : null;

  // ---- Papel & Musgo (08/10/2026): a frase do cabeçalho diz em que pé está a fatura da vez ----
  const rotuloCartao = cartaoConfig(cartao).rotulo;
  const fraseDoTopo = importada ? (
    <>
      A fatura de {monthKeyLabel(mesRef)} do {rotuloCartao} <strong>já foi importada</strong>: {moneyFin(importada.total)}, vence{" "}
      {dataBR(importada.vencimento)}.
    </>
  ) : lida && resumo ? (
    <>
      <strong>{resumo.frase}</strong> Confira as linhas e confirme: a fatura vira uma conta a pagar com o total do boleto.
    </>
  ) : (
    <>
      A fatura de {monthKeyLabel(mesRef)} do {rotuloCartao} <strong>ainda não foi importada</strong>. Solte o arquivo que o Itaú Empresas exporta:
      o app mostra o que tem dentro, quais compras já estavam em Compras e quais ninguém lançou.
    </>
  );

  return (
    <AccessGate allowed={canFinanceiroFull} label="Financeiro · Fatura do cartão" module="fin-fatura">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Financeiro · Pagar"
          titulo="Fatura do cartão"
          frase={fraseDoTopo}
          acoes={
            <div className="grid grid-cols-2 gap-2 max-sm:w-full">
              <label className="grid gap-1">
                <span className="text-xs font-bold text-tinta-2">Cartão</span>
                <select id="fatura-cartao" value={cartao} onChange={(event) => setCartao(event.target.value as CartaoFatura)} className={cn(CAMPO, "sm:w-[13rem]")}>
                  {cartoesFatura.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-bold text-tinta-2">Mês do vencimento</span>
                <select id="fatura-mes" value={mesRef} onChange={(event) => setMesRef(event.target.value)} className={cn(CAMPO, "sm:w-[12rem]")}>
                  {meses.map((mes) => (
                    <option key={mes} value={mes}>
                      {monthKeyLabel(mes)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          }
        />

        {!useRemote || (useRemote && !podeGravar) || faturasQuery.isError || comprasQuery.isError || feedback || erro ? (
          <div className="grid gap-2">
            {!useRemote ? <AvisoDaTela tom="atencao">Neste modo (sem login) dá para ler a fatura, mas nada é gravado.</AvisoDaTela> : null}
            {useRemote && !podeGravar ? (
              <AvisoDaTela tom="info">Você pode consultar. Só o financeiro completo (Lucas, Dr. Daniel, CEO) confirma ou desfaz uma fatura.</AvisoDaTela>
            ) : null}
            {faturasQuery.isError ? (
              <AvisoDaTela tom="erro">Não consegui ler as faturas já importadas: {mensagemDoErroDaFatura(faturasQuery.error)}</AvisoDaTela>
            ) : null}
            {comprasQuery.isError ? (
              <AvisoDaTela tom="erro">Não consegui ler as Compras para conferir — o casamento com Compras fica vazio até recarregar.</AvisoDaTela>
            ) : null}
            {feedback ? (
              <AvisoDaTela tom="ok" onFechar={() => setFeedback("")}>
                {feedback}
              </AvisoDaTela>
            ) : null}
            {erro ? (
              <AvisoDaTela tom="erro" onFechar={() => setErro("")}>
                {erro}
              </AvisoDaTela>
            ) : null}
          </div>
        ) : null}

        {importada ? (
          <FaturaImportadaCard
            fatura={importada}
            itens={itensGravados}
            carregando={itensQuery.isLoading}
            resumo={resumoGravado}
            rateio={rateioGravado}
            contaDescricao={contaDaImportada ? `${contaDaImportada.description} · vence ${dataBR(contaDaImportada.dueDate)}${contaDaImportada.paidAt ? ` · paga em ${dataBR(contaDaImportada.paidAt)}` : " · em aberto"}` : "conta não carregada (outro ano?)"}
            categorias={categorias}
            nomeCategoria={nomeCategoria}
            podeGravar={podeGravar && useRemote}
            onCategoria={(item, categoriaRef) => mudarCategoriaGravada.mutate({ item, categoriaRef })}
            onDesfazer={() => void desfazer(importada)}
            desfazendo={desfazerMutation.isPending}
          />
        ) : null}

        {!importada ? (
          <BlocoFolha as="section" aria-labelledby="importar-fatura-titulo" className="min-w-0">
            <div className={CABECA_DA_FOLHA}>
              <TituloDoBloco id="importar-fatura-titulo" icone={<CreditCard className="h-4 w-4" aria-hidden="true" />}>
                {monthKeyLabel(mesRef)} · {rotuloCartao}: ainda não importada
              </TituloDoBloco>
              <InfoTip title="Para que serve">
                A fatura do Itaú vira UMA conta a pagar com o total do boleto (é o pagamento). As linhas não viram contas: elas explicam o gasto. Por
                isso a P12 e o Lucro passam a mostrar a fatura dividida pelas categorias das compras — a soma continua sendo o total da conta, nada é
                contado duas vezes. A parte de obra do cartão sai do lucro, como qualquer obra.
              </InfoTip>
            </div>
            <div className="grid gap-4 p-6 max-md:p-4">
              <p className="max-w-[72ch] text-sm font-medium leading-[22px] text-tinta-2 [text-wrap:pretty]">
                {contaDaFatura.sugerida
                  ? `A conta de estimativa é "${contaDaFatura.sugerida.description}": ${moneyFin(contaDaFatura.sugerida.amount)}, vence ${dataBR(contaDaFatura.sugerida.dueDate)}. Ao confirmar, ela recebe o valor real.`
                  : contaDaFatura.candidatas.length
                    ? "Há conta de fatura neste mês, mas não dá para ter certeza de qual é deste cartão — você escolhe ao confirmar."
                    : "Não há conta de fatura deste cartão neste mês: ao confirmar, o app cria uma."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={inputArquivo}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.ofx,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    const arquivo = event.target.files?.[0];
                    if (arquivo) void receberArquivo(arquivo);
                    event.target.value = "";
                  }}
                />
                <Botao variante="primario" carregando={lendo} disabled={lendo} icone={<FileUp className="h-4 w-4" aria-hidden="true" />} onClick={() => inputArquivo.current?.click()}>
                  Importar fatura (.xlsx, .csv, .ofx ou .pdf)
                </Botao>
                <Botao variante="secundario" aria-expanded={colando} icone={<ClipboardPaste className="h-4 w-4" aria-hidden="true" />} onClick={() => setColando((atual) => !atual)}>
                  Colar o texto da fatura
                </Botao>
                {lida ? (
                  <Botao variante="fantasma" onClick={limpar}>
                    Descartar leitura
                  </Botao>
                ) : null}
              </div>
              {colando ? (
                <div className="grid gap-3">
                  <Campo rotulo="Texto da fatura (copiado do PDF ou do site do Itaú)" htmlFor="fatura-texto">
                    <textarea
                      id="fatura-texto"
                      value={textoColado}
                      onChange={(event) => setTextoColado(event.target.value)}
                      rows={8}
                      placeholder={"Vencimento 17/10/2026  Total da fatura R$ 10.958,89\n02/09 STIN PHARMA 02/02 7.640,50\n21/09 MERCADOLIVRE*LOJA 773,57"}
                      className={cn(CAMPO_TEXTO, "font-mono text-[13px]")}
                    />
                  </Campo>
                  <div>
                    <Botao variante="secundario" tamanho="pq" onClick={lerColado}>
                      Ler o texto
                    </Botao>
                  </div>
                </div>
              ) : null}
            </div>
          </BlocoFolha>
        ) : null}

        {lida && !importada ? (
          <>
            <BlocoFolha as="section" aria-labelledby="conferir-fatura-titulo" className="min-w-0">
              <div className={CABECA_DA_FOLHA}>
                <TituloDoBloco
                  id="conferir-fatura-titulo"
                  icone={
                    resumo && resumo.semRegistro === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-atencao" aria-hidden="true" />
                    )
                  }
                >
                  {resumo?.frase}
                </TituloDoBloco>
              </div>
              <div className="grid gap-4 p-6 max-md:p-4">
                <p className="text-sm font-medium leading-[22px] text-tinta-2">
                  {resumo?.complemento}
                  {lida.finalCartao ? ` Cartão final ${lida.finalCartao}.` : ""}
                  {aRevisar ? ` ${aRevisar} linha(s) com categoria para revisar (em destaque).` : ""}
                </p>
                {[...lida.avisos, ...(outraBandeira ? [`O arquivo fala em ${outraBandeira.curto}, mas o cartão escolhido é ${rotuloCartao}. Confira o cartão.`] : [])].map((aviso) => (
                  <AvisoDaTela key={aviso} tom="atencao">
                    {aviso}
                  </AvisoDaTela>
                ))}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,11rem)_minmax(0,11rem)_minmax(0,1fr)]">
                  <Campo rotulo="Vencimento do boleto" htmlFor="fatura-vencimento">
                    <input id="fatura-vencimento" type="date" value={vencimento} onChange={(event) => setVencimento(event.target.value)} className={CAMPO} />
                  </Campo>
                  <Campo
                    rotulo="Total da fatura (R$)"
                    htmlFor="fatura-total"
                    dica={
                      <InfoTip title="Qual total">
                        É o valor do boleto — é ele que vira a conta a pagar. A soma das linhas deste arquivo dá {moneyFin(lida.somaLinhas)}. Se o
                        total for diferente, a diferença fica na categoria da fatura (saldo anterior, juros).
                      </InfoTip>
                    }
                  >
                    <input
                      id="fatura-total"
                      inputMode="decimal"
                      value={totalTexto}
                      onChange={(event) => setTotalTexto(event.target.value)}
                      className={cn(CAMPO, "text-right tabular-nums")}
                    />
                  </Campo>
                  <Campo rotulo="Conta a pagar que recebe a fatura" htmlFor="fatura-conta" className="sm:col-span-2 lg:col-span-1">
                    <select id="fatura-conta" value={contaEscolhida} onChange={(event) => setContaEscolhida(event.target.value)} className={CAMPO}>
                      {!contaEscolhida ? <option value="">Escolha…</option> : null}
                      {contaDaFatura.candidatas.map((expense) => (
                        <option key={expense.id} value={expense.id}>
                          Atualizar "{expense.description}" · {moneyFin(expense.amount)} · vence {dataBR(expense.dueDate)}
                          {expense.paidAt ? " · paga" : ""}
                        </option>
                      ))}
                      <option value="NOVA">Criar uma conta nova</option>
                    </select>
                  </Campo>
                </div>
                {vencimento && vencimento.slice(0, 7) !== mesRef ? (
                  <div>
                    <Botao variante="secundario" tamanho="pq" onClick={() => setMesRef(vencimento.slice(0, 7))}>
                      Usar {monthKeyLabel(vencimento.slice(0, 7))}
                    </Botao>
                  </div>
                ) : null}
                {avisosDaConta.map((aviso) => (
                  <AvisoDaTela key={aviso} tom="atencao">
                    {aviso}
                  </AvisoDaTela>
                ))}
              </div>
            </BlocoFolha>

            <BlocoFolha as="section" aria-labelledby="linha-a-linha-titulo" className="min-w-0 overflow-hidden">
              <div className={CABECA_DA_FOLHA}>
                <TituloDoBloco id="linha-a-linha-titulo" detalhe={quantos(linhasComCategoria.length, "linha")}>
                  Linha a linha
                </TituloDoBloco>
                <p className={cn(AJUDA, "basis-full")}>
                  &quot;Em Compras&quot; casa pelo valor (±R$ 0,02) e pela data (±5 dias); cada compra só casa com uma linha. Troque a categoria ou a
                  compra quando o app errar.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[66rem] border-collapse text-sm text-tinta">
                  <thead>
                    <tr>
                      <th className={TH}>Data</th>
                      <th className={TH}>Estabelecimento</th>
                      <th className={TH}>Parcela</th>
                      <th className={cn(TH, "text-right")}>Valor</th>
                      <th className={TH}>Categoria</th>
                      <th className={TH}>Em Compras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasComCategoria.map((item) => {
                      const pagamento = item.linha.tipo === "PAGAMENTO";
                      const podeCasar = (item.linha.tipo === "COMPRA" || item.linha.tipo === "PARCELA") && item.linha.valor > 0;
                      const perto = podeCasar
                        ? compras.filter((compra) => {
                            if (compra.id === item.casada?.compraId) return true;
                            if ([...casamentos.values()].some((c) => c.compraId === compra.id)) return false;
                            return item.linha.data ? Math.abs(diasEntre(compra.purchaseDate, item.linha.data)) <= 20 : false;
                          })
                        : [];
                      const revisar = !pagamento && item.sugestao.revisar && !item.editada;
                      return (
                        <tr
                          key={item.linha.ordem}
                          className={cn("align-top transition-colors duration-150 hover:bg-saber/70", pagamento && "text-tinta-2", revisar && "bg-atencao-claro/60")}
                        >
                          <td className={cn(TD, "py-2 tabular-nums")}>{dataBR(item.linha.data)}</td>
                          <td className={cn(TD, "min-w-[12rem] py-2")}>
                            <span className="font-bold">{item.linha.descricao}</span>
                            {item.linha.tipo !== "COMPRA" && item.linha.tipo !== "PARCELA" ? <Etiqueta className="ml-2">{tipoLinhaLabels[item.linha.tipo]}</Etiqueta> : null}
                          </td>
                          <td className={cn(TD, "py-2 tabular-nums")}>{item.linha.parcelaNum ? `${item.linha.parcelaNum}/${item.linha.parcelaTotal}` : "—"}</td>
                          <td className={cn(TD, "whitespace-nowrap py-2 text-right font-bold tabular-nums", item.linha.valor < 0 ? "text-ok" : "text-tinta")}>
                            {moneyFin(item.linha.valor)}
                          </td>
                          <td className={cn(TD, "py-2")}>
                            {pagamento ? (
                              <span className="text-[13px]">fora da conta</span>
                            ) : (
                              <>
                                <select
                                  aria-label={`Categoria de ${item.linha.descricao}`}
                                  value={item.categoriaRef}
                                  onChange={(event) => setCategoriasEditadas((atual) => ({ ...atual, [item.linha.ordem]: event.target.value }))}
                                  className={cn(CAMPO_PQ, "w-full min-w-[12rem] max-w-[16rem]")}
                                >
                                  {categorias.map((categoria) => (
                                    <option key={categoria.id} value={categoria.id}>
                                      {categoria.name}
                                      {categoria.isCapex ? " (obra, fora do lucro)" : ""}
                                    </option>
                                  ))}
                                </select>
                                {!item.editada ? (
                                  <p className={cn("mt-1 text-xs font-semibold leading-4", revisar ? "text-atencao" : "text-tinta-2")}>{item.sugestao.motivo}</p>
                                ) : null}
                              </>
                            )}
                          </td>
                          <td className={cn(TD, "py-2")}>
                            {podeCasar ? (
                              <select
                                aria-label={`Compra de ${item.linha.descricao}`}
                                value={item.casada?.compraId ?? ""}
                                onChange={(event) => setManuais((atual) => ({ ...atual, [item.linha.ordem]: event.target.value || null }))}
                                className={cn(CAMPO_PQ, "w-full min-w-[13rem] max-w-[18rem]", item.casada ? "border-ok bg-ok-claro" : "border-atencao bg-atencao-claro")}
                              >
                                <option value="">Sem registro em Compras</option>
                                {perto.map((compra) => (
                                  <option key={compra.id} value={compra.id}>
                                    {dataBR(compra.purchaseDate)} · {moneyFin(compra.amount)}
                                    {compra.installments > 1 ? ` em ${compra.installments}x` : ""} · {compra.supplier || compra.description}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[13px] text-tinta-2">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </BlocoFolha>

            <RateioCard rateio={rateio} total={total ?? 0} nomeCategoria={nomeCategoria} categoriaPorId={categoriaPorId} />

            {/* A DECISÃO: confirmar a fatura (o valor no rótulo), com o que falta escrito em cima. */}
            <BlocoFolha as="section" aria-label="Confirmar a fatura" className="grid gap-4 p-6 max-md:p-4">
              {pendencias.length ? (
                <div className="grid gap-2">
                  {pendencias.map((pendencia) => (
                    <AvisoDaTela key={pendencia} tom="atencao">
                      {pendencia}
                    </AvisoDaTela>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Botao
                  variante="primario"
                  carregando={confirmarMutation.isPending}
                  disabled={!podeConfirmar}
                  icone={<CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  onClick={() => confirmarMutation.mutate()}
                  // No celular o rótulo (valor e vencimento) quebra em duas linhas em vez de sair do botão (08/10/2026).
                  className="h-auto min-h-10 whitespace-normal py-2.5 text-left leading-5 tabular-nums"
                >
                  Confirmar fatura{total ? ` de ${moneyFin(total)}` : ""}
                  {vencimento ? ` · vence ${dataBR(vencimento)}` : ""}
                </Botao>
                <span className={AJUDA}>
                  {contaEscolhida === "NOVA"
                    ? "Cria uma conta a pagar na categoria Fatura cartão de crédito."
                    : contaSelecionada
                      ? `Atualiza "${contaSelecionada.description}" de ${moneyFin(contaSelecionada.amount)} para ${moneyFin(total ?? 0)}.`
                      : ""}
                </span>
              </div>
            </BlocoFolha>
          </>
        ) : null}

        <HistoricoCard
          faturas={faturas}
          onAbrir={(fatura) => {
            setCartao(fatura.cartao);
            setMesRef(fatura.mesRef);
            limpar();
          }}
        />
        <p className="text-xs font-medium leading-4 text-tinta-2">Dados: {financeiro.syncMode}</p>
      </div>
    </AccessGate>
  );
}

function RateioCard({
  rateio,
  total,
  nomeCategoria,
  categoriaPorId,
}: {
  rateio: { categoriaRef: string; valor: number }[];
  total: number;
  nomeCategoria: (ref: string | null) => string;
  categoriaPorId: Map<string, FinCategory>;
}) {
  if (!rateio.length) return null;
  const obra = rateio.filter((linha) => categoriaPorId.get(linha.categoriaRef)?.isCapex).reduce((soma, linha) => soma + linha.valor, 0);
  return (
    <BlocoSaber as="section" aria-labelledby="rateio-titulo" className="grid gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="rateio-titulo" className={RUBRICA}>
          Como a fatura aparece na P12
        </h2>
        <InfoTip title="Sem contar em dobro">
          A conta da fatura é trocada por estes pedaços na P12, no Painel e no Lucro — a soma é sempre o total da conta. O que as linhas não
          explicam fica em &quot;Fatura cartão de crédito&quot;.
        </InfoTip>
      </div>
      <p className="text-sm font-medium leading-5 text-tinta-2">
        <strong className="font-bold text-tinta">{moneyFin(total)}</strong> divididos em {quantos(rateio.length, "categoria")}
        {obra ? `; ${moneyFin(obra)} são obra e saem do lucro do mês` : ""}.
      </p>
      <dl className="border-t border-fio-2 sm:columns-2 sm:gap-8">
        {rateio.map((linha) => (
          <div key={linha.categoriaRef} className="flex break-inside-avoid items-center justify-between gap-3 border-b border-fio py-2">
            <dt className="min-w-0 text-[13px] font-medium leading-5 text-tinta-2">
              {nomeCategoria(linha.categoriaRef)}
              {categoriaPorId.get(linha.categoriaRef)?.isCapex ? <Etiqueta tom="ouro" className="ml-2">obra</Etiqueta> : null}
            </dt>
            <dd className="whitespace-nowrap text-sm font-bold tabular-nums text-tinta">{moneyFin(linha.valor)}</dd>
          </div>
        ))}
      </dl>
    </BlocoSaber>
  );
}

function FaturaImportadaCard({
  fatura,
  itens,
  carregando,
  resumo,
  rateio,
  contaDescricao,
  categorias,
  nomeCategoria,
  podeGravar,
  onCategoria,
  onDesfazer,
  desfazendo,
}: {
  fatura: FaturaImportada;
  itens: ItemFaturaGravado[];
  carregando: boolean;
  resumo: ReturnType<typeof resumoDaFatura> | null;
  rateio: { categoriaRef: string; valor: number }[];
  contaDescricao: string;
  categorias: FinCategory[];
  nomeCategoria: (ref: string | null) => string;
  podeGravar: boolean;
  onCategoria: (item: ItemFaturaGravado, categoriaRef: string) => void;
  onDesfazer: () => void;
  desfazendo: boolean;
}) {
  const categoriaPorId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
  return (
    <>
      <BlocoFolha as="section" aria-labelledby="fatura-importada-titulo" className="min-w-0">
        <div className={CABECA_DA_FOLHA}>
          <TituloDoBloco id="fatura-importada-titulo" icone={<CheckCircle2 className="h-4 w-4 text-ok" aria-hidden="true" />}>
            {monthKeyLabel(fatura.mesRef)} · {cartaoConfig(fatura.cartao).rotulo}: importada em {dataBR(fatura.createdAt.slice(0, 10))}
          </TituloDoBloco>
          {podeGravar ? (
            <Botao variante="perigo" tamanho="pq" className="ml-auto" carregando={desfazendo} disabled={desfazendo} icone={<Undo2 className="h-4 w-4" aria-hidden="true" />} onClick={onDesfazer}>
              Desfazer importação
            </Botao>
          ) : null}
        </div>
        <div className="grid gap-4 p-6 max-md:p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8">
          <div className="grid gap-1">
            <NumeroEmReais valor={fatura.total} tamanho="medio" />
            <span className="text-[13px] font-medium text-tinta-2">
              vence {dataBR(fatura.vencimento)}
              {fatura.finalCartao ? ` · final ${fatura.finalCartao}` : ""}
            </span>
          </div>
          <div className="grid gap-1 text-sm font-medium leading-[22px] text-tinta-2">
            <p>
              Conta: <span className="font-bold text-tinta">{contaDescricao}</span>
              {fatura.contaAcao === "ATUALIZADA" && fatura.valorAnterior !== null
                ? ` — era a estimativa de ${moneyFin(fatura.valorAnterior)}${fatura.vencimentoAnterior ? ` (vencia ${dataBR(fatura.vencimentoAnterior)})` : ""}.`
                : " — criada na importação."}
            </p>
            {resumo ? <p className="font-bold text-tinta">{resumo.frase}</p> : null}
          </div>
        </div>
      </BlocoFolha>

      <BlocoFolha as="section" aria-labelledby="linhas-gravadas-titulo" className="min-w-0 overflow-hidden">
        <div className={CABECA_DA_FOLHA}>
          <TituloDoBloco id="linhas-gravadas-titulo" detalhe={carregando ? undefined : quantos(itens.length, "linha")}>
            Linhas da fatura
          </TituloDoBloco>
          <p className={cn(AJUDA, "basis-full")}>Trocar a categoria aqui muda a P12 na hora (a conta a pagar não muda).</p>
        </div>
        {carregando ? (
          <p className="flex items-center gap-2 px-6 py-6 text-sm font-medium text-tinta-2 max-md:px-4">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando as linhas…
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] border-collapse text-sm text-tinta">
              <thead>
                <tr>
                  <th className={TH}>Data</th>
                  <th className={TH}>Estabelecimento</th>
                  <th className={TH}>Parcela</th>
                  <th className={cn(TH, "text-right")}>Valor</th>
                  <th className={TH}>Categoria</th>
                  <th className={TH}>Em Compras</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.clientRef} className={cn("transition-colors duration-150 hover:bg-saber/70", item.tipo === "PAGAMENTO" && "text-tinta-2")}>
                    <td className={cn(TD, "py-2 tabular-nums")}>{dataBR(item.data)}</td>
                    <td className={cn(TD, "py-2")}>
                      <span className="font-bold">{item.descricao}</span>
                      {item.tipo !== "COMPRA" && item.tipo !== "PARCELA" ? <Etiqueta className="ml-2">{tipoLinhaLabels[item.tipo]}</Etiqueta> : null}
                    </td>
                    <td className={cn(TD, "py-2 tabular-nums")}>{item.parcelaNum ? `${item.parcelaNum}/${item.parcelaTotal}` : "—"}</td>
                    <td className={cn(TD, "whitespace-nowrap py-2 text-right font-bold tabular-nums", item.valor < 0 ? "text-ok" : "text-tinta")}>{moneyFin(item.valor)}</td>
                    <td className={cn(TD, "py-2")}>
                      {item.tipo === "PAGAMENTO" ? (
                        <span className="text-[13px]">fora da conta</span>
                      ) : podeGravar ? (
                        <select
                          aria-label={`Categoria de ${item.descricao}`}
                          value={item.categoriaRef ?? CATEGORIA_FATURA}
                          onChange={(event) => onCategoria(item, event.target.value)}
                          className={cn(CAMPO_PQ, "w-full min-w-[12rem] max-w-[16rem]")}
                        >
                          {categorias.map((categoria) => (
                            <option key={categoria.id} value={categoria.id}>
                              {categoria.name}
                              {categoria.isCapex ? " (obra, fora do lucro)" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[13px]">{nomeCategoria(item.categoriaRef)}</span>
                      )}
                    </td>
                    <td className={cn(TD, "py-2 text-[13px]")}>
                      {item.purchaseRef ? (
                        <span className="font-bold text-ok">sim{item.casamento === "MANUAL" ? " (ligada à mão)" : ""}</span>
                      ) : item.tipo === "COMPRA" || item.tipo === "PARCELA" ? (
                        <span className="font-bold text-atencao">sem registro</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlocoFolha>

      <RateioCard rateio={rateio} total={fatura.total} nomeCategoria={nomeCategoria} categoriaPorId={categoriaPorId} />
    </>
  );
}

function HistoricoCard({ faturas, onAbrir }: { faturas: FaturaImportada[]; onAbrir: (fatura: FaturaImportada) => void }) {
  if (!faturas.length) return null;
  return (
    <BlocoFolha as="section" aria-labelledby="historico-faturas-titulo" className="min-w-0 overflow-hidden">
      <div className={CABECA_DA_FOLHA}>
        <TituloDoBloco id="historico-faturas-titulo" detalhe={quantos(faturas.length, "fatura")}>
          Faturas já importadas
        </TituloDoBloco>
      </div>
      <ul>
        {faturas.map((fatura) => (
          <li key={fatura.clientRef} className="border-b border-fio last:border-b-0">
            <button
              type="button"
              onClick={() => onAbrir(fatura)}
              className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3 text-left text-sm transition-colors duration-150 hover:bg-saber/70 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco max-md:px-4"
            >
              <span className="text-tinta-2">
                <strong className="font-bold text-tinta">{monthKeyLabel(fatura.mesRef)}</strong> · {cartaoConfig(fatura.cartao).rotulo}
                {fatura.finalCartao ? ` · final ${fatura.finalCartao}` : ""}
              </span>
              <span className="flex items-center gap-3">
                <span className="whitespace-nowrap font-bold tabular-nums text-tinta">{moneyFin(fatura.total)}</span>
                <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-tinta-2">vence {dataBR(fatura.vencimento)}</span>
                <ChevronRight className="h-4 w-4 text-tinta-2" aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </BlocoFolha>
  );
}
