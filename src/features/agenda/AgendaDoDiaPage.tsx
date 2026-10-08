// AGENDA DO DIA (29/09/2026)
//
// Lucas: "gostaria também que tivesse a agenda do dia do iClinic no aplicativo".
// A tela mostra o dia por profissional, a partir do espelho do iClinic (lido de
// hora em hora), e deixa a recepção marcar Veio/Faltou — o que alimenta o
// relatório semanal do médico. As regras moram em agendaDoDia.ts (testadas);
// aqui só se desenha. Dia e profissional ficam no endereço (?dia=&prof=), para
// o link mandado a um colega abrir no mesmo lugar.
//
// REDESENHO "PAPEL & MUSGO", ETAPA 2 (08/10/2026): a aba "Agenda do dia" do
// Início › Hoje. Um cabeçalho só (a frase do dia vira a frase do cabeçalho),
// cada profissional numa folha, Veio/Faltou como botões de decisão na linha, a
// semana do relatório num bloco "saber". Sem vidro, sem pílula colorida, sem
// fonte mono. O que a tela faz não muda: mesmas leituras, mesmas marcações,
// mesmos avisos e as mesmas URLs (?dia=&prof=).
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CircleSlash, Info, RefreshCw, UserRoundX, XCircle } from "lucide-react";
import { BlocoFolha, BlocoSaber } from "@/components/ui/blocos";
import { Botao } from "@/components/ui/botao";
import { Cabecalho } from "@/components/ui/cabecalho";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  buscarAgendaAgora,
  listAgendaDoPeriodo,
  listFichasParaAgenda,
  listPresencasDoPeriodo,
  listSaudeDaAgenda,
  salvarPresenca,
  ultimaSincronizacaoDaAgenda,
} from "@/lib/remote/agenda";
import {
  PROFISSIONAIS_ICLINIC,
  chaveDaPresenca,
  diaCurto,
  diaDaSemana,
  fraseDoTopo,
  frescorDoEspelho,
  linhaDaPresenca,
  montarItens,
  nomeDoProfissional,
  resumirItens,
  resumoDaSemana,
  rotuloDoDia,
  saudeDosCalendarios,
  semanaDoRelatorio,
  somarDias,
  type ItemDaAgenda,
  type Presenca,
} from "./agendaDoDia";

const CINCO_MIN = 5 * 60_000;
const COR_PRIMEIRA_CONSULTA = "#4be0de";

function diaValido(valor: string | null) {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}

// A porta (módulo "agenda") fica na rota, em src/App.tsx.
export function AgendaDoDiaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const podeEditar = canEditModule(pessoa, "agenda");
  const remoto = Boolean(supabase && session && !isPreview);
  const hoje = todayISO();
  const [params, setParams] = useSearchParams();
  const dia = diaValido(params.get("dia")) ?? hoje;
  const profissional = params.get("prof") || null; // null = todos
  const queryClient = useQueryClient();
  const [buscando, setBuscando] = useState(false);

  const irPara = (mudanca: { dia?: string; prof?: string | null }) => {
    const proximo = new URLSearchParams(params);
    const novoDia = mudanca.dia ?? dia;
    if (novoDia === hoje) proximo.delete("dia");
    else proximo.set("dia", novoDia);
    if (mudanca.prof !== undefined) {
      if (mudanca.prof) proximo.set("prof", mudanca.prof);
      else proximo.delete("prof");
    }
    setParams(proximo, { replace: true });
  };

  // A semana do relatório (sexta a quinta) contém o dia: uma leitura serve ao
  // dia e ao resumo da semana.
  const semana = semanaDoRelatorio(dia);
  const espelhoQuery = useQuery({ queryKey: ["agenda-espelho", semana.de, semana.ate], queryFn: () => listAgendaDoPeriodo(semana.de, semana.ate), enabled: remoto, refetchInterval: CINCO_MIN });
  const presencasQuery = useQuery({ queryKey: ["agenda-presenca", semana.de, semana.ate], queryFn: () => listPresencasDoPeriodo(semana.de, semana.ate), enabled: remoto, refetchInterval: CINCO_MIN });
  const fichasQuery = useQuery({ queryKey: ["agenda-fichas"], queryFn: listFichasParaAgenda, enabled: remoto, staleTime: CINCO_MIN });
  const saudeQuery = useQuery({ queryKey: ["agenda-saude", hoje], queryFn: () => listSaudeDaAgenda(somarDias(hoje, -2)), enabled: remoto, staleTime: CINCO_MIN });
  const syncQuery = useQuery({ queryKey: ["agenda-ultima-sync"], queryFn: ultimaSincronizacaoDaAgenda, enabled: remoto, refetchInterval: CINCO_MIN });

  const itensDaSemana = useMemo(
    () => montarItens({ linhas: espelhoQuery.data ?? [], presencas: presencasQuery.data?.linhas ?? [], contatos: fichasQuery.data ?? [], hojeISO: hoje }),
    [espelhoQuery.data, presencasQuery.data, fichasQuery.data, hoje],
  );
  const itensDoDia = useMemo(() => itensDaSemana.filter((i) => i.dia === dia), [itensDaSemana, dia]);
  const itensVisiveis = useMemo(() => (profissional ? itensDoDia.filter((i) => i.profissionalChave === profissional) : itensDoDia), [itensDoDia, profissional]);
  const saude = useMemo(() => saudeDosCalendarios(saudeQuery.data ?? [], Date.now()), [saudeQuery.data]);
  const frescor = frescorDoEspelho(syncQuery.data ?? null, Date.now());
  const frase = fraseDoTopo(itensDoDia, dia, hoje, profissional);
  const focoDaSemana = profissional ?? "dr-daniel";
  const semanaResumo = resumoDaSemana(itensDaSemana, dia, hoje, focoDaSemana);

  // Grupos por profissional, na ordem do iClinic; rótulo desconhecido vai no fim.
  const grupos = useMemo(() => {
    const ordem = PROFISSIONAIS_ICLINIC.map((p) => p.chave);
    const chaves = [...new Set(itensVisiveis.map((i) => i.profissionalChave))].sort((a, b) => {
      const ia = ordem.indexOf(a);
      const ib = ordem.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return chaves.map((chave) => ({ chave, itens: itensVisiveis.filter((i) => i.profissionalChave === chave) }));
  }, [itensVisiveis]);

  const presencaPorChave = useMemo(() => new Map((presencasQuery.data?.linhas ?? []).map((p) => [chaveDaPresenca(p.origem, p.origem_id), p])), [presencasQuery.data]);

  const marcar = useMutation({
    mutationFn: async (entrada: { item: ItemDaAgenda; presenca?: "VEIO" | "FALTOU" | null; primeiraConsulta?: boolean | null }) => {
      const atual = presencaPorChave.get(chaveDaPresenca(entrada.item.origem, entrada.item.origemId));
      await salvarPresenca(linhaDaPresenca(entrada.item, { presenca: entrada.presenca, primeiraConsulta: entrada.primeiraConsulta }, atual));
    },
    onMutate: async (entrada) => {
      const chave = ["agenda-presenca", semana.de, semana.ate];
      await queryClient.cancelQueries({ queryKey: chave });
      const guardado = queryClient.getQueryData<{ linhas: Presenca[]; tabelaPronta: boolean }>(chave);
      const antes = guardado?.linhas ?? [];
      const id = chaveDaPresenca(entrada.item.origem, entrada.item.origemId);
      const atual = antes.find((p) => chaveDaPresenca(p.origem, p.origem_id) === id);
      const linha = linhaDaPresenca(entrada.item, { presenca: entrada.presenca, primeiraConsulta: entrada.primeiraConsulta }, atual);
      const nova: Presenca = { origem: linha.origem, origem_id: linha.origem_id, presenca: linha.presenca, primeira_consulta: linha.primeira_consulta, marcado_por_nome: pessoa?.nome ?? null, marcado_em: new Date().toISOString() };
      queryClient.setQueryData(chave, { linhas: [...antes.filter((p) => chaveDaPresenca(p.origem, p.origem_id) !== id), nova], tabelaPronta: guardado?.tabelaPronta ?? true });
      return { guardado };
    },
    onError: (erro, _entrada, contexto) => {
      if (contexto?.guardado) queryClient.setQueryData(["agenda-presenca", semana.de, semana.ate], contexto.guardado);
      const texto = erro instanceof Error ? erro.message : String(erro);
      toast(/agenda_presenca|does not exist|schema cache/i.test(texto) ? "Ainda não dá para marcar: a tabela de presença não foi criada no banco. Avise o Lucas." : `Não consegui guardar agora: ${texto}`, { tom: "erro" });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["agenda-presenca", semana.de, semana.ate] }),
  });

  async function buscarAgora() {
    setBuscando(true);
    try {
      const r = await buscarAgendaAgora();
      if (r.ok) toast("Agenda lida de novo no iClinic.", { tom: "ok" });
      else toast(r.error ?? r.erros?.join(" · ") ?? "A leitura voltou com erro. Tente de novo em alguns minutos.", { tom: "atencao" });
      await queryClient.invalidateQueries({ queryKey: ["agenda-espelho"] });
      await queryClient.invalidateQueries({ queryKey: ["agenda-ultima-sync"] });
      await queryClient.invalidateQueries({ queryKey: ["agenda-saude"] });
    } finally {
      // Um minuto de folga: o Google devolve "muitas leituras" (429) se apertar sem parar.
      setTimeout(() => setBuscando(false), 60_000);
    }
  }

  const carregando = espelhoQuery.isLoading || presencasQuery.isLoading;
  const erro = espelhoQuery.error ?? null;
  const presencaSemTabela = remoto && presencasQuery.data?.tabelaPronta === false;
  const profissionalSemCalendario = profissional ? saude.find((s) => s.chave === profissional && !s.ligado) : undefined;
  const avisosDeCalendario = saude.filter((s) => s.aviso && s.ligado);
  const semCalendario = saude.filter((s) => !s.ligado);

  // Botão pequeno de navegação do dia (40 px, ícone de 16 px).
  const SETA =
    "grid h-10 w-10 shrink-0 place-items-center rounded-controle border border-fio-2 bg-folha text-tinta transition-colors hover:border-borda-campo hover:bg-papel " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";

  return (
    <div className="mx-auto w-full max-w-[1200px] font-sans text-tinta">
      <Cabecalho
        sobrancelha="Início · Hoje · iClinic"
        titulo="Agenda do dia"
        frase={
          !remoto
            ? "Quem vem hoje, com quem e em que horário. Quando o paciente chegar (ou não vier), marque Veio ou Faltou."
            : carregando
              ? "Lendo a agenda…"
              : frase
        }
        acoes={
          remoto ? (
            <Botao
              variante="secundario"
              icone={<RefreshCw className={cn("h-4 w-4", buscando && "motion-safe:animate-spin")} aria-hidden="true" />}
              disabled={buscando}
              onClick={() => void buscarAgora()}
            >
              {buscando ? "Lido agora — espere 1 minuto" : "Buscar agora no iClinic"}
            </Botao>
          ) : null
        }
      />

      {/* A lista do dia não precisa da largura toda: lê-se melhor em até 960 px. */}
      <div className="max-w-[960px]">
      {/* Dia e profissional (ficam no endereço: ?dia=&prof=) */}
      <div className="mb-6 grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={SETA} aria-label="Dia anterior" onClick={() => irPara({ dia: somarDias(dia, -1) })}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-[9.5rem] px-1 text-center">
            <p className="font-serifa text-xl leading-7 text-tinta">{rotuloDoDia(dia, hoje)}</p>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              {diaDaSemana(dia)}, {diaCurto(dia)}
            </p>
          </div>
          <button type="button" className={SETA} aria-label="Dia seguinte" onClick={() => irPara({ dia: somarDias(dia, 1) })}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          {dia !== hoje ? (
            <Botao variante="fantasma" tamanho="pq" onClick={() => irPara({ dia: hoje })}>
              Voltar para hoje
            </Botao>
          ) : null}
          <input
            type="date"
            value={dia}
            onChange={(evento) => diaValido(evento.target.value) && irPara({ dia: evento.target.value })}
            className="h-10 rounded-controle border border-borda-campo bg-folha px-3 text-sm font-medium text-tinta focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco"
            aria-label="Escolher o dia"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Profissional">
          {[{ chave: null as string | null, rotulo: "Todos" }, ...PROFISSIONAIS_ICLINIC.map((p) => ({ chave: p.chave as string | null, rotulo: p.curto }))].map((opcao) => {
            const ativo = profissional === opcao.chave;
            return (
              <button
                key={opcao.chave ?? "todos"}
                type="button"
                onClick={() => irPara({ prof: opcao.chave })}
                aria-pressed={ativo}
                className={cn(
                  "inline-flex h-8 items-center rounded-controle border px-3 text-[13px] font-bold leading-5 transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
                  ativo ? "border-musgo bg-musgo text-sobre-musgo" : "border-fio-2 bg-folha text-tinta hover:border-borda-campo hover:bg-papel",
                )}
              >
                {opcao.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {!remoto ? (
        <Aviso tom="info">Modo de demonstração: a agenda do iClinic só aparece com o login da clínica.</Aviso>
      ) : (
        <div className="grid gap-4">
          {/* De quando é o espelho */}
          <p className="flex flex-wrap items-center gap-x-1 text-[13px] font-medium leading-5 text-tinta-2">
            {frescor.texto}
            <InfoTip title="De onde vem esta agenda">
              O iClinic copia cada agenda para um calendário do Google, e o app lê esses calendários de hora em hora (aos 5 minutos de cada hora). É um espelho: marcar ou desmarcar continua sendo no iClinic. O que mudou lá aparece aqui na próxima leitura, ou na hora, pelo botão ao lado.
            </InfoTip>
          </p>

          {frescor.atrasado ? (
            <Aviso tom="atencao">
              {frescor.semDados
                ? "A agenda ainda não chegou do iClinic. Toque em “Buscar agora no iClinic”; se continuar vazia, avise o Lucas."
                : `Atenção: a agenda não é atualizada há mais de 2 horas (${frescor.texto}). O que foi marcado ou desmarcado no iClinic depois disso ainda não aparece aqui. Toque em “Buscar agora no iClinic”; se continuar parada, avise o Lucas e confira no próprio iClinic.`}
            </Aviso>
          ) : null}
          {avisosDeCalendario.map((s) => (
            <Aviso key={s.chave} tom="atencao">
              {s.aviso}
            </Aviso>
          ))}
          {semCalendario.length && !profissional ? (
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              Sem calendário ligado: {semCalendario.map((s) => `${s.nome} (${s.funcao})`).join(", ")} — a agenda {semCalendario.length === 1 ? "dela" : "deles"} ainda não aparece aqui.
            </p>
          ) : null}
          {presencaSemTabela ? <Aviso tom="info">Veio/Faltou ainda não grava: a tabela de presença não foi criada no banco. A agenda aparece normalmente; avise o Lucas.</Aviso> : null}
          {erro ? <Aviso tom="erro">Não consegui ler a agenda agora ({erro instanceof Error ? erro.message : String(erro)}). Tente de novo em instantes.</Aviso> : null}

          {/* O dia */}
          {!carregando && !erro && grupos.length === 0 ? (
            <BlocoSaber>
              <p className="text-sm font-medium leading-6 text-tinta-2">
                {profissionalSemCalendario ? (
                  <>
                    A agenda de {profissionalSemCalendario.nome} ainda não chega ao app: falta ligar o calendário dela no Google (quem liga é o Lucas, em Administração → Integrações). Até lá, confira no iClinic.
                  </>
                ) : (
                  <>
                    Nenhuma consulta {profissional ? `de ${nomeDoProfissional(profissional)} ` : ""}neste dia no espelho. Se no iClinic tem consulta, toque em “Buscar agora no iClinic”. Se continuar vazio, o calendário desse profissional pode ter parado — veja os avisos acima e confira no iClinic.
                  </>
                )}
              </p>
            </BlocoSaber>
          ) : null}

          {grupos.map((grupo) => {
            const resumo = resumirItens(grupo.itens);
            const idGrupo = `agenda-${grupo.chave.replace(/[^a-z0-9]+/gi, "-")}`;
            return (
              <BlocoFolha key={grupo.chave} as="section" aria-labelledby={idGrupo} className="overflow-hidden">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pb-3 pt-5">
                  <h2 id={idGrupo} className="text-base font-bold leading-6 text-tinta">
                    {grupo.itens[0]?.profissional ?? nomeDoProfissional(grupo.chave)}
                  </h2>
                  <span className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                    {resumo.consultas} {resumo.consultas === 1 ? "consulta" : "consultas"} · {resumo.novas} {resumo.novas === 1 ? "nova" : "novas"} · {resumo.vagas} {resumo.vagas === 1 ? "vaga livre" : "vagas livres"}
                    {resumo.desmarcadas ? ` · ${resumo.desmarcadas} desmarcada${resumo.desmarcadas > 1 ? "s" : ""}` : ""}
                  </span>
                </div>
                <ul>
                  {grupo.itens.map((item) => (
                    <LinhaDaAgenda key={item.id} item={item} podeEditar={podeEditar} salvando={marcar.isPending} aoMarcar={(mudanca) => marcar.mutate({ item, ...mudanca })} />
                  ))}
                </ul>
              </BlocoFolha>
            );
          })}

          {/* A semana do relatório do médico */}
          <BlocoSaber as="section" aria-labelledby="agenda-semana">
            <h2 id="agenda-semana" className="flex items-center gap-1 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
              Semana do relatório
              <InfoTip title="Como esta conta é feita">
                A semana vai de sexta a quinta, igual ao check-in semanal. Contam só as consultas de paciente até hoje; desmarcadas no iClinic, vagas e bloqueios ficam de fora. “Sem registro” é consulta que já passou e ninguém marcou Veio nem Faltou — marque para o relatório do médico sair certo.
              </InfoTip>
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-tinta">{semanaResumo.frase}</p>
            {!profissional ? <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">Escolha outro profissional acima para ver a semana dele.</p> : null}
          </BlocoSaber>
        </div>
      )}
      </div>
    </div>
  );
}

function Aviso({ tom, children }: { tom: "info" | "atencao" | "erro"; children: React.ReactNode }) {
  const Icone = tom === "info" ? Info : AlertTriangle;
  return (
    <div
      role={tom === "erro" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-bloco px-4 py-3 text-sm font-semibold leading-5",
        tom === "atencao" && "bg-atencao-claro text-atencao",
        tom === "erro" && "bg-erro-claro text-erro",
        tom === "info" && "bg-saber text-tinta",
      )}
    >
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function LinhaDaAgenda({
  item,
  podeEditar,
  salvando,
  aoMarcar,
}: {
  item: ItemDaAgenda;
  podeEditar: boolean;
  salvando: boolean;
  aoMarcar: (mudanca: { presenca?: "VEIO" | "FALTOU" | null; primeiraConsulta?: boolean | null }) => void;
}) {
  const horario = (
    <span className="w-[6.5rem] shrink-0 whitespace-nowrap text-sm font-bold leading-6 tabular-nums text-tinta">
      {item.horario}
      <span className="font-medium text-tinta-2">–{item.fimHorario}</span>
    </span>
  );

  if (item.tipo === "VAGA") {
    return (
      <li className="flex flex-wrap items-center gap-x-3 border-t border-dashed border-fio-2 px-4 py-2.5 text-sm text-tinta-2">
        {horario}
        <span className="font-semibold">Vaga livre</span>
        <span className="text-[13px]">(“AGENDAR CONSULTA” no iClinic)</span>
      </li>
    );
  }

  if (item.tipo === "BLOQUEIO") {
    return (
      <li className="flex items-center gap-3 border-t border-fio px-4 py-2.5 text-sm text-tinta-2">
        {horario}
        <CircleSlash className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{item.nome}</span>
        <span className="text-[13px]">(não é paciente)</span>
      </li>
    );
  }

  const primeira = item.novidade.novo === true;
  return (
    <li className={cn("border-t border-fio px-4 py-3", item.cancelada && "bg-papel")}>
      {/* Grade: horário · paciente · Veio/Faltou. No celular os botões descem para baixo do nome. */}
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 md:grid-cols-[6.5rem_minmax(0,1fr)_auto]">
        {horario}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {item.ficha.status === "FICHA" ? (
              <Link
                to={`/crm/contatos/${item.ficha.contatoId}`}
                className={cn("text-sm font-bold leading-6 text-tinta underline-offset-[3px] hover:underline", item.cancelada && "text-tinta-2 line-through")}
              >
                {item.nome}
              </Link>
            ) : (
              <span className={cn("text-sm font-bold leading-6 text-tinta", item.cancelada && "text-tinta-2 line-through")}>{item.nome}</span>
            )}
            {primeira ? (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-controle bg-saber px-2 text-xs font-bold leading-5 text-tinta">
                {/* A cor verde-água é a da Primeira consulta no iClinic: a mesma marca que a recepção vê lá. */}
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_PRIMEIRA_CONSULTA }} aria-hidden="true" />
                Primeira consulta
                {item.novidade.fonte === "recepcao" ? <span className="font-medium text-tinta-2">(marcado pela recepção)</span> : null}
              </span>
            ) : null}
            {item.cancelada ? <span className="text-xs font-bold text-erro">Desmarcada no iClinic</span> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium leading-5 text-tinta-2">
            {item.ficha.status === "FICHA" ? (
              <span>ficha do CRM ligada</span>
            ) : item.ficha.status === "DUVIDA" ? (
              <span className="inline-flex items-center">
                sem ficha
                <InfoTip title="Por que não ligou">
                  Há {item.ficha.quantas} fichas no CRM com nome parecido. Para não ligar a pessoa errada, o app não escolhe: procure no CRM e confira.
                </InfoTip>
              </span>
            ) : (
              <span>sem ficha</span>
            )}
            {!item.cancelada ? <SeloConfirmacao item={item} /> : null}
            {!item.cancelada && item.novidade.novo === null && podeEditar ? (
              <button type="button" className="text-left font-bold text-musgo underline-offset-[3px] hover:underline disabled:opacity-60" disabled={salvando} onClick={() => aoMarcar({ primeiraConsulta: true })}>
                Está verde-água no iClinic? Marcar como primeira consulta
              </button>
            ) : null}
            {item.novidade.fonte === "recepcao" && podeEditar && !item.cancelada ? (
              <button type="button" className="text-left font-semibold underline-offset-[3px] hover:underline disabled:opacity-60" disabled={salvando} onClick={() => aoMarcar({ primeiraConsulta: null })}>
                desfazer primeira consulta
              </button>
            ) : null}
          </div>
        </div>
        {!item.cancelada ? (
          <div className="col-start-2 md:col-start-auto">
            <BotoesDePresenca item={item} podeEditar={podeEditar} salvando={salvando} aoMarcar={aoMarcar} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function SeloConfirmacao({ item }: { item: ItemDaAgenda }) {
  const { chave, rotulo } = item.confirmacao;
  return (
    <span
      className={cn(
        "font-bold",
        chave === "CONFIRMOU" && "text-ok",
        chave === "REMARCAR" && "text-atencao",
        chave === "SEM_RESPOSTA" && "font-medium text-tinta-2",
      )}
    >
      {rotulo}
      {chave === "REMARCAR" ? " pelo portal" : ""}
    </span>
  );
}

function BotoesDePresenca({
  item,
  podeEditar,
  salvando,
  aoMarcar,
}: {
  item: ItemDaAgenda;
  podeEditar: boolean;
  salvando: boolean;
  aoMarcar: (mudanca: { presenca?: "VEIO" | "FALTOU" | null }) => void;
}) {
  if (!item.podeMarcarPresenca) {
    return <span className="inline-block pt-0.5 text-[13px] font-medium text-tinta-2">Veio/Faltou abre no dia</span>;
  }
  if (!podeEditar) {
    return (
      <span className={cn("inline-block pt-0.5 text-[13px] font-bold", item.presenca === "VEIO" ? "text-ok" : item.presenca === "FALTOU" ? "text-erro" : "text-tinta-2")}>
        {item.presenca === "VEIO" ? "Veio" : item.presenca === "FALTOU" ? "Faltou" : "Sem registro"}
      </span>
    );
  }
  const alternar = (valor: "VEIO" | "FALTOU") => aoMarcar({ presenca: item.presenca === valor ? null : valor });
  const BASE =
    "inline-flex h-8 items-center gap-1.5 rounded-controle border px-3 text-[13px] font-bold leading-5 transition-colors disabled:cursor-progress disabled:opacity-70 " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco max-md:h-11";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Presença de ${item.nome}`}>
      <button
        type="button"
        disabled={salvando}
        aria-pressed={item.presenca === "VEIO"}
        onClick={() => alternar("VEIO")}
        title={item.presenca === "VEIO" && item.presencaPor ? `Marcado por ${item.presencaPor}` : undefined}
        className={cn(BASE, item.presenca === "VEIO" ? "border-ok bg-ok text-folha" : "border-fio-2 bg-folha text-tinta hover:border-ok hover:bg-ok-claro")}
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Veio
      </button>
      <button
        type="button"
        disabled={salvando}
        aria-pressed={item.presenca === "FALTOU"}
        onClick={() => alternar("FALTOU")}
        title={item.presenca === "FALTOU" && item.presencaPor ? `Marcado por ${item.presencaPor}` : undefined}
        className={cn(BASE, item.presenca === "FALTOU" ? "border-erro bg-erro text-folha" : "border-fio-2 bg-folha text-tinta hover:border-erro hover:bg-erro-claro")}
      >
        {item.presenca === "FALTOU" ? <UserRoundX className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />} Faltou
      </button>
    </div>
  );
}
