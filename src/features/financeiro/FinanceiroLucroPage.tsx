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
  conferirRecebiveis,
  defaultLucroConfig,
  diasUteisDoMes,
  mesesAnteriores,
  normalizaConfig,
  registrarConferencia,
  reguaNoDia,
  selicDaConfig,
  subirDegrau,
  type LucroConfig,
  type MarcaDiaLucro,
  type ReguaLucro,
} from "./lucroInteligente";
import { taxaAntecipacaoMensal } from "./recebiveisRede";
import { useFinanceiro } from "./useFinanceiro";

const configStorageKey = "app-bratan-fin-lucro-config";
const marcasStorageKey = "app-bratan-fin-lucro-dias";

const reguaLabels: Record<keyof ReguaLucro, string> = {
  impostos: "Impostos (% do líquido)",
  lucroMensal: "Lucro dos sócios (R$ por mês)",
  medicoExecutor: "Médico executor (% do prescrito)",
};

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
  return `impostos ${pct(regua.impostos)} do líquido · lucro ${moneyFin(regua.lucroMensal)}/mês · médico executor ${pct(regua.medicoExecutor)} do prescrito`;
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

  const reguaHoje = reguaNoDia(config, hoje);
  const diasUteisHoje = diasUteisDoMes(hoje.slice(0, 7)).length;
  const cotaHoje = diasUteisHoje ? reguaHoje.lucroMensal / diasUteisHoje : 0;
  const linhaDeHoje = planilha.linhas.find((linha) => linha.dia === hoje) ?? null;
  const degrauMaisRecente = [...config.degraus].sort((a, b) => a.desde.localeCompare(b.desde)).at(-1) ?? config.degraus[0];
  const comprometido = planilha.totais.reservado.impostos + planilha.totais.reservado.lucro + planilha.totais.reservado.medicoExecutor;
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
                <InfoTip title="A régua da aula (Dr. Thiago Volpi) e a do Instituto">
                  <strong>Vendas − Lucro = Despesas.</strong> Em vez de gastar primeiro e lucrar o que sobra, a clínica
                  decide o lucro e se vira com o resto. De cada real que entra (já sem as taxas), o app separa{" "}
                  <strong>impostos</strong> (% do líquido), o <strong>lucro dos sócios</strong> — aqui um valor fixo por
                  mês, dividido pelos dias úteis (Lucas: &quot;não é em porcentagem, é sempre esse valor&quot;) — e o{" "}
                  <strong>médico executor</strong>: 50% do que o Dr. Daniel prescreveu no dia; a metade da clínica é que
                  carrega imposto, lucro e despesas. O que sobra é o único dinheiro para gastar. Lucro e impostos vão para
                  contas de difícil acesso. &quot;Não é meta, é decisão.&quot; (Exemplo da aula, só para referência: 25%
                  lucro · 16,6% impostos · 28% executor → sobram 30,4%.)
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Régua de hoje: impostos {pct(reguaHoje.impostos)} do líquido · lucro {moneyFin(reguaHoje.lucroMensal)}/mês (
                <strong className="text-brand-musgo">{moneyFin(cotaHoje)} por dia útil</strong>, {diasUteisHoje} em {mesLongo(hoje.slice(0, 7))}) · médico executor{" "}
                {pct(reguaHoje.medicoExecutor)} do que ele prescreveu → o que sobra fica para gastar. As taxas da maquininha e do PIX saem antes
                de repartir. O crédito conta no dia do lançamento e fica disponível no dia útil seguinte; puxar antes dos 31 dias custa a
                antecipação (TAD {pct(taxaAntecipacaoMensal(selicDaConfig(config)) * 100)} ao mês) — a planilha mostra quanto.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" aria-label="Mês" />
              <Button type="button" variant={showConfig ? "default" : "outline"} onClick={() => setShowConfig((value) => !value)}>
                <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Régua
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
                <h2 className="text-lg font-bold text-brand-musgo">A régua</h2>
                <p className="text-xs text-muted-foreground">
                  Editando o degrau que vale desde {degrauMaisRecente ? diaCurto(degrauMaisRecente.desde) : "—"}. Dias anteriores continuam com o degrau da época.
                </p>
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={novoDegrauHoje} disabled={config.degraus.some((d) => d.desde === hoje)}>
                    Novo degrau a partir de hoje
                  </Button>
                  <Button type="button" size="sm" onClick={subirLucro} disabled={reguaHoje.lucroMensal >= config.alvo.lucroMensal}>
                    <TrendingUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Subir lucro +R$ 2.000/mês
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-brand-oliva/14 bg-white/70 p-3">
                <p className="text-sm font-semibold text-brand-musgo">Decisão de hoje</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["impostos", "lucroMensal", "medicoExecutor"] as const).map((campo) => (
                    <label key={campo} className="text-xs text-muted-foreground">
                      {reguaLabels[campo]}
                      <Input
                        key={`${degrauMaisRecente?.desde}-${campo}-${degrauMaisRecente?.[campo]}`}
                        defaultValue={degrauMaisRecente ? valorDoCampo(degrauMaisRecente, campo) : ""}
                        onBlur={(event) => editaDegrau(campo, event.target.value)}
                        inputMode="decimal"
                        disabled={!canEdit}
                        className="mt-1 h-9"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-sm text-brand-tinta">
                  Cota do lucro por dia útil: <strong>{moneyFin(cotaHoje)}</strong>
                  <span className="ml-1 text-xs text-muted-foreground">({diasUteisHoje} dias úteis em {mesLongo(hoje.slice(0, 7))}; muda a cada mês)</span>
                </p>
              </div>
              <div className="rounded-lg border border-brand-oliva/14 bg-white/70 p-3">
                <p className="text-sm font-semibold text-brand-musgo">Alvo (onde queremos chegar)</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["impostos", "lucroMensal", "medicoExecutor"] as const).map((campo) => (
                    <label key={campo} className="text-xs text-muted-foreground">
                      {reguaLabels[campo]}
                      <Input
                        key={`alvo-${campo}-${config.alvo[campo]}`}
                        defaultValue={valorDoCampo(config.alvo, campo)}
                        onBlur={(event) => editaAlvo(campo, event.target.value)}
                        inputMode="decimal"
                        disabled={!canEdit}
                        className="mt-1 h-9"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  A planilha de precificação calcula os 50% do médico DEPOIS de imposto/cartão, comissão e custo de sala (Programa de R$ 6.997 →
                  R$ 2.515 para o médico); aqui é 50% do valor prescrito, como o Lucas descreveu — se a regra for a da planilha, ajuste o percentual.
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
                  .map((degrau) => `${diaCurto(degrau.desde)} → ${descreveRegua(degrau)}`)
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
              {moneyFin(planilha.totais.reservado.medicoExecutor)} (50% de {moneyFin(planilha.totais.prescrito)} prescritos)
            </p>
          </div>
          <div className={cn("rounded-lg border p-4", saldoOperacional < -0.005 ? "border-red-200 bg-red-50/60" : "border-brand-oliva/14 bg-white/55")}>
            <Wallet className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-brand-musgo">
              Cabe gastar no mês
              <InfoTip title="Cabe gastar × contas pagas">
                &quot;Cabe gastar&quot; é a soma do que sobrou para o operacional em cada dia (líquido − impostos − parte do médico − cota do lucro).
                &quot;Contas pagas&quot; são as contas operacionais que já saíram no mês (sem obra, impostos, sócios, empréstimos e repasse do médico —
                esses têm envelope próprio). Se as contas passam do que cabe, o número fica vermelho: é a despesa acima da régua que a aula manda enxugar.
              </InfoTip>
            </p>
            <p className={cn("text-2xl font-bold", planilha.totais.reservado.operacional < -0.005 ? "text-red-700" : "text-brand-tinta")}>
              {moneyFin(planilha.totais.reservado.operacional)}
            </p>
            <p className="text-xs text-muted-foreground">contas operacionais já pagas: {moneyFin(planilha.totais.usado.operacional)}</p>
            <p className={cn("text-xs font-semibold", saldoOperacional < -0.005 ? "text-red-700" : "text-emerald-700")}>
              {saldoOperacional < -0.005 ? `já passou do que cabe em ${moneyFin(-saldoOperacional)}` : `ainda cabem ${moneyFin(saldoOperacional)} de contas`}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
            <Scale className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Disponível para separar hoje</p>
            <p className="text-2xl font-bold text-brand-tinta">{linhaDeHoje ? moneyFin(linhaDeHoje.disponivel) : "—"}</p>
            <p className="text-xs text-muted-foreground">
              {linhaDeHoje
                ? `PIX/dinheiro de hoje + cartão de ontem${linhaDeHoje.antecipacao > 0.005 ? ` · puxar o cartão hoje custa ${moneyFin(linhaDeHoje.antecipacao)}` : ""}`
                : "escolha o mês atual para ver o dia de hoje"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {planilha.diasPendentes ? `${planilha.diasPendentes} dia(s) com entrada ainda sem marcar "separado"` : "todos os dias com entrada já marcados"}
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
                as outras contas fora obra e empréstimos. <strong>Lucro</strong> é o que sobrou depois de impostos, médico e
                operacional — inclui o que os sócios já levaram. Obra, empréstimos e investimento ficam à parte: a aula
                manda tratar dívida de reforma como lucro reinvestido.
              </InfoTip>
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">Envelope</th>
                    {avaliacao.meses.map((mes) => (
                      <th key={mes.monthKey} className="px-2 py-1.5 text-right">{mesLabel(mes.monthKey)}</th>
                    ))}
                    <th className="px-2 py-1.5 text-right">{avaliacao.meses.length > 1 ? "Soma" : ""}</th>
                    <th className="px-2 py-1.5 text-right text-brand-musgo">Régua de hoje</th>
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
                  <tr className="border-t border-brand-oliva/10 text-muted-foreground">
                    <td className="px-2 py-1.5">↳ tratamentos prescritos pelo Dr. (base dos 50%)</td>
                    {avaliacao.meses.map((mes) => (
                      <td key={mes.monthKey} className={cellNum}>{moneyFin(mes.prescrito)}</td>
                    ))}
                    <td className={cellNum}>{avaliacao.meses.length > 1 ? moneyFin(avaliacao.consolidado.prescrito) : ""}</td>
                    <td className={cellNum} />
                    <td className={cellNum} />
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
                          {campo === "medicoExecutor" && mes.prescrito > 0 ? (
                            <span className="block text-[10px] text-muted-foreground">pela régua: {moneyFin((mes.prescrito * reguaHoje.medicoExecutor) / 100)}</span>
                          ) : null}
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
                      <td className={cn(cellNum, "text-brand-musgo")}>
                        {campo === "impostos" ? pct(reguaHoje.impostos) : null}
                        {campo === "medicoExecutor" ? `${pct(reguaHoje.medicoExecutor)} do prescrito` : null}
                        {campo === "lucro" ? `${moneyFin(reguaHoje.lucroMensal)}/mês` : null}
                        {campo === "operacional" ? "o que sobra" : null}
                      </td>
                      <td className={cn(cellNum, "text-brand-musgo")}>
                        {campo === "impostos" ? pct(config.alvo.impostos) : null}
                        {campo === "medicoExecutor" ? `${pct(config.alvo.medicoExecutor)} do prescrito` : null}
                        {campo === "lucro" ? `${moneyFin(config.alvo.lucroMensal)}/mês` : null}
                        {campo === "operacional" ? "o que sobra" : null}
                      </td>
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
                    <td className="px-2 py-1.5">Obra, empréstimos e investimento (à parte — a aula: é lucro reinvestido)</td>
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
          <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
            Conferência com a maquininha
            <InfoTip title="Bater o a receber">
              O app soma as parcelas de cartão que ainda vão cair (líquidas, pela agenda de 31 dias das comandas). Abra
              o portal da Rede, veja o &quot;a receber&quot; de hoje e digite aqui. Diferença pequena é bandeira (Elo/Amex
              paga mais) ou data; diferença grande é comanda faltando ou antecipação já puxada. O contrato ainda pede
              que pelo menos <strong>10% do volume de crédito</strong> seja antecipado com a TAD — esperar 31 dias em tudo
              derruba as taxas com desconto.
            </InfoTip>
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-brand-oliva/14 bg-white/70 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">O app espera receber</p>
              <p className="text-2xl font-bold text-brand-tinta">{moneyFin(conferencia.calculado)}</p>
              <p className="text-xs text-muted-foreground">
                {conferencia.parcelas} parcela(s)
                {conferencia.porMes.length ? ` · ${conferencia.porMes.map((m) => `${mesLabel(m.mes)} ${moneyFin(m.liquido)}`).join(" · ")}` : ""}
              </p>
            </div>
            <div className="rounded-lg border border-brand-oliva/14 bg-white/70 p-3">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                A Rede mostra hoje (a receber)
                <Input
                  key={`conf-${conferencia.informadoEm}-${conferencia.informado}`}
                  defaultValue={conferencia.informadoEm === hoje && conferencia.informado !== null ? conferencia.informado.toFixed(2).replace(".", ",") : ""}
                  placeholder="0,00"
                  onBlur={(event) => registraConferenciaRede(event.target.value)}
                  inputMode="decimal"
                  disabled={!canEdit}
                  className="mt-1 h-10"
                />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {conferencia.informadoEm ? `última conferência em ${diaCurto(conferencia.informadoEm)}` : "ainda sem conferência"}
              </p>
            </div>
            <div
              className={cn(
                "rounded-lg border p-3",
                conferencia.bate === null ? "border-brand-oliva/14 bg-white/70" : conferencia.bate ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60",
              )}
            >
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Diferença (Rede − app)</p>
              <p className={cn("text-2xl font-bold", conferencia.bate === false ? "text-red-700" : "text-brand-tinta")}>
                {conferencia.diferenca === null ? "—" : moneyFin(conferencia.diferenca)}
              </p>
              <p className="text-xs text-muted-foreground">
                {conferencia.bate === null
                  ? "digite o valor da Rede para bater"
                  : conferencia.bate
                    ? "bateu (folga de R$ 50 ou 0,5%)"
                    : conferencia.diferenca! < 0
                      ? "a Rede mostra menos: antecipação já puxada ou comanda a mais no app"
                      : "a Rede mostra mais: comanda faltando no app ou venda lançada em outro dia"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Compromisso RAV do contrato: antecipar ao menos 10% do volume de crédito do mês —{" "}
            <strong className="text-brand-musgo">{moneyFin(conferencia.minimoAntecipar)}</strong> sobre {moneyFin(conferencia.volumeCartaoMes)} até agora em{" "}
            {mesLongo(hoje.slice(0, 7))}.
            {(config.conferencias ?? []).length > 1
              ? ` Histórico: ${[...(config.conferencias ?? [])].slice(-5).map((c) => `${diaCurto(c.dia)} ${moneyFin(c.aReceberRede)}`).join(" · ")}.`
              : ""}
          </p>
        </section>

        <section className="rounded-lg border border-brand-oliva/14 bg-white/60 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-brand-musgo">Planilha do dia a dia · {new Date(`${month}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
            <p className="text-xs text-muted-foreground">
              {planilha.diasSeparados}/{planilha.diasComMovimento} dias com entrada já marcados como separados · cota do lucro {moneyFin(planilha.cotaLucroDiaUtil)} × {planilha.diasUteis} dias úteis
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
                    <th className="px-2 py-1.5 text-right">Lucro (cota)</th>
                    <th className="px-2 py-1.5 text-right">Médico (50% do prescrito)</th>
                    <th className="px-2 py-1.5 text-right font-bold text-brand-musgo">Fica p/ gastar</th>
                    <th className="px-2 py-1.5 text-right">Contas pagas (dia)</th>
                    <th className="px-2 py-1.5 text-right">Sobra ou falta (mês)</th>
                    <th className="px-2 py-1.5 text-center">Fechamento</th>
                    <th className="px-2 py-1.5 text-center">Separado?</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasVisiveis.map((linha) => {
                    const semMovimento = linha.total < 0.005 && linha.usado.operacional < 0.005 && linha.regua.cotaLucro < 0.005;
                    return (
                      <tr
                        key={linha.dia}
                        className={cn(
                          "border-t border-brand-oliva/10",
                          !linha.diaUtil && "bg-brand-papel/50",
                          semMovimento && "text-muted-foreground/70",
                          linha.marca?.separado && "bg-emerald-50/50",
                        )}
                      >
                        <td className="sticky left-0 z-10 bg-white/90 px-2 py-1.5 font-semibold text-brand-tinta">
                          {diaCurto(linha.dia)}
                          {!linha.diaUtil && !linha.fimDeSemana ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">feriado</span> : null}
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
                          <span className="ml-1 text-[10px] text-muted-foreground">{pct(linha.regua.impostos)}</span>
                        </td>
                        <td className={cellNum}>{linha.reservado.lucro ? moneyFin(linha.reservado.lucro) : "—"}</td>
                        <td className={cellNum}>
                          {linha.reservado.medicoExecutor ? moneyFin(linha.reservado.medicoExecutor) : "—"}
                          {linha.prescrito ? <span className="block text-[10px] text-muted-foreground">de {moneyFin(linha.prescrito)}</span> : null}
                        </td>
                        <td className={cn(cellNum, "font-bold", linha.reservado.operacional < -0.005 ? "text-red-700" : "text-brand-musgo")}>
                          {linha.total || linha.regua.cotaLucro ? moneyFin(linha.reservado.operacional) : "—"}
                        </td>
                        <td className={cellNum}>{linha.usado.operacional ? moneyFin(linha.usado.operacional) : "—"}</td>
                        <td className={cn(cellNum, linha.acumulado.saldo.operacional < -0.005 ? "text-red-700" : "text-emerald-700")}>
                          {linha.acumulado.saldo.operacional < -0.005 ? `falta ${moneyFin(-linha.acumulado.saldo.operacional)}` : `sobra ${moneyFin(linha.acumulado.saldo.operacional)}`}
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
                    <td className={cellNum}>
                      {moneyFin(planilha.totais.reservado.medicoExecutor)}
                      <span className="block text-[10px] font-normal text-muted-foreground">de {moneyFin(planilha.totais.prescrito)}</span>
                    </td>
                    <td className={cn(cellNum, planilha.totais.reservado.operacional < -0.005 ? "text-red-700" : "text-brand-musgo")}>{moneyFin(planilha.totais.reservado.operacional)}</td>
                    <td className={cellNum}>{moneyFin(planilha.totais.usado.operacional)}</td>
                    <td className={cn(cellNum, saldoOperacional < -0.005 ? "text-red-700" : "text-emerald-700")}>
                      {saldoOperacional < -0.005 ? `falta ${moneyFin(-saldoOperacional)}` : `sobra ${moneyFin(saldoOperacional)}`}
                    </td>
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
            é o que sobrou. &quot;Impostos&quot; é a % do líquido; &quot;Lucro (cota)&quot; é o lucro do mês dividido pelos dias úteis — vale todo dia útil, mesmo
            sem entrada; &quot;Médico&quot; é a metade dos tratamentos prescritos no dia; &quot;Fica p/ gastar&quot; é o que sobra (negativo quando o dia não
            paga a régua). &quot;Disponível&quot; é PIX/dinheiro do dia + o cartão do dia útil anterior (pulando feriado), já líquido: a Rede deixa o crédito
            à disposição em D+1 e a clínica decide quando puxar; &quot;puxar hoje&quot; é o custo da antecipação (TAD = SELIC a.m. + 0,9%, pelos dias que
            faltam até os 31 de cada parcela). &quot;Contas pagas (dia)&quot; são as contas operacionais pagas naquele dia (obra, impostos, sócios,
            empréstimos e repasse do médico têm envelope próprio). &quot;Sobra ou falta (mês)&quot; compara, do dia 1 até ali, tudo que ficou para gastar
            com tudo que já foi pago. Marque &quot;Separado&quot; quando as transferências do dia forem feitas.
          </p>
        </section>
      </div>
    </AccessGate>
  );
}
