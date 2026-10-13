// PLANO DE ACOMPANHAMENTO (caminhada do paciente).
//
// PAPEL & MUSGO (08/10/2026, redesenho etapa 4): um cabeçalho só, com o número
// do plano explicado em frase ("Dez pacientes no plano de acompanhamento, sete
// em dia. Dois com marco atrasado."); os quatro números viram a faixa "para
// saber"; a importação da InBody, a conferência e a lista dos pacientes moram
// em folhas (é onde se age); a pesagem da semana e quem não fechou ficam no
// saber. Filtros viram leituras com o número de cada canal. Sem vidro, sem
// animação de entrada, sem verde/vermelho genéricos: ok, atenção e erro do app.
// O que a tela FAZ não mudou: mesmos filtros, mesmos marcos, mesma trava de
// quem só vê, mesmo relatório, mesma inscrição e o mesmo resgate.
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ClipboardCheck, Copy, FileText, HeartPulse, Plus, Scale, Stethoscope, UserPlus } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { AvisoSoVe, avisarSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, CampoBusca, FraseDoFluxo } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { canAcompanhamento, canGravarMedicoes, canVerMedicoes } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { exportBrandedPdf } from "@/lib/brandedPdf";
import { cn } from "@/lib/utils";
import {
  contactDisplayName,
  crmModuleRoutes,
  notClosedRecently,
  programPhaseLabels,
  type CrmAdhesionChannel,
  type CrmProgramPhase,
  criarTarefaDeResgatePorRisco,
} from "@/features/crm/crmData";
import { CAMPO, CAMPO_PQ, Etiqueta, GrupoDeLeituras, Indicadores, Leitura, NOME_LINK, classeDoChip } from "@/features/crm/comercialVisual";
import { AvisoDaTela, Campo, TituloDoBloco, Vazio } from "@/features/financeiro/pecasDiaPagar";
import { useAuth } from "@/hooks/useAuth";
import { ListaEsperaCard } from "./ListaEsperaCard";
import { ImportarInBodyCard } from "./ImportarInBodyCard";
import { useCrmState } from "@/features/crm/useCrmState";
import { listRemotePacienteMedicoesDesde } from "@/lib/remoteData";
import { listaParaCobrar, pesagensDaSemana } from "./pesagensSemana";
import { fraseDoAcompanhamento } from "@/features/pacientes/frasesPacientes";
import {
  buildPerformanceReportTable,
  buildProgramaBoard,
  enrollPatientInProgram,
  milestoneResponsible,
  milestoneTypeLabels,
  canalFiltroLabels,
  cardNoCanal,
  conferenciaAcompanhamento,
  contagemPorCanal,
  patientsNotInProgram,
  type CanalFiltro,
  programSummaryLines,
  toggleProgramMilestone,
  type ProgramMilestone,
  type ProgramPatientCard,
} from "./programaData";

const channelShort: Record<CrmAdhesionChannel, string> = {
  PROGRAMA_ACOMPANHAMENTO: "Programa",
  CLUBE_BRATAN: "Clube",
  SOMENTE_TRATAMENTO: "Só tratamento",
};

const channelOptions: { value: CrmAdhesionChannel; label: string }[] = [
  { value: "PROGRAMA_ACOMPANHAMENTO", label: "Programa de Acompanhamento" },
  { value: "CLUBE_BRATAN", label: "Consulta Black (ex-Clube)" },
  { value: "SOMENTE_TRATAMENTO", label: "Somente Tratamento" },
];

function formatBR(dateISO: string) {
  return dateISO ? dateISO.slice(0, 10).split("-").reverse().join("/") : "—";
}

// Contador de marcos em uma linha só. Antes era um bloco de duas linhas com
// rótulo em cima; com 3 deles por paciente, cada cartão ganhava 60 px de altura
// sem dizer mais nada (16/09/2026: "tá muito grande, você rola infinitamente").
// Papel & Musgo (08/10/2026): etiqueta de 24 px, completo em ok, algarismos alinhados.
function ProgressPill({ label, done, total, icon: Icon }: { label: string; done: number; total: number; icon: typeof HeartPulse }) {
  const complete = done >= total;
  return (
    <span
      title={`${label}: ${done} de ${total}`}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-controle px-1.5 font-sans text-xs font-bold leading-none tabular-nums",
        complete ? "bg-ok-claro text-ok" : "bg-saber text-tinta",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", complete ? "text-ok" : "text-tinta-2")} aria-hidden="true" />
      {done}/{total}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function MilestoneChip({ milestone, onToggle }: { milestone: ProgramMilestone; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={milestone.done}
      title={`${milestone.label} · responsável: ${milestoneResponsible[milestone.type]} · previsto ${formatBR(milestone.expectedDate)}${milestone.done ? " · FEITO (toque para desfazer)" : milestone.overdue ? " · ATRASADO (toque para marcar feito)" : " · toque para marcar feito"}`}
      className={cn(
        "inline-flex min-h-8 items-center gap-1 rounded-controle border px-2.5 font-sans text-xs font-bold leading-none transition-colors duration-150 ease-papel",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
        milestone.done
          ? "border-transparent bg-ok-claro text-ok"
          : milestone.overdue
            ? "border-atencao bg-atencao-claro text-atencao"
            : "border-fio-2 bg-folha text-tinta hover:border-borda-campo",
      )}
    >
      {milestone.type === "MEDICO" ? `Dr. ${milestone.n}` : `${milestone.type === "CHECK" ? "Check" : "Bio"} ${milestone.n}`}
      {milestone.done ? " ✓" : ""}
    </button>
  );
}

export function ProgramaAcompanhamentoPage() {
  const { state, persist, syncMode, isSyncing, syncError } = useCrmState({ modulo: "acompanhamento" });
  const { pessoa } = useAuth();
  // "Só vê" (29/09/2026, auditoria B9): sem EDITAR no Plano de Acompanhamento,
  // não marca marco, não inscreve e não cria resgate. A importação do InBody
  // segue a regra própria do dado clínico (canGravarMedicoes), de propósito.
  const telaAcomp = useNivelDaTela("acompanhamento");
  const semEdicao = !telaAcomp.podeEditar;
  const hoje = todayISO();
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<CrmProgramPhase | "TODAS">("TODAS");
  // FILTRO POR CANAL (17/08/2026, pedido do Lucas): separar quem está em
  // acompanhamento de tratamento de quem está no programa.
  const [canalFiltro, setCanalFiltro] = useState<CanalFiltro>("TODOS");
  const [conferenciaAberta, setConferenciaAberta] = useState(false);
  // Os dois blocos de nomes ficam fechados: a frase-resumo já diz se precisa
  // abrir, e abertos eles empurravam a lista de pacientes para fora da tela.
  const [pesagemAberta, setPesagemAberta] = useState(false);
  const [naoFecharamAberto, setNaoFecharamAberto] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [days, setDays] = useState(7);
  const [enrollOpen, setEnrollOpen] = useState(false);

  // PESAGEM DA SEMANA (16/09/2026): o que o paciente manda pelo portal chega aqui.
  // 60 dias bastam para a variação e para o semáforo (que olha as últimas 2 semanas).
  // A bioimpedância é da equipe clínica (RLS de 28/09/2026): para os demais a
  // consulta nem sai, e a regra da pesagem no semáforo é pulada, como já era
  // quando não havia medição.
  const podeVerMedicoes = canVerMedicoes(pessoa);
  const podeGravarMedicoes = canGravarMedicoes(pessoa);
  const desde = useMemo(() => new Date(new Date(`${hoje}T12:00:00Z`).getTime() - 60 * 86_400_000).toISOString().slice(0, 10), [hoje]);
  const medicoes = useQuery({
    queryKey: ["pesagens-desde", desde],
    queryFn: () => listRemotePacienteMedicoesDesde(desde),
    staleTime: 60_000,
    enabled: podeVerMedicoes,
  });
  const boardSemPesagem = useMemo(() => buildProgramaBoard(state, hoje), [state, hoje]);
  const pesagens = useMemo(
    () =>
      pesagensDaSemana({
        pacientes: boardSemPesagem.map((card) => ({ contactId: card.contactId, nome: card.patientName, desde: card.startedAt })),
        medicoes: (medicoes.data ?? []).map((m) => ({ contactRef: m.contactRef, dia: m.dia, pesoKg: m.pesoKg, origem: m.origem })),
        hoje,
      }),
    [boardSemPesagem, medicoes.data, hoje],
  );
  const board = useMemo(() => buildProgramaBoard(state, hoje, undefined, pesagens.ultimaPorContato), [state, hoje, pesagens.ultimaPorContato]);
  const notClosed = useMemo(() => notClosedRecently(state, hoje, days), [state, hoje, days]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return board.filter((card) => {
      if (phaseFilter !== "TODAS" && card.phase !== phaseFilter) return false;
      if (!cardNoCanal(card, canalFiltro)) return false;
      if (term && !card.patientName.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [board, search, phaseFilter, canalFiltro]);

  const porCanal = useMemo(() => contagemPorCanal(board), [board]);
  const vermelhos = board.filter((card) => card.risco.nivel === "VERMELHO").length;
  const pendencias = useMemo(() => conferenciaAcompanhamento(state, hoje), [state, hoje]);
  const pendenciasAltas = pendencias.filter((item) => item.gravidade === "ALTA").length;

  const totals = useMemo(
    () => ({
      pacientes: board.length,
      emDia: board.filter((card) => card.overdueCount === 0).length,
      atrasados: board.filter((card) => card.overdueCount > 0).length,
    }),
    [board],
  );

  const phasesInUse = useMemo(() => [...new Set(board.map((card) => card.phase))], [board]);

  function toggle(dealId: string, key: string) {
    if (semEdicao) return avisarSoVe();
    void persist((current) => toggleProgramMilestone(current, dealId, key));
  }

  function gerarRelatorio() {
    if (!filtered.length) {
      setCopyFeedback("Nenhum paciente para o relatório com o filtro atual.");
      window.setTimeout(() => setCopyFeedback(""), 6000);
      return;
    }
    const ok = exportBrandedPdf({
      title: "Plano de Acompanhamento — Assistente de Performance",
      subtitle: `Controle da caminhada dos pacientes · ${formatBR(hoje)}`,
      sections: [
        { heading: "Resumo", lines: programSummaryLines(filtered) },
        { heading: "Pacientes em acompanhamento", table: buildPerformanceReportTable(filtered) },
      ],
      footerNote: "Datas previstas contam a partir da adesão. A agenda oficial fica no Feegow.",
    });
    setCopyFeedback(
      ok
        ? "Relatório gerado — use \"Salvar como PDF\" na janela de impressão para enviar."
        : "Libere os pop-ups do navegador para gerar o relatório.",
    );
    window.setTimeout(() => setCopyFeedback(""), 7000);
  }

  async function copyNotClosed() {
    const lines = [
      `Pacientes que não fecharam (últimos ${days} dias) — ${notClosed.length}`,
      ...notClosed.map((row) => `• ${row.contact ? contactDisplayName(row.contact) : "Contato"} — ${formatBR(row.dateISO)}${row.objection ? ` — ${row.objection}` : ""}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyFeedback("Lista de não-fechados copiada.");
    } catch {
      setCopyFeedback("Não consegui copiar automático — tente de novo.");
    }
    window.setTimeout(() => setCopyFeedback(""), 6000);
  }

  // CABEÇALHO (08/10/2026): o número do plano em frase, e o que pede atenção em laranja.
  const frase = fraseDoAcompanhamento({ pacientes: totals.pacientes, emDia: totals.emDia, atrasados: totals.atrasados, vermelhos });
  const sincronia = syncError ? "Sem sincronizar" : isSyncing ? "Sincronizando" : syncMode;

  return (
    <AccessGate allowed={canAcompanhamento} label="Acompanhamento" module="acompanhamento">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 font-sans text-tinta max-md:gap-4">
        <AvisoSoVe soVe={telaAcomp.soVe} />
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Pacientes · Caminhada do paciente"
          titulo="Plano de acompanhamento"
          frase={
            <>
              <strong>{frase.destaque}</strong>
              {frase.resto}
              {frase.alerta ? <span className="alerta">{frase.alerta}</span> : null}
            </>
          }
          acoes={
            <>
              <Botao variante="secundario" icone={<FileText className="h-4 w-4" aria-hidden="true" />} onClick={gerarRelatorio}>
                Relatório p/ Performance
              </Botao>
              <Botao
                variante="secundario"
                icone={<UserPlus className="h-4 w-4" aria-hidden="true" />}
                disabled={semEdicao}
                aria-expanded={enrollOpen}
                onClick={() => setEnrollOpen((value) => !value)}
              >
                Adicionar paciente ao plano
              </Botao>
            </>
          }
          rodape={
            <FraseDoFluxo>
              Quem está em qual fase, o que já foi feito, o próximo passo de cada paciente — e quem não fechou na semana.{" "}
              <InfoTip title="O que é esta aba?">
                A visão única do plano de acompanhamento: todos os pacientes que aderiram, em qual fase estão e a caminhada
                de 6 meses de cada um — 6 checkpoints da Assistente de Performance, 6 bioimpedâncias e as 3 consultas do Dr.
                Daniel. Cada setor marca o que faz (enfermagem, Performance, médico). No fim, a lista de quem não fechou na
                semana, pronta para copiar. As datas previstas contam a partir da adesão; a agenda oficial fica no Feegow.
              </InfoTip>{" "}
              <Etiqueta tom={syncError ? "atencao" : "neutro"} className="align-middle">
                {sincronia}
              </Etiqueta>
            </FraseDoFluxo>
          }
        />

        {/* Os quatro números, para saber (o que pede atenção pinta de laranja; a frase diz o porquê). */}
        <Indicadores
          rotulo="O plano em números"
          colunas={4}
          itens={[
            { rotulo: "No plano", valor: totals.pacientes, frase: totals.pacientes === 1 ? "paciente aderiu" : "pacientes aderiram" },
            { rotulo: "Em dia", valor: totals.emDia, frase: "nenhum marco passou da data", tom: totals.emDia > 0 && totals.emDia === totals.pacientes ? "ok" : undefined },
            { rotulo: "Com atraso", valor: totals.atrasados, frase: "algum marco passou da data", tom: totals.atrasados ? "atencao" : undefined },
            { rotulo: "Semáforo vermelho", valor: vermelhos, frase: "não respondeu, sem retorno ou muito tempo sem vir", tom: vermelhos ? "atencao" : undefined },
          ]}
        />

        {/* A bioimpedância fica no alto porque é o que a enfermagem vem fazer aqui
            depois de rodar o aparelho (pedido do Lucas, 16/09/2026). Fechado, é
            uma linha; aberto, é a área de soltar o arquivo. */}
        {podeGravarMedicoes ? (
          <ImportarInBodyCard contatos={state.contacts.map((contato) => ({ id: contato.id, name: contato.fullName }))} pessoaId={pessoa?.id ?? null} ativo={syncMode !== "local"} />
        ) : null}

        {copyFeedback ? <AvisoDaTela tom="ok">{copyFeedback}</AvisoDaTela> : null}

        {/* CONFERÊNCIA — "está tudo linkado? faltou alguém?" (17/08/2026).
            Sem este bloco, essa pergunta não tinha resposta: dava para olhar o
            quadro e não saber quem deveria estar nele e não está. */}
        {pendencias.length ? (
          <BlocoFolha as="section" aria-label="Conferência do plano" className={cn(pendenciasAltas ? "border-atencao" : "")}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 max-md:px-4">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <ClipboardCheck className={cn("h-4 w-4 shrink-0", pendenciasAltas ? "text-atencao" : "text-tinta-2")} aria-hidden="true" />
                <strong className={cn("text-sm font-bold leading-5", pendenciasAltas ? "text-atencao" : "text-tinta")}>
                  Conferência: {pendencias.length} ponto(s) para olhar
                </strong>
                {pendencias.map((item) => (
                  <Etiqueta key={item.chave} tom={item.gravidade === "ALTA" ? "erro" : item.gravidade === "MEDIA" ? "atencao" : "neutro"}>
                    {item.pessoas.length} {item.chave === "SEM_CANAL" ? "sem canal" : item.chave === "GANHOU_FORA" ? "fechou e ficou fora" : item.chave === "PACIENTE_SEM_NEGOCIACAO" ? "sem negociação" : "nome repetido"}
                  </Etiqueta>
                ))}
              </span>
              <Botao tamanho="pq" variante="fantasma" aria-expanded={conferenciaAberta} onClick={() => setConferenciaAberta((atual) => !atual)}>
                {conferenciaAberta ? "Esconder" : "Ver detalhes"}
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-150 ease-papel", conferenciaAberta && "rotate-180")} aria-hidden="true" />
              </Botao>
            </div>

            {conferenciaAberta ? (
              <ul className="border-t border-fio">
                {pendencias.map((item) => (
                  <li key={item.chave} className="grid gap-1.5 border-b border-fio px-5 py-4 last:border-b-0 max-md:px-4">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold leading-5 text-tinta">
                      <Etiqueta tom={item.gravidade === "ALTA" ? "erro" : item.gravidade === "MEDIA" ? "atencao" : "neutro"}>{item.gravidade}</Etiqueta>
                      {item.titulo}
                    </p>
                    <p className="text-[13px] font-medium leading-5 text-tinta-2">
                      <strong className="font-bold text-tinta">Por que importa:</strong> {item.porque}
                    </p>
                    <p className="text-[13px] font-medium leading-5 text-tinta-2">
                      <strong className="font-bold text-tinta">O que fazer:</strong> {item.oQueFazer}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {item.pessoas.map((pessoa) => (
                        <Link key={`${item.chave}-${pessoa.contactId}`} to={crmModuleRoutes.contact(pessoa.contactId)} title={pessoa.detalhe} className={classeDoChip(false)}>
                          {pessoa.nome}
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </BlocoFolha>
        ) : null}

        {/* PESAGEM DA SEMANA (16/09/2026): a enfermagem vê o que chegou pelo portal e
            quem precisa ser cobrado. Quem passa de 2 semanas sem pesar já pesa no
            semáforo de adesão do cartão, então esta lista e o semáforo contam a mesma história. */}
        {podeVerMedicoes ? (
          <BlocoSaber as="section" aria-label="Pesagem da semana" className="py-4 max-md:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <TituloDoBloco icone={<Scale className="h-4 w-4" aria-hidden="true" />}>Pesagem da semana</TituloDoBloco>
                <InfoTip title="De onde vem esta lista">
                  O paciente manda o peso pelo Meu Bratan, uma vez por semana. A enfermagem também pode lançar pela ficha, no
                  cartão Portal do paciente. A semana começa na segunda. Quem passa de duas semanas sem pesar soma um ponto no
                  semáforo de adesão.
                </InfoTip>
                <span className="text-[13px] font-medium leading-5 text-tinta-2">{medicoes.isLoading ? "Carregando as pesagens…" : pesagens.frase}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pesagens.faltando.length + pesagens.semNenhuma.length > 0 ? (
                  <Botao
                    tamanho="pq"
                    variante="secundario"
                    icone={<Copy className="h-4 w-4" aria-hidden="true" />}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(listaParaCobrar(pesagens));
                        setCopyFeedback("Lista de quem falta pesar copiada.");
                        window.setTimeout(() => setCopyFeedback(""), 6000);
                      } catch {
                        setCopyFeedback("Não consegui copiar a lista.");
                        window.setTimeout(() => setCopyFeedback(""), 6000);
                      }
                    }}
                  >
                    Copiar quem falta
                  </Botao>
                ) : null}
                <Botao
                  tamanho="pq"
                  variante="fantasma"
                  aria-expanded={pesagemAberta}
                  aria-label={pesagemAberta ? "Esconder quem pesou" : "Ver quem pesou"}
                  onClick={() => setPesagemAberta((atual) => !atual)}
                >
                  {pesagemAberta ? "Esconder" : "Ver quem pesou"}
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-150 ease-papel", pesagemAberta && "rotate-180")} aria-hidden="true" />
                </Botao>
              </div>
            </div>

            {medicoes.isError ? <p className="mt-3 text-[13px] font-semibold text-erro">Não consegui ler as pesagens agora. O resto da tela continua valendo.</p> : null}

            <div className={cn("mt-4 grid gap-6 lg:grid-cols-2", !pesagemAberta && "hidden")}>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
                  Mandaram nesta semana <span className="tabular-nums text-ok">({pesagens.mandaram.length})</span>
                </p>
                {pesagens.mandaram.length ? (
                  <ul className="mt-2">
                    {pesagens.mandaram.map((p) => (
                      <li key={p.contactId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-fio py-2 text-sm last:border-b-0">
                        <Link to={crmModuleRoutes.contact(p.contactId)} className={NOME_LINK}>
                          {p.nome}
                        </Link>
                        <span className="text-[13px] font-medium tabular-nums text-tinta-2">
                          {p.frase}
                          {p.ultimaOrigem === "ENFERMAGEM" ? " · lançada pela enfermagem" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[13px] font-medium text-tinta-2">Ninguém pesou ainda nesta semana.</p>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
                  Falta cobrar <span className="tabular-nums text-atencao">({pesagens.faltando.length + pesagens.semNenhuma.length})</span>
                </p>
                {pesagens.faltando.length + pesagens.semNenhuma.length ? (
                  <ul className="mt-2">
                    {[...pesagens.faltando, ...pesagens.semNenhuma].map((p) => (
                      <li key={p.contactId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-fio py-2 text-sm last:border-b-0">
                        <Link to={crmModuleRoutes.contact(p.contactId)} className={NOME_LINK}>
                          {p.nome}
                        </Link>
                        <span className="text-[13px] font-medium tabular-nums text-tinta-2">{p.frase}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[13px] font-medium text-tinta-2">Todo mundo em dia.</p>
                )}
              </div>
            </div>
          </BlocoSaber>
        ) : null}

        {enrollOpen && !semEdicao ? (
          <EnrollPanel
            state={state}
            hoje={hoje}
            onEnroll={(input) => {
              void persist((current) => enrollPatientInProgram(current, input));
              setCopyFeedback("Paciente adicionado ao plano de acompanhamento.");
              window.setTimeout(() => setCopyFeedback(""), 6000);
            }}
          />
        ) : null}

        {/* Busca e filtros: canal (o que o paciente fechou) e fase. */}
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CampoBusca valor={search} onMudar={setSearch} rotulo="Buscar paciente" placeholder="Buscar paciente" className="w-full max-w-[320px] max-md:max-w-none" />
            {/* CANAL: o que o paciente fechou. É o filtro que separa quem está em
                acompanhamento de tratamento de quem está no programa. */}
            <GrupoDeLeituras rotulo="Filtrar por canal">
              {(["TODOS", "PROGRAMA_ACOMPANHAMENTO", "CLUBE_BRATAN", "SOMENTE_TRATAMENTO", "SEM_CANAL"] as CanalFiltro[])
                .filter((opcao) => opcao === "TODOS" || porCanal[opcao] > 0)
                .map((opcao) => (
                  <Leitura key={opcao} ativa={canalFiltro === opcao} numero={porCanal[opcao]} tom={opcao === "SEM_CANAL" ? "erro" : undefined} onClick={() => setCanalFiltro(opcao)}>
                    {opcao === "TODOS" ? "Todos" : opcao === "SEM_CANAL" ? "Sem canal" : channelShort[opcao as CrmAdhesionChannel]}
                  </Leitura>
                ))}
            </GrupoDeLeituras>
          </div>
          {phasesInUse.length ? (
            <GrupoDeLeituras rotulo="Filtrar por fase">
              <span className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Fase</span>
              <Leitura ativa={phaseFilter === "TODAS"} onClick={() => setPhaseFilter("TODAS")}>
                Todas as fases
              </Leitura>
              {phasesInUse.map((phase) => (
                <Leitura key={phase} ativa={phaseFilter === phase} onClick={() => setPhaseFilter((current) => (current === phase ? "TODAS" : phase))}>
                  {programPhaseLabels[phase]}
                </Leitura>
              ))}
            </GrupoDeLeituras>
          ) : null}
        </div>

        {filtered.length ? (
          <BlocoFolha as="section" aria-label="Pacientes no plano" className="overflow-hidden">
            <div className="flex h-10 items-center justify-between gap-3 border-b border-fio-2 px-5 text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2 max-md:px-4">
              <span className="tabular-nums">{filtered.length} {filtered.length === 1 ? "paciente" : "pacientes"} no plano</span>
              <span className="hidden sm:inline">check · bio · dr. · próximo passo</span>
            </div>
            {filtered.map((card) => (
              <PatientCard key={card.dealId} card={card} onToggle={(key) => toggle(card.dealId, key)} onResgate={semEdicao ? undefined : (c) => { void persist((current) => criarTarefaDeResgatePorRisco(current, c.dealId, c.risco.motivos, pessoa?.id ?? "coordenacao", hoje)); setCopyFeedback(`Tarefa de resgate criada para ${c.patientName} (enfermagem liga hoje).`); }} />
            ))}
          </BlocoFolha>
        ) : (
          <BlocoFolha>
            <Vazio titulo={board.length ? "Nenhum paciente com esse filtro." : "Nenhum paciente no plano ainda."}>
              {board.length
                ? "Troque o canal ou a fase acima para ver os outros."
                : "Use \"Adicionar paciente ao plano\" para cadastrar quem já está em acompanhamento, ou feche um negócio no Kanban."}
            </Vazio>
          </BlocoFolha>
        )}

        <ListaEsperaCard pessoaId={pessoa?.id ?? null} ativo={syncMode !== "local"} />
        {/* Não fecharam na semana — a lista que vai para a Assistente de Performance */}
        <BlocoSaber as="section" aria-label="Não fecharam" className="py-4 max-md:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TituloDoBloco detalhe={`${notClosed.length} nos últimos ${days} dias`}>Não fecharam</TituloDoBloco>
            <div className="flex flex-wrap items-center gap-2">
              <select value={days} onChange={(event) => setDays(Number(event.target.value))} className={cn(CAMPO_PQ, "w-[104px]")} aria-label="Período de não-fechamento">
                <option value={7}>7 dias</option>
                <option value={14}>14 dias</option>
                <option value={30}>30 dias</option>
              </select>
              <Botao tamanho="pq" variante="secundario" icone={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={() => void copyNotClosed()} disabled={!notClosed.length}>
                Copiar
              </Botao>
              <Botao
                tamanho="pq"
                variante="fantasma"
                aria-expanded={naoFecharamAberto}
                aria-label={naoFecharamAberto ? "Esconder quem não fechou" : "Ver quem não fechou"}
                onClick={() => setNaoFecharamAberto((atual) => !atual)}
              >
                {naoFecharamAberto ? "Esconder" : "Ver"}
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-150 ease-papel", naoFecharamAberto && "rotate-180")} aria-hidden="true" />
              </Botao>
            </div>
          </div>
          <div className={cn("mt-3", !naoFecharamAberto && "hidden")}>
            {notClosed.length === 0 ? (
              <p className="text-[13px] font-medium text-tinta-2">Ninguém em aberto de não-fechamento nesse período.</p>
            ) : (
              <ul>
                {notClosed.map((row) => (
                  <li key={row.deal.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-fio py-2.5 last:border-b-0">
                    <div className="min-w-0">
                      {row.contact ? (
                        <Link to={crmModuleRoutes.contact(row.contact.id)} className={NOME_LINK}>
                          {contactDisplayName(row.contact)}
                        </Link>
                      ) : (
                        <span className="text-sm font-bold text-tinta">Contato</span>
                      )}
                      {row.objection ? <p className="text-[13px] font-medium text-tinta-2">Objeção: {row.objection}</p> : null}
                    </div>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-tinta-2">{formatBR(row.dateISO)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </BlocoSaber>
      </div>
    </AccessGate>
  );
}

function EnrollPanel({
  state,
  hoje,
  onEnroll,
}: {
  state: ReturnType<typeof useCrmState>["state"];
  hoje: string;
  onEnroll: (input: { contactId: string; startDate: string; channel: CrmAdhesionChannel; checksDone: number; biosDone: number; medicoDone: number }) => void;
}) {
  const [contactId, setContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [startDate, setStartDate] = useState(hoje);
  const [channel, setChannel] = useState<CrmAdhesionChannel>("PROGRAMA_ACOMPANHAMENTO");
  const [checksDone, setChecksDone] = useState("0");
  const [biosDone, setBiosDone] = useState("0");
  const [medicoDone, setMedicoDone] = useState("0");
  const [error, setError] = useState("");

  const suggestions = useMemo(() => patientsNotInProgram(state, hoje), [state, hoje]);
  const matches = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    if (!term) return suggestions.slice(0, 8);
    return suggestions.filter((contact) => contactDisplayName(contact).toLowerCase().includes(term)).slice(0, 8);
  }, [suggestions, contactSearch]);
  const selected = state.contacts.find((contact) => contact.id === contactId);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!contactId) return setError("Escolha o paciente na lista.");
    if (!startDate) return setError("Informe a data de início (adesão).");
    onEnroll({
      contactId,
      startDate,
      channel,
      checksDone: Number(checksDone) || 0,
      biosDone: Number(biosDone) || 0,
      medicoDone: Number(medicoDone) || 0,
    });
    setContactId("");
    setContactSearch("");
    setChecksDone("0");
    setBiosDone("0");
    setMedicoDone("0");
  }

  return (
    <BlocoFolha as="section" aria-labelledby="titulo-adicionar-ao-plano" respiro>
      <TituloDoBloco id="titulo-adicionar-ao-plano" icone={<UserPlus className="h-4 w-4" aria-hidden="true" />}>
        Adicionar paciente ao plano
      </TituloDoBloco>
      <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
        Para quem já está em acompanhamento (entrou antes do app). Escolha o paciente, a data de adesão e quantos passos já fez.
      </p>
      <form className="mt-5 grid gap-5" onSubmit={submit}>
        <Campo rotulo="Paciente" htmlFor="adesao-paciente">
          {selected ? (
            <div className="flex items-center justify-between gap-2 rounded-controle border border-musgo bg-musgo-claro px-3 py-1.5">
              <span className="truncate text-sm font-bold text-tinta">{contactDisplayName(selected)}</span>
              <Botao tamanho="pq" variante="fantasma" onClick={() => setContactId("")}>
                Trocar
              </Botao>
            </div>
          ) : (
            <>
              <input id="adesao-paciente" value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Buscar paciente ativo/fechado..." className={CAMPO} />
              <div className="flex flex-wrap gap-1.5">
                {matches.length ? (
                  matches.map((contact) => (
                    <button key={contact.id} type="button" onClick={() => setContactId(contact.id)} className={classeDoChip(false)}>
                      {contactDisplayName(contact)}
                    </button>
                  ))
                ) : (
                  <p className="text-[13px] font-medium text-tinta-2">Nenhum paciente encontrado com esse nome.</p>
                )}
              </div>
            </>
          )}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data de adesão" htmlFor="adesao-data">
            <input id="adesao-data" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={cn(CAMPO, "tabular-nums")} />
          </Campo>
          <Campo rotulo="Canal" htmlFor="adesao-canal">
            <select id="adesao-canal" value={channel} onChange={(event) => setChannel(event.target.value as CrmAdhesionChannel)} className={cn(CAMPO, "cursor-pointer")}>
              {channelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <fieldset className="grid gap-2">
          <legend className="font-sans text-[13px] font-bold leading-5 text-tinta">Quantos já fez? (deixe 0 se está começando)</legend>
          <div className="grid grid-cols-3 gap-3 max-md:gap-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-tinta-2">Checkpoints (0–6)</span>
              <input value={checksDone} onChange={(event) => setChecksDone(event.target.value)} inputMode="numeric" className={cn(CAMPO, "tabular-nums")} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-tinta-2">Bioimped. (0–6)</span>
              <input value={biosDone} onChange={(event) => setBiosDone(event.target.value)} inputMode="numeric" className={cn(CAMPO, "tabular-nums")} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-tinta-2">Consultas (0–3)</span>
              <input value={medicoDone} onChange={(event) => setMedicoDone(event.target.value)} inputMode="numeric" className={cn(CAMPO, "tabular-nums")} />
            </label>
          </div>
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-erro">
            {error}
          </p>
        ) : null}
        <div>
          <Botao type="submit" variante="primario" icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
            Adicionar ao plano
          </Botao>
        </div>
      </form>
    </BlocoFolha>
  );
}

// O semáforo de adesão: cor + forma + palavra (a cor nunca fala sozinha).
const corDoRisco = { VERDE: "bg-ok", AMARELO: "bg-atencao", VERMELHO: "bg-erro" } as const;
const palavraDoRisco = { VERDE: "verde", AMARELO: "amarelo", VERMELHO: "vermelho" } as const;

// UMA LINHA POR PACIENTE (16/09/2026). Era um cartão de ~200 px: título, frase do
// semáforo, mês, três blocos de progresso e a faixa do próximo passo. Com a
// clínica inteira no plano, a tela virava rolagem sem fim. Agora cabe tudo em
// uma linha — nome, fase, semáforo, contadores e o próximo passo — e o detalhe
// (marcos para marcar, data de adesão, motivo do semáforo) abre no toque.
// Papel & Musgo (08/10/2026): a linha atrasada ganha um traço laranja na borda
// (não um fundo vermelho), e o detalhe aberto mora no saber.
function PatientCard({ card, onToggle, onResgate }: { card: ProgramPatientCard; onToggle: (key: string) => void; onResgate?: (card: ProgramPatientCard) => void }) {
  const [open, setOpen] = useState(false);
  const next = card.nextMilestone;

  return (
    <div className={cn("border-b border-fio last:border-b-0", card.overdueCount > 0 && "shadow-[inset_3px_0_0_rgb(var(--atencao-rgb))]")}>
      {/* No computador, colunas alinhadas (nome · canal e fase · marcos · próximo passo); no celular, a linha quebra. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-2.5 max-md:px-4 lg:grid lg:grid-cols-[2rem_0.625rem_minmax(0,1.1fr)_minmax(0,1fr)_10.5rem_minmax(0,1.25fr)] lg:gap-x-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? `Esconder os marcos de ${card.patientName}` : `Ver os marcos de ${card.patientName}`}
          className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-controle text-tinta-2 transition-colors duration-150 ease-papel hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-150 ease-papel", open && "rotate-180")} aria-hidden="true" />
        </button>

        <span
          role="img"
          title={card.risco.frase}
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", corDoRisco[card.risco.nivel])}
          aria-label={`Semáforo ${palavraDoRisco[card.risco.nivel]}`}
        />

        <Link
          to={`/crm/contatos/${card.contactId}`}
          className={cn(NOME_LINK, "min-w-[8rem] flex-1")}
          title={`Mês ${card.monthOfProgram}/${card.grade.meses} · adesão ${formatBR(card.startedAt)}`}
        >
          {card.patientName}
        </Link>

        <span className="hidden min-w-0 shrink-0 truncate text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2 sm:inline">
          {card.channel ? `${channelShort[card.channel]} · ` : ""}
          {card.phaseLabel}
        </span>

        {/* Os totais vêm da GRADE DO CANAL (17/09/2026): o Clube dá direito a duas
            bioimpedâncias e duas consultas, e quem comprou só tratamento não tem
            marco nenhum. Antes todos apareciam devendo 6/6/3. */}
        <span className="flex shrink-0 items-center gap-1">
          {card.grade.CHECK.length > 0 ? <ProgressPill label="Checkpoints" done={card.checksDone} total={card.grade.CHECK.length} icon={ClipboardCheck} /> : null}
          {card.grade.BIO.length > 0 ? <ProgressPill label="Bioimpedâncias" done={card.biosDone} total={card.grade.BIO.length} icon={HeartPulse} /> : null}
          {card.grade.MEDICO.length > 0 ? <ProgressPill label="Consultas com o Dr." done={card.medicoDone} total={card.grade.MEDICO.length} icon={Stethoscope} /> : null}
          {card.milestones.length === 0 ? <span className="text-xs font-semibold text-tinta-2">só tratamento</span> : null}
        </span>

        <span className="min-w-[10rem] flex-1 text-[13px] leading-5 sm:text-right lg:min-w-0">
          {next ? (
            <>
              <span className="font-medium text-tinta-2">{next.label} · </span>
              <span className={cn("font-bold tabular-nums", next.overdue ? "text-atencao" : "text-tinta")}>
                {formatBR(next.expectedDate)}
                {next.overdue ? " (atrasado)" : ""}
              </span>
            </>
          ) : card.milestones.length === 0 ? (
            <span className="font-medium text-tinta-2">sem marcos — acompanhamento do tratamento</span>
          ) : (
            <span className="font-bold text-ok">Caminhada completa</span>
          )}
        </span>
      </div>

      {card.risco.nivel === "VERMELHO" ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-3 pl-[5.375rem] text-[13px] lg:pl-[5.875rem] font-semibold leading-5 text-erro max-md:px-4">
          {card.risco.frase}
          {onResgate ? (
            <Botao tamanho="pq" variante="suave" onClick={() => onResgate(card)}>
              Criar tarefa de resgate (ligar hoje)
            </Botao>
          ) : null}
        </p>
      ) : null}

      {open ? (
        <div className="grid gap-2.5 border-t border-fio bg-saber px-5 py-4 max-md:px-4">
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            Mês {card.monthOfProgram}/{card.grade.meses} · adesão {formatBR(card.startedAt)}
            {card.channel ? ` · ${channelShort[card.channel]}` : ""} · {card.phaseLabel}
            {card.risco.nivel === "AMARELO" ? ` · ${card.risco.frase}` : ""}
          </p>
          {(["CHECK", "BIO", "MEDICO"] as const).map((type) => (
            <div key={type} className="flex flex-wrap items-center gap-1.5">
              <span className="w-52 shrink-0 text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2 max-md:w-full">
                {milestoneTypeLabels[type]} <span className="font-medium normal-case tracking-normal">· {milestoneResponsible[type]}</span>
              </span>
              {card.milestones
                .filter((milestone) => milestone.type === type)
                .sort((a, b) => a.n - b.n)
                .map((milestone) => (
                  <MilestoneChip key={milestone.key} milestone={milestone} onToggle={() => onToggle(milestone.key)} />
                ))}
            </div>
          ))}
          <p className="text-xs font-medium leading-4 text-tinta-2">
            Cada setor marca o que faz (toque para marcar/desfazer). Datas previstas contam da adesão; a agenda oficial fica no Feegow.
          </p>
        </div>
      ) : null}
    </div>
  );
}
