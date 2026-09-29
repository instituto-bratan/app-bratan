// FATURA DO CARTÃO (29/09/2026) — pedido aprovado pelo Lucas.
//
// A fatura do Itaú deixa de ser um número só em Contas a Pagar: o Lucas solta o
// arquivo que o Itaú Empresas exporta, o app mostra linha a linha (categoria
// sugerida + a compra de Compras com que casou) e, ao confirmar, a fatura vira
// UMA conta a pagar com o total do boleto — atualizando a estimativa daquele
// cartão/mês em vez de criar outra. As regras moram em faturaCartao.ts (puro,
// testado em tests/fatura-cartao.test.mjs).
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ClipboardPaste, CreditCard, FileUp, Loader2, Undo2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { avisar, confirmar } from "@/components/ui/avisos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const selectClass = "mt-1 block w-full rounded-md border border-brand-oliva/25 bg-white/80 px-3 py-2 text-sm font-semibold text-brand-tinta";

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

  return (
    <AccessGate allowed={canFinanceiroFull} label="Financeiro · Fatura do cartão" module="fin-fatura">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Fatura linha a linha</Badge>
            <Badge variant="muted">{financeiro.syncMode}</Badge>
          </div>
          <h1 className="mt-3 flex flex-wrap items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
            <CreditCard className="h-7 w-7" aria-hidden="true" />
            Fatura do cartão
            <InfoTip title="Para que serve">
              A fatura do Itaú vira UMA conta a pagar com o total do boleto (é o pagamento). As linhas não viram contas: elas
              explicam o gasto. Por isso a P12 e o Lucro passam a mostrar a fatura dividida pelas categorias das compras — a
              soma continua sendo o total da conta, nada é contado duas vezes. A parte de obra do cartão sai do lucro, como
              qualquer obra.
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Solte a fatura que o Itaú Empresas exporta e o app mostra o que tem dentro, quais compras já estavam em Compras e
            quais ninguém lançou.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="fatura-cartao">Cartão</Label>
              <select id="fatura-cartao" value={cartao} onChange={(event) => setCartao(event.target.value as CartaoFatura)} className={selectClass}>
                {cartoesFatura.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="fatura-mes">Mês do vencimento</Label>
              <select id="fatura-mes" value={mesRef} onChange={(event) => setMesRef(event.target.value)} className={selectClass}>
                {meses.map((mes) => (
                  <option key={mes} value={mes}>
                    {monthKeyLabel(mes)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!useRemote ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
              Neste modo (sem login) dá para ler a fatura, mas nada é gravado.
            </p>
          ) : null}
          {useRemote && !podeGravar ? (
            <p className="mt-3 rounded-md border border-brand-oliva/20 bg-white/70 px-3 py-2 text-sm text-muted-foreground">
              Você pode consultar. Só o financeiro completo (Lucas, Dr. Daniel, CEO) confirma ou desfaz uma fatura.
            </p>
          ) : null}
          {faturasQuery.isError ? (
            <p className="mt-3 text-sm font-semibold text-red-700">
              Não consegui ler as faturas já importadas: {mensagemDoErroDaFatura(faturasQuery.error)}
            </p>
          ) : null}
          {comprasQuery.isError ? (
            <p className="mt-3 text-sm font-semibold text-red-700">
              Não consegui ler as Compras para conferir — o casamento com Compras fica vazio até recarregar.
            </p>
          ) : null}
          {feedback ? <p className="mt-3 text-sm font-semibold text-brand-musgo">{feedback}</p> : null}
          {erro ? <p className="mt-3 text-sm font-semibold text-red-700">{erro}</p> : null}
        </motion.section>

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
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {monthKeyLabel(mesRef)} · {cartaoConfig(cartao).rotulo}: ainda não importada
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {contaDaFatura.sugerida
                  ? `A conta de estimativa é "${contaDaFatura.sugerida.description}": ${moneyFin(contaDaFatura.sugerida.amount)}, vence ${dataBR(contaDaFatura.sugerida.dueDate)}. Ao confirmar, ela recebe o valor real.`
                  : contaDaFatura.candidatas.length
                    ? "Há conta de fatura neste mês, mas não dá para ter certeza de qual é deste cartão — você escolhe ao confirmar."
                    : "Não há conta de fatura deste cartão neste mês: ao confirmar, o app cria uma."}
              </p>
            </CardHeader>
            <CardContent className="grid gap-3">
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
                <Button type="button" className="gap-2" disabled={lendo} onClick={() => inputArquivo.current?.click()}>
                  {lendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
                  Importar fatura (.xlsx, .csv, .ofx ou .pdf)
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={() => setColando((atual) => !atual)}>
                  <ClipboardPaste className="h-4 w-4" aria-hidden="true" /> Colar o texto da fatura
                </Button>
                {lida ? (
                  <Button type="button" variant="ghost" onClick={limpar}>
                    Descartar leitura
                  </Button>
                ) : null}
              </div>
              {colando ? (
                <div className="grid gap-2">
                  <Label htmlFor="fatura-texto">Texto da fatura (copiado do PDF ou do site do Itaú)</Label>
                  <textarea
                    id="fatura-texto"
                    value={textoColado}
                    onChange={(event) => setTextoColado(event.target.value)}
                    rows={8}
                    placeholder={"Vencimento 17/10/2026  Total da fatura R$ 10.958,89\n02/09 STIN PHARMA 02/02 7.640,50\n21/09 MERCADOLIVRE*LOJA 773,57"}
                    className="w-full rounded-md border border-brand-oliva/25 bg-white/80 p-3 font-mono text-xs text-brand-tinta"
                  />
                  <div>
                    <Button type="button" size="sm" onClick={lerColado}>
                      Ler o texto
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {lida && !importada ? (
          <>
            <Card className="border-brand-oliva/20 bg-white/70 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                  {resumo && resumo.semRegistro === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
                  )}
                  {resumo?.frase}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {resumo?.complemento}
                  {lida.finalCartao ? ` Cartão final ${lida.finalCartao}.` : ""}
                  {aRevisar ? ` ${aRevisar} linha(s) com categoria para revisar (em amarelo).` : ""}
                </p>
              </CardHeader>
              <CardContent className="grid gap-3">
                {[...lida.avisos, ...(outraBandeira ? [`O arquivo fala em ${outraBandeira.curto}, mas o cartão escolhido é ${cartaoConfig(cartao).rotulo}. Confira o cartão.`] : [])].map((aviso) => (
                  <p key={aviso} className="rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
                    {aviso}
                  </p>
                ))}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <Label htmlFor="fatura-vencimento">Vencimento do boleto</Label>
                    <Input id="fatura-vencimento" type="date" value={vencimento} onChange={(event) => setVencimento(event.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="fatura-total">
                      Total da fatura (R$)
                      <InfoTip title="Qual total">
                        É o valor do boleto — é ele que vira a conta a pagar. A soma das linhas deste arquivo dá {moneyFin(lida.somaLinhas)}.
                        Se o total for diferente, a diferença fica na categoria da fatura (saldo anterior, juros).
                      </InfoTip>
                    </Label>
                    <Input id="fatura-total" inputMode="decimal" value={totalTexto} onChange={(event) => setTotalTexto(event.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="fatura-conta">Conta a pagar que recebe a fatura</Label>
                    <select id="fatura-conta" value={contaEscolhida} onChange={(event) => setContaEscolhida(event.target.value)} className={selectClass}>
                      {!contaEscolhida ? <option value="">Escolha…</option> : null}
                      {contaDaFatura.candidatas.map((expense) => (
                        <option key={expense.id} value={expense.id}>
                          Atualizar "{expense.description}" · {moneyFin(expense.amount)} · vence {dataBR(expense.dueDate)}
                          {expense.paidAt ? " · paga" : ""}
                        </option>
                      ))}
                      <option value="NOVA">Criar uma conta nova</option>
                    </select>
                  </div>
                </div>
                {vencimento && vencimento.slice(0, 7) !== mesRef ? (
                  <div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setMesRef(vencimento.slice(0, 7))}>
                      Usar {monthKeyLabel(vencimento.slice(0, 7))}
                    </Button>
                  </div>
                ) : null}
                {avisosDaConta.map((aviso) => (
                  <p key={aviso} className="rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
                    {aviso}
                  </p>
                ))}
              </CardContent>
            </Card>

            <Card className="border-brand-oliva/20 bg-white/70 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Linha a linha</CardTitle>
                <p className="text-xs text-muted-foreground">
                  "Em Compras" casa pelo valor (±R$ 0,02) e pela data (±5 dias); cada compra só casa com uma linha. Troque a
                  categoria ou a compra quando o app errar.
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[66rem] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-brand-oliva/25 text-left text-xs text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Data</th>
                        <th className="py-1.5 pr-3 font-medium">Estabelecimento</th>
                        <th className="py-1.5 pr-3 font-medium">Parcela</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Valor</th>
                        <th className="py-1.5 pr-3 font-medium">Categoria</th>
                        <th className="py-1.5 font-medium">Em Compras</th>
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
                        return (
                          <tr
                            key={item.linha.ordem}
                            className={cn(
                              "border-b border-brand-oliva/10 align-top last:border-0",
                              pagamento && "text-muted-foreground",
                              !pagamento && item.sugestao.revisar && !item.editada && "bg-amber-50/70",
                            )}
                          >
                            <td className="py-1.5 pr-3 tabular-nums">{dataBR(item.linha.data)}</td>
                            <td className="min-w-[12rem] py-1.5 pr-3">
                              <span className="font-semibold text-brand-tinta">{item.linha.descricao}</span>
                              {item.linha.tipo !== "COMPRA" && item.linha.tipo !== "PARCELA" ? (
                                <span className="ml-2 text-[11px] text-muted-foreground">{tipoLinhaLabels[item.linha.tipo]}</span>
                              ) : null}
                            </td>
                            <td className="py-1.5 pr-3 tabular-nums">{item.linha.parcelaNum ? `${item.linha.parcelaNum}/${item.linha.parcelaTotal}` : "—"}</td>
                            <td className={cn("py-1.5 pr-3 text-right font-semibold tabular-nums", item.linha.valor < 0 ? "text-emerald-800" : "text-brand-tinta")}>
                              {moneyFin(item.linha.valor)}
                            </td>
                            <td className="py-1.5 pr-3">
                              {pagamento ? (
                                <span className="text-xs">fora da conta</span>
                              ) : (
                                <>
                                  <select
                                    aria-label={`Categoria de ${item.linha.descricao}`}
                                    value={item.categoriaRef}
                                    onChange={(event) => setCategoriasEditadas((atual) => ({ ...atual, [item.linha.ordem]: event.target.value }))}
                                    className="w-full min-w-[12rem] max-w-[16rem] rounded-md border border-brand-oliva/25 bg-white/80 px-2 py-1 text-xs"
                                  >
                                    {categorias.map((categoria) => (
                                      <option key={categoria.id} value={categoria.id}>
                                        {categoria.name}
                                        {categoria.isCapex ? " (obra, fora do lucro)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                  {!item.editada ? <p className="mt-0.5 text-[11px] text-muted-foreground">{item.sugestao.motivo}</p> : null}
                                </>
                              )}
                            </td>
                            <td className="py-1.5">
                              {podeCasar ? (
                                <select
                                  aria-label={`Compra de ${item.linha.descricao}`}
                                  value={item.casada?.compraId ?? ""}
                                  onChange={(event) => setManuais((atual) => ({ ...atual, [item.linha.ordem]: event.target.value || null }))}
                                  className={cn(
                                    "w-full min-w-[13rem] max-w-[18rem] rounded-md border px-2 py-1 text-xs",
                                    item.casada ? "border-emerald-300 bg-emerald-50/70" : "border-rose-300 bg-rose-50/70",
                                  )}
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
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <RateioCard rateio={rateio} total={total ?? 0} nomeCategoria={nomeCategoria} categoriaPorId={categoriaPorId} />

            <Card className={cn("shadow-none", pendencias.length ? "border-amber-300 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50")}>
              <CardContent className="grid gap-3 p-5">
                {pendencias.map((pendencia) => (
                  <p key={pendencia} className="text-sm font-semibold text-amber-900">
                    {pendencia}
                  </p>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" className="gap-2" disabled={!podeConfirmar} onClick={() => confirmarMutation.mutate()}>
                    {confirmarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    Confirmar fatura{total ? ` de ${moneyFin(total)}` : ""}
                    {vencimento ? ` · vence ${dataBR(vencimento)}` : ""}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {contaEscolhida === "NOVA"
                      ? "Cria uma conta a pagar na categoria Fatura cartão de crédito."
                      : contaSelecionada
                        ? `Atualiza "${contaSelecionada.description}" de ${moneyFin(contaSelecionada.amount)} para ${moneyFin(total ?? 0)}.`
                        : ""}
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}

        <HistoricoCard faturas={faturas} onAbrir={(fatura) => {
          setCartao(fatura.cartao);
          setMesRef(fatura.mesRef);
          limpar();
        }} />
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
    <Card className="border-brand-oliva/20 bg-white/70 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Como a fatura aparece na P12
          <InfoTip title="Sem contar em dobro">
            A conta da fatura é trocada por estes pedaços na P12, no Painel e no Lucro — a soma é sempre o total da conta. O que as
            linhas não explicam fica em "Fatura cartão de crédito".
          </InfoTip>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {moneyFin(total)} divididos em {rateio.length} categoria(s)
          {obra ? `; ${moneyFin(obra)} são obra e saem do lucro do mês` : ""}.
        </p>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {rateio.map((linha) => (
          <div key={linha.categoriaRef} className="flex items-center justify-between gap-3 rounded-md border border-brand-oliva/12 bg-white/80 px-3 py-1.5 text-sm">
            <span>
              {nomeCategoria(linha.categoriaRef)}
              {categoriaPorId.get(linha.categoriaRef)?.isCapex ? <span className="ml-2 text-[11px] text-muted-foreground">obra</span> : null}
            </span>
            <strong className="tabular-nums text-brand-musgo">{moneyFin(linha.valor)}</strong>
          </div>
        ))}
      </CardContent>
    </Card>
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
      <Card className="border-emerald-200 bg-emerald-50/50 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            {monthKeyLabel(fatura.mesRef)} · {cartaoConfig(fatura.cartao).rotulo}: importada em {dataBR(fatura.createdAt.slice(0, 10))}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {moneyFin(fatura.total)} com vencimento {dataBR(fatura.vencimento)}
            {fatura.finalCartao ? ` · final ${fatura.finalCartao}` : ""}. Conta: {contaDescricao}
            {fatura.contaAcao === "ATUALIZADA" && fatura.valorAnterior !== null
              ? ` — era a estimativa de ${moneyFin(fatura.valorAnterior)}${fatura.vencimentoAnterior ? ` (vencia ${dataBR(fatura.vencimentoAnterior)})` : ""}.`
              : " — criada na importação."}
          </p>
          {resumo ? <p className="text-sm font-semibold text-brand-musgo">{resumo.frase}</p> : null}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {podeGravar ? (
            <Button type="button" variant="outline" size="sm" className="gap-2" disabled={desfazendo} onClick={onDesfazer}>
              {desfazendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}
              Desfazer importação
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-brand-oliva/20 bg-white/70 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Linhas da fatura</CardTitle>
          <p className="text-xs text-muted-foreground">Trocar a categoria aqui muda a P12 na hora (a conta a pagar não muda).</p>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando as linhas…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-brand-oliva/25 text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Data</th>
                    <th className="py-1.5 pr-3 font-medium">Estabelecimento</th>
                    <th className="py-1.5 pr-3 font-medium">Parcela</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Valor</th>
                    <th className="py-1.5 pr-3 font-medium">Categoria</th>
                    <th className="py-1.5 font-medium">Em Compras</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item) => (
                    <tr key={item.clientRef} className={cn("border-b border-brand-oliva/10 last:border-0", item.tipo === "PAGAMENTO" && "text-muted-foreground")}>
                      <td className="py-1.5 pr-3 tabular-nums">{dataBR(item.data)}</td>
                      <td className="py-1.5 pr-3">
                        <span className="font-semibold text-brand-tinta">{item.descricao}</span>
                        {item.tipo !== "COMPRA" && item.tipo !== "PARCELA" ? <span className="ml-2 text-[11px] text-muted-foreground">{tipoLinhaLabels[item.tipo]}</span> : null}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{item.parcelaNum ? `${item.parcelaNum}/${item.parcelaTotal}` : "—"}</td>
                      <td className={cn("py-1.5 pr-3 text-right font-semibold tabular-nums", item.valor < 0 ? "text-emerald-800" : "text-brand-tinta")}>{moneyFin(item.valor)}</td>
                      <td className="py-1.5 pr-3">
                        {item.tipo === "PAGAMENTO" ? (
                          <span className="text-xs">fora da conta</span>
                        ) : podeGravar ? (
                          <select
                            aria-label={`Categoria de ${item.descricao}`}
                            value={item.categoriaRef ?? CATEGORIA_FATURA}
                            onChange={(event) => onCategoria(item, event.target.value)}
                            className="w-full min-w-[12rem] max-w-[16rem] rounded-md border border-brand-oliva/25 bg-white/80 px-2 py-1 text-xs"
                          >
                            {categorias.map((categoria) => (
                              <option key={categoria.id} value={categoria.id}>
                                {categoria.name}
                                {categoria.isCapex ? " (obra, fora do lucro)" : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs">{nomeCategoria(item.categoriaRef)}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-xs">
                        {item.purchaseRef ? (
                          <span className="text-emerald-800">sim{item.casamento === "MANUAL" ? " (ligada à mão)" : ""}</span>
                        ) : item.tipo === "COMPRA" || item.tipo === "PARCELA" ? (
                          <span className="text-rose-800">sem registro</span>
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
        </CardContent>
      </Card>

      <RateioCard rateio={rateio} total={fatura.total} nomeCategoria={nomeCategoria} categoriaPorId={categoriaPorId} />
    </>
  );
}

function HistoricoCard({ faturas, onAbrir }: { faturas: FaturaImportada[]; onAbrir: (fatura: FaturaImportada) => void }) {
  if (!faturas.length) return null;
  return (
    <Card className="border-brand-oliva/20 bg-white/60 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Faturas já importadas</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {faturas.map((fatura) => (
          <button
            key={fatura.clientRef}
            type="button"
            onClick={() => onAbrir(fatura)}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-oliva/14 bg-white/80 px-3 py-2 text-left text-sm hover:bg-white"
          >
            <span>
              <strong className="text-brand-tinta">{monthKeyLabel(fatura.mesRef)}</strong> · {cartaoConfig(fatura.cartao).rotulo}
              {fatura.finalCartao ? ` · final ${fatura.finalCartao}` : ""}
            </span>
            <span className="tabular-nums text-brand-musgo">
              {moneyFin(fatura.total)} · vence {dataBR(fatura.vencimento)}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
