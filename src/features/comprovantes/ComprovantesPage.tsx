// COMPROVANTES — Financeiro › Dia › Comprovantes.
//
// REDESENHO PAPEL & MUSGO (08/10/2026): UM cabeçalho com a frase do número
// ("Doze comprovantes no filtro, somando R$ …"), o anexar numa FOLHA (o arquivo
// à esquerda, o que ele quita à direita) e a lista com os filtros no alto, no
// mesmo bloco. Nenhuma regra mudou: quem só vê não anexa, não estorna nem oculta;
// a recepção só exclui de vez o que ela mesma anexou; o estorno é um registro novo.
import { useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ImageIcon, RotateCcw, UploadCloud, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { AvisoSoVe, avisarSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { BlocoFolha, Botao, Cabecalho, CampoBusca } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { canComprovantes, cargoLabels, isCoordenacao } from "@/lib/access";
import { formatShortTime, readLocalValue, writeLocalValue } from "@/lib/localStore";
import { parseMoneyBR } from "@/lib/money";
import {
  getRemoteComprovanteUrl,
  createRemoteEstorno,
  listRemoteComprovantes,
  listRemotePagamentos,
  hardDeleteRemoteComprovante,
  softDeleteRemoteComprovante,
  uploadRemoteComprovante,
} from "@/lib/remoteData";
import { prepareSharePointDispatch } from "@/lib/sharepoint";
import { cn } from "@/lib/utils";
import { applyContactChannels, contactDisplayName, findOrCreateCrmContact } from "@/features/crm/crmData";
import {
  contactChannelsIssue,
  contactChannelsValues,
  emptyContactChannels,
  type ContactChannelsDraft,
} from "@/features/crm/contactChannels";
import { extractPersonName } from "@/features/crm/nameMatch";
import { PatientPicker } from "@/features/crm/PatientPicker";
import { useCrmState } from "@/features/crm/useCrmState";
import type { ComprovanteTipo, FormaPagamento } from "@/types/database";
import { loadInteligencia360State, saveInteligencia360State } from "@/features/inteligencia360/inteligencia360Data";
import { pagamentosStorageKey, type PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import {
  applyComprovanteToPagamentos,
  comprovantesAccept,
  comprovantesStorageKey,
  countActiveComprovanteFiltros,
  defaultComprovanteFiltros,
  filterComprovantes,
  formatFileSize,
  formaLabels,
  isAcceptedComprovante,
  listComprovanteAutores,
  money,
  receivableFromComprovante,
  somaComprovantes,
  type ComprovanteFiltros,
  type ComprovanteRecord,
  type OrdenacaoComprovante,
  type PeriodoFiltro,
} from "./comprovantesData";
import { confirmar, toast } from "@/components/ui/avisos";
import {
  AvisoDaTela,
  CABECA_DA_FOLHA,
  CAMPO,
  CAMPO_PQ,
  CAMPO_TEXTO,
  Campo,
  Etiqueta,
  Leitura,
  MARCAR,
  RUBRICA,
  TituloDoBloco,
  Vazio,
  porExtenso,
} from "@/features/financeiro/pecasDiaPagar";

/** Botão só com ícone (limpar o dia/mês do filtro). */
const BOTAO_ICONE =
  "grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";

function createId() {
  return `comprovante-${crypto.randomUUID?.() ?? Date.now()}`;
}

function parseMoneyInput(value: string) {
  const parsed = parseMoneyBR(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ComprovantesPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localRecords, setLocalRecords] = useState<ComprovanteRecord[]>(() => readLocalValue(comprovantesStorageKey, []));
  const [localPagamentos, setLocalPagamentos] = useState<PagamentoLembrete[]>(() => readLocalValue(pagamentosStorageKey, []));
  const [filtros, setFiltros] = useState<ComprovanteFiltros>(defaultComprovanteFiltros);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pacienteReferencia, setPacienteReferencia] = useState("");
  const [patientRef, setPatientRef] = useState("");
  // Telefone/e-mail de quem entra pelo comprovante (29/07): antes nascia mudo.
  const [patientChannels, setPatientChannels] = useState<ContactChannelsDraft>(emptyContactChannels);
  const { state: crmState, persist: persistCrm } = useCrmState({ modulo: "comprovantes" });
  // "Só vê" (29/09/2026, auditoria B9): sem EDITAR em Comprovantes, não anexa, não estorna nem oculta.
  const telaComp = useNivelDaTela("comprovantes");
  const semEdicao = !telaComp.podeEditar;
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

  const visibleRecords = useMemo(() => filterComprovantes(records, filtros), [filtros, records]);
  const totalNoFiltro = useMemo(() => somaComprovantes(visibleRecords), [visibleRecords]);
  const autores = useMemo(() => listComprovanteAutores(records), [records]);
  const activeFiltros = countActiveComprovanteFiltros(filtros);

  function updateFiltros(patch: Partial<ComprovanteFiltros>) {
    setFiltros((current) => ({ ...current, ...patch }));
  }

  function persist(nextRecords: ComprovanteRecord[]) {
    setLocalRecords(nextRecords);
    writeLocalValue(comprovantesStorageKey, nextRecords);
  }

  function resetCaptureForm() {
    setPacienteReferencia("");
    setPatientRef("");
    setPatientChannels(emptyContactChannels);
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

  // Garante o paciente no CRM (vincula o existente do seletor ou cria pelo nome)
  // e devolve ref + nome canônico. Assim o comprovante fica ligado ao MESMO
  // contato do CRM/comandas/dívida/360, sem duplicar.
  function resolvePatientLink(): { ref: string; name: string } {
    const canais = contactChannelsValues(patientChannels);
    if (patientRef) {
      const existing = crmState.contacts.find((contact) => contact.id === patientRef);
      // Cadastro vinculado que estava sem número ganha o que foi digitado aqui.
      persistCrm((current) => applyContactChannels(current, patientRef, canais, pessoa?.id ?? "financeiro"));
      return { ref: patientRef, name: existing ? contactDisplayName(existing) : pacienteReferencia.trim() };
    }
    const clean = extractPersonName(pacienteReferencia) || pacienteReferencia.trim();
    if (!clean) return { ref: "", name: "" };
    const contactValues = {
      fullName: clean,
      ...canais,
      contactType: "PATIENT" as const,
      lifecycleStage: "ACTIVE_PATIENT" as const,
      sourceChannel: "Comprovante",
      ownerUserId: pessoa?.id ?? "financeiro",
    };
    const result = findOrCreateCrmContact(crmState, contactValues, pessoa?.id ?? "financeiro");
    persistCrm((current) => {
      const resolved = findOrCreateCrmContact(current, { ...contactValues, id: result.contact.id }, pessoa?.id ?? "financeiro");
      return applyContactChannels(resolved.state, resolved.contact.id, canais, pessoa?.id ?? "financeiro");
    });
    return { ref: result.contact.id, name: contactDisplayName(result.contact) };
  }

  async function attach(files: FileList | File[]) {
    if (semEdicao) return avisarSoVe();
    const nextFiles = Array.from(files);
    const acceptedFiles = nextFiles.filter(isAcceptedComprovante);

    if (!acceptedFiles.length) {
      setError("Anexe JPG, PNG, HEIC ou PDF.");
      return;
    }

    const problemaContato = contactChannelsIssue(patientChannels);
    if (problemaContato) {
      setError(problemaContato);
      return;
    }

    const parsedValor = valor ? parseMoneyInput(valor) : undefined;
    const link = resolvePatientLink();
    const paciente = link.name.trim();
    const crmRef = link.ref || undefined;

    if (useRemote && pessoa) {
      try {
        await Promise.all(
          acceptedFiles.map((file, index) =>
            uploadMutation.mutateAsync({
              pessoa,
              file,
              pacienteReferencia: paciente || undefined,
              crmContactRef: crmRef,
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
        anexadoPorId: pessoa?.id,
        anexadoPorCargo: pessoa?.cargo ?? "recepcionista",
        pacienteReferencia: paciente || undefined,
        crmContactRef: crmRef,
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

  async function createEstorno(record: ComprovanteRecord) {
    if (semEdicao) return avisarSoVe();
    const confirmed = await confirmar(`Criar um registro de estorno para "${record.arquivoNome}"?`, { corpo: "O comprovante original é mantido sem alterações.", confirmar: "Criar estorno" });

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
      anexadoPorId: pessoa?.id,
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

  // Quem pode excluir o quê (04/08/2026, pedido do Lucas: "a recepcionista
  // precisa conseguir excluir comprovantes"):
  //   • OCULTAR: qualquer pessoa que usa a tela (reversível — o registro fica
  //     guardado e a coordenação consegue reexibir).
  //   • EXCLUIR DE VEZ: a coordenação em qualquer um; a recepção só nos que ELA
  //     mesma anexou — corrige o próprio erro na hora, sem poder apagar o
  //     histórico lançado por outra pessoa. Mesma regra vale no banco (RLS).
  const podeOcultar = canComprovantes(pessoa?.cargo);
  function podeExcluirDeVez(record: ComprovanteRecord) {
    if (isCoordenacao(pessoa?.cargo)) return true;
    if (!pessoa?.id) return false;
    return Boolean(record.anexadoPorId) && record.anexadoPorId === pessoa.id;
  }

  async function softDelete(record: ComprovanteRecord) {
    if (semEdicao) return avisarSoVe();
    const confirmed = await confirmar(`Ocultar "${record.arquivoNome}" da lista?`, { corpo: "O registro não é apagado; só sai da lista.", confirmar: "Ocultar" });

    if (!confirmed) return;

    if (useRemote) {
      void softDeleteMutation.mutateAsync(record.id).catch(() => {
        setError("Não foi possível ocultar o comprovante no Supabase.");
      });
      return;
    }

    persist(records.map((item) => (item.id === record.id ? { ...item, deletedAt: new Date().toISOString() } : item)));
  }

  async function hardDelete(record: ComprovanteRecord) {
    if (semEdicao) return avisarSoVe();
    const sharepointNote =
      record.sharePoint.status === "pendente"
        ? " Ele ainda não subiu para o SharePoint e será removido da fila."
        : " A cópia que já subiu para o SharePoint permanece lá.";
    const confirmed = await confirmar(`Excluir de vez "${record.arquivoNome}"?`, { corpo: `O arquivo e o registro são apagados do app — sem volta.${sharepointNote}`, destrutivo: true, confirmar: "Excluir de vez" });
    if (!confirmed) return;

    if (useRemote) {
      hardDeleteRemoteComprovante({ id: record.id, storagePath: record.storagePath })
        .then(() => queryClient.invalidateQueries({ queryKey: ["comprovantes"] }))
        .catch(() => setError("Não foi possível excluir o comprovante. Tente de novo."));
      return;
    }

    persist(records.filter((item) => item.id !== record.id));
  }

  // ---- Papel & Musgo (08/10/2026): a frase do cabeçalho, com o número do filtro ----
  const fraseDoTopo = (
    <>
      <strong>
        {porExtenso(visibleRecords.length, "m")} {visibleRecords.length === 1 ? "comprovante" : "comprovantes"}
      </strong>{" "}
      no filtro, somando {money(totalNoFiltro)}. Cada arquivo fica guardado num armazenamento privado e sobe sozinho para a pasta do mês no
      SharePoint (a cada 15 minutos).
    </>
  );
  const periodos = ["dia", "semana", "mes", "ano", "tudo"] as (PeriodoFiltro | "tudo")[];
  const rotuloPeriodo = (periodo: PeriodoFiltro | "tudo") =>
    periodo === "mes" ? "Este mês" : periodo === "dia" ? "Hoje" : periodo === "semana" ? "Semana" : periodo === "ano" ? "Este ano" : "Tudo";

  return (
    <AccessGate allowed={canComprovantes} label="Comprovantes" module="comprovantes">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <AvisoSoVe soVe={telaComp.soVe} />
        <Cabecalho className="mb-0 max-md:mb-0" sobrancelha="Financeiro · Dia" titulo="Comprovantes" frase={fraseDoTopo} />

        {comprovantesQuery.isError ? (
          <AvisoDaTela tom="erro">Não foi possível carregar comprovantes do Supabase. Confira bucket privado, RLS e vínculo do colaborador.</AvisoDaTela>
        ) : null}

        {/* DECIDIR: anexar (o arquivo à esquerda, o que ele quita à direita). */}
        <BlocoFolha as="section" aria-labelledby="anexar-titulo" className="min-w-0">
          <div className={CABECA_DA_FOLHA}>
            <TituloDoBloco id="anexar-titulo" icone={<UploadCloud className="h-4 w-4" aria-hidden="true" />}>
              Anexar comprovante
            </TituloDoBloco>
          </div>
          <div className="grid gap-6 p-6 max-md:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <div
              onDrop={onDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              className={cn(
                "grid min-h-52 place-items-center rounded-bloco border-2 border-dashed p-6 text-center transition-colors duration-150",
                isDragging ? "border-musgo bg-musgo-claro" : "border-borda-campo bg-saber",
              )}
            >
              <div className="grid justify-items-center gap-2">
                <span className="grid h-12 w-12 place-items-center rounded-controle bg-folha text-musgo">
                  <UploadCloud className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="mt-2 text-base font-bold leading-6 text-tinta">Arraste e solte o comprovante aqui</p>
                <p className="max-w-[44ch] text-sm font-medium leading-[22px] text-tinta-2">
                  JPG, PNG, HEIC ou PDF. O registro guarda data, hora, nome e cargo de quem anexou.
                </p>
                <div className="mt-3">
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
                  <Botao
                    variante="primario"
                    disabled={semEdicao}
                    carregando={uploadMutation.isPending}
                    icone={<UploadCloud className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => inputRef.current?.click()}
                  >
                    {uploadMutation.isPending ? "Anexando..." : "Anexar comprovante"}
                  </Botao>
                </div>
              </div>
            </div>

            <div className="grid content-start gap-4">
              <Campo rotulo="Baixar pendência existente" htmlFor="pagamento-vinculado" ajuda="Ao vincular, o comprovante marca a pendência como paga e alimenta os recebíveis.">
                <select id="pagamento-vinculado" value={pagamentoLembreteId} onChange={(event) => selectPagamento(event.target.value)} className={CAMPO}>
                  <option value="">Não vincular</option>
                  {pagamentosAbertos.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.pacienteNome} · {money(record.valorPendente)}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Paciente" htmlFor="paciente-referencia">
                <PatientPicker
                  id="paciente-referencia"
                  contacts={crmState.contacts}
                  value={{ ref: patientRef, name: pacienteReferencia }}
                  onChange={(next) => {
                    setPacienteReferencia(next.name);
                    setPatientRef(next.ref);
                  }}
                  channels={patientChannels}
                  onChannelsChange={setPatientChannels}
                  placeholder="Buscar paciente por nome ou telefone…"
                />
              </Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Valor" opcional htmlFor="valor">
                  <input id="valor" inputMode="decimal" placeholder="0,00" value={valor} onChange={(event) => setValor(event.target.value)} className={cn(CAMPO, "text-right tabular-nums")} />
                </Campo>
                <Campo rotulo="Forma de pagamento" htmlFor="forma">
                  <select id="forma" value={formaPagamento} onChange={(event) => setFormaPagamento(event.target.value as FormaPagamento | "")} className={CAMPO}>
                    <option value="">Não informar</option>
                    {Object.entries(formaLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <Campo rotulo="Observação" opcional htmlFor="observacao">
                <textarea
                  id="observacao"
                  rows={3}
                  className={cn(CAMPO_TEXTO, "min-h-[72px] resize-none")}
                  placeholder="Detalhe opcional"
                  value={observacao}
                  onChange={(event) => setObservacao(event.target.value)}
                />
              </Campo>
              <label className="flex cursor-pointer items-start gap-3 rounded-controle bg-saber p-3 text-sm leading-5">
                <input type="checkbox" checked={alimentarRecebiveis360} onChange={(event) => setAlimentarRecebiveis360(event.target.checked)} className={cn(MARCAR, "mt-0.5")} />
                <span>
                  <span className="block font-bold text-tinta">Alimentar Recebíveis 360</span>
                  <span className="block text-[13px] font-medium text-tinta-2">Com paciente e valor, este comprovante vira receita recebida no 360.</span>
                </span>
              </label>
              {error ? <AvisoDaTela tom="erro">{error}</AvisoDaTela> : null}
            </div>
          </div>
        </BlocoFolha>

        {/* A LISTA: filtros no alto, os comprovantes embaixo (o mesmo bloco). */}
        <BlocoFolha as="section" aria-labelledby="lista-comprovantes-titulo" className="min-w-0 overflow-hidden">
          <div className={CABECA_DA_FOLHA}>
            <TituloDoBloco id="lista-comprovantes-titulo" detalhe={`${visibleRecords.length} no filtro · ${money(totalNoFiltro)}`}>
              Comprovantes
            </TituloDoBloco>
            <Botao
              variante="fantasma"
              tamanho="pq"
              className="ml-auto"
              icone={<X className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setFiltros(defaultComprovanteFiltros)}
              disabled={activeFiltros === 0}
            >
              Limpar filtros{activeFiltros > 0 ? ` (${activeFiltros})` : ""}
            </Botao>
          </div>

          <div className="grid gap-4 border-b border-fio px-6 py-4 max-md:px-4">
            <CampoBusca
              valor={filtros.busca}
              onMudar={(busca) => updateFiltros({ busca })}
              placeholder="Buscar por paciente, nome do arquivo, observação ou quem anexou"
              rotulo="Buscar comprovante"
            />

            {/* Período: presets + dia ou mês específico */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={RUBRICA}>Período</span>
              {periodos.map((periodo) => {
                const active = !filtros.mes && !filtros.data && filtros.periodo === periodo;
                return (
                  <Leitura key={periodo} ativo={active} onClick={() => updateFiltros({ periodo, mes: "", data: "" })}>
                    {rotuloPeriodo(periodo)}
                  </Leitura>
                );
              })}
              <span className="flex items-center gap-2">
                <label htmlFor="filtro-dia" className={RUBRICA}>
                  dia
                </label>
                <input
                  id="filtro-dia"
                  type="date"
                  value={filtros.data}
                  onChange={(event) => updateFiltros({ data: event.target.value, mes: "" })}
                  className={cn(CAMPO_PQ, "w-[150px]")}
                />
                {filtros.data ? (
                  <button type="button" aria-label="Limpar o dia" onClick={() => updateFiltros({ data: "" })} className={BOTAO_ICONE}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <label htmlFor="filtro-mes" className={RUBRICA}>
                  ou mês
                </label>
                <input
                  id="filtro-mes"
                  type="month"
                  value={filtros.mes}
                  onChange={(event) => updateFiltros({ mes: event.target.value, data: "" })}
                  className={cn(CAMPO_PQ, "w-[150px]")}
                />
                {filtros.mes ? (
                  <button type="button" aria-label="Limpar o mês" onClick={() => updateFiltros({ mes: "" })} className={BOTAO_ICONE}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </div>

            {/* Tipo · Forma · Autor · Ordenar */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Tipo" htmlFor="filtro-tipo">
                <select
                  id="filtro-tipo"
                  value={filtros.tipo}
                  onChange={(event) => updateFiltros({ tipo: event.target.value as ComprovanteFiltros["tipo"] })}
                  className={CAMPO}
                >
                  <option value="todos">Todos</option>
                  <option value="entrada">Comprovantes</option>
                  <option value="estorno">Estornos</option>
                </select>
              </Campo>
              <Campo rotulo="Forma de pagamento" htmlFor="filtro-forma">
                <select
                  id="filtro-forma"
                  value={filtros.forma}
                  onChange={(event) => updateFiltros({ forma: event.target.value as ComprovanteFiltros["forma"] })}
                  className={CAMPO}
                >
                  <option value="todas">Todas</option>
                  {Object.entries(formaLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Quem anexou" htmlFor="filtro-autor">
                <select id="filtro-autor" value={filtros.autor} onChange={(event) => updateFiltros({ autor: event.target.value })} className={CAMPO}>
                  <option value="todos">Todos</option>
                  {autores.map((autor) => (
                    <option key={autor} value={autor}>
                      {autor}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Ordenar" htmlFor="filtro-ordem">
                <select
                  id="filtro-ordem"
                  value={filtros.ordenacao}
                  onChange={(event) => updateFiltros({ ordenacao: event.target.value as OrdenacaoComprovante })}
                  className={CAMPO}
                >
                  <option value="recentes">Mais recentes</option>
                  <option value="antigos">Mais antigos</option>
                  <option value="maior_valor">Maior valor</option>
                  <option value="menor_valor">Menor valor</option>
                </select>
              </Campo>
            </div>
          </div>

          {visibleRecords.length ? (
            <ul>
              {visibleRecords.map((record) => {
                const estorno = record.tipo === "estorno";
                return (
                  <li
                    key={record.id}
                    className={cn(
                      "grid gap-x-4 gap-y-3 border-b border-fio px-6 py-4 last:border-b-0 transition-colors duration-150 hover:bg-saber/70 max-md:px-4 md:grid-cols-[3rem_minmax(0,1fr)_auto_auto] md:items-center",
                      estorno && "bg-erro-claro/40",
                    )}
                  >
                    <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-controle border border-fio bg-saber text-tinta-2 max-md:hidden">
                      {previewUrls[record.id] ? (
                        <img src={previewUrls[record.id]} alt="" className="h-full w-full object-cover" />
                      ) : record.arquivoTipo.includes("pdf") ? (
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <ImageIcon className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                    <div className="grid min-w-0 gap-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Etiqueta tom={estorno ? "erro" : "musgo"}>{estorno ? "Estorno" : "Comprovante"}</Etiqueta>
                        <span className="text-xs font-bold tabular-nums text-tinta-2">{formatShortTime(record.anexadoEm)}</span>
                      </p>
                      <p className="truncate text-sm font-bold leading-5 text-tinta">{record.arquivoNome}</p>
                      <p className="text-[13px] font-medium leading-5 text-tinta-2">
                        {record.anexadoPor} · {cargoLabels[record.anexadoPorCargo]} · {formatFileSize(record.arquivoTamanho)}
                      </p>
                      {record.pacienteReferencia || record.formaPagamento ? (
                        <p className="text-[13px] font-medium leading-5 text-tinta">
                          {record.pacienteReferencia ? <>Paciente/referência: {record.pacienteReferencia}</> : null}
                          {record.pacienteReferencia && record.formaPagamento ? " · " : null}
                          {record.formaPagamento ? formaLabels[record.formaPagamento] : null}
                        </p>
                      ) : null}
                      {record.observacao ? <p className="text-[13px] font-medium leading-5 text-tinta-2">{record.observacao}</p> : null}
                      <p className="flex flex-wrap items-center gap-2">
                        {record.pagamentoLembreteId ? <Etiqueta tom="ok">Pendência baixada pelo comprovante</Etiqueta> : null}
                        {record.inteligencia360ReceivableId ? <Etiqueta tom="ok">Recebíveis 360 alimentado</Etiqueta> : null}
                        <Etiqueta>SharePoint: {record.sharePoint.status}</Etiqueta>
                        {record.storagePath ? (
                          <button
                            type="button"
                            className="rounded-sm text-[13px] font-bold text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                            onClick={() => {
                              void getRemoteComprovanteUrl(record.storagePath as string)
                                .then((url) => window.open(url, "_blank", "noopener"))
                                .catch(() => toast("Não consegui abrir o arquivo agora. Tente de novo.", { tom: "erro" }));
                            }}
                          >
                            Ver comprovante
                          </button>
                        ) : null}
                      </p>
                    </div>
                    <span className={cn("whitespace-nowrap text-sm font-bold tabular-nums md:text-right", estorno ? "text-erro" : "text-tinta")}>{money(record.valor)}</span>
                    <div className="flex flex-wrap items-center gap-1 md:justify-end">
                      {record.tipo === "entrada" ? (
                        <Botao variante="secundario" tamanho="pq" disabled={semEdicao} icone={<RotateCcw className="h-4 w-4" aria-hidden="true" />} onClick={() => createEstorno(record)}>
                          Estornar
                        </Botao>
                      ) : null}
                      {podeOcultar ? (
                        <Botao variante="fantasma" tamanho="pq" disabled={semEdicao} onClick={() => softDelete(record)}>
                          Ocultar
                        </Botao>
                      ) : null}
                      {podeExcluirDeVez(record) ? (
                        <Botao variante="perigo" tamanho="pq" disabled={semEdicao} onClick={() => hardDelete(record)}>
                          Excluir de vez
                        </Botao>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vazio titulo="Nenhum comprovante com esses filtros">
              {activeFiltros > 0
                ? "Nada bate com os filtros atuais. Toque em “Limpar filtros” para ver todos, ou ajuste o período/busca."
                : "Use o botão de anexo ou arraste um arquivo para iniciar a captura. Os registros são imutáveis; correções entram como estorno."}
            </Vazio>
          )}
        </BlocoFolha>
      </div>
    </AccessGate>
  );
}
