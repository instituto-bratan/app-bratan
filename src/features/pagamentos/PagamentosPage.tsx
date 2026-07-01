import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarClock, CheckCircle2, CircleDollarSign, Clock3, RotateCcw, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canLembretesPagamento } from "@/lib/access";
import { formatShortTime, readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { loadInteligencia360State, saveInteligencia360State } from "@/features/inteligencia360/inteligencia360Data";
import {
  createRemotePagamento,
  listRemotePagamentos,
  postponeRemotePagamento,
  softDeleteRemotePagamento,
  updateRemotePagamentoStatus,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type { PagamentoLembreteStatus } from "@/types/database";
import {
  filterPagamentos,
  formatDate,
  isPagamentoHoje,
  isPagamentoProximo,
  isPagamentoVencido,
  mergePagamentoReceivables,
  money,
  pagamentoFiltroLabels,
  pagamentosStorageKey,
  pagamentosSummary,
  pagamentoStatusLabels,
  sortPagamentos,
  type PagamentoFiltro,
  type PagamentoLembrete,
} from "./pagamentosData";

type FormState = {
  pacienteNome: string;
  valorPendente: string;
  dataPrevista: string;
  observacao: string;
};

const emptyForm: FormState = {
  pacienteNome: "",
  valorPendente: "",
  dataPrevista: todayISO(),
  observacao: "",
};

const filtros: PagamentoFiltro[] = ["abertos", "vencidos", "hoje", "proximos", "pagos", "todos"];

function createId() {
  return `pagamento-${crypto.randomUUID?.() ?? Date.now()}`;
}

function parseMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function dueBadge(record: PagamentoLembrete) {
  if (record.status !== "aberto") return pagamentoStatusLabels[record.status];
  if (isPagamentoVencido(record)) return "Vencido";
  if (isPagamentoHoje(record)) return "Hoje";
  if (isPagamentoProximo(record)) return "Próximo";
  return "Em aberto";
}

export function PagamentosPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [localRecords, setLocalRecords] = useState<PagamentoLembrete[]>(() => readLocalValue(pagamentosStorageKey, []));
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filter, setFilter] = useState<PagamentoFiltro>("abertos");
  const [error, setError] = useState<string | null>(null);
  const [postponeTarget, setPostponeTarget] = useState<string | null>(null);
  const [postponeDate, setPostponeDate] = useState(todayISO());

  const pagamentosQuery = useQuery({
    queryKey: ["pagamentos-lembretes"],
    queryFn: listRemotePagamentos,
    enabled: useRemote,
  });
  const createMutation = useMutation({
    mutationFn: createRemotePagamento,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
  });
  const statusMutation = useMutation({
    mutationFn: updateRemotePagamentoStatus,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
  });
  const postponeMutation = useMutation({
    mutationFn: postponeRemotePagamento,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: softDeleteRemotePagamento,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
  });

  const records = useRemote ? pagamentosQuery.data ?? [] : localRecords;
  const summary = useMemo(() => pagamentosSummary(records), [records]);
  const visibleRecords = useMemo(() => sortPagamentos(filterPagamentos(records, filter)), [filter, records]);

  function persist(nextRecords: PagamentoLembrete[]) {
    setLocalRecords(nextRecords);
    writeLocalValue(pagamentosStorageKey, nextRecords);
    const current360 = loadInteligencia360State();
    saveInteligencia360State({
      ...current360,
      receivables: mergePagamentoReceivables(current360.receivables, nextRecords),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const pacienteNome = form.pacienteNome.trim();
    const valorPendente = parseMoney(form.valorPendente);
    const observacao = form.observacao.trim();

    if (!pacienteNome || !form.dataPrevista || !Number.isFinite(valorPendente) || valorPendente <= 0) {
      setError("Informe paciente, valor pendente e data combinada.");
      return;
    }

    if (useRemote && pessoa) {
      try {
        await createMutation.mutateAsync({
          pessoa,
          pacienteNome,
          valorPendente,
          dataPrevista: form.dataPrevista,
          observacao: observacao || undefined,
        });
        setForm({ ...emptyForm, dataPrevista: todayISO() });
      } catch {
        setError("Não foi possível salvar no Supabase. Confira RLS e tente novamente.");
      }
      return;
    }

    const now = new Date().toISOString();
    persist([
      {
        id: createId(),
        pacienteNome,
        valorPendente,
        dataPrevista: form.dataPrevista,
        observacao: observacao || undefined,
        status: "aberto",
        criadoPor: pessoa?.nome ?? "Coordenação",
        criadoEm: now,
      },
      ...records,
    ]);
    setForm({ ...emptyForm, dataPrevista: todayISO() });
  }

  function updateLocalStatus(id: string, status: PagamentoLembreteStatus) {
    persist(
      records.map((record) =>
        record.id === id
          ? {
              ...record,
              status,
              pagoEm: status === "pago" ? new Date().toISOString() : undefined,
            }
          : record,
      ),
    );
  }

  function updateStatus(record: PagamentoLembrete, status: PagamentoLembreteStatus) {
    if (useRemote) {
      void statusMutation.mutateAsync({ id: record.id, status }).catch(() => {
        setError("Não foi possível atualizar o lembrete no Supabase.");
      });
      return;
    }

    updateLocalStatus(record.id, status);
  }

  function openPostpone(record: PagamentoLembrete) {
    setError(null);
    setPostponeTarget(record.id);
    setPostponeDate(record.dataPrevista);
  }

  function savePostpone(record: PagamentoLembrete) {
    if (!postponeDate) {
      setError("Informe uma nova data.");
      return;
    }

    if (useRemote) {
      void postponeMutation.mutateAsync({ id: record.id, dataPrevista: postponeDate }).catch(() => {
        setError("Não foi possível reagendar no Supabase.");
      });
    } else {
      persist(
        records.map((item) =>
          item.id === record.id
            ? {
                ...item,
                dataPrevista: postponeDate,
                status: "aberto",
                pagoEm: undefined,
              }
            : item,
        ),
      );
    }

    setPostponeTarget(null);
    setPostponeDate(todayISO());
  }

  function hide(record: PagamentoLembrete) {
    const confirmed = window.confirm(`Ocultar o lembrete de ${record.pacienteNome}? O histórico não será apagado fisicamente no Supabase.`);
    if (!confirmed) return;

    if (useRemote) {
      void deleteMutation.mutateAsync(record.id).catch(() => {
        setError("Não foi possível ocultar no Supabase.");
      });
      return;
    }

    persist(records.map((item) => (item.id === record.id ? { ...item, deletedAt: new Date().toISOString() } : item)));
  }

  return (
    <AccessGate allowed={canLembretesPagamento} label="Lembretes de pagamento">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="gold" className="mb-4">
                Coordenação
              </Badge>
              <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Lembretes de pagamento</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Lembretes simples por nome, valor pendente e data combinada. Cada lembrete alimenta Recebíveis 360 automaticamente.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-brand-musgo">{summary.abertos.length}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">abertos</p>
              </div>
              <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/55 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-brand-musgo">{summary.vencidos.length}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">vencidos</p>
              </div>
              <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-brand-musgo">{summary.hoje.length}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">hoje</p>
              </div>
              <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
                <p className="text-lg font-bold text-brand-musgo">{money(summary.totalAberto)}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">em aberto</p>
              </div>
            </div>
          </div>
        </motion.section>

        {pagamentosQuery.isError ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive">
                Não foi possível carregar lembretes do Supabase. Aplique a migration nova e confira seu acesso de coordenação.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
          <Card className="h-fit border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
                Novo lembrete
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="paciente">Nome</Label>
                  <Input
                    id="paciente"
                    value={form.pacienteNome}
                    placeholder="Nome da pessoa"
                    onChange={(event) => setForm((current) => ({ ...current, pacienteNome: event.target.value }))}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="valor">Valor pendente</Label>
                    <Input
                      id="valor"
                      inputMode="decimal"
                      value={form.valorPendente}
                      placeholder="Ex.: 1500,00"
                      onChange={(event) => setForm((current) => ({ ...current, valorPendente: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="data-prevista">Data combinada</Label>
                    <Input
                      id="data-prevista"
                      type="date"
                      value={form.dataPrevista}
                      onChange={(event) => setForm((current) => ({ ...current, dataPrevista: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="observacao">Observação</Label>
                  <textarea
                    id="observacao"
                    value={form.observacao}
                    rows={4}
                    placeholder="Ex.: pagou entrada, ficou de quitar o restante nesta data."
                    onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))}
                    className="flex w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <LiquidButton type="submit" size="lg" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando..." : "Salvar lembrete"}
                </LiquidButton>
              </form>
            </CardContent>
          </Card>

          <section className="space-y-4">
            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardContent className="flex flex-wrap items-center gap-2 p-3">
                {filtros.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={filter === item ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setFilter(item)}
                  >
                    {pagamentoFiltroLabels[item]}
                  </Button>
                ))}
              </CardContent>
            </Card>

            {visibleRecords.length ? (
              visibleRecords.map((record, index) => (
                <motion.article
                  key={record.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: index * 0.03, ease: [0.4, 0, 0.2, 1] }}
                >
                  <Card
                    className={cn(
                      "border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-calm",
                      isPagamentoVencido(record) && "border-destructive/35 bg-destructive/5",
                      isPagamentoHoje(record) && "border-brand-dourado/50 bg-brand-creme/35",
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Badge variant={isPagamentoVencido(record) || isPagamentoHoje(record) ? "gold" : "muted"}>
                              {dueBadge(record)}
                            </Badge>
                            <Badge variant="outline">{formatDate(record.dataPrevista)}</Badge>
                            <span className="text-xs font-semibold uppercase text-brand-oliva">
                              criado às {formatShortTime(record.criadoEm)}
                            </span>
                          </div>
                          <h2 className="text-xl font-semibold leading-tight text-brand-tinta">{record.pacienteNome}</h2>
                          <p className="mt-1 text-lg font-bold text-brand-musgo">{money(record.valorPendente)}</p>
                          {record.observacao ? <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{record.observacao}</p> : null}
                          <p className="mt-2 text-xs font-semibold uppercase text-brand-oliva">Recebíveis 360 sincronizado</p>
                          {record.pagoEm ? <p className="mt-2 text-xs font-semibold uppercase text-brand-oliva">Pago às {formatShortTime(record.pagoEm)}</p> : null}
                        </div>

                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          {record.status === "aberto" ? (
                            <>
                              <Button type="button" size="sm" onClick={() => updateStatus(record, "pago")}>
                                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Pago
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => openPostpone(record)}>
                                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                                Reagendar
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => updateStatus(record, "cancelado")}>
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <Button type="button" variant="outline" size="sm" onClick={() => updateStatus(record, "aberto")}>
                              Reabrir
                            </Button>
                          )}
                          <Button type="button" variant="ghost" size="icon" aria-label="Ocultar" onClick={() => hide(record)}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>

                      {postponeTarget === record.id ? (
                        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-brand-oliva/18 bg-white/65 p-3 sm:flex-row sm:items-end">
                          <div className="space-y-2 sm:w-48">
                            <Label htmlFor={`postpone-${record.id}`}>Nova data</Label>
                            <Input
                              id={`postpone-${record.id}`}
                              type="date"
                              value={postponeDate}
                              onChange={(event) => setPostponeDate(event.target.value)}
                            />
                          </div>
                          <Button type="button" onClick={() => savePostpone(record)}>
                            Salvar data
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setPostponeTarget(null)}>
                            Fechar
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </motion.article>
              ))
            ) : (
              <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
                <CardContent className="grid min-h-56 place-items-center p-8 text-center">
                  <div>
                    <CalendarClock className="mx-auto mb-4 h-9 w-9 text-brand-oliva" aria-hidden="true" />
                    <p className="font-semibold text-brand-tinta">Nenhum lembrete neste filtro</p>
                    <p className="mt-2 text-sm text-muted-foreground">Quando houver saldo combinado, registre a data para a equipe não depender de memória.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {summary.proximoLembrete ? (
              <Card className="border-brand-dourado/45 bg-brand-creme/35 shadow-none">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-1 h-5 w-5 shrink-0 text-brand-musgo" aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-brand-tinta">Próximo acompanhamento</p>
                      <p className="text-sm text-muted-foreground">
                        {summary.proximoLembrete.pacienteNome} · {formatDate(summary.proximoLembrete.dataPrevista)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="gold">{money(summary.proximoLembrete.valorPendente)}</Badge>
                </CardContent>
              </Card>
            ) : null}
          </section>
        </div>
      </div>
    </AccessGate>
  );
}
