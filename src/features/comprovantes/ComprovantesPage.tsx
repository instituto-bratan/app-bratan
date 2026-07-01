import { useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileText, ImageIcon, RotateCcw, UploadCloud } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetalButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canComprovantes, cargoLabels, isCoordenacao } from "@/lib/access";
import { formatShortTime, readLocalValue, writeLocalValue } from "@/lib/localStore";
import {
  createRemoteEstorno,
  listRemoteComprovantes,
  listRemotePagamentos,
  softDeleteRemoteComprovante,
  uploadRemoteComprovante,
} from "@/lib/remoteData";
import { prepareSharePointDispatch } from "@/lib/sharepoint";
import { cn } from "@/lib/utils";
import type { ComprovanteTipo, FormaPagamento } from "@/types/database";
import { loadInteligencia360State, saveInteligencia360State } from "@/features/inteligencia360/inteligencia360Data";
import { pagamentosStorageKey, type PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import {
  applyComprovanteToPagamentos,
  comprovantesAccept,
  comprovantesStorageKey,
  formatFileSize,
  formaLabels,
  isAcceptedComprovante,
  isInsideFilter,
  money,
  receivableFromComprovante,
  type ComprovanteRecord,
  type PeriodoFiltro,
} from "./comprovantesData";

function createId() {
  return `comprovante-${crypto.randomUUID?.() ?? Date.now()}`;
}

function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ComprovantesPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localRecords, setLocalRecords] = useState<ComprovanteRecord[]>(() => readLocalValue(comprovantesStorageKey, []));
  const [localPagamentos, setLocalPagamentos] = useState<PagamentoLembrete[]>(() => readLocalValue(pagamentosStorageKey, []));
  const [filter, setFilter] = useState<PeriodoFiltro>("dia");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pacienteReferencia, setPacienteReferencia] = useState("");
  const [pagamentoLembreteId, setPagamentoLembreteId] = useState("");
  const [alimentarRecebiveis360, setAlimentarRecebiveis360] = useState(true);
  const [valor, setValor] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | "">("");
  const [observacao, setObservacao] = useState("");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const comprovantesQuery = useQuery({
    queryKey: ["comprovantes", pessoa?.cargo],
    queryFn: () => listRemoteComprovantes(pessoa!.cargo),
    enabled: useRemote && Boolean(pessoa),
  });
  const pagamentosQuery = useQuery({
    queryKey: ["pagamentos-lembretes"],
    queryFn: listRemotePagamentos,
    enabled: useRemote && Boolean(pessoa),
  });
  const uploadMutation = useMutation({
    mutationFn: uploadRemoteComprovante,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comprovantes"] }),
  });
  const estornoMutation = useMutation({
    mutationFn: createRemoteEstorno,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comprovantes"] }),
  });
  const softDeleteMutation = useMutation({
    mutationFn: softDeleteRemoteComprovante,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comprovantes"] }),
  });
  const records = useRemote ? comprovantesQuery.data ?? [] : localRecords;
  const pagamentos = useRemote ? pagamentosQuery.data ?? [] : localPagamentos;
  const pagamentosAbertos = useMemo(
    () => pagamentos.filter((record) => !record.deletedAt && record.status === "aberto"),
    [pagamentos],
  );

  const visibleRecords = useMemo(
    () =>
      records
        .filter((record) => !record.deletedAt)
        .filter((record) => isInsideFilter(record.anexadoEm, filter))
        .sort((a, b) => new Date(b.anexadoEm).getTime() - new Date(a.anexadoEm).getTime()),
    [filter, records],
  );

  function persist(nextRecords: ComprovanteRecord[]) {
    setLocalRecords(nextRecords);
    writeLocalValue(comprovantesStorageKey, nextRecords);
  }

  function resetCaptureForm() {
    setPacienteReferencia("");
    setPagamentoLembreteId("");
    setValor("");
    setFormaPagamento("");
    setObservacao("");
    setAlimentarRecebiveis360(true);
    if (inputRef.current) inputRef.current.value = "";
  }

  function selectPagamento(id: string) {
    setPagamentoLembreteId(id);
    const pagamento = pagamentosAbertos.find((record) => record.id === id);
    if (!pagamento) return;
    setPacienteReferencia(pagamento.pacienteNome);
    setValor(String(pagamento.valorPendente).replace(".", ","));
    if (!observacao.trim()) {
      setObservacao(`Baixa da pendência combinada para ${pagamento.dataPrevista}.`);
    }
  }

  function syncLocalFinancialLinks(comprovantes: ComprovanteRecord[]) {
    const nextPagamentos = comprovantes.reduce(applyComprovanteToPagamentos, localPagamentos);
    setLocalPagamentos(nextPagamentos);
    writeLocalValue(pagamentosStorageKey, nextPagamentos);

    const receivables = comprovantes.flatMap((comprovante) => {
      const receivable = receivableFromComprovante(comprovante);
      return receivable ? [receivable] : [];
    });
    if (!receivables.length) return;

    const current360 = loadInteligencia360State();
    const existingIds = new Set(receivables.map((record) => record.id));
    saveInteligencia360State({
      ...current360,
      receivables: [...receivables, ...current360.receivables.filter((record) => !existingIds.has(record.id))],
    });
  }

  async function attach(files: FileList | File[]) {
    const nextFiles = Array.from(files);
    const acceptedFiles = nextFiles.filter(isAcceptedComprovante);

    if (!acceptedFiles.length) {
      setError("Anexe JPG, PNG, HEIC ou PDF.");
      return;
    }

    const parsedValor = valor ? parseMoneyInput(valor) : undefined;
    const paciente = pacienteReferencia.trim();

    if (useRemote && pessoa) {
      try {
        await Promise.all(
          acceptedFiles.map((file, index) =>
            uploadMutation.mutateAsync({
              pessoa,
              file,
              pacienteReferencia: paciente || undefined,
              pagamentoLembreteId: pagamentoLembreteId || undefined,
              valor: Number.isFinite(parsedValor) ? parsedValor : undefined,
              formaPagamento: formaPagamento || undefined,
              observacao: observacao.trim() || undefined,
              alimentarRecebiveis360: alimentarRecebiveis360 && index === 0,
            }),
          ),
        );

        setError(null);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["pagamentos-lembretes"] }),
          queryClient.invalidateQueries({ queryKey: ["inteligencia-360-state"] }),
        ]);
        resetCaptureForm();
      } catch {
        setError("Não foi possível anexar e vincular no Supabase. Confira bucket privado, RLS, migrations e permissões.");
      }

      return;
    }

    const now = new Date().toISOString();
    const nextRecords = acceptedFiles.map((file, index) => {
      const id = createId();
      return {
        id,
        tipo: "entrada" as ComprovanteTipo,
        arquivoNome: file.name,
        arquivoTipo: file.type || file.name.split(".").pop()?.toLowerCase() || "arquivo",
        arquivoTamanho: file.size,
        anexadoEm: now,
        anexadoPor: pessoa?.nome ?? "Equipe Bratan",
        anexadoPorCargo: pessoa?.cargo ?? "recepcionista",
        pacienteReferencia: paciente || undefined,
        pagamentoLembreteId: pagamentoLembreteId || undefined,
        inteligencia360ReceivableId: paciente && Number.isFinite(parsedValor) && alimentarRecebiveis360 && index === 0 ? `recv-${id}` : undefined,
        valor: Number.isFinite(parsedValor) ? parsedValor : undefined,
        formaPagamento: formaPagamento || undefined,
        observacao: observacao.trim() || undefined,
        sharePoint: prepareSharePointDispatch(id, file.name),
      };
    });

    const nextPreviewUrls = acceptedFiles.reduce<Record<string, string>>((acc, file, index) => {
      if (file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".heic")) {
        acc[nextRecords[index].id] = URL.createObjectURL(file);
      }
      return acc;
    }, {});

    setError(null);
    setPreviewUrls((current) => ({ ...current, ...nextPreviewUrls }));
    persist([...nextRecords, ...records]);
    syncLocalFinancialLinks(nextRecords);
    resetCaptureForm();
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void attach(event.dataTransfer.files);
  }

  function createEstorno(record: ComprovanteRecord) {
    const confirmed = window.confirm(
      `Criar um registro de estorno para "${record.arquivoNome}"? O comprovante original será mantido sem alterações.`,
    );

    if (!confirmed) return;

    if (useRemote && pessoa) {
      void estornoMutation.mutateAsync({ pessoa, record }).catch(() => {
        setError("Não foi possível criar o estorno no Supabase.");
      });
      return;
    }

    const id = createId();
    const estorno: ComprovanteRecord = {
      id,
      tipo: "estorno",
      arquivoNome: `Estorno de ${record.arquivoNome}`,
      arquivoTipo: "registro-estorno",
      arquivoTamanho: 0,
      anexadoEm: new Date().toISOString(),
      anexadoPor: pessoa?.nome ?? "Equipe Bratan",
      anexadoPorCargo: pessoa?.cargo ?? "gestor_financeiro",
      pacienteReferencia: record.pacienteReferencia,
      pagamentoLembreteId: record.pagamentoLembreteId,
      valor: typeof record.valor === "number" ? -Math.abs(record.valor) : undefined,
      observacao: `Correção operacional do comprovante ${record.arquivoNome}.`,
      estornoDe: record.id,
      sharePoint: prepareSharePointDispatch(id, `Estorno de ${record.arquivoNome}`),
    };

    persist([estorno, ...records]);
  }

  function softDelete(record: ComprovanteRecord) {
    const confirmed = window.confirm(`Ocultar "${record.arquivoNome}" da lista? O registro não será apagado fisicamente.`);

    if (!confirmed) return;

    if (useRemote) {
      void softDeleteMutation.mutateAsync(record.id).catch(() => {
        setError("Não foi possível ocultar o comprovante no Supabase.");
      });
      return;
    }

    persist(records.map((item) => (item.id === record.id ? { ...item, deletedAt: new Date().toISOString() } : item)));
  }

  return (
    <AccessGate allowed={canComprovantes} label="Comprovantes">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="gold" className="mb-4">
                Supabase Storage privado
              </Badge>
              <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Comprovantes</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Captura interina de comprovantes para coordenação e recepção. A etapa oficial futura envia os arquivos para o SharePoint via Microsoft Graph API.
              </p>
            </div>
            <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-brand-musgo">{visibleRecords.length}</p>
              <p className="text-xs font-semibold uppercase text-brand-oliva">{useRemote ? "Supabase" : "no filtro"}</p>
            </div>
          </div>
        </motion.section>

        {comprovantesQuery.isError ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive">
                Não foi possível carregar comprovantes do Supabase. Confira bucket privado, RLS e vínculo do colaborador.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
            <div
              onDrop={onDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              className={cn(
                "grid min-h-52 place-items-center rounded-lg border border-dashed p-6 text-center transition",
                isDragging ? "border-brand-dourado bg-brand-creme/55" : "border-brand-oliva/35 bg-brand-papel/70",
              )}
            >
              <div>
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-lg bg-white/75 text-brand-musgo">
                  <UploadCloud className="h-7 w-7" aria-hidden="true" />
                </div>
                <p className="text-lg font-semibold text-brand-tinta">Arraste e solte o comprovante aqui</p>
                <p className="mt-2 text-sm text-muted-foreground">JPG, PNG, HEIC ou PDF. O registro guarda data, hora, nome e cargo de quem anexou.</p>
                <div className="mt-5">
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={comprovantesAccept}
                    className="sr-only"
                    onChange={(event) => {
                      if (event.target.files) void attach(event.target.files);
                    }}
                  />
                  <MetalButton type="button" variant="gold" onClick={() => inputRef.current?.click()}>
                    {uploadMutation.isPending ? "Anexando..." : "Anexar comprovante"}
                  </MetalButton>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pagamento-vinculado">Baixar pendência existente</Label>
                <select
                  id="pagamento-vinculado"
                  value={pagamentoLembreteId}
                  onChange={(event) => selectPagamento(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Não vincular</option>
                  {pagamentosAbertos.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.pacienteNome} · {money(record.valorPendente)}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  Ao vincular, o comprovante marca a pendência como paga e alimenta os recebíveis.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paciente-referencia">Paciente / referência</Label>
                <Input
                  id="paciente-referencia"
                  placeholder="Nome ou código simples"
                  value={pacienteReferencia}
                  onChange={(event) => setPacienteReferencia(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor">Valor opcional</Label>
                <Input id="valor" inputMode="decimal" placeholder="0,00" value={valor} onChange={(event) => setValor(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forma">Forma de pagamento</Label>
                <select
                  id="forma"
                  value={formaPagamento}
                  onChange={(event) => setFormaPagamento(event.target.value as FormaPagamento | "")}
                  className="flex h-10 w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Não informar</option>
                  {Object.entries(formaLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="observacao">Observação</Label>
                <textarea
                  id="observacao"
                  rows={3}
                  className="min-h-24 w-full resize-none rounded-lg border border-input bg-white/80 px-3 py-3 text-sm leading-6 text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Detalhe opcional"
                  value={observacao}
                  onChange={(event) => setObservacao(event.target.value)}
                />
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-brand-oliva/16 bg-white/65 p-3 text-sm leading-6">
                <input
                  type="checkbox"
                  checked={alimentarRecebiveis360}
                  onChange={(event) => setAlimentarRecebiveis360(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-brand-tinta">Alimentar Recebíveis 360</span>
                  <span className="text-muted-foreground">Com paciente e valor, este comprovante vira receita recebida no 360.</span>
                </span>
              </label>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {(["dia", "semana", "mes", "ano"] as PeriodoFiltro[]).map((periodo) => (
            <Button
              key={periodo}
              type="button"
              variant={filter === periodo ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(periodo)}
            >
              {periodo === "mes" ? "Mês" : periodo[0].toUpperCase() + periodo.slice(1)}
            </Button>
          ))}
        </div>

        <section className="space-y-3">
          {visibleRecords.length ? (
            visibleRecords.map((record, index) => (
              <motion.article
                key={record.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: index * 0.03, ease: [0.4, 0, 0.2, 1] }}
              >
                <Card className={cn("border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur", record.tipo === "estorno" && "border-destructive/30 bg-destructive/5")}>
                  <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-brand-oliva/20 bg-brand-papel text-brand-musgo">
                        {previewUrls[record.id] ? (
                          <img src={previewUrls[record.id]} alt="" className="h-full w-full object-cover" />
                        ) : record.arquivoTipo.includes("pdf") ? (
                          <FileText className="h-6 w-6" aria-hidden="true" />
                        ) : (
                          <ImageIcon className="h-6 w-6" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={record.tipo === "estorno" ? "outline" : "gold"}>{record.tipo === "estorno" ? "Estorno" : "Comprovante"}</Badge>
                          <span className="text-xs font-semibold uppercase text-brand-oliva">{formatShortTime(record.anexadoEm)}</span>
                        </div>
                        <p className="mt-2 truncate font-semibold text-brand-tinta">{record.arquivoNome}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {record.anexadoPor} · {cargoLabels[record.anexadoPorCargo]} · {formatFileSize(record.arquivoTamanho)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-brand-musgo">{money(record.valor)}</p>
                        {record.pacienteReferencia ? <p className="text-sm text-muted-foreground">Paciente/referência: {record.pacienteReferencia}</p> : null}
                        {record.formaPagamento ? <p className="text-sm text-muted-foreground">{formaLabels[record.formaPagamento]}</p> : null}
                        {record.pagamentoLembreteId ? (
                          <p className="mt-1 text-xs font-semibold uppercase text-brand-oliva">Pendência baixada pelo comprovante</p>
                        ) : null}
                        {record.inteligencia360ReceivableId ? (
                          <p className="mt-1 text-xs font-semibold uppercase text-brand-oliva">Recebíveis 360 alimentado</p>
                        ) : null}
                        {record.observacao ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{record.observacao}</p> : null}
                        <p className="mt-2 text-xs font-semibold uppercase text-brand-oliva">SharePoint: {record.sharePoint.status}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {record.tipo === "entrada" ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => createEstorno(record)}>
                          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                          Estornar
                        </Button>
                      ) : null}
                      {isCoordenacao(pessoa?.cargo) ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => softDelete(record)}>
                          Ocultar
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </motion.article>
            ))
          ) : (
            <Card className="border-brand-oliva/20 bg-white/55 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Nenhum comprovante neste período</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  Use o botão de anexo ou arraste um arquivo para iniciar a captura. Os registros são imutáveis; correções entram como estorno.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </AccessGate>
  );
}
