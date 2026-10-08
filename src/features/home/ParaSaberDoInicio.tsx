// PARA SABER — a coluna da direita do Início (redesenho etapa 2, 08/10/2026).
//
// Imagem 01: "Outubro até agora" (o fio do mês com o entalhe de hoje, o
// faturado × meta, a meta até hoje, quanto falta por dia útil, cabe gastar no
// mês e as salas ocupadas) e a AGENDA DE HOJE. Bloco "saber": sem borda, sem
// sombra, um tom abaixo do papel. Os números vêm de onde a Home sempre leu: o
// retrato público do Lucro Inteligente (feito, meta, cabe gastar, meta do dia),
// a ocupação de sala calculada das comandas e o espelho do iClinic da Agenda do
// dia. Número derivado sempre com a sua frase.
import * as React from "react";
import { Link } from "react-router-dom";
import { Check, Sprout } from "lucide-react";
import { BlocoSaber } from "@/components/ui/blocos";
import { LinkSeta } from "@/components/ui/botao";
import { FioDoMes } from "@/components/ui/fio-do-mes";
import { formatShortTime } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import type { OcupacaoMes } from "@/features/financeiro/ocupacaoSala";
import { formatHoras } from "@/features/financeiro/ocupacaoSala";
import { BarraDaMeta, Divisa, FaixaDasSalas, NumeroGrande, Par, Rubrica } from "./pecasDoInicio";
import { numeroInteiro, reaisInteiros, type AgendaDoInicio, type MesAteAgora } from "./paraDecidir";

export type LucroDoMes = {
  feitoMes: number;
  metaMes: number;
  cabeGastar: number;
  contasPagas: number;
  sobra: number;
  metaDia: number;
  feitoHoje: number;
  diaComDoutor: boolean;
  /** Quando o retrato público foi gravado (ISO); vazio na prévia. */
  atualizadoEm?: string;
};

export type ParaSaberProps = {
  mes: MesAteAgora;
  /** null = o financeiro ainda não publicou o mês no Lucro Inteligente. */
  lucro: LucroDoMes | null;
  carregandoLucro: boolean;
  /** Prévia sem banco: os números do mês e a agenda são exemplos. */
  exemplo: boolean;
  ocupacao: OcupacaoMes | null;
  /** As tarefas do dia (o checklist do setor) — para todo mundo, com ou sem a ocupação. */
  tarefas: { feitas: number; total: number } | null;
  /** null = a pessoa não vê a Agenda do dia. */
  agenda: AgendaDoInicio | null;
  carregandoAgenda: boolean;
  /** "11:40" — a hora de Brasília, para a linha do agora. */
  agora: string;
  links: { lucro?: string; metas?: string; painel?: string };
};

/** O rótulo vira link quando a pessoa abre a tela de onde o número vem. */
function RotuloComLink({ to, children }: { to?: string; children: React.ReactNode }) {
  if (!to) return <>{children}</>;
  return (
    <Link to={to} className="rounded-sm underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco">
      {children}
    </Link>
  );
}

export function ParaSaberDoInicio({ mes, lucro, carregandoLucro, exemplo, ocupacao, tarefas, agenda, carregandoAgenda, agora, links }: ParaSaberProps) {
  const nomeMes = mes.nome.toLowerCase();
  return (
    <BlocoSaber
      as="aside"
      aria-label="Para saber"
      className="flex flex-col gap-4 md:max-xl:grid md:max-xl:grid-cols-2 md:max-xl:items-start md:max-xl:gap-8"
    >
      <section aria-labelledby="inicio-mes" className="flex min-w-0 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <Rubrica id="inicio-mes">{mes.nome} até agora</Rubrica>
          <span className="whitespace-nowrap text-[13px] font-medium leading-5 text-tinta-2">
            dia útil {mes.hojeDiaUtil} de {mes.diasUteis}
          </span>
        </div>
        {/* No celular o fio sobe para baixo do cabeçalho; aqui ele mora no computador. */}
        <FioDoMes diasUteis={mes.diasUteis} hoje={mes.hojeDiaUtil} mes={mes.nome} legenda={false} sobre="saber" className="max-md:hidden" />

        {lucro ? (
          <>
            <div className="grid gap-1">
              <NumeroGrande valor={numeroInteiro(lucro.feitoMes)} />
              <p className="text-[13px] font-medium leading-5 text-tinta-2">
                <RotuloComLink to={links.metas}>faturados</RotuloComLink> · meta de {nomeMes}{" "}
                <strong className="font-bold tabular-nums text-tinta">{reaisInteiros(lucro.metaMes)}</strong>
              </p>
            </div>
            {lucro.metaMes > 0 ? (
              <BarraDaMeta
                feito={mes.percentualFeito}
                ateHoje={mes.percentualAteHoje}
                rotulo={
                  <>
                    meta até hoje <strong className="tabular-nums">{reaisInteiros(mes.metaAteHoje)}</strong>
                  </>
                }
                descricao={`Faturado ${reaisInteiros(lucro.feitoMes)}; a meta até hoje é ${reaisInteiros(mes.metaAteHoje)}`}
              />
            ) : null}
            <p className="grid text-sm font-medium leading-[22px] text-tinta-2 [&_strong]:font-bold [&_strong]:tabular-nums [&_strong]:text-tinta">
              {lucro.metaMes > 0 ? (
                <span>
                  {mes.diferenca > 0 ? (
                    <>
                      <strong>{reaisInteiros(mes.diferenca)} acima</strong> da meta até hoje.
                    </>
                  ) : mes.diferenca < 0 ? (
                    <>
                      <strong className="!text-atencao">{reaisInteiros(-mes.diferenca)} abaixo</strong> da meta até hoje.
                    </>
                  ) : (
                    <>Exatamente na meta até hoje.</>
                  )}
                </span>
              ) : (
                <span>Sem meta do mês publicada.</span>
              )}
              {lucro.metaMes > 0 ? (
                <span>
                  {mes.falta <= 0 ? (
                    <>A meta de {nomeMes} já foi batida.</>
                  ) : mes.faltamDias > 0 ? (
                    <>
                      Faltam <strong>{reaisInteiros(mes.faltaPorDia)}</strong> em cada um dos {mes.faltamDias} {mes.faltamDias === 1 ? "dia útil" : "dias úteis"}.
                    </>
                  ) : (
                    <>
                      Último dia útil: faltam <strong>{reaisInteiros(mes.falta)}</strong> para a meta.
                    </>
                  )}
                </span>
              ) : null}
              {lucro.metaDia > 0 ? (
                <span>
                  Hoje: <strong>{reaisInteiros(lucro.feitoHoje)}</strong> de {reaisInteiros(lucro.metaDia)}, {lucro.diaComDoutor ? "dia com Dr.\u00a0Daniel" : "dia sem Dr.\u00a0Daniel"}.
                </span>
              ) : (
                <span>Sem meta publicada para hoje.</span>
              )}
            </p>
          </>
        ) : (
          <p className="text-sm font-medium leading-[22px] text-tinta-2">
            {carregandoLucro ? "Lendo o mês no Lucro Inteligente…" : "O financeiro ainda não publicou o mês no Lucro Inteligente."}
          </p>
        )}

        <Divisa />

        {lucro ? (
          <div className="grid gap-0.5">
            <Par rotulo={<RotuloComLink to={links.lucro}>Cabe gastar no mês</RotuloComLink>} valor={reaisInteiros(lucro.sobra)} tom={lucro.sobra < -0.005 ? "atencao" : "tinta"} />
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              {lucro.sobra < -0.005 ? "Já passou do que cabe. " : ""}Cabem {reaisInteiros(lucro.cabeGastar)} de contas no mês; {reaisInteiros(lucro.contasPagas)} já foram pagos
              {lucro.atualizadoEm ? ` · atualizado às ${formatShortTime(lucro.atualizadoEm)}` : ""}.
            </p>
          </div>
        ) : null}

        {ocupacao ? (
          <div className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold leading-5 text-tinta">
                <RotuloComLink to={links.painel}>Salas ocupadas</RotuloComLink>{" "}
                <span className="text-[13px] font-semibold text-ok">
                  · saudável {ocupacao.meta.minima} a {ocupacao.meta.maxima}%
                </span>
              </span>
              <span className={cn("whitespace-nowrap text-xl font-bold leading-7 tabular-nums", ocupacao.percentual < 40 ? "text-atencao" : "text-tinta")}>
                {ocupacao.percentual.toLocaleString("pt-BR")}%
              </span>
            </div>
            <FaixaDasSalas
              valor={ocupacao.percentual}
              de={ocupacao.meta.minima}
              ate={ocupacao.meta.maxima}
              descricao={`Salas ocupadas ${ocupacao.percentual.toLocaleString("pt-BR")}%; a faixa saudável é de ${ocupacao.meta.minima} a ${ocupacao.meta.maxima}%`}
            />
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              {formatHoras(ocupacao.horasVendidas)} vendidas de {formatHoras(ocupacao.horasDisponiveis)} até hoje
              {ocupacao.horasParaMeta > 0 ? ` · faltam ${formatHoras(ocupacao.horasParaMeta)} para ${ocupacao.meta.minima}%` : ""}
            </p>
          </div>
        ) : null}

        {/* As tarefas do dia: para todo mundo, como o "Checklist N%" do Início de antes (revisão de 08/10/2026). */}
        {tarefas ? (
          <div className="grid gap-0.5">
            <Par rotulo={<RotuloComLink to="/tarefas">Tarefas do dia</RotuloComLink>} valor={`${tarefas.feitas} de ${tarefas.total}`} />
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              {tarefas.total === 0 ? "nenhuma tarefa no seu setor" : tarefas.feitas === tarefas.total ? "todas feitas hoje" : `${tarefas.total - tarefas.feitas} ainda abertas`}
            </p>
          </div>
        ) : null}

        {exemplo ? <p className="text-xs font-medium leading-4 text-tinta-2">Prévia: os números do mês e a agenda são exemplos, sem dado da clínica.</p> : null}
      </section>

      {agenda || carregandoAgenda ? (
        <>
          <Divisa className="md:max-xl:hidden" />
          <AgendaDeHoje agenda={agenda} carregando={carregandoAgenda} agora={agora} />
        </>
      ) : null}
    </BlocoSaber>
  );
}

function AgendaDeHoje({ agenda, carregando, agora }: { agenda: AgendaDoInicio | null; carregando: boolean; agora: string }) {
  const consultas = agenda?.consultas ?? [];
  return (
    <section aria-labelledby="inicio-agenda" className="grid min-w-0 gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <Rubrica id="inicio-agenda">Agenda de hoje</Rubrica>
        {agenda && consultas.length ? (
          <span className="truncate text-[13px] font-medium leading-5 text-tinta-2">
            {agenda.titulo} · {consultas.length} {consultas.length === 1 ? "paciente" : "pacientes"}
          </span>
        ) : null}
      </div>
      {!agenda || !consultas.length ? (
        <div className="grid gap-2 py-1">
          <p className="text-sm font-medium leading-5 text-tinta-2">{carregando ? "Lendo a agenda do iClinic…" : "Nenhuma consulta de paciente hoje no espelho do iClinic."}</p>
          {carregando ? null : <LinkSeta to="/agenda">Abrir a agenda do dia</LinkSeta>}
        </div>
      ) : (
        <ol className="grid">
          {consultas.map((consulta, indice) => (
            <React.Fragment key={consulta.id}>
              {indice === agenda.agoraEm ? <LinhaDoAgora agora={agora} /> : null}
              <li
                className={cn(
                  "grid min-h-8 grid-cols-[40px_16px_minmax(0,1fr)_auto] items-center gap-x-2 border-t border-fio",
                  (indice === 0 || indice === agenda.agoraEm) && "border-t-0",
                )}
              >
                <span className={cn("text-[13px] leading-5 tabular-nums", consulta.passou ? "font-medium text-tinta-2" : "font-bold text-tinta")}>{consulta.horario}</span>
                {consulta.presenca === "VEIO" ? <Check className="h-4 w-4 text-ok" strokeWidth={2.25} aria-label="veio" /> : <span aria-hidden="true" />}
                <span
                  className={cn(
                    "truncate text-sm leading-5",
                    consulta.passou ? "font-medium text-tinta-2" : indice === agenda.agoraEm ? "font-bold text-tinta" : "font-semibold text-tinta",
                  )}
                >
                  {consulta.nome}
                </span>
                <span className="inline-flex items-center gap-1 justify-self-end whitespace-nowrap text-[13px] font-medium leading-5 text-tinta-2">
                  {consulta.presenca === "FALTOU" ? (
                    <span className="font-bold text-atencao">faltou</span>
                  ) : consulta.primeira ? (
                    <>
                      <Sprout className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                      primeira consulta
                    </>
                  ) : agenda.titulo === "Todos" ? (
                    consulta.profissional
                  ) : null}
                </span>
              </li>
            </React.Fragment>
          ))}
          {agenda.agoraEm >= consultas.length ? <LinhaDoAgora agora={agora} /> : null}
        </ol>
      )}
      {agenda && agenda.outros > 0 ? (
        <p className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-[13px] font-medium leading-5 text-tinta-2">
          <span>
            E mais {agenda.outros} {agenda.outros === 1 ? "consulta" : "consultas"} com outros profissionais.
          </span>
          <LinkSeta to="/agenda" className="text-[13px]">
            Ver a agenda
          </LinkSeta>
        </p>
      ) : null}
    </section>
  );
}

/** O agora: a hora em ouro e o fio de ouro, com a palavra ao lado (o ouro marca o agora). */
function LinhaDoAgora({ agora }: { agora: string }) {
  return (
    <li aria-label={`Agora, ${agora}`} className="grid min-h-5 grid-cols-[40px_minmax(0,1fr)] items-center gap-x-2">
      <span className="text-xs font-extrabold leading-4 tabular-nums text-ouro">{agora}</span>
      <span className="flex items-center gap-2 text-xs font-extrabold leading-4 text-ouro after:h-0.5 after:flex-1 after:bg-ouro-fio after:content-['']">agora</span>
    </li>
  );
}

