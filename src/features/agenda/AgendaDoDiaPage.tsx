// AGENDA DO DIA (29/09/2026)
//
// Lucas: "gostaria também que tivesse a agenda do dia do iClinic no aplicativo".
// A tela mostra o dia por profissional, a partir do espelho do iClinic (lido de
// hora em hora), e deixa a recepção marcar Veio/Faltou — o que alimenta o
// relatório semanal do médico. As regras moram em agendaDoDia.ts (testadas);
// aqui só se desenha. Dia e profissional ficam no endereço (?dia=&prof=), para
// o link mandado a um colega abrir no mesmo lugar.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleSlash, RefreshCw, UserRoundX, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <Badge variant="gold">iClinic</Badge>
            <h1 className="mt-2 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
              <CalendarDays className="h-8 w-8 text-brand-oliva" aria-hidden="true" />
              Agenda do dia
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Quem vem hoje, com quem e em que horário. Quando o paciente chegar (ou não vier), marque Veio ou Faltou.</p>
          </div>
        </div>

        {/* Dia */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Dia anterior" onClick={() => irPara({ dia: somarDias(dia, -1) })}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="min-w-[10rem] text-center">
            <p className="text-lg font-semibold text-brand-tinta">{rotuloDoDia(dia, hoje)}</p>
            <p className="text-xs text-muted-foreground">
              {diaDaSemana(dia)}, {diaCurto(dia)}
            </p>
          </div>
          <Button type="button" variant="outline" size="icon" aria-label="Dia seguinte" onClick={() => irPara({ dia: somarDias(dia, 1) })}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          {dia !== hoje ? (
            <Button type="button" variant="subtle" size="sm" onClick={() => irPara({ dia: hoje })}>
              Voltar para hoje
            </Button>
          ) : null}
          <input
            type="date"
            value={dia}
            onChange={(evento) => diaValido(evento.target.value) && irPara({ dia: evento.target.value })}
            className="h-9 rounded-md border border-border bg-white/60 px-2 text-sm"
            aria-label="Escolher o dia"
          />
        </div>

        {/* Profissional */}
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Profissional">
          {[{ chave: null as string | null, rotulo: "Todos" }, ...PROFISSIONAIS_ICLINIC.map((p) => ({ chave: p.chave as string | null, rotulo: p.curto }))].map((opcao) => (
            <button
              key={opcao.chave ?? "todos"}
              type="button"
              onClick={() => irPara({ prof: opcao.chave })}
              aria-pressed={profissional === opcao.chave}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                profissional === opcao.chave ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-oliva/25 bg-white/60 text-brand-tinta hover:bg-white",
              )}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
      </motion.section>

      {!remoto ? (
        <Aviso tom="info">Modo de demonstração: a agenda do iClinic só aparece com o login da clínica.</Aviso>
      ) : (
        <>
          {/* Frase do topo + frescor */}
          <div className="rounded-lg border border-brand-musgo/25 bg-brand-creme/50 px-4 py-3">
            <p className="text-base font-semibold text-brand-tinta">{carregando ? "Lendo a agenda…" : frase}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {frescor.texto}
                <InfoTip title="De onde vem esta agenda">
                  O iClinic copia cada agenda para um calendário do Google, e o app lê esses calendários de hora em hora (aos 5 minutos de cada hora). É um espelho: marcar ou desmarcar continua sendo no iClinic. O que mudou lá aparece aqui na próxima leitura, ou na hora, pelo botão ao lado.
                </InfoTip>
              </span>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={buscando} onClick={() => void buscarAgora()}>
                <RefreshCw className={cn("mr-1 h-3.5 w-3.5", buscando && "motion-safe:animate-spin")} aria-hidden="true" />
                {buscando ? "Lido agora — espere 1 minuto" : "Buscar agora no iClinic"}
              </Button>
            </div>
          </div>

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
            <p className="text-xs text-muted-foreground">
              Sem calendário ligado: {semCalendario.map((s) => `${s.nome} (${s.funcao})`).join(", ")} — a agenda {semCalendario.length === 1 ? "dela" : "deles"} ainda não aparece aqui.
            </p>
          ) : null}
          {presencaSemTabela ? <Aviso tom="info">Veio/Faltou ainda não grava: a tabela de presença não foi criada no banco. A agenda aparece normalmente; avise o Lucas.</Aviso> : null}
          {erro ? <Aviso tom="erro">Não consegui ler a agenda agora ({erro instanceof Error ? erro.message : String(erro)}). Tente de novo em instantes.</Aviso> : null}

          {/* O dia */}
          {!carregando && !erro && grupos.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                {profissionalSemCalendario ? (
                  <>
                    A agenda de {profissionalSemCalendario.nome} ainda não chega ao app: falta ligar o calendário dela no Google (quem liga é o Lucas, em Administração → Integrações). Até lá, confira no iClinic.
                  </>
                ) : (
                  <>
                    Nenhuma consulta {profissional ? `de ${nomeDoProfissional(profissional)} ` : ""}neste dia no espelho. Se no iClinic tem consulta, toque em “Buscar agora no iClinic”. Se continuar vazio, o calendário desse profissional pode ter parado — veja os avisos acima e confira no iClinic.
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {grupos.map((grupo) => {
            const resumo = resumirItens(grupo.itens);
            return (
              <Card key={grupo.chave} className="border-brand-oliva/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-lg">
                    {grupo.itens[0]?.profissional ?? nomeDoProfissional(grupo.chave)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {resumo.consultas} {resumo.consultas === 1 ? "consulta" : "consultas"} · {resumo.novas} {resumo.novas === 1 ? "nova" : "novas"} · {resumo.vagas} {resumo.vagas === 1 ? "vaga livre" : "vagas livres"}
                      {resumo.desmarcadas ? ` · ${resumo.desmarcadas} desmarcada${resumo.desmarcadas > 1 ? "s" : ""}` : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {grupo.itens.map((item) => (
                    <LinhaDaAgenda key={item.id} item={item} podeEditar={podeEditar} salvando={marcar.isPending} aoMarcar={(mudanca) => marcar.mutate({ item, ...mudanca })} />
                  ))}
                </CardContent>
              </Card>
            );
          })}

          {/* A semana do relatório do médico */}
          <Card className="border-brand-musgo/25">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                Semana do relatório
                <InfoTip title="Como esta conta é feita">
                  A semana vai de sexta a quinta, igual ao check-in semanal. Contam só as consultas de paciente até hoje; desmarcadas no iClinic, vagas e bloqueios ficam de fora. “Sem registro” é consulta que já passou e ninguém marcou Veio nem Faltou — marque para o relatório do médico sair certo.
                </InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-brand-tinta">
              <p>{semanaResumo.frase}</p>
              {!profissional ? <p className="mt-1 text-xs text-muted-foreground">Escolha outro profissional acima para ver a semana dele.</p> : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Aviso({ tom, children }: { tom: "info" | "atencao" | "erro"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm font-semibold",
        tom === "atencao" && "border-amber-300 bg-amber-50/80 text-amber-950",
        tom === "erro" && "border-rose-300 bg-rose-50/80 text-rose-900",
        tom === "info" && "border-brand-oliva/25 bg-white/60 text-brand-tinta",
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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
    <span className="w-24 shrink-0 font-mono text-sm tabular-nums text-brand-musgo">
      {item.horario}
      <span className="text-muted-foreground">–{item.fimHorario}</span>
    </span>
  );

  if (item.tipo === "VAGA") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-brand-oliva/35 bg-white/40 px-3 py-2 text-sm text-muted-foreground">
        {horario}
        <span className="font-semibold">Vaga livre</span>
        <span className="text-xs">(“AGENDAR CONSULTA” no iClinic)</span>
      </div>
    );
  }

  if (item.tipo === "BLOQUEIO") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand-oliva/10 bg-white/30 px-3 py-2 text-sm text-muted-foreground">
        {horario}
        <CircleSlash className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{item.nome}</span>
        <span className="text-xs">(não é paciente)</span>
      </div>
    );
  }

  const primeira = item.novidade.novo === true;
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", item.cancelada ? "border-brand-oliva/10 bg-white/30 opacity-70" : "border-brand-oliva/15 bg-white/75")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {horario}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.ficha.status === "FICHA" ? (
              <Link to={`/crm/contatos/${item.ficha.contatoId}`} className={cn("font-semibold text-brand-tinta hover:underline", item.cancelada && "line-through")}>
                {item.nome}
              </Link>
            ) : (
              <span className={cn("font-semibold text-brand-tinta", item.cancelada && "line-through")}>{item.nome}</span>
            )}
            {primeira ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_PRIMEIRA_CONSULTA }} aria-hidden="true" />
                Primeira consulta
                {item.novidade.fonte === "recepcao" ? <span className="font-normal">(marcado pela recepção)</span> : null}
              </span>
            ) : null}
            {item.cancelada ? <span className="text-xs font-semibold text-rose-800">Desmarcada no iClinic</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
              <button type="button" className="font-semibold text-brand-musgo underline-offset-2 hover:underline disabled:opacity-50" disabled={salvando} onClick={() => aoMarcar({ primeiraConsulta: true })}>
                Está verde-água no iClinic? Marcar como primeira consulta
              </button>
            ) : null}
            {item.novidade.fonte === "recepcao" && podeEditar && !item.cancelada ? (
              <button type="button" className="underline-offset-2 hover:underline disabled:opacity-50" disabled={salvando} onClick={() => aoMarcar({ primeiraConsulta: null })}>
                desfazer primeira consulta
              </button>
            ) : null}
          </div>
        </div>
        {!item.cancelada ? <BotoesDePresenca item={item} podeEditar={podeEditar} salvando={salvando} aoMarcar={aoMarcar} /> : null}
      </div>
    </div>
  );
}

function SeloConfirmacao({ item }: { item: ItemDaAgenda }) {
  const { chave, rotulo } = item.confirmacao;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold",
        chave === "CONFIRMOU" && "border-emerald-300 bg-emerald-50 text-emerald-900",
        chave === "REMARCAR" && "border-amber-300 bg-amber-50 text-amber-900",
        chave === "SEM_RESPOSTA" && "border-brand-oliva/20 bg-white/50 text-muted-foreground",
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
    return <span className="self-center text-xs text-muted-foreground">Veio/Faltou abre no dia</span>;
  }
  if (!podeEditar) {
    return <span className="self-center text-xs font-semibold text-muted-foreground">{item.presenca === "VEIO" ? "Veio" : item.presenca === "FALTOU" ? "Faltou" : "Sem registro"}</span>;
  }
  const alternar = (valor: "VEIO" | "FALTOU") => aoMarcar({ presenca: item.presenca === valor ? null : valor });
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`Presença de ${item.nome}`}>
      <button
        type="button"
        disabled={salvando}
        aria-pressed={item.presenca === "VEIO"}
        onClick={() => alternar("VEIO")}
        title={item.presenca === "VEIO" && item.presencaPor ? `Marcado por ${item.presencaPor}` : undefined}
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm font-semibold transition disabled:opacity-60",
          item.presenca === "VEIO" ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-300 bg-white/70 text-emerald-800 hover:bg-emerald-50",
        )}
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Veio
      </button>
      <button
        type="button"
        disabled={salvando}
        aria-pressed={item.presenca === "FALTOU"}
        onClick={() => alternar("FALTOU")}
        title={item.presenca === "FALTOU" && item.presencaPor ? `Marcado por ${item.presencaPor}` : undefined}
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm font-semibold transition disabled:opacity-60",
          item.presenca === "FALTOU" ? "border-rose-600 bg-rose-600 text-white" : "border-rose-300 bg-white/70 text-rose-800 hover:bg-rose-50",
        )}
      >
        {item.presenca === "FALTOU" ? <UserRoundX className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />} Faltou
      </button>
    </div>
  );
}
