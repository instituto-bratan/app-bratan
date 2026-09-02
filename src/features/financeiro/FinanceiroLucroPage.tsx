import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, Landmark, PiggyBank, Scale, ShieldAlert, SlidersHorizontal, TrendingUp, Wallet } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import {
  listRemoteFinLucroDias,
  loadRemoteFinLucroConfig,
  saveRemoteFinLucroConfig,
  saveRemoteFinLucroDia,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { moneyFin } from "./financeiroData";
import {
  avaliacaoInstantanea,
  buildPlanilhaLucro,
  defaultLucroConfig,
  mesesAnteriores,
  operacionalDe,
  percentuaisNoDia,
  selicDaConfig,
  subirDegrau,
  type LucroConfig,
  type MarcaDiaLucro,
  type PercentuaisLucro,
} from "./lucroInteligente";
import { taxaAntecipacaoMensal } from "./recebiveisRede";
import { useFinanceiro } from "./useFinanceiro";

const configStorageKey = "app-bratan-fin-lucro-config";
const marcasStorageKey = "app-bratan-fin-lucro-dias";

const envelopeLabels = {
  impostos: "Impostos",
  lucro: "Lucro (sócios)",
  medicoExecutor: "Médico executor",
  operacional: "Fica para gastar",
} as const;

function pct(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

function diaCurto(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function mesLabel(monthKey: string) {
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function parsePct(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

export function FinanceiroLucroPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const canEdit = canEditModule(pessoa, "fin-lucro");
  const hoje = todayISO();
  const [month, setMonth] = useState(hoje.slice(0, 7));
  const year = Number(month.slice(0, 4));
  const financeiro = useFinanceiro(year);
  const [showConfig, setShowConfig] = useState(false);
  const [feedback, setFeedback] = useState("");

  // ---- Percentuais (degraus + alvo): igual à config de Metas — local + Supabase.
  const [config, setConfig] = useState<LucroConfig>(() => ({
    ...defaultLucroConfig,
    ...readLocalValue<Partial<LucroConfig>>(configStorageKey, {}),
  }));
  useQuery({
    queryKey: ["fin-lucro-config"],
    queryFn: async () => {
      const remote = await loadRemoteFinLucroConfig();
      if (remote) {
        setConfig((current) => {
          const merged = { ...current, ...(remote as Partial<LucroConfig>) };
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
        setFeedback("Os percentuais ficaram só neste aparelho — o Supabase recusou a gravação.");
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
        expenses: financeiro.expenses,
        categories: financeiro.categories,
        reconciliations: financeiro.reconciliations,
        marcas,
        config,
        monthKey: month,
        hoje,
      }),
    [financeiro.sales, financeiro.expenses, financeiro.categories, financeiro.reconciliations, marcas, config, month, hoje],
  );

  // Passo 1 da aula: os três meses fechados antes do mês escolhido. Meses de
  // outro ano não estão carregados (useFinanceiro carrega um ano por vez) —
  // ficam de fora em vez de aparecer zerados.
  const mesesAvaliados = useMemo(() => mesesAnteriores(month, 3).filter((m) => m.startsWith(`${year}-`)), [month, year]);
  const avaliacao = useMemo(
    () => avaliacaoInstantanea(financeiro.sales, financeiro.expenses, financeiro.categories, financeiro.crediarioProfits, mesesAvaliados),
    [financeiro.sales, financeiro.expenses, financeiro.categories, financeiro.crediarioProfits, mesesAvaliados],
  );

  const degrauHoje = percentuaisNoDia(config, hoje);
  const degrauMaisRecente = [...config.degraus].sort((a, b) => a.desde.localeCompare(b.desde)).at(-1) ?? config.degraus[0];
  const comprometido = planilha.totais.reservado.impostos + planilha.totais.reservado.lucro + planilha.totais.reservado.medicoExecutor;
  const saldoOperacional = planilha.totais.saldo.operacional;

  function editaDegrau(campo: keyof PercentuaisLucro, valor: string) {
    if (!canEdit || !degrauMaisRecente) return;
    const degraus = config.degraus.map((degrau) => (degrau.desde === degrauMaisRecente.desde ? { ...degrau, [campo]: parsePct(valor) } : degrau));
    persistConfig({ ...config, degraus });
  }

  function editaAlvo(campo: keyof PercentuaisLucro, valor: string) {
    if (!canEdit) return;
    persistConfig({ ...config, alvo: { ...config.alvo, [campo]: parsePct(valor) } });
  }

  function editaSelic(valor: string) {
    if (!canEdit) return;
    const selic = parsePct(valor);
    if (selic <= 0) return;
    persistConfig({ ...config, selicAnual: selic });
  }

  function novoDegrauHoje() {
    if (!canEdit || !degrauMaisRecente) return;
    if (config.degraus.some((degrau) => degrau.desde === hoje)) return;
    persistConfig({ ...config, degraus: [...config.degraus, { ...degrauMaisRecente, desde: hoje }] });
    setFeedback(`Novo degrau criado a partir de ${diaCurto(hoje)} — edite os percentuais dele.`);
  }

  function subirLucro() {
    if (!canEdit) return;
    const next = subirDegrau(config, hoje, 2);
    persistConfig(next);
    setFeedback(`Lucro subiu para ${pct(percentuaisNoDia(next, hoje).lucro)} a partir de hoje. A aula: "não é meta, é decisão".`);
  }

  function toggleSeparado(dia: string, atual: MarcaDiaLucro | null) {
    if (!canEdit) return;
    persistMarca({ dia, separado: !atual?.separado, observacao: atual?.observacao ?? "" });
  }

  function editaObservacao(dia: string, atual: MarcaDiaLucro | null) {
    if (!canEdit) return;
    const texto = window.prompt(`Observação do dia ${diaCurto(dia)} (ex.: transferi 5.000 p/ conta lucro, impostos ficam p/ dia 10):`, atual?.observacao ?? "");
    if (texto === null) return;
    persistMarca({ dia, separado: atual?.separado ?? false, observacao: texto.trim() });
  }

  const linhasVisiveis = planilha.linhas;
  const cellNum = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Lucro Inteligente" module="fin-lucro">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Financeiro 360</Badge>
                <Badge variant="muted">{financeiro.syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Lucro Inteligente
                <InfoTip title="A régua da aula (Dr. Thiago Volpi)">
                  <strong>Vendas − Lucro = Despesas.</strong> Em vez de gastar primeiro e lucrar o que sobra, a clínica
                  decide o lucro e se vira com o resto. De cada real que entra, o app já separa{" "}
                  <strong>impostos</strong>, <strong>lucro dos sócios</strong> (o salário da CEO é o lucro) e o{" "}
                  <strong>repasse do médico executor</strong>; o que sobra é o único dinheiro para gastar. Percentual é
                  sempre sobre 100% do que entrou. Lucro e impostos vão para contas de difícil acesso. A aula deixa no
                  máximo ~30% para a despesa operacional — e a régua aqui já começa nesse topo (decisão do Lucas,
                  02/09): quanto menos sobra para gastar, mais a gente economiza e mais vira lucro.
                  &quot;Não é meta, é decisão.&quot;
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Régua de hoje: impostos {pct(degrauHoje.impostos)} · lucro {pct(degrauHoje.lucro)} · médico executor{" "}
                {pct(degrauHoje.medicoExecutor)} → <strong className="text-brand-musgo">fica {pct(operacionalDe(degrauHoje))} para gastar</strong>.
                As taxas da maquininha e do PIX saem antes de repartir. O crédito conta no dia do lançamento e fica disponível no dia útil seguinte;
                puxar antes dos 31 dias custa a antecipação (TAD {pct(taxaAntecipacaoMensal(selicDaConfig(config)) * 100)} ao mês) — a planilha mostra quanto.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" aria-label="Mês" />
              <Button type="button" variant={showConfig ? "default" : "outline"} onClick={() => setShowConfig((value) => !value)}>
                <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Percentuais
              </Button>
            </div>
          </div>
          {feedback ? <p className="mt-3 text-sm text-brand-musgo">{feedback}</p> : null}
        </motion.section>

        {syncFailed ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            <div className="flex flex-wrap items-center gap-3">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">Sua marcação NÃO chegou ao Supabase — está salva só neste aparelho. Não saia da tela sem sincronizar.</span>
              <Button type="button" variant="outline" size="sm" onClick={retrySync}>
                Tentar sincronizar
              </Button>
            </div>
            {syncErrorDetail ? <p className="mt-1.5 break-all pl-7 font-mono text-[11px] leading-4 text-red-600/80">Detalhe técnico: {syncErrorDetail}</p> : null}
          </div>
        ) : null}

        {showConfig ? (
          <section className="rounded-lg border border-brand-dourado/40 bg-brand-creme/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-brand-musgo">Os degraus da decisão</h2>
                <p className="text-xs text-muted-foreground">
                  Editando o degrau que vale desde {degrauMaisRecente ? diaCurto(degrauMaisRecente.desde) : "—"}. Dias anteriores continuam com o degrau da época.
                </p>
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={novoDegrauHoje} disabled={config.degraus.some((d) => d.desde === hoje)}>
                    Novo degrau a partir de hoje
                  </Button>
                  <Button type="button" size="sm" onClick={subirLucro} disabled={degrauHoje.lucro >= config.alvo.lucro}>
                    <TrendingUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Subir lucro +2 pts
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-brand-oliva/14 bg-white/70 p-3">
                <p className="text-sm font-semibold text-brand-musgo">Decisão de hoje</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["impostos", "lucro", "medicoExecutor"] as const).map((campo) => (
                    <label key={campo} className="text-xs text-muted-foreground">
                      {envelopeLabels[campo]}
                      <Input
                        key={`${degrauMaisRecente?.desde}-${campo}-${degrauMaisRecente?.[campo]}`}
                        defaultValue={String(degrauMaisRecente?.[campo] ?? 0).replace(".", ",")}
                        onBlur={(event) => editaDegrau(campo, event.target.value)}
                        inputMode="decimal"
                        disabled={!canEdit}
                        className="mt-1 h-9"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-sm text-brand-tinta">
                  Fica para gastar: <strong>{degrauMaisRecente ? pct(operacionalDe(degrauMaisRecente)) : "—"}</strong>
                </p>
              </div>
              <div className="rounded-lg border border-brand-oliva/14 bg-white/70 p-3">
                <p className="text-sm font-semibold text-brand-musgo">Alvo (onde queremos chegar)</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["impostos", "lucro", "medicoExecutor"] as const).map((campo) => (
                    <label key={campo} className="text-xs text-muted-foreground">
                      {envelopeLabels[campo]}
                      <Input
                        key={`alvo-${campo}-${config.alvo[campo]}`}
                        defaultValue={String(config.alvo[campo]).replace(".", ",")}
                        onBlur={(event) => editaAlvo(campo, event.target.value)}
                        inputMode="decimal"
                        disabled={!canEdit}
                        className="mt-1 h-9"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-sm text-brand-tinta">
                  Fica para gastar no alvo: <strong>{pct(operacionalDe(config.alvo))}</strong>
                  <span className="ml-1 text-xs text-muted-foreground">
                    (a aula: 25% lucro · 16,6% impostos · 28% executor → 30,4%; aqui o executor é o repasse real do Dr. Daniel, e a diferença vai para o lucro)
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-brand-oliva/14 bg-white/70 p-3">
              <label className="text-xs text-muted-foreground">
                SELIC ao ano (%) — referência da antecipação
                <Input
                  key={`selic-${config.selicAnual ?? ""}`}
                  defaultValue={String(config.selicAnual ?? 15).replace(".", ",")}
                  onBlur={(event) => editaSelic(event.target.value)}
                  inputMode="decimal"
                  disabled={!canEdit}
                  className="mt-1 h-9 w-32"
                />
              </label>
              <p className="pb-2 text-xs text-muted-foreground">
                TAD = SELIC a.m. + 0,9% = <strong className="text-brand-musgo">{pct(taxaAntecipacaoMensal(selicDaConfig(config)) * 100)} ao mês</strong>{" "}
                (anexo RAV do acordo Q-7621480). Custo de puxar = (1 + TAD)^(dias/30) − 1 sobre o valor antecipado.
              </p>
            </div>
            {config.degraus.length > 1 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Histórico:{" "}
                {[...config.degraus]
                  .sort((a, b) => a.desde.localeCompare(b.desde))
                  .map((degrau) => `${diaCurto(degrau.desde)} → lucro ${pct(degrau.lucro)}`)
                  .join(" · ")}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <Landmark className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Entrou no mês (líquido)</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(planilha.totais.liquido)}</p>
            <p className="text-xs text-muted-foreground">
              bruto {moneyFin(planilha.totais.total)} · taxas {moneyFin(planilha.totais.taxas)} · {planilha.diasComMovimento} dia(s) com entrada
            </p>
          </div>
          <div className="rounded-lg border border-brand-dourado/45 bg-brand-creme/40 p-4">
            <PiggyBank className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Já não é nosso</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(comprometido)}</p>
            <p className="text-xs text-muted-foreground">
              impostos {moneyFin(planilha.totais.reservado.impostos)} · lucro {moneyFin(planilha.totais.reservado.lucro)} · médico{" "}
              {moneyFin(planilha.totais.reservado.medicoExecutor)}
            </p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <Wallet className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Fica para gastar</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(planilha.totais.reservado.operacional)}</p>
            <p className="text-xs text-muted-foreground">
              {planilha.totais.liquido > 0 ? pct((planilha.totais.reservado.operacional / planilha.totais.liquido) * 100) : "—"} do líquido · gasto até agora{" "}
              {moneyFin(planilha.totais.usado.operacional)}
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg border p-4",
              saldoOperacional < -0.005 ? "border-red-200 bg-red-50/60" : "border-emerald-200 bg-emerald-50/60",
            )}
          >
            <Scale className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Saldo do envelope operacional</p>
            <p className={cn("text-2xl font-bold", saldoOperacional < -0.005 ? "text-red-700" : "text-brand-tinta")}>{moneyFin(saldoOperacional)}</p>
            <p className="text-xs text-muted-foreground">
              {saldoOperacional < -0.005 ? "gastamos mais do que o envelope permitia" : "o que sobra se não gastarmos mais"} ·{" "}
              {planilha.diasPendentes ? `${planilha.diasPendentes} dia(s) sem marcar "separado"` : "todos os dias marcados"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              disponível no mês {moneyFin(planilha.totais.disponivel)}
              {planilha.totais.antecipacao > 0.005 ? ` · puxar todo o cartão no D+1 custaria ${moneyFin(planilha.totais.antecipacao)}` : ""}
            </p>
          </div>
        </div>

        {mesesAvaliados.length ? (
          <section className="rounded-lg border border-brand-oliva/14 bg-white/60 p-4 backdrop-blur">
            <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
              Onde estamos (Passo 1 da aula)
              <InfoTip title="Avaliação instantânea">
                &quot;Antes de mudar qualquer coisa, você precisa saber onde está.&quot; Os últimos meses fechados, com a
                porcentagem exata de cada envelope sobre o que entrou. Impostos = imposto pago (competência); médico
                executor = repasse do Dr. Daniel; sócios = salário CEO + pró-labore + distribuição; operacional = todas
                as outras contas fora obra. <strong>Lucro</strong> é o que sobrou depois de impostos, médico e
                operacional — inclui o que os sócios já levaram. Obra e investimento ficam à parte: a aula manda tratar
                dívida de reforma como lucro reinvestido.
              </InfoTip>
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">Envelope</th>
                    {avaliacao.meses.map((mes) => (
                      <th key={mes.monthKey} className="px-2 py-1.5 text-right">{mesLabel(mes.monthKey)}</th>
                    ))}
                    <th className="px-2 py-1.5 text-right">{avaliacao.meses.length > 1 ? "Soma" : ""}</th>
                    <th className="px-2 py-1.5 text-right text-brand-musgo">Decisão hoje</th>
                    <th className="px-2 py-1.5 text-right text-brand-musgo">Alvo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-brand-oliva/10 font-semibold">
                    <td className="px-2 py-1.5">Receita (comandas + crediário)</td>
                    {avaliacao.meses.map((mes) => (
                      <td key={mes.monthKey} className={cellNum}>{moneyFin(mes.receita)}</td>
                    ))}
                    <td className={cellNum}>{avaliacao.meses.length > 1 ? moneyFin(avaliacao.consolidado.receita) : ""}</td>
                    <td className={cellNum}>100%</td>
                    <td className={cellNum}>100%</td>
                  </tr>
                  {(
                    [
                      ["impostos", "Impostos pagos"],
                      ["medicoExecutor", "Médico executor (Dr. Daniel)"],
                      ["operacional", "Despesas operacionais"],
                      ["lucro", "Lucro (sobrou p/ os sócios)"],
                    ] as const
                  ).map(([campo, label]) => (
                    <tr key={campo} className={cn("border-t border-brand-oliva/10", campo === "lucro" && "bg-brand-creme/30 font-semibold")}>
                      <td className="px-2 py-1.5">{label}</td>
                      {avaliacao.meses.map((mes) => (
                        <td key={mes.monthKey} className={cn(cellNum, campo === "lucro" && mes.lucro < 0 && "text-red-700")}>
                          {moneyFin(mes[campo])} <span className="text-xs text-muted-foreground">({pct(mes.percentuais[campo])})</span>
                        </td>
                      ))}
                      <td className={cn(cellNum, campo === "lucro" && avaliacao.consolidado.lucro < 0 && "text-red-700")}>
                        {avaliacao.meses.length > 1 ? (
                          <>
                            {moneyFin(avaliacao.consolidado[campo])} <span className="text-xs text-muted-foreground">({pct(avaliacao.consolidado.percentuais[campo])})</span>
                          </>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className={cn(cellNum, "text-brand-musgo")}>{campo === "operacional" ? pct(operacionalDe(degrauHoje)) : pct(degrauHoje[campo])}</td>
                      <td className={cn(cellNum, "text-brand-musgo")}>{campo === "operacional" ? pct(operacionalDe(config.alvo)) : pct(config.alvo[campo])}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-brand-oliva/10 text-muted-foreground">
                    <td className="px-2 py-1.5">↳ dos quais os sócios já levaram</td>
                    {avaliacao.meses.map((mes) => (
                      <td key={mes.monthKey} className={cellNum}>{moneyFin(mes.sociosPagos)} <span className="text-xs">({pct(mes.percentuais.sociosPagos)})</span></td>
                    ))}
                    <td className={cellNum}>{avaliacao.meses.length > 1 ? moneyFin(avaliacao.consolidado.sociosPagos) : ""}</td>
                    <td className={cellNum} />
                    <td className={cellNum} />
                  </tr>
                  <tr className="border-t border-brand-oliva/10 text-muted-foreground">
                    <td className="px-2 py-1.5">Obra / investimento (à parte)</td>
                    {avaliacao.meses.map((mes) => (
                      <td key={mes.monthKey} className={cellNum}>{moneyFin(mes.investimento)}</td>
                    ))}
                    <td className={cellNum}>{avaliacao.meses.length > 1 ? moneyFin(avaliacao.consolidado.investimento) : ""}</td>
                    <td className={cellNum} />
                    <td className={cellNum} />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-brand-oliva/14 bg-white/60 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-brand-musgo">Planilha do dia a dia · {new Date(`${month}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
            <p className="text-xs text-muted-foreground">
              {planilha.diasSeparados}/{planilha.diasComMovimento} dias com entrada já marcados como separados
            </p>
          </div>
          {linhasVisiveis.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Mês ainda não começou — a planilha nasce dia a dia.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1400px] text-xs sm:text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-white/90 px-2 py-1.5 text-left">Dia</th>
                    <th className="px-2 py-1.5 text-right">PIX</th>
                    <th className="px-2 py-1.5 text-right">Dinheiro</th>
                    <th className="px-2 py-1.5 text-right">Débito</th>
                    <th className="px-2 py-1.5 text-right">Crédito</th>
                    <th className="px-2 py-1.5 text-right">Bruto</th>
                    <th className="px-2 py-1.5 text-right">Taxas</th>
                    <th className="px-2 py-1.5 text-right font-bold text-brand-musgo">Entrou (líquido)</th>
                    <th className="px-2 py-1.5 text-right">Disponível</th>
                    <th className="px-2 py-1.5 text-right">Impostos</th>
                    <th className="px-2 py-1.5 text-right">Lucro</th>
                    <th className="px-2 py-1.5 text-right">Médico</th>
                    <th className="px-2 py-1.5 text-right font-bold text-brand-musgo">Fica p/ gastar</th>
                    <th className="px-2 py-1.5 text-right">Acumulado p/ gastar</th>
                    <th className="px-2 py-1.5 text-right">Gasto no dia</th>
                    <th className="px-2 py-1.5 text-right">Saldo envelope</th>
                    <th className="px-2 py-1.5 text-center">Fechamento</th>
                    <th className="px-2 py-1.5 text-center">Separado?</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasVisiveis.map((linha) => {
                    const semMovimento = linha.total < 0.005 && linha.usado.operacional < 0.005;
                    return (
                      <tr
                        key={linha.dia}
                        className={cn(
                          "border-t border-brand-oliva/10",
                          linha.fimDeSemana && "bg-brand-papel/50",
                          semMovimento && "text-muted-foreground/70",
                          linha.marca?.separado && "bg-emerald-50/50",
                        )}
                      >
                        <td className="sticky left-0 z-10 bg-white/90 px-2 py-1.5 font-semibold text-brand-tinta">
                          {diaCurto(linha.dia)}
                          {linha.comprovantesPendentes ? (
                            <span className="ml-1 text-[10px] font-normal text-brand-dourado" title="pagamentos sem comprovante">
                              · {linha.comprovantesPendentes} s/ comprov.
                            </span>
                          ) : null}
                        </td>
                        <td className={cellNum}>{linha.pix ? moneyFin(linha.pix) : "—"}</td>
                        <td className={cellNum}>{linha.dinheiro ? moneyFin(linha.dinheiro) : "—"}</td>
                        <td className={cellNum}>{linha.debito ? moneyFin(linha.debito) : "—"}</td>
                        <td className={cellNum}>{linha.credito ? moneyFin(linha.credito) : "—"}</td>
                        <td className={cellNum}>{linha.total ? moneyFin(linha.total) : "—"}</td>
                        <td className={cn(cellNum, "text-red-700/80")}>{linha.taxas ? `−${moneyFin(linha.taxas)}` : "—"}</td>
                        <td className={cn(cellNum, "font-bold text-brand-musgo")}>{linha.liquido ? moneyFin(linha.liquido) : "—"}</td>
                        <td className={cellNum}>
                          {linha.disponivel ? moneyFin(linha.disponivel) : "—"}
                          {linha.antecipacao > 0.005 ? (
                            <span className="block text-[10px] font-normal text-muted-foreground" title="custo de resgatar hoje o cartão de ontem em vez de esperar os 31 dias">
                              puxar hoje: −{moneyFin(linha.antecipacao)}
                            </span>
                          ) : null}
                        </td>
                        <td className={cellNum}>
                          {linha.reservado.impostos ? moneyFin(linha.reservado.impostos) : "—"}
                          <span className="ml-1 text-[10px] text-muted-foreground">{pct(linha.percentuais.impostos)}</span>
                        </td>
                        <td className={cellNum}>
                          {linha.reservado.lucro ? moneyFin(linha.reservado.lucro) : "—"}
                          <span className="ml-1 text-[10px] text-muted-foreground">{pct(linha.percentuais.lucro)}</span>
                        </td>
                        <td className={cellNum}>
                          {linha.reservado.medicoExecutor ? moneyFin(linha.reservado.medicoExecutor) : "—"}
                          <span className="ml-1 text-[10px] text-muted-foreground">{pct(linha.percentuais.medicoExecutor)}</span>
                        </td>
                        <td className={cn(cellNum, "font-bold text-brand-musgo")}>
                          {linha.reservado.operacional ? moneyFin(linha.reservado.operacional) : "—"}
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{pct(linha.percentuais.operacional)}</span>
                        </td>
                        <td className={cellNum}>{moneyFin(linha.acumulado.reservado.operacional)}</td>
                        <td className={cellNum}>{linha.usado.operacional ? moneyFin(linha.usado.operacional) : "—"}</td>
                        <td className={cn(cellNum, linha.acumulado.saldo.operacional < -0.005 ? "text-red-700" : "text-emerald-700")}>
                          {moneyFin(linha.acumulado.saldo.operacional)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {linha.fechamento === "CONFERIDO" ? (
                            <Badge className="bg-emerald-100 text-emerald-800">conferido</Badge>
                          ) : linha.fechamento === "DIVERGENTE" ? (
                            <Badge className="bg-red-100 text-red-700">divergente</Badge>
                          ) : linha.total ? (
                            <span className="text-[11px] text-muted-foreground">sem fechamento</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {linha.total || linha.marca ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleSeparado(linha.dia, linha.marca)}
                                disabled={!canEdit}
                                aria-label={linha.marca?.separado ? `Dia ${diaCurto(linha.dia)} separado` : `Marcar dia ${diaCurto(linha.dia)} como separado`}
                                className={cn(
                                  "inline-flex h-7 w-7 items-center justify-center rounded-md border",
                                  linha.marca?.separado ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-brand-oliva/30 bg-white text-brand-oliva/40",
                                  !canEdit && "cursor-not-allowed opacity-60",
                                )}
                              >
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => editaObservacao(linha.dia, linha.marca)}
                                disabled={!canEdit}
                                className={cn("text-[11px] underline-offset-2 hover:underline", linha.marca?.observacao ? "text-brand-musgo" : "text-muted-foreground")}
                                title={linha.marca?.observacao || "adicionar observação"}
                              >
                                {linha.marca?.observacao ? "obs ✎" : "obs"}
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
                  <tr className="border-t-2 border-brand-musgo/40 bg-brand-creme/50 font-semibold text-brand-tinta">
                    <td className="sticky left-0 z-10 bg-brand-creme px-2 py-2">Total do mês</td>
                    <td className={cellNum}>{moneyFin(linhasVisiveis.reduce((s, l) => s + l.pix, 0))}</td>
                    <td className={cellNum}>{moneyFin(linhasVisiveis.reduce((s, l) => s + l.dinheiro, 0))}</td>
                    <td className={cellNum}>{moneyFin(linhasVisiveis.reduce((s, l) => s + l.debito, 0))}</td>
                    <td className={cellNum}>{moneyFin(linhasVisiveis.reduce((s, l) => s + l.credito, 0))}</td>
                    <td className={cellNum}>{moneyFin(planilha.totais.total)}</td>
                    <td className={cn(cellNum, "text-red-700/80")}>−{moneyFin(planilha.totais.taxas)}</td>
                    <td className={cn(cellNum, "text-brand-musgo")}>{moneyFin(planilha.totais.liquido)}</td>
                    <td className={cellNum}>{moneyFin(planilha.totais.disponivel)}</td>
                    <td className={cellNum}>{moneyFin(planilha.totais.reservado.impostos)}</td>
                    <td className={cellNum}>{moneyFin(planilha.totais.reservado.lucro)}</td>
                    <td className={cellNum}>{moneyFin(planilha.totais.reservado.medicoExecutor)}</td>
                    <td className={cn(cellNum, "text-brand-musgo")}>{moneyFin(planilha.totais.reservado.operacional)}</td>
                    <td className={cellNum} />
                    <td className={cellNum}>{moneyFin(planilha.totais.usado.operacional)}</td>
                    <td className={cn(cellNum, saldoOperacional < -0.005 ? "text-red-700" : "text-emerald-700")}>{moneyFin(saldoOperacional)}</td>
                    <td className={cellNum} />
                    <td className={cellNum} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            <strong className="text-brand-musgo">Como ler:</strong> &quot;Bruto&quot; é tudo que foi lançado nas comandas do dia (crédito incluído);
            &quot;Taxas&quot; é a maquininha (débito 0,7% · crédito à vista 1,7% · parcelado 2,39%) mais o PIX (0,6%, teto R$ 150); &quot;Entrou (líquido)&quot;
            é o que sobrou — e é sobre ele que os envelopes são repartidos. &quot;Disponível&quot; é PIX/dinheiro do dia + o cartão do dia útil
            anterior (pulando feriado), já líquido: a Rede deixa o crédito à disposição em D+1 e a clínica decide quando puxar; &quot;puxar hoje&quot;
            é o custo da antecipação (TAD = SELIC a.m. + 0,9%, pelos dias que faltam até os 31 de cada parcela). Esperar os 31 dias custa zero. &quot;Gasto no dia&quot; são as contas pagas no dia que pertencem ao operacional (obra,
            impostos, sócios e repasse do médico têm envelope próprio). Marque &quot;Separado&quot; quando as transferências do dia forem feitas.
          </p>
        </section>
      </div>
    </AccessGate>
  );
}
