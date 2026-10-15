// LUCRO INTELIGENTE — a régua da aula (Profit First) aplicada ao Instituto.
//
// REDESENHO (08/10/2026, Papel & Musgo, etapa 4): um cabeçalho só (a régua de
// hoje em frase e o fio do mês), os três números do dia lado a lado no "saber"
// (Dr. Daniel recebe · separar para os sócios · fica para gastar), os envelopes,
// os compromissos, o caixa projetado, o mês em quatro números, o Passo 1 da
// aula e a conferência com a maquininha; a planilha do dia a dia fecha a tela
// numa folha (é nela que se marca "separado"). Régua, marcas, sincronização,
// contas e permissões são as mesmas de antes.
import { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Info, Landmark, Pencil, PiggyBank, Scale, Sparkles, SlidersHorizontal, Stethoscope, TrendingUp, Trophy, Wallet } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, FioDoMes, Selo } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import {
  lerRemoteSaldoBanco,
  listRemoteFinLucroDias,
  loadRemoteFinLucroConfig,
  saveRemoteFinLucroConfig,
  saveRemoteFinLucroDia,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { moneyFin } from "./financeiroData";
import {
  avaliacaoInstantanea,
  linhaEmDestaque,
  buildPlanilhaLucro,
  conferirRecebiveis,
  defaultLucroConfig,
  diasUteisDoMes,
  mesesAnteriores,
  normalizaConfig,
  registrarConferencia,
  reguaNoDia,
  selicDaConfig,
  subirDegrau,
  explicarMedicoDoDia,
  type LucroConfig,
  type MarcaDiaLucro,
  type ReguaLucro,
} from "./lucroInteligente";
import { taxaAntecipacaoMensal } from "./recebiveisRede";
import { resumoDosRepasses } from "./lucroInteligente";
import { CompromissosLucroCard } from "./CompromissosLucroCard";
import { compromissosDoMes, definirConfigDoMotor } from "./motorLucroInteligente";
import { useVersaoDoMotor } from "@/lib/useConfigDoMotor";
import { useFinanceiro } from "./useFinanceiro";
import { buildMetasBoard, type MetasConfig } from "./metasData";
import { buildCaixaProjetado } from "./caixaProjetado";
import { AntecipacaoComparador } from "./AntecipacaoComparadorCard";
import { EnvelopesVisuais, transferenciasPrevistas } from "./EnvelopesVisuais";
import { CaixaProjetadoCard } from "./CaixaProjetadoCard";
import { configAtual } from "@/lib/configNegocio";
import { PROFISSIONAIS, type ProfissionalId } from "./profissionais";
import { perguntar } from "@/components/ui/avisos";
import { useMetasConfig } from "./useMetasConfig";
import { Campo, RecadoDaTela, Selecao, classeDoCampo, classeDoCampoNumero, tabela } from "./pecasBancoFechamento";
import { BarraFina, Etiqueta, Frase, IconeDoTom, Numero, OrigemDosDados, Rubrica } from "./pecasResultados";

const configStorageKey = "app-bratan-fin-lucro-config";
const marcasStorageKey = "app-bratan-fin-lucro-dias";
/** Mesma chave da P12 e das Metas — a configuração é uma só. */
/** Piso do caixa projetado (por aparelho; vira configuração quando a proposta 7.3 for aprovada). */
const pisoCaixaStorageKey = "app-bratan-fin-caixa-piso-v1";

const reguaLabels: Record<"impostos" | "lucroMensal" | "medicoExecutor" | "moises", string> = {
  impostos: "Impostos (% do líquido)",
  lucroMensal: "Lucro dos sócios (R$ por mês)",
  medicoExecutor: "Dr. Daniel (% do lucro bruto do produto — col. S)",
  moises: "Dr. Moisés (% do lucro bruto dos procedimentos dele — col. Q)",
};
const CAMPOS_DA_REGUA = ["impostos", "lucroMensal", "medicoExecutor", "moises"] as const;

function pct(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

function diaCurto(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function mesLabel(monthKey: string) {
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function mesLongo(monthKey: string) {
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long" });
}

function parseNumero(value: string) {
  const parsed = Number(value.replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseCampo(campo: keyof ReguaLucro, value: string) {
  const numero = parseNumero(value);
  if (!Number.isFinite(numero)) return null;
  if (campo === "lucroMensal") return Math.max(0, Math.round(numero * 100) / 100);
  return Math.max(0, Math.min(100, numero));
}

function valorDoCampo(regua: ReguaLucro, campo: keyof ReguaLucro) {
  if (campo === "lucroMensal") return regua.lucroMensal.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return String(regua[campo]).replace(".", ",");
}

function descreveRegua(regua: ReguaLucro) {
  return `impostos ${pct(regua.impostos)} do líquido · lucro ${moneyFin(regua.lucroMensal)}/mês · Dr. Daniel ${pct(regua.medicoExecutor)} do lucro bruto do produto · Dr. Moisés ${pct(regua.moises)} dos procedimentos dele`;
}

export function FinanceiroLucroPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const canEdit = canEditModule(pessoa, "fin-lucro");
  const hoje = todayISO();
  const [month, setMonth] = useState(hoje.slice(0, 7));
  const year = Number(month.slice(0, 4));
  // Com o ano anterior (01/10/2026): em janeiro vence a 2ª parcela do executor de dezembro.
  const financeiro = useFinanceiro(year, { comAnoAnterior: true });
  const [showConfig, setShowConfig] = useState(false);
  const [feedback, setFeedback] = useState("");

  // ---- Régua (degraus + alvo + SELIC + conferências): igual à config de Metas — local + Supabase.
  const [config, setConfig] = useState<LucroConfig>(() =>
    normalizaConfig({ ...defaultLucroConfig, ...readLocalValue<Partial<LucroConfig>>(configStorageKey, {}) }),
  );
  useQuery({
    queryKey: ["fin-lucro-config"],
    queryFn: async () => {
      const remote = await loadRemoteFinLucroConfig();
      if (remote) {
        setConfig((current) => {
          const merged = normalizaConfig({ ...current, ...(remote as Partial<LucroConfig>) });
          writeLocalValue(configStorageKey, merged);
          return merged;
        });
      }
      return remote ?? {};
    },
    enabled: useRemote,
  });
  const saveConfigMutation = useMutation({
    mutationFn: (next: LucroConfig) => saveRemoteFinLucroConfig(next as unknown as Record<string, unknown>),
  });
  function persistConfig(next: LucroConfig) {
    setConfig(next);
    writeLocalValue(configStorageKey, next);
    if (useRemote) {
      void saveConfigMutation.mutateAsync(next).catch((error) => {
        console.warn("Config do Lucro Inteligente não sincronizou.", error);
        setFeedback("A régua ficou só neste aparelho — o Supabase recusou a gravação.");
      });
    }
  }

  // ---- Marca diária ("separei"): mesmo desenho do PDCA, com fila de pendentes.
  const [marcas, setMarcas] = useState<MarcaDiaLucro[]>(() => readLocalValue(marcasStorageKey, []));
  const pendingRef = useRef(new Map<string, MarcaDiaLucro>());
  const [syncFailed, setSyncFailed] = useState(false);
  const [syncErrorDetail, setSyncErrorDetail] = useState("");
  useQuery({
    queryKey: ["fin-lucro-dias", year],
    queryFn: async () => {
      const remote = await listRemoteFinLucroDias(year);
      const pending = pendingRef.current;
      setMarcas((current) => {
        const outrosAnos = current.filter((marca) => !marca.dia.startsWith(`${year}-`));
        const merged = [...outrosAnos, ...remote.filter((marca) => !pending.has(marca.dia)), ...pending.values()];
        writeLocalValue(marcasStorageKey, merged);
        return merged;
      });
      return remote;
    },
    enabled: useRemote,
  });

  function syncMarcaRemote(marca: MarcaDiaLucro) {
    return saveRemoteFinLucroDia(marca, session?.user?.id ?? null)
      .then(() => {
        pendingRef.current.delete(marca.dia);
        if (pendingRef.current.size === 0) {
          setSyncFailed(false);
          setSyncErrorDetail("");
        }
      })
      .catch((error) => {
        console.warn("Marca do Lucro Inteligente não sincronizou.", error);
        pendingRef.current.set(marca.dia, marca);
        setSyncFailed(true);
        setSyncErrorDetail(error instanceof Error ? error.message : String(error));
      });
  }

  function persistMarca(marca: MarcaDiaLucro) {
    setMarcas((current) => {
      const next = [...current.filter((existing) => existing.dia !== marca.dia), marca];
      writeLocalValue(marcasStorageKey, next);
      return next;
    });
    if (useRemote) void syncMarcaRemote(marca);
  }

  function retrySync() {
    for (const marca of pendingRef.current.values()) void syncMarcaRemote(marca);
  }

  const planilha = useMemo(
    () =>
      buildPlanilhaLucro({
        sales: financeiro.sales,
        // Fatura do cartão pelo rateio (29/09/2026): a parte de obra sai do operacional.
        expenses: financeiro.expensesPorCategoria,
        categories: financeiro.categories,
        reconciliations: financeiro.reconciliations,
        marcas,
        config,
        monthKey: month,
        hoje,
      }),
    [financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, financeiro.reconciliations, marcas, config, month, hoje],
  );

  // Passo 1 da aula: os três meses fechados antes do mês escolhido. Meses de
  // outro ano não estão carregados (useFinanceiro carrega um ano por vez) —
  // ficam de fora em vez de aparecer zerados.
  const mesesAvaliados = useMemo(() => mesesAnteriores(month, 3).filter((m) => m.startsWith(`${year}-`)), [month, year]);
  const avaliacao = useMemo(
    () => avaliacaoInstantanea(financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, financeiro.crediarioProfits, mesesAvaliados),
    [financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, financeiro.crediarioProfits, mesesAvaliados],
  );

  const reguaHoje = reguaNoDia(config, hoje);
  const diasUteisHoje = diasUteisDoMes(hoje.slice(0, 7)).length;
  const cotaHoje = diasUteisHoje ? reguaHoje.lucroMensal / diasUteisHoje : 0;
  const linhaDeHoje = planilha.linhas.find((linha) => linha.dia === hoje) ?? null;
  const degrauMaisRecente = [...config.degraus].sort((a, b) => a.desde.localeCompare(b.desde)).at(-1) ?? config.degraus[0];
  const comprometido = planilha.totais.reservado.impostos + planilha.totais.reservado.lucro + planilha.totais.reservado.medicoExecutor + planilha.totais.reservado.moises;
  const saldoOperacional = planilha.totais.saldo.operacional;

  function editaDegrau(campo: keyof ReguaLucro, valor: string) {
    if (!canEdit || !degrauMaisRecente) return;
    const novo = parseCampo(campo, valor);
    if (novo === null) return;
    const degraus = config.degraus.map((degrau) => (degrau.desde === degrauMaisRecente.desde ? { ...degrau, [campo]: novo } : degrau));
    persistConfig({ ...config, degraus });
  }

  function editaAlvo(campo: keyof ReguaLucro, valor: string) {
    if (!canEdit) return;
    const novo = parseCampo(campo, valor);
    if (novo === null) return;
    persistConfig({ ...config, alvo: { ...config.alvo, [campo]: novo } });
  }

  function editaSelic(valor: string) {
    if (!canEdit) return;
    const selic = parseNumero(valor);
    if (!Number.isFinite(selic) || selic <= 0) return;
    persistConfig({ ...config, selicAnual: selic });
  }

  const conferencia = useMemo(() => conferirRecebiveis(financeiro.sales, hoje, config.conferencias ?? []), [financeiro.sales, hoje, config.conferencias]);

  function registraConferenciaRede(valor: string) {
    if (!canEdit) return;
    const numero = parseNumero(valor);
    if (!Number.isFinite(numero) || numero < 0 || !valor.trim()) return;
    persistConfig(registrarConferencia(config, { dia: hoje, aReceberRede: Math.round(numero * 100) / 100 }));
  }

  function novoDegrauHoje() {
    if (!canEdit || !degrauMaisRecente) return;
    if (config.degraus.some((degrau) => degrau.desde === hoje)) return;
    persistConfig({ ...config, degraus: [...config.degraus, { ...degrauMaisRecente, desde: hoje }] });
    setFeedback(`Novo degrau criado a partir de ${diaCurto(hoje)} — edite a régua dele.`);
  }

  function subirLucro() {
    if (!canEdit) return;
    const next = subirDegrau(config, hoje, 2000);
    persistConfig(next);
    setFeedback(`Lucro dos sócios subiu para ${moneyFin(reguaNoDia(next, hoje).lucroMensal)}/mês a partir de hoje. A aula: "não é meta, é decisão".`);
  }

  function toggleSeparado(dia: string, atual: MarcaDiaLucro | null) {
    if (!canEdit) return;
    persistMarca({ dia, separado: !atual?.separado, observacao: atual?.observacao ?? "" });
  }

  async function editaObservacao(dia: string, atual: MarcaDiaLucro | null) {
    if (!canEdit) return;
    const texto = await perguntar(`Observação do dia ${diaCurto(dia)}`, { valorInicial: atual?.observacao ?? "", placeholder: "ex.: transferi 5.000 p/ conta lucro, impostos ficam p/ dia 10", multilinha: true, confirmar: "Salvar" });
    if (texto === null) return;
    persistMarca({ dia, separado: atual?.separado ?? false, observacao: texto.trim() });
  }

  const linhasVisiveis = planilha.linhas;

  // ---- DESTAQUE DO DIA (08/09): o que o Dr. Daniel recebe e o lucro dos sócios,
  // em números grandes — e o retrato público que a Home mostra para todo mundo.
  const destaque = useMemo(() => linhaEmDestaque(planilha, hoje), [planilha, hoje]);
  // O retrato público (Home e balão) é publicado pelo PublicadorDoResumo, no layout — em qualquer tela.
  const progressoLucro = reguaHoje.lucroMensal > 0 ? Math.min(100, Math.round((planilha.totais.reservado.lucro / reguaHoje.lucroMensal) * 100)) : 0;

  // ---- TRANSFERÊNCIAS (10/09, Lucas): provisionado × transferido × falta, e o
  // registro do repasse — que vira conta paga na categoria certa (Contas a Pagar
  // e P12 contam o mesmo dinheiro).
  const repasses = useMemo(() => resumoDosRepasses(planilha, financeiro.expenses), [planilha, financeiro.expenses]);
  // MOTOR DAS PARCELAS (01/10/2026): a régua desta tela também alimenta o lucro do
  // mês de todas as telas; e os compromissos do mês saem do mesmo motor.
  useEffect(() => {
    definirConfigDoMotor(config);
  }, [config]);
  const versaoDoMotor = useVersaoDoMotor();
  const compromissosLucro = useMemo(
    () => compromissosDoMes({ sales: financeiro.sales, expenses: financeiro.expenses, monthKey: month, desde: `${Number(month.slice(0, 4)) - 1}-01` }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeiro.sales, financeiro.expenses, month, versaoDoMotor],
  );
  // Com o motor, "falta" vira o compromisso do mês: as parcelas do executor que
  // vencem e o lucro de cada sócio — o mesmo número do Contas a Pagar.
  const repassesDaTela = useMemo(
    () =>
      compromissosLucro.ativo
        ? {
            medicoExecutor: { ...repasses.medicoExecutor, provisionado: compromissosLucro.executor.devidoNoMes, transferido: compromissosLucro.executor.pagoNoMes, dividasPagas: 0, falta: compromissosLucro.executor.faltaNoMes },
            moises: { ...repasses.moises, provisionado: compromissosLucro.moises.devidoNoMes, transferido: compromissosLucro.moises.pagoNoMes, dividasPagas: 0, falta: compromissosLucro.moises.faltaNoMes },
            socios: { ...repasses.socios, provisionado: compromissosLucro.socios.devido, transferido: compromissosLucro.socios.pagoNoMes, dividasPagas: 0, falta: compromissosLucro.socios.falta },
          }
        : repasses,
    [compromissosLucro, repasses],
  );
  // ---- PLANILHA SIMPLES POR PADRÃO (10/09, Lucas: "está muita informação").
  const [detalhado, setDetalhado] = useState(false);
  // A CONTA DO MÉDICO ABERTA (10/09/2026, Lucas: "pras minhas contas está um pouco
  // menos… preciso que você disserte como chegou nesses valores"). Desde 15/10 há
  // uma conta por executor: a do Dr. Daniel e a do Dr. Moisés.
  const [contaDe, setContaDe] = useState<ProfissionalId | null>(null);
  const mostrarConta = contaDe !== null;
  const quemDaConta: ProfissionalId = contaDe ?? "daniel";
  const nomeDaConta = PROFISSIONAIS[quemDaConta].nome;
  const [diaDaConta, setDiaDaConta] = useState<string | null>(null);
  const diaExplicado = diaDaConta ?? destaque?.dia ?? hoje;
  const explicacao = useMemo(() => {
    const linhaDoDia = planilha.linhas.find((linha) => linha.dia === diaExplicado);
    return explicarMedicoDoDia(financeiro.sales, diaExplicado, linhaDoDia?.regua ?? reguaHoje, quemDaConta);
  }, [financeiro.sales, diaExplicado, planilha.linhas, reguaHoje, quemDaConta]);
  const alternaConta = (quem: ProfissionalId) => setContaDe((atual) => (atual === quem ? null : quem));
  const diasComVenda = useMemo(() => planilha.linhas.filter((linha) => linha.total > 0.005).map((linha) => linha.dia), [planilha.linhas]);

  // ---- OS ENVELOPES EM UM OLHAR + CAIXA PROJETADO (14/09/2026, aprovados pelo Lucas).
  // Metas do servidor, iguais para todo mundo (29/09/2026).
  const metasConfig: MetasConfig = useMetasConfig();
  const metasBoard = useMemo(() => buildMetasBoard(financeiro.sales, metasConfig, month), [financeiro.sales, metasConfig, month]);
  // O saldo do Itaú é digitado na Prova do dinheiro (P12) e reaproveitado aqui.
  // Vem do app desde 17/09/2026 (antes era localStorage, ou seja, de um aparelho só).
  const saldoBanco = useQuery({ queryKey: ["fin-saldo-banco"], queryFn: lerRemoteSaldoBanco, staleTime: 30_000 });
  const saldoItau = saldoBanco.data && saldoBanco.data.valor > 0 ? saldoBanco.data.valor : null;
  const [comAntecipacao, setComAntecipacao] = useState(false);
  const [pisoCaixa, setPisoCaixa] = useState<number>(() => readLocalValue<number>(pisoCaixaStorageKey, configAtual<number>("caixa.piso") ?? 0));
  const caixa = useMemo(
    () =>
      buildCaixaProjetado({
        sales: financeiro.sales,
        expenses: financeiro.expenses,
        hoje,
        semanas: 6,
        saldoInicial: saldoItau,
        piso: pisoCaixa,
        comAntecipacao,
        selicAnual: selicDaConfig(config),
        transferenciasPrevistas: transferenciasPrevistas(hoje, repassesDaTela, compromissosLucro),
      }),
    [financeiro.sales, financeiro.expenses, hoje, saldoItau, pisoCaixa, comAntecipacao, config, repassesDaTela, compromissosLucro],
  );

  // ---- a forma (08/10/2026): o fio do mês, o "hoje" dos destaques e as células --
  const mesDeHoje = hoje.slice(0, 7);
  const diasUteisDoMesEscolhido = useMemo(() => diasUteisDoMes(month), [month]);
  const diaUtilDeHoje = diasUteisDoMesEscolhido.filter((dia) => dia <= hoje).length;
  const nomeDoMesEscolhido = mesLongo(month);
  const quandoDestaque = destaque ? (destaque.dia === hoje ? "hoje" : diaCurto(destaque.dia)) : "—";
  const destaqueEhHoje = Boolean(destaque && destaque.dia === hoje);
  const tad = pct(taxaAntecipacaoMensal(selicDaConfig(config)) * 100);
  const cellNumTabela = cn(tabela.tdNum, "px-3 py-2");

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Lucro Inteligente" module="fin-lucro">
      <div className="mx-auto w-full max-w-[1320px]">
        <Cabecalho
          sobrancelha="Resultados · Lucro"
          titulo={
            <>
              Lucro <em>Inteligente</em>{" "}
              <InfoTip title="A régua da aula (Dr. Thiago Volpi) e a do Instituto" className="align-middle">
                <strong>Vendas − Lucro = Despesas.</strong> Em vez de gastar primeiro e lucrar o que sobra, a clínica
                decide o lucro e se vira com o resto. De cada real que entra (já sem as taxas), o app separa{" "}
                <strong>impostos</strong> (% do líquido), o <strong>lucro dos sócios</strong> — aqui um valor fixo por
                mês, dividido pelos dias úteis (Lucas: &quot;não é em porcentagem, é sempre esse valor&quot;) — e o{" "}
                <strong>médico executor</strong>: a coluna S da planilha de precificação, &quot;Margem Líquida Médico&quot; = 50% do
                lucro bruto de cada produto (preço − imposto/cartão − comissão − consumíveis − repasse nutri − custo de sala;
                Plano de R$ 6.997 → R$ 1.738,37). O que sobra é o único dinheiro para gastar. Lucro e impostos vão para
                contas de difícil acesso. &quot;Não é meta, é decisão.&quot; (Exemplo da aula, só para referência: 25%
                lucro · 16,6% impostos · 28% executor → sobram 30,4%.)
              </InfoTip>
            </>
          }
          frase={
            <>
              <strong>Régua de hoje:</strong> impostos {pct(reguaHoje.impostos)} do líquido · lucro {moneyFin(reguaHoje.lucroMensal)}/mês (
              <strong>{moneyFin(cotaHoje)} por dia útil</strong>, {diasUteisHoje} em {mesLongo(hoje.slice(0, 7))}) · Dr. Daniel{" "}
              {pct(reguaHoje.medicoExecutor)} do lucro bruto de cada produto dele (coluna S) · Dr. Moisés {pct(reguaHoje.moises)} do lucro bruto de cada
              procedimento dele (coluna Q) → o que sobra fica para gastar.
            </>
          }
          acoes={
            <div className="flex flex-wrap items-end gap-2">
              <Campo rotulo="Mês" className="w-44">
                <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={classeDoCampo} aria-label="Mês" />
              </Campo>
              <Botao
                variante={showConfig ? "suave" : "secundario"}
                icone={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setShowConfig((value) => !value)}
                aria-pressed={showConfig}
              >
                Régua
              </Botao>
            </div>
          }
          rodape={
            month === mesDeHoje ? (
              <FioDoMes diasUteis={diasUteisDoMesEscolhido.length} hoje={diaUtilDeHoje} mes={nomeDoMesEscolhido.charAt(0).toUpperCase() + nomeDoMesEscolhido.slice(1)} sobre="papel" />
            ) : null
          }
        />

        <p className="-mt-2 mb-6 flex items-start gap-2 text-[13px] font-medium leading-5 text-tinta-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            As taxas da maquininha e do PIX saem antes de repartir. O crédito conta no dia do lançamento e fica disponível no dia útil seguinte; puxar antes
            dos 31 dias custa a antecipação (TAD {tad} ao mês) — a planilha mostra quanto.
          </span>
        </p>

        <div className="grid gap-6">
          {feedback ? <RecadoDaTela>{feedback}</RecadoDaTela> : null}

          {syncFailed ? (
            <RecadoDaTela tom="erro">
              <span className="flex flex-wrap items-center gap-3">
                <span className="flex-1">Sua marcação NÃO chegou ao Supabase — está salva só neste aparelho. Não saia da tela sem sincronizar.</span>
                <Botao tamanho="pq" onClick={retrySync}>
                  Tentar sincronizar
                </Botao>
              </span>
              {syncErrorDetail ? <span className="mt-1.5 block break-all font-mono text-xs font-medium leading-4 text-tinta-2">Detalhe técnico: {syncErrorDetail}</span> : null}
            </RecadoDaTela>
          ) : null}

          {showConfig ? (
            <BlocoFolha as="section" aria-labelledby="lucro-regua" respiro className="grid gap-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="lucro-regua" className="text-xl font-bold leading-7 text-tinta">
                    A régua
                  </h2>
                  <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
                    Editando o degrau que vale desde {degrauMaisRecente ? diaCurto(degrauMaisRecente.desde) : "—"}. Dias anteriores continuam com o degrau da época.
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <Botao tamanho="pq" onClick={novoDegrauHoje} disabled={config.degraus.some((d) => d.desde === hoje)}>
                      Novo degrau a partir de hoje
                    </Botao>
                    <Botao
                      tamanho="pq"
                      variante="suave"
                      icone={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                      onClick={subirLucro}
                      disabled={reguaHoje.lucroMensal >= config.alvo.lucroMensal}
                    >
                      Subir lucro +R$ 2.000/mês
                    </Botao>
                  </div>
                ) : null}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <BlocoSaber className="grid content-start gap-4">
                  <Rubrica as="h3">Decisão de hoje</Rubrica>
                  <div className="grid items-end gap-3 sm:grid-cols-2">
                    {CAMPOS_DA_REGUA.map((campo) => (
                      <Campo key={campo} rotulo={reguaLabels[campo]}>
                        <input
                          key={`${degrauMaisRecente?.desde}-${campo}-${degrauMaisRecente?.[campo]}`}
                          defaultValue={degrauMaisRecente ? valorDoCampo(degrauMaisRecente, campo) : ""}
                          onBlur={(event) => editaDegrau(campo, event.target.value)}
                          inputMode="decimal"
                          disabled={!canEdit}
                          className={classeDoCampoNumero}
                        />
                      </Campo>
                    ))}
                  </div>
                  <p className="text-sm font-medium leading-5 text-tinta">
                    Cota do lucro por dia útil: <strong className="font-bold tabular-nums">{moneyFin(cotaHoje)}</strong>
                    <span className="ml-1 text-[13px] text-tinta-2">({diasUteisHoje} dias úteis em {mesLongo(hoje.slice(0, 7))}; muda a cada mês)</span>
                  </p>
                </BlocoSaber>
                <BlocoSaber className="grid content-start gap-4">
                  <Rubrica as="h3">Alvo (onde queremos chegar)</Rubrica>
                  <div className="grid items-end gap-3 sm:grid-cols-2">
                    {CAMPOS_DA_REGUA.map((campo) => (
                      <Campo key={campo} rotulo={reguaLabels[campo]}>
                        <input
                          key={`alvo-${campo}-${config.alvo[campo]}`}
                          defaultValue={valorDoCampo(config.alvo, campo)}
                          onBlur={(event) => editaAlvo(campo, event.target.value)}
                          inputMode="decimal"
                          disabled={!canEdit}
                          className={classeDoCampoNumero}
                        />
                      </Campo>
                    ))}
                  </div>
                  <p className="text-[13px] font-medium leading-5 text-tinta-2">
                    O médico recebe a coluna S da planilha de precificação: 50% do lucro bruto do produto (preço − imposto/cartão − comissão 10% −
                    consumíveis − repasse nutri − custo de sala). O app reconhece o produto pela descrição e pelo preço do item da comanda
                    (Plano 6.997 → 1.738,37 · consulta 2.500 → 743,11 · dose 590 → 130 a 226; planilha OFICIAL de 15/09); item sem
                    produto reconhecido usa a fração do produto de referência do tipo. O Dr. Moisés recebe a coluna Q da aba dele: 20% do lucro
                    bruto de cada procedimento dele (Botox 2.500 → 206,78 · avaliação 550 → 58,28), pago em três parcelas no dia 20 dos três
                    meses seguintes.
                  </p>
                </BlocoSaber>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <Campo rotulo="SELIC ao ano (%) — referência da antecipação" className="w-72">
                  <input
                    key={`selic-${config.selicAnual ?? ""}`}
                    defaultValue={String(config.selicAnual ?? 15).replace(".", ",")}
                    onBlur={(event) => editaSelic(event.target.value)}
                    inputMode="decimal"
                    disabled={!canEdit}
                    className={classeDoCampoNumero}
                  />
                </Campo>
                <p className="min-w-0 flex-1 basis-72 pb-2 text-[13px] font-medium leading-5 text-tinta-2">
                  TAD = SELIC a.m. + 0,9% = <strong className="font-bold text-tinta">{tad} ao mês</strong> (anexo RAV do acordo Q-7621480). Custo de puxar = (1 + TAD)^(dias/30) − 1
                  sobre o valor antecipado.
                </p>
              </div>
              <AntecipacaoComparador tadMensalPct={taxaAntecipacaoMensal(selicDaConfig(config)) * 100} valorSugerido={Math.round(planilha.linhas.reduce((soma, linha) => soma + linha.credito, 0))} />
              {config.degraus.length > 1 ? (
                <p className="text-[13px] font-medium leading-5 text-tinta-2">
                  <strong className="font-bold text-tinta">Histórico:</strong>{" "}
                  {[...config.degraus]
                    .sort((a, b) => a.desde.localeCompare(b.desde))
                    .map((degrau) => `${diaCurto(degrau.desde)} → ${descreveRegua(degrau)}`)
                    .join(" · ")}
                </p>
              ) : null}
            </BlocoFolha>
          ) : null}

          {/* O DIA EM NÚMEROS GRANDES (08/09/2026, Lucas: "tem que ficar bem exposto o que o
              Dr. Daniel vai receber em cada dia e o lucro também"). Desde 15/10/2026 o
              Dr. Moisés tem o cartão dele ao lado: "para a gente saber qual que vai ser o
              salário do Dr. Moisés e qual que está sendo o salário do Dr. Daniel". */}
          <section aria-label="O dia em números" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <BlocoSaber className="grid content-start gap-3">
              <div className="flex items-center justify-between gap-3">
                <Rubrica as="h2" className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Dr. Daniel recebe
                </Rubrica>
                <Etiqueta tom={destaqueEhHoje ? "ouro" : "neutro"}>{quandoDestaque}</Etiqueta>
              </div>
              <Numero texto={destaque ? moneyFin(destaque.reservado.medicoExecutor) : "—"} tamanho="grande" />
              <Frase>
                {pct(reguaHoje.medicoExecutor)} do lucro bruto dos produtos do dia{destaque?.lucroBrutoProdutos ? ` (${moneyFin(destaque.lucroBrutoProdutos)})` : ""}
              </Frase>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-fio-2 pt-3">
                <p className="text-sm font-bold leading-5 tabular-nums text-tinta">No mês: {moneyFin(planilha.totais.reservado.medicoExecutor)}</p>
                <Botao tamanho="pq" variante="fantasma" onClick={() => alternaConta("daniel")} aria-expanded={contaDe === "daniel"}>
                  {contaDe === "daniel" ? "Fechar a conta" : "Como cheguei neste valor"}
                </Botao>
              </div>
            </BlocoSaber>
            <BlocoSaber className="grid content-start gap-3">
              <div className="flex items-center justify-between gap-3">
                <Rubrica as="h2" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Dr. Moisés recebe
                </Rubrica>
                <Etiqueta tom={destaqueEhHoje ? "ouro" : "neutro"}>{quandoDestaque}</Etiqueta>
              </div>
              <Numero texto={destaque ? moneyFin(destaque.reservado.moises) : "—"} tamanho="grande" />
              <Frase>
                {pct(reguaHoje.moises)} do lucro bruto dos procedimentos dele no dia{destaque?.lucroBrutoMoises ? ` (${moneyFin(destaque.lucroBrutoMoises)})` : ""}
              </Frase>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-fio-2 pt-3">
                <p className="text-sm font-bold leading-5 tabular-nums text-tinta">
                  No mês: {moneyFin(planilha.totais.reservado.moises)}
                  <span className="block text-[13px] font-medium text-tinta-2">vendido dele: {moneyFin(planilha.totais.vendidoMoises)}</span>
                </p>
                <Botao tamanho="pq" variante="fantasma" onClick={() => alternaConta("moises")} aria-expanded={contaDe === "moises"}>
                  {contaDe === "moises" ? "Fechar a conta" : "Como cheguei neste valor"}
                </Botao>
              </div>
            </BlocoSaber>
            <BlocoSaber className="grid content-start gap-3">
              <div className="flex items-center justify-between gap-3">
                <Rubrica as="h2" className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Separar para os sócios
                </Rubrica>
                <Etiqueta tom={destaqueEhHoje ? "ouro" : "neutro"}>{quandoDestaque}</Etiqueta>
              </div>
              <Numero texto={destaque ? moneyFin(destaque.reservado.lucro) : "—"} tamanho="grande" />
              <Frase>
                É o lucro de {moneyFin(reguaHoje.lucroMensal)} do mês dividido pelos {planilha.diasUteis} dias úteis. Todo dia útil separa esse valor,
                tenha entrado muito ou pouco.
              </Frase>
              <div className="mt-1 grid gap-2 border-t border-fio-2 pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold leading-5 tabular-nums text-tinta">
                  <span>Já separado no mês: {moneyFin(planilha.totais.reservado.lucro)}</span>
                  <span className="text-[13px] text-tinta-2">
                    {progressoLucro}% dos {moneyFin(reguaHoje.lucroMensal)}
                  </span>
                </div>
                <BarraFina valor={progressoLucro} rotulo={`Já separado: ${progressoLucro}% do lucro do mês`} />
              </div>
            </BlocoSaber>
            <BlocoSaber className="grid content-start gap-3">
              <div className="flex items-center justify-between gap-3">
                <Rubrica as="h2" className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Fica para gastar
                </Rubrica>
                <Etiqueta tom={destaqueEhHoje ? "ouro" : "neutro"}>{quandoDestaque}</Etiqueta>
              </div>
              <Numero
                texto={destaque ? moneyFin(destaque.reservado.operacional) : "—"}
                tamanho="grande"
                tom={destaque && destaque.reservado.operacional < -0.005 ? "RUIM" : "NEUTRO"}
              />
              <Frase>o que sobrou do dia depois de impostos, Dr. Daniel, Dr. Moisés e lucro</Frase>
              <p
                className={cn(
                  "mt-1 flex items-start gap-2 border-t border-fio-2 pt-3 text-sm font-bold leading-5 tabular-nums",
                  saldoOperacional < -0.005 ? "text-erro" : "text-ok",
                )}
              >
                <IconeDoTom tom={saldoOperacional < -0.005 ? "RUIM" : "BOM"} className="mt-0.5" />
                <span>
                  No mês: cabe {moneyFin(planilha.totais.reservado.operacional)} · pagas {moneyFin(planilha.totais.usado.operacional)} →{" "}
                  {saldoOperacional < -0.005 ? `faltam ${moneyFin(-saldoOperacional)}` : `sobram ${moneyFin(saldoOperacional)}`}
                </span>
              </p>
            </BlocoSaber>
          </section>

          {mostrarConta ? (
            <BlocoSaber as="section" aria-labelledby="lucro-conta-medico" className="grid gap-4 p-0 max-md:p-0">
              <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-5 max-md:px-4 max-md:pt-4">
                <h2 id="lucro-conta-medico" className="flex items-center gap-2 text-xl font-bold leading-7 text-tinta">
                  {quemDaConta === "moises" ? <Sparkles className="h-5 w-5 stroke-oliva" aria-hidden="true" /> : <Stethoscope className="h-5 w-5 stroke-oliva" aria-hidden="true" />}
                  A conta do {nomeDaConta}, item por item
                </h2>
                <Campo rotulo="Dia" className="w-40">
                  <Selecao value={diaExplicado} onChange={(event) => setDiaDaConta(event.target.value)} aria-label="Dia da conta">
                    {(diasComVenda.includes(diaExplicado) ? diasComVenda : [...diasComVenda, diaExplicado].sort()).map((dia) => (
                      <option key={dia} value={dia}>
                        {diaCurto(dia)}
                        {dia === hoje ? " (hoje)" : ""}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
              </div>
              <p className="max-w-[110ch] px-6 text-sm font-medium leading-6 text-tinta max-md:px-4">
                Cada item da comanda é procurado na tabela de preços (pelo nome exato que o Fechamento grava; se não, por palavra-chave ou
                pelo preço). A tabela traz o <strong className="font-bold">lucro bruto do produto</strong> (coluna P: preço − nota fiscal − comissão − custo da
                sala − material). Se o paciente pagou um valor diferente da tabela, <strong className="font-bold">o valor pago entra no lugar do preço</strong> (coluna F)
                e a planilha recalcula: imposto e comissão acompanham o valor pago; consumíveis, repasse e sala ficam fixos.{" "}
                {quemDaConta === "moises" ? (
                  <>
                    O Dr. Moisés recebe {pct(explicacao.percentual)} desse lucro bruto (coluna Q da aba dele). Só entram os itens marcados como dele na
                    comanda — os procedimentos da aba &quot;Dr. Moisés&quot; já nascem com essa marca.
                  </>
                ) : (
                  <>
                    O Dr. Daniel recebe {pct(explicacao.percentual)} desse lucro bruto (coluna S). Itens de nutri, psicóloga e &quot;outro&quot; não entram,
                    nem os itens do Dr. Moisés (esses estão na conta dele).
                  </>
                )}
              </p>
              {explicacao.comandas.length ? (
                <div className="overflow-x-auto px-3 max-md:px-1">
                  <table className={cn(tabela.tabela, "min-w-[880px]")}>
                    <thead>
                      <tr>
                        <th className={tabela.th}>Paciente · item lançado</th>
                        <th className={tabela.thNum}>Cobrado</th>
                        <th className={tabela.th}>Produto da tabela (como reconheci)</th>
                        <th className={tabela.thNum}>Tabela: preço → lucro bruto</th>
                        <th className={tabela.thNum}>Qtd.</th>
                        <th className={tabela.thNum}>Lucro bruto do item</th>
                        <th className={tabela.thNum}>
                          {pct(explicacao.percentual)} {nomeDaConta}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {explicacao.comandas.map((comanda) =>
                        comanda.itens.map((item, indice) => (
                          <tr key={`${comanda.saleId}-${indice}`} className={cn(tabela.linha, "align-top", item.parteMedico <= 0 && "text-tinta-2")}>
                            <td className={tabela.td}>
                              {indice === 0 ? <span className="block font-bold text-tinta">{comanda.paciente}</span> : null}
                              <span className="text-[13px]">{item.descricao}</span>
                            </td>
                            <td className={tabela.tdNum}>{moneyFin(item.cobrado)}</td>
                            <td className={cn(tabela.td, "text-[13px]")}>
                              {item.produto ?? (item.reconhecido === "não é do médico" ? "— não entra na parte do médico" : "— sem produto na tabela: usa a fração padrão do tipo")}
                              {item.produto ? <span className="block text-xs text-tinta-2">reconhecido por {item.reconhecido}</span> : null}
                            </td>
                            <td className={cn(tabela.tdNum, "text-[13px]")}>
                              {item.precoTabela != null && item.lucroBrutoTabela != null ? `${moneyFin(item.precoTabela)} → ${moneyFin(item.lucroBrutoTabela)}` : "—"}
                            </td>
                            <td className={tabela.tdNum}>{item.quantidade ?? "—"}</td>
                            <td className={tabela.tdNum}>
                              {item.lucroBruto > 0 ? moneyFin(item.lucroBruto) : "—"}
                              {item.taxaVariavel != null && item.custoFixo != null && item.precoTabela != null && item.quantidade != null && Math.abs(item.cobrado - item.precoTabela * item.quantidade) > 0.005 ? (
                                <span className="block text-xs text-tinta-2">
                                  {moneyFin(item.cobrado)} − {Math.round(item.taxaVariavel * 10000) / 100}% (imposto + comissão) − {moneyFin(item.custoFixo)} fixos
                                </span>
                              ) : null}
                            </td>
                            <td className={cn(tabela.tdNum, "font-bold text-tinta")}>{item.parteMedico > 0 ? moneyFin(item.parteMedico) : "—"}</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className={tabela.pe} colSpan={2}>
                          Total do dia · cobrado {moneyFin(explicacao.cobrado)}
                        </td>
                        <td className={tabela.pe} colSpan={3}></td>
                        <td className={tabela.peNum}>{moneyFin(explicacao.lucroBruto)}</td>
                        <td className={tabela.peNum}>{moneyFin(explicacao.parteMedico)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="px-6 text-sm font-medium leading-5 text-tinta-2 max-md:px-4">Nenhum item do {nomeDaConta} lançado neste dia.</p>
              )}
              {explicacao.comandas.length ? (
                <div className="mx-6 mb-6 grid gap-2 rounded-controle bg-folha p-4 text-sm font-medium leading-6 text-tinta max-md:mx-4 max-md:mb-4">
                  <p className="font-bold">Para conferir com a sua conta</p>
                  <p>
                    Coluna P dos itens do dia {moneyFin(explicacao.lucroBruto)} → {quemDaConta === "moises" ? "coluna Q" : "coluna S"} ({nomeDaConta}){" "}
                    <strong className="font-bold">{moneyFin(explicacao.parteMedico)}</strong>.{" "}
                    {quemDaConta === "moises"
                      ? "Aba \"Precificação Dr. Moisés\" (hora de sala de 15/09/2026, atualizada em 15/10/2026)."
                      : "Planilha OFICIAL de 15/09/2026."}
                  </p>
                  {/* A RÉGUA DA AULA (Dr. Thiago Volpi, 42:35): "passar para você como médico executor algo entre 20 e 30%
                      do que você fatura… da receita que você tem"; no Espaço dele são 28%. Aqui a parte do médico sai da
                      coluna S da planilha, então o % da receita é consequência — e é o que dá para comparar com a aula. */}
                  {quemDaConta === "daniel" && planilha.totais.liquido > 0.005 ? (
                    <p className="border-t border-fio pt-2">
                      <strong className="font-bold">Comparado com a aula:</strong> no mês, a parte do Dr. Daniel ({moneyFin(planilha.totais.reservado.medicoExecutor)}) está em{" "}
                      <strong className="font-bold">{Math.round((planilha.totais.reservado.medicoExecutor / planilha.totais.liquido) * 1000) / 10}%</strong> do que entrou líquido
                      ({moneyFin(planilha.totais.liquido)}). O Dr. Volpi manda passar ao médico executor entre 20% e 30% da receita (no Espaço dele, 28%),
                      sempre em percentual, nunca em valor fixo. O salário fixo do Dr. Daniel (RT) fica fora desta conta desde 10/09, como conta fixa do
                      Contas a Pagar.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </BlocoSaber>
          ) : null}

          {/* OS ENVELOPES EM UM OLHAR (14/09/2026): a planilha desenhada — barra por dia,
              uma frase por envelope, agenda das transferências (10 e 25). */}
          <EnvelopesVisuais planilha={planilha} board={metasBoard} repasses={repassesDaTela} reguaHoje={reguaHoje} hoje={hoje} motor={compromissosLucro} />

          {/* COMPROMISSOS DO LUCRO INTELIGENTE (01/10/2026): o que o mês deve ao médico
              executor (duas parcelas) e a cada sócio, o que já foi pago e o que falta.
              Substitui o bloco de transferências de 10/09: lá o executor aparecia
              inteiro como "falta", sem a regra das duas parcelas. */}
          <CompromissosLucroCard compromissos={compromissosLucro} readOnly={!canEdit} hoje={hoje} onRegistrar={(conta) => financeiro.addExpense(conta)} />

          {/* CAIXA PROJETADO (14/09/2026): as próximas 6 semanas, com pontos de aperto e o custo de antecipar. */}
          {month === hoje.slice(0, 7) ? (
            <CaixaProjetadoCard
              caixa={caixa}
              canEdit={canEdit}
              onToggleAntecipacao={() => setComAntecipacao((atual) => !atual)}
              onPiso={(valor) => {
                setPisoCaixa(valor);
                writeLocalValue(pisoCaixaStorageKey, valor);
              }}
            />
          ) : null}

          <section aria-label="O mês em quatro números" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="grid content-start gap-3 rounded-bloco bg-saber p-5 max-md:p-4">
              <Rubrica as="h2" className="flex items-center gap-2">
                <Landmark className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Entrou no mês (líquido)
              </Rubrica>
              <Numero texto={moneyFin(planilha.totais.liquido)} />
              <Frase>
                bruto {moneyFin(planilha.totais.total)} · taxas {moneyFin(planilha.totais.taxas)} · {planilha.diasComMovimento} dia(s) com entrada
              </Frase>
            </div>
            <div className="grid content-start gap-3 rounded-bloco bg-saber p-5 max-md:p-4">
              <Rubrica as="h2" className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Já não é nosso
              </Rubrica>
              <Numero texto={moneyFin(comprometido)} />
              <Frase>
                impostos {moneyFin(planilha.totais.reservado.impostos)} · lucro {moneyFin(planilha.totais.reservado.lucro)} · Dr. Daniel{" "}
                {moneyFin(planilha.totais.reservado.medicoExecutor)} ({pct(reguaHoje.medicoExecutor)} do lucro bruto de {moneyFin(planilha.totais.lucroBrutoProdutos)} nos produtos dele)
                {planilha.totais.reservado.moises > 0.005
                  ? ` · Dr. Moisés ${moneyFin(planilha.totais.reservado.moises)} (${pct(reguaHoje.moises)} do lucro bruto de ${moneyFin(planilha.totais.lucroBrutoMoises)} nos procedimentos dele)`
                  : ""}
              </Frase>
            </div>
            <div className="grid content-start gap-3 rounded-bloco bg-saber p-5 max-md:p-4">
              <Rubrica as="h2" className="flex items-center gap-2">
                <Wallet className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Cabe gastar no mês
                <InfoTip title="Cabe gastar × contas pagas">
                  &quot;Cabe gastar&quot; é a soma do que sobrou para o operacional em cada dia (líquido − impostos − parte do Dr. Daniel − parte do Dr. Moisés − cota do lucro).
                  &quot;Contas pagas&quot; são as contas operacionais que já saíram no mês (sem obra, impostos, sócios, empréstimos e repasse do médico —
                  esses têm envelope próprio). Se as contas passam do que cabe, o número fica vermelho: é a despesa acima da régua que a aula manda enxugar.
                </InfoTip>
              </Rubrica>
              <Numero texto={moneyFin(planilha.totais.reservado.operacional)} tom={planilha.totais.reservado.operacional < -0.005 ? "RUIM" : "NEUTRO"} />
              <Frase>contas operacionais já pagas: {moneyFin(planilha.totais.usado.operacional)}</Frase>
              <Frase tom={saldoOperacional < -0.005 ? "RUIM" : "BOM"}>
                {saldoOperacional < -0.005 ? `já passou do que cabe em ${moneyFin(-saldoOperacional)}` : `ainda cabem ${moneyFin(saldoOperacional)} de contas`}
              </Frase>
            </div>
            <div className="grid content-start gap-3 rounded-bloco bg-saber p-5 max-md:p-4">
              <Rubrica as="h2" className="flex items-center gap-2">
                <Scale className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Disponível para separar hoje
              </Rubrica>
              <Numero texto={linhaDeHoje ? moneyFin(linhaDeHoje.disponivel) : "—"} />
              <Frase>
                {linhaDeHoje
                  ? `PIX/dinheiro de hoje + cartão de ontem${linhaDeHoje.antecipacao > 0.005 ? ` · puxar o cartão hoje custa ${moneyFin(linhaDeHoje.antecipacao)}` : ""}`
                  : "escolha o mês atual para ver o dia de hoje"}
              </Frase>
              <Frase>
                {planilha.diasPendentes ? `${planilha.diasPendentes} dia(s) com entrada ainda sem marcar "separado"` : "todos os dias com entrada já marcados"}
              </Frase>
            </div>
          </section>

          {mesesAvaliados.length ? (
            <BlocoSaber as="section" aria-labelledby="lucro-onde-estamos" className="grid gap-4 p-0 max-md:p-0">
              <h2 id="lucro-onde-estamos" className="flex items-center gap-2 px-6 pt-5 text-xl font-bold leading-7 text-tinta max-md:px-4 max-md:pt-4">
                Onde estamos (Passo 1 da aula)
                <InfoTip title="Avaliação instantânea">
                  &quot;Antes de mudar qualquer coisa, você precisa saber onde está.&quot; Os últimos meses fechados, com a
                  porcentagem exata de cada envelope sobre o que entrou. Impostos = imposto pago (competência); médico
                  executor = só as transferências do Lucro Inteligente ao Dr. Daniel; Dr. Moisés = os pagamentos registrados a ele; sócios = transferências do Lucro Inteligente + distribuição
                  de lucro; operacional = todas as outras contas fora obra e empréstimos — inclusive o salário fixo do médico, o salário da CEO e o
                  pró-labore, que são conta fixa e não lucro (Lucas, 10/09). <strong>Lucro</strong> é o que sobrou depois de impostos, médico e
                  operacional — inclui o que os sócios já levaram. Obra, empréstimos e investimento ficam à parte: a aula
                  manda tratar dívida de reforma como lucro reinvestido.
                </InfoTip>
              </h2>
              <div className="overflow-x-auto px-3 pb-3 max-md:px-1">
                <table className={cn(tabela.tabela, "min-w-[1040px]")}>
                  <thead>
                    <tr>
                      <th className={cn(tabela.th, "w-[17rem] min-w-[15rem]")}>Envelope</th>
                      {avaliacao.meses.map((mes) => (
                        <th key={mes.monthKey} className={tabela.thNum}>
                          {mesLabel(mes.monthKey)}
                        </th>
                      ))}
                      <th className={tabela.thNum}>{avaliacao.meses.length > 1 ? "Soma" : ""}</th>
                      <th className={cn(tabela.thNum, "text-tinta")}>Régua de hoje</th>
                      <th className={cn(tabela.thNum, "text-tinta")}>Alvo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={cn(tabela.linha, "font-bold")}>
                      <td className={tabela.td}>Receita (comandas + crediário)</td>
                      {avaliacao.meses.map((mes) => (
                        <td key={mes.monthKey} className={cellNumTabela}>
                          {moneyFin(mes.receita)}
                        </td>
                      ))}
                      <td className={cellNumTabela}>{avaliacao.meses.length > 1 ? moneyFin(avaliacao.consolidado.receita) : ""}</td>
                      <td className={cellNumTabela}>100%</td>
                      <td className={cellNumTabela}>100%</td>
                    </tr>
                    <tr className={cn(tabela.linha, "text-tinta-2")}>
                      <td className={cn(tabela.td, "text-[13px]")}>↳ itens do médico (consulta, tratamento, sinal) e o lucro bruto deles (col. P)</td>
                      {avaliacao.meses.map((mes) => (
                        <td key={mes.monthKey} className={cellNumTabela}>
                          {moneyFin(mes.prescrito)}
                          <span className="block text-xs">col. P {moneyFin(mes.lucroBrutoProdutos)}</span>
                        </td>
                      ))}
                      <td className={cellNumTabela}>
                        {avaliacao.meses.length > 1 ? moneyFin(avaliacao.consolidado.prescrito) : ""}
                        {avaliacao.meses.length > 1 ? <span className="block text-xs">col. P {moneyFin(avaliacao.consolidado.lucroBrutoProdutos)}</span> : null}
                      </td>
                      <td className={cellNumTabela} />
                      <td className={cellNumTabela} />
                    </tr>
                    {(
                      [
                        ["impostos", "Impostos pagos"],
                        ["medicoExecutor", "Médico executor (Dr. Daniel)"],
                        ["moises", "Dr. Moisés (biomédico)"],
                        ["operacional", "Despesas operacionais"],
                        ["lucro", "Lucro (sobrou p/ os sócios)"],
                      ] as const
                    ).map(([campo, label]) => (
                      <tr key={campo} className={cn(tabela.linha, campo === "lucro" && "bg-folha font-bold")}>
                        <td className={tabela.td}>{label}</td>
                        {avaliacao.meses.map((mes) => (
                          <td key={mes.monthKey} className={cn(cellNumTabela, campo === "lucro" && mes.lucro < 0 && "text-erro")}>
                            {moneyFin(mes[campo])} <span className="text-[13px] font-medium text-tinta-2">({pct(mes.percentuais[campo])})</span>
                            {campo === "medicoExecutor" && mes.lucroBrutoProdutos > 0 ? (
                              <span className="block text-xs font-medium text-tinta-2">pela col. S: {moneyFin((mes.lucroBrutoProdutos * reguaHoje.medicoExecutor) / 100)}</span>
                            ) : null}
                          </td>
                        ))}
                        <td className={cn(cellNumTabela, campo === "lucro" && avaliacao.consolidado.lucro < 0 && "text-erro")}>
                          {avaliacao.meses.length > 1 ? (
                            <>
                              {moneyFin(avaliacao.consolidado[campo])} <span className="text-[13px] font-medium text-tinta-2">({pct(avaliacao.consolidado.percentuais[campo])})</span>
                            </>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className={cn(cellNumTabela, "font-bold text-tinta")}>
                          {campo === "impostos" ? pct(reguaHoje.impostos) : null}
                          {campo === "medicoExecutor" ? `${pct(reguaHoje.medicoExecutor)} da col. P` : null}
                          {campo === "moises" ? `${pct(reguaHoje.moises)} da col. P dele` : null}
                          {campo === "lucro" ? `${moneyFin(reguaHoje.lucroMensal)}/mês` : null}
                          {campo === "operacional" ? "o que sobra" : null}
                        </td>
                        <td className={cn(cellNumTabela, "font-bold text-tinta")}>
                          {campo === "impostos" ? pct(config.alvo.impostos) : null}
                          {campo === "medicoExecutor" ? `${pct(config.alvo.medicoExecutor)} da col. P` : null}
                          {campo === "moises" ? `${pct(config.alvo.moises)} da col. P dele` : null}
                          {campo === "lucro" ? `${moneyFin(config.alvo.lucroMensal)}/mês` : null}
                          {campo === "operacional" ? "o que sobra" : null}
                        </td>
                      </tr>
                    ))}
                    <tr className={cn(tabela.linha, "text-tinta-2")}>
                      <td className={cn(tabela.td, "text-[13px]")}>↳ dos quais os sócios já levaram</td>
                      {avaliacao.meses.map((mes) => (
                        <td key={mes.monthKey} className={cellNumTabela}>
                          {moneyFin(mes.sociosPagos)} <span className="text-[13px]">({pct(mes.percentuais.sociosPagos)})</span>
                        </td>
                      ))}
                      <td className={cellNumTabela}>{avaliacao.meses.length > 1 ? moneyFin(avaliacao.consolidado.sociosPagos) : ""}</td>
                      <td className={cellNumTabela} />
                      <td className={cellNumTabela} />
                    </tr>
                    <tr className={cn(tabela.linha, "text-tinta-2")}>
                      <td className={cn(tabela.td, "text-[13px]")}>Obra, empréstimos e investimento (à parte — a aula: é lucro reinvestido)</td>
                      {avaliacao.meses.map((mes) => (
                        <td key={mes.monthKey} className={cellNumTabela}>
                          {moneyFin(mes.investimento)}
                        </td>
                      ))}
                      <td className={cellNumTabela}>{avaliacao.meses.length > 1 ? moneyFin(avaliacao.consolidado.investimento) : ""}</td>
                      <td className={cellNumTabela} />
                      <td className={cellNumTabela} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </BlocoSaber>
          ) : null}

          <BlocoFolha as="section" aria-labelledby="lucro-maquininha" respiro className="grid gap-5">
            <h2 id="lucro-maquininha" className="flex items-center gap-2 text-xl font-bold leading-7 text-tinta">
              Conferência com a maquininha
              <InfoTip title="Bater o a receber">
                O app soma as parcelas de cartão que ainda vão cair (líquidas, pela agenda de 31 dias das comandas). Abra
                o portal da Rede, veja o &quot;a receber&quot; de hoje e digite aqui. Diferença pequena é bandeira (Elo/Amex
                paga mais) ou data; diferença grande é comanda faltando ou antecipação já puxada. O contrato ainda pede
                que pelo menos <strong>10% do volume de crédito</strong> seja antecipado com a TAD — esperar 31 dias em tudo
                derruba as taxas com desconto.
              </InfoTip>
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid content-start gap-3 rounded-bloco bg-saber p-5 max-md:p-4">
                <Rubrica>O app espera receber</Rubrica>
                <Numero texto={moneyFin(conferencia.calculado)} />
                <Frase>
                  {conferencia.parcelas} parcela(s)
                  {conferencia.porMes.length ? ` · ${conferencia.porMes.map((m) => `${mesLabel(m.mes)} ${moneyFin(m.liquido)}`).join(" · ")}` : ""}
                </Frase>
              </div>
              <div className="grid content-start gap-2 p-1">
                <Campo
                  rotulo="A Rede mostra hoje (a receber)"
                  ajuda={conferencia.informadoEm ? `última conferência em ${diaCurto(conferencia.informadoEm)}` : "ainda sem conferência"}
                >
                  <input
                    key={`conf-${conferencia.informadoEm}-${conferencia.informado}`}
                    defaultValue={conferencia.informadoEm === hoje && conferencia.informado !== null ? conferencia.informado.toFixed(2).replace(".", ",") : ""}
                    placeholder="0,00"
                    onBlur={(event) => registraConferenciaRede(event.target.value)}
                    inputMode="decimal"
                    disabled={!canEdit}
                    className={classeDoCampoNumero}
                  />
                </Campo>
              </div>
              <div
                className={cn(
                  "grid content-start gap-3 rounded-bloco p-5 max-md:p-4",
                  conferencia.bate === null ? "bg-saber" : conferencia.bate ? "bg-ok-claro" : "bg-erro-claro",
                )}
              >
                <Rubrica>Diferença (Rede − app)</Rubrica>
                <Numero texto={conferencia.diferenca === null ? "—" : moneyFin(conferencia.diferenca)} tom={conferencia.bate === false ? "RUIM" : "NEUTRO"} />
                <p
                  className={cn(
                    "flex items-start gap-2 text-[13px] font-medium leading-5",
                    conferencia.bate === null ? "text-tinta-2" : conferencia.bate ? "font-bold text-ok" : "font-bold text-erro",
                  )}
                >
                  {conferencia.bate === null ? null : <IconeDoTom tom={conferencia.bate ? "BOM" : "RUIM"} className="mt-0.5" />}
                  <span>
                    {conferencia.bate === null
                      ? "digite o valor da Rede para bater"
                      : conferencia.bate
                        ? "bateu (folga de R$ 50 ou 0,5%)"
                        : conferencia.diferenca! < 0
                          ? "a Rede mostra menos: antecipação já puxada ou comanda a mais no app"
                          : "a Rede mostra mais: comanda faltando no app ou venda lançada em outro dia"}
                  </span>
                </p>
              </div>
            </div>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              Compromisso RAV do contrato: antecipar ao menos 10% do volume de crédito do mês —{" "}
              <strong className="font-bold tabular-nums text-tinta">{moneyFin(conferencia.minimoAntecipar)}</strong> sobre {moneyFin(conferencia.volumeCartaoMes)} até agora em{" "}
              {mesLongo(hoje.slice(0, 7))}.
              {(config.conferencias ?? []).length > 1
                ? ` Histórico: ${[...(config.conferencias ?? [])].slice(-5).map((c) => `${diaCurto(c.dia)} ${moneyFin(c.aReceberRede)}`).join(" · ")}.`
                : ""}
            </p>
          </BlocoFolha>

          {/* PLANILHA DO DIA A DIA — SIMPLES POR PADRÃO (10/09/2026, Lucas: "está
              muito confusa... muita informação"). Sete colunas contam a história:
              quanto entrou, o que a régua separou (impostos, sócios, Dr. Daniel, Dr. Moisés),
              o que sobrou e se já foi separado. O resto (PIX/dinheiro/cartão,
              taxas, disponível, contas pagas, fechamento) abre em "Ver detalhes". */}
          <BlocoFolha as="section" aria-labelledby="lucro-planilha" className="grid gap-4 overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-5 max-md:px-4 max-md:pt-4">
              <div>
                <h2 id="lucro-planilha" className="flex items-center gap-2 text-xl font-bold leading-7 text-tinta">
                  Planilha do dia a dia · {new Date(`${month}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                  <InfoTip title="Como ler a planilha">
                    <strong>Entrou</strong> é o que ficou das comandas do dia depois das taxas da maquininha e do PIX.{" "}
                    <strong>Impostos</strong> é a % do líquido. <strong>Sócios</strong> é o lucro do mês dividido pelos dias úteis — vale todo dia útil,
                    mesmo sem entrada. <strong>Dr. Daniel</strong> é a coluna S da precificação: 50% do lucro bruto de cada produto dele vendido no dia.{" "}
                    <strong>Dr. Moisés</strong> é a coluna Q da aba dele: 20% do lucro bruto de cada procedimento dele.{" "}
                    <strong>Fica para gastar</strong> é o que sobra (vermelho quando o dia não paga a régua). Marque <strong>Separado</strong> quando as
                    transferências do dia forem feitas. Em &quot;Ver detalhes&quot;: PIX, dinheiro, débito, crédito, bruto, taxas (débito 0,7% · crédito à
                    vista 1,7% · parcelado 2,39% · PIX 0,6% teto R$ 150), disponível (PIX/dinheiro do dia + cartão do dia útil anterior, e o custo de
                    puxar hoje), contas operacionais pagas no dia, sobra ou falta acumulada e o fechamento do caixa.
                  </InfoTip>
                </h2>
                <p className="mt-1 text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                  {planilha.diasSeparados}/{planilha.diasComMovimento} dias com entrada já marcados como separados · cota dos sócios {moneyFin(planilha.cotaLucroDiaUtil)} por dia útil
                </p>
              </div>
              <Botao tamanho="pq" variante={detalhado ? "suave" : "secundario"} onClick={() => setDetalhado((v) => !v)} aria-pressed={detalhado}>
                {detalhado ? "Ver resumo" : "Ver detalhes"}
              </Botao>
            </div>
            {linhasVisiveis.length === 0 ? (
              <p className="px-6 pb-6 text-center text-sm font-medium leading-5 text-tinta-2">Mês ainda não começou — a planilha nasce dia a dia.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={cn(tabela.tabela, "text-[13px]", detalhado ? "min-w-[1500px]" : "min-w-[860px]")}>
                  <thead>
                    <tr>
                      <th className={cn(tabela.th, "sticky left-0 z-10 bg-folha px-3")}>Dia</th>
                      {detalhado ? (
                        <>
                          <th className={cn(tabela.thNum, "px-3")}>PIX</th>
                          <th className={cn(tabela.thNum, "px-3")}>Dinheiro</th>
                          <th className={cn(tabela.thNum, "px-3")}>Débito</th>
                          <th className={cn(tabela.thNum, "px-3")}>Crédito</th>
                          <th className={cn(tabela.thNum, "px-3")}>Bruto</th>
                          <th className={cn(tabela.thNum, "px-3")}>Taxas</th>
                        </>
                      ) : null}
                      <th className={cn(tabela.thNum, "px-3 text-tinta")}>Entrou</th>
                      {detalhado ? <th className={cn(tabela.thNum, "px-3")}>Disponível</th> : null}
                      <th className={cn(tabela.thNum, "px-3")}>Impostos</th>
                      <th className={cn(tabela.thNum, "bg-musgo-claro px-3 text-tinta")}>Sócios</th>
                      <th className={cn(tabela.thNum, "bg-ouro-claro px-3 text-tinta")}>Dr. Daniel</th>
                      <th className={cn(tabela.thNum, "bg-ouro-claro px-3 text-tinta")}>Dr. Moisés</th>
                      <th className={cn(tabela.thNum, "px-3 text-tinta")}>Fica p/ gastar</th>
                      {detalhado ? (
                        <>
                          <th className={cn(tabela.thNum, "px-3")}>Contas pagas</th>
                          <th className={cn(tabela.thNum, "px-3")}>Sobra ou falta (mês)</th>
                          <th className={cn(tabela.th, "px-3 text-center")}>Fechamento</th>
                        </>
                      ) : null}
                      <th className={cn(tabela.th, "px-3 text-center")}>Separado?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasVisiveis.map((linha) => {
                      const semMovimento = linha.total < 0.005 && linha.usado.operacional < 0.005 && linha.regua.cotaLucro < 0.005;
                      const fundoDaLinha = linha.marca?.separado ? "bg-ok-claro" : !linha.diaUtil ? "bg-saber" : "bg-folha";
                      return (
                        <tr key={linha.dia} className={cn(fundoDaLinha, semMovimento && "text-tinta-2", linha.dia === hoje && "shadow-[inset_3px_0_0_rgb(var(--ouro-fio-rgb))]")}>
                          <td className={cn(tabela.td, "sticky left-0 z-10 whitespace-nowrap px-3 py-2 font-bold text-tinta", fundoDaLinha)}>
                            {diaCurto(linha.dia)}
                            {linha.dia === hoje ? <span className="ml-1.5 text-xs font-bold text-ouro">hoje</span> : null}
                            {!linha.diaUtil && !linha.fimDeSemana ? <span className="ml-1.5 text-xs font-medium text-tinta-2">feriado</span> : null}
                            {linha.comprovantesPendentes ? (
                              <span className="ml-1.5 text-xs font-bold text-atencao" title="pagamentos sem comprovante">
                                · {linha.comprovantesPendentes} s/ comprov.
                              </span>
                            ) : null}
                          </td>
                          {detalhado ? (
                            <>
                              <td className={cellNumTabela}>{linha.pix ? moneyFin(linha.pix) : "—"}</td>
                              <td className={cellNumTabela}>{linha.dinheiro ? moneyFin(linha.dinheiro) : "—"}</td>
                              <td className={cellNumTabela}>{linha.debito ? moneyFin(linha.debito) : "—"}</td>
                              <td className={cellNumTabela}>{linha.credito ? moneyFin(linha.credito) : "—"}</td>
                              <td className={cellNumTabela}>{linha.total ? moneyFin(linha.total) : "—"}</td>
                              <td className={cn(cellNumTabela, "text-erro")}>{linha.taxas ? `−${moneyFin(linha.taxas)}` : "—"}</td>
                            </>
                          ) : null}
                          <td className={cn(cellNumTabela, "font-bold text-tinta")}>{linha.liquido ? moneyFin(linha.liquido) : "—"}</td>
                          {detalhado ? (
                            <td className={cellNumTabela}>
                              {linha.disponivel ? moneyFin(linha.disponivel) : "—"}
                              {linha.antecipacao > 0.005 ? (
                                <span className="block text-xs font-medium text-tinta-2" title="custo de resgatar hoje o cartão de ontem em vez de esperar os 31 dias">
                                  puxar hoje: −{moneyFin(linha.antecipacao)}
                                </span>
                              ) : null}
                            </td>
                          ) : null}
                          <td className={cellNumTabela}>{linha.reservado.impostos ? moneyFin(linha.reservado.impostos) : "—"}</td>
                          <td className={cn(cellNumTabela, "bg-musgo-claro/60 font-bold text-tinta")}>{linha.reservado.lucro ? moneyFin(linha.reservado.lucro) : "—"}</td>
                          <td className={cn(cellNumTabela, "bg-ouro-claro/60 font-bold text-tinta")}>
                            {linha.reservado.medicoExecutor ? moneyFin(linha.reservado.medicoExecutor) : "—"}
                            {detalhado && linha.lucroBrutoProdutos ? (
                              <span className="block text-xs font-medium text-tinta-2" title="lucro bruto dos produtos do dia (coluna P) · itens do médico pelo preço">
                                col. P {moneyFin(linha.lucroBrutoProdutos)} · itens {moneyFin(linha.prescrito)}
                              </span>
                            ) : null}
                          </td>
                          <td className={cn(cellNumTabela, "bg-ouro-claro/60 font-bold text-tinta")}>
                            {linha.reservado.moises ? moneyFin(linha.reservado.moises) : "—"}
                            {detalhado && linha.lucroBrutoMoises ? (
                              <span className="block text-xs font-medium text-tinta-2" title="lucro bruto dos procedimentos do Dr. Moisés no dia (coluna P) · o que foi vendido dele">
                                col. P {moneyFin(linha.lucroBrutoMoises)} · vendido {moneyFin(linha.vendidoMoises)}
                              </span>
                            ) : null}
                          </td>
                          <td className={cn(cellNumTabela, "font-bold", linha.reservado.operacional < -0.005 ? "text-erro" : "text-tinta")}>
                            {linha.total || linha.regua.cotaLucro ? moneyFin(linha.reservado.operacional) : "—"}
                          </td>
                          {detalhado ? (
                            <>
                              <td className={cellNumTabela}>{linha.usado.operacional ? moneyFin(linha.usado.operacional) : "—"}</td>
                              <td className={cn(cellNumTabela, "font-bold", linha.acumulado.saldo.operacional < -0.005 ? "text-erro" : "text-ok")}>
                                {linha.acumulado.saldo.operacional < -0.005 ? `falta ${moneyFin(-linha.acumulado.saldo.operacional)}` : `sobra ${moneyFin(linha.acumulado.saldo.operacional)}`}
                              </td>
                              <td className={cn(tabela.td, "px-3 py-2 text-center")}>
                                {linha.fechamento === "CONFERIDO" ? (
                                  <Selo estado="pago">conferido</Selo>
                                ) : linha.fechamento === "DIVERGENTE" ? (
                                  <Selo estado="vencido">divergente</Selo>
                                ) : linha.total ? (
                                  <span className="text-xs font-medium text-tinta-2">sem fechamento</span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </>
                          ) : null}
                          <td className={cn(tabela.td, "px-3 py-2 text-center")}>
                            {linha.total || linha.marca ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => toggleSeparado(linha.dia, linha.marca)}
                                  disabled={!canEdit}
                                  aria-pressed={Boolean(linha.marca?.separado)}
                                  aria-label={linha.marca?.separado ? `Dia ${diaCurto(linha.dia)} separado` : `Marcar dia ${diaCurto(linha.dia)} como separado`}
                                  className={cn(
                                    "inline-flex h-8 w-8 items-center justify-center rounded-controle border transition-colors duration-150 ease-papel",
                                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
                                    linha.marca?.separado ? "border-ok bg-ok text-folha" : "border-fio-2 bg-folha text-tinta-2 hover:border-borda-campo hover:text-tinta",
                                    !canEdit && "cursor-not-allowed opacity-60",
                                  )}
                                >
                                  <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => editaObservacao(linha.dia, linha.marca)}
                                  disabled={!canEdit}
                                  className={cn(
                                    "inline-flex h-8 items-center gap-1 rounded-controle px-1.5 text-xs font-bold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco",
                                    linha.marca?.observacao ? "text-musgo" : "text-tinta-2",
                                  )}
                                  title={linha.marca?.observacao || "adicionar observação"}
                                >
                                  obs
                                  {linha.marca?.observacao ? <Pencil className="h-3 w-3" aria-label="com observação" /> : null}
                                </button>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-saber">
                      <td className={cn(tabela.pe, "sticky left-0 z-10 bg-saber px-3")}>Total do mês</td>
                      {detalhado ? (
                        <>
                          <td className={cn(tabela.peNum, "px-3")}>{moneyFin(linhasVisiveis.reduce((s, l) => s + l.pix, 0))}</td>
                          <td className={cn(tabela.peNum, "px-3")}>{moneyFin(linhasVisiveis.reduce((s, l) => s + l.dinheiro, 0))}</td>
                          <td className={cn(tabela.peNum, "px-3")}>{moneyFin(linhasVisiveis.reduce((s, l) => s + l.debito, 0))}</td>
                          <td className={cn(tabela.peNum, "px-3")}>{moneyFin(linhasVisiveis.reduce((s, l) => s + l.credito, 0))}</td>
                          <td className={cn(tabela.peNum, "px-3")}>{moneyFin(planilha.totais.total)}</td>
                          <td className={cn(tabela.peNum, "px-3 text-erro")}>−{moneyFin(planilha.totais.taxas)}</td>
                        </>
                      ) : null}
                      <td className={cn(tabela.peNum, "px-3")}>{moneyFin(planilha.totais.liquido)}</td>
                      {detalhado ? <td className={cn(tabela.peNum, "px-3")}>{moneyFin(planilha.totais.disponivel)}</td> : null}
                      <td className={cn(tabela.peNum, "px-3")}>{moneyFin(planilha.totais.reservado.impostos)}</td>
                      <td className={cn(tabela.peNum, "bg-musgo-claro px-3")}>{moneyFin(planilha.totais.reservado.lucro)}</td>
                      <td className={cn(tabela.peNum, "bg-ouro-claro px-3")}>
                        {moneyFin(planilha.totais.reservado.medicoExecutor)}
                        {detalhado ? <span className="block text-xs font-medium text-tinta-2">col. P {moneyFin(planilha.totais.lucroBrutoProdutos)}</span> : null}
                      </td>
                      <td className={cn(tabela.peNum, "bg-ouro-claro px-3")}>
                        {moneyFin(planilha.totais.reservado.moises)}
                        {detalhado ? <span className="block text-xs font-medium text-tinta-2">col. P {moneyFin(planilha.totais.lucroBrutoMoises)}</span> : null}
                      </td>
                      <td className={cn(tabela.peNum, "px-3", planilha.totais.reservado.operacional < -0.005 ? "text-erro" : "text-tinta")}>{moneyFin(planilha.totais.reservado.operacional)}</td>
                      {detalhado ? (
                        <>
                          <td className={cn(tabela.peNum, "px-3")}>{moneyFin(planilha.totais.usado.operacional)}</td>
                          <td className={cn(tabela.peNum, "px-3", saldoOperacional < -0.005 ? "text-erro" : "text-ok")}>
                            {saldoOperacional < -0.005 ? `falta ${moneyFin(-saldoOperacional)}` : `sobra ${moneyFin(saldoOperacional)}`}
                          </td>
                          <td className={cn(tabela.peNum, "px-3")} />
                        </>
                      ) : null}
                      <td className={cn(tabela.peNum, "px-3")} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </BlocoFolha>

          <OrigemDosDados modo={financeiro.syncMode} />
        </div>
      </div>
    </AccessGate>
  );
}
