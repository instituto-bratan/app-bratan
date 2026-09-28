// HOJE — A PRIMEIRA TELA DO DIA DA NUTRICIONISTA (28/09/2026).
//
// Tudo o que pede ação, cada item abrindo a tarefa exata: consultas de hoje,
// planos a entregar no prazo de 72 horas úteis, rascunhos, entregas que ainda
// não terminaram e retornos a organizar.
import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarPlus, FileText, Send, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { montarPainel } from "../dominio/painel";
import { feriadosNacionais } from "../dominio/prazos";
import { tituloDoPlano } from "../dominio/plano";
import { capitalizarPrimeira, dataCurta, diaMes } from "../dominio/texto";
import { useAgenda, useConfig, useNutricaoPronta, usePessoas, useTodosAtendimentos, useTodosPlanos } from "../store/hooks";
import * as repo from "../store/repositorio";
import { abrirAtendimentoDeHoje, BotaoNovaConsulta, SeloEstacao } from "../ui/acoes";
import { CabecalhoDaPagina, Carregando, Modulo, SeloFicticio, Vazio } from "../ui/basicos";

const ROTULO_TIPO = { checkpoint: "Checkpoint", primeira: "Primeira consulta", retorno: "Retorno" } as const;

function Linha({ para, titulo, detalhe, selo, acao }: { para?: string; titulo: ReactNode; detalhe?: ReactNode; selo?: ReactNode; acao?: ReactNode }) {
  const conteudo = (
    <>
      <div className="min-w-0">
        <p className="truncate font-semibold text-brand-tinta">{titulo}</p>
        {detalhe ? <p className="truncate text-xs text-muted-foreground">{detalhe}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {selo}
        {acao ?? (para ? <ArrowRight className="h-4 w-4 text-brand-oliva" aria-hidden="true" /> : null)}
      </div>
    </>
  );
  const classe = "flex items-center justify-between gap-3 rounded-xl border border-brand-oliva/12 bg-white/60 px-3 py-2.5 transition-colors hover:border-brand-dourado/50 hover:bg-white/90";
  return para ? (
    <Link to={para} className={classe}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

function Coluna({ titulo, contagem, children, icone: Icone }: { titulo: string; contagem: number; children: ReactNode; icone: typeof FileText }) {
  return (
    <section className="grid content-start gap-2">
      <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.07em] text-brand-oliva">
        <Icone className="h-4 w-4" aria-hidden="true" /> {titulo}
        <span className="rounded-full bg-muted px-2 text-[11px] text-muted-foreground">{contagem}</span>
      </h2>
      {children}
    </section>
  );
}

function SeloPrazo({ estado, rotulo }: { estado: "no_prazo" | "vence_hoje" | "atrasado"; rotulo: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-bold",
        estado === "atrasado" ? "bg-red-50 text-red-800" : estado === "vence_hoje" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800",
      )}
    >
      {rotulo}
    </span>
  );
}

export function NutricaoHojePage() {
  const pronto = useNutricaoPronta();
  const hoje = repo.hoje();
  const { data: pessoas = [] } = usePessoas();
  const { data: atendimentos = [] } = useTodosAtendimentos();
  const { data: planos = [] } = useTodosPlanos();
  const { data: agenda = [] } = useAgenda(hoje);
  const { data: config } = useConfig();
  const navegar = useNavigate();

  const painel = useMemo(() => {
    const ano = Number(hoje.slice(0, 4));
    const feriados = [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1), ...(config?.feriados ?? [])];
    return montarPainel({ hoje, pessoas, atendimentos, planos, agenda, feriados });
  }, [hoje, pessoas, atendimentos, planos, agenda, config]);

  if (pronto.isLoading) return <Carregando texto="Preparando o dia" />;
  if (pronto.isError) {
    return (
      <Modulo>
        <Vazio titulo="O banco local não abriu">{String((pronto.error as Error)?.message ?? pronto.error)}</Vazio>
      </Modulo>
    );
  }

  const dataLonga = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${hoje}T12:00:00`));
  const temFicticia = pessoas.some((p) => p.ficticia);

  const abrir = async (pessoaId: string, tipo: keyof typeof ROTULO_TIPO) => {
    const pessoa = pessoas.find((p) => p.id === pessoaId);
    if (!pessoa) return;
    navegar(`/nutricao/consultas/${await abrirAtendimentoDeHoje(pessoa, tipo)}`);
  };

  return (
    <Modulo>
      <CabecalhoDaPagina
        sobretitulo="Nutrição · Hoje"
        titulo={capitalizarPrimeira(dataLonga)}
        detalhe={<SeloEstacao detalhado />}
        acoes={<BotaoNovaConsulta />}
      />
      {temFicticia ? (
        <p className="mb-5 rounded-xl border border-dashed border-brand-dourado/60 bg-brand-creme/40 px-3 py-2 text-xs text-brand-tinta">
          Piloto com pessoas fictícias. Nomes, falas e quantidades foram inventados para testar o módulo e não são orientação clínica.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Coluna titulo="Consultas de hoje" contagem={painel.agenda.length} icone={Stethoscope}>
          {painel.agenda.length === 0 ? (
            <Vazio titulo="Nada na agenda de hoje">Use “Nova consulta” quando alguém chegar.</Vazio>
          ) : (
            painel.agenda.map((item) => {
              const at = item.atendimento;
              const selo = at ? (
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", at.estado === "finalizado" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
                  {at.estado === "finalizado" ? "finalizado" : "em registro"}
                </span>
              ) : null;
              return (
                <Linha
                  key={item.id}
                  titulo={
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{item.hora}</span> {item.pessoa.nome} {item.pessoa.ficticia ? <SeloFicticio /> : null}
                    </span>
                  }
                  detalhe={`${ROTULO_TIPO[item.tipo]}${item.pessoa.faseAcompanhamento ? ` · mês ${item.pessoa.faseAcompanhamento.mes} de ${item.pessoa.faseAcompanhamento.total}` : ""}`}
                  selo={selo}
                  acao={
                    <div className="flex gap-1.5">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/nutricao/pessoas/${item.pessoa.id}?aba=preparo`}>Preparar</Link>
                      </Button>
                      <Button size="sm" onClick={() => void abrir(item.pessoa.id, item.tipo)}>
                        {at ? "Abrir" : "Começar"}
                      </Button>
                    </div>
                  }
                />
              );
            })
          )}
          <Button asChild variant="ghost" size="sm" className="justify-start gap-2 text-brand-oliva">
            <Link to="/nutricao/pessoas">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Pôr alguém na agenda de hoje
            </Link>
          </Button>
        </Coluna>

        <Coluna titulo="Prazos e rascunhos" contagem={painel.aEntregar.length + painel.checkpointsEmRascunho.length + painel.planosEmRascunho.length} icone={FileText}>
          {painel.aEntregar.map((e) => (
            <Linha
              key={e.atendimento.id}
              para={e.plano ? `/nutricao/planos/${e.plano.id}` : `/nutricao/pessoas/${e.pessoa.id}?aba=planos&novoPara=${e.atendimento.id}`}
              titulo={`Plano de ${e.pessoa.nome}`}
              detalhe={`${e.plano ? (e.plano.estado === "rascunho" ? "em rascunho" : "finalizado, falta compartilhar") : "ainda não começou"} · entregar até ${diaMes(e.atendimento.prazoPlano)}`}
              selo={<SeloPrazo estado={e.situacao.estado} rotulo={e.situacao.rotulo} />}
            />
          ))}
          {painel.checkpointsEmRascunho.map(({ pessoa, atendimento }) => (
            <Linha
              key={atendimento.id}
              para={`/nutricao/consultas/${atendimento.id}`}
              titulo={`Checkpoint de ${pessoa.nome}`}
              detalhe={`rascunho de ${dataCurta(atendimento.data)}`}
              selo={<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">rascunho</span>}
            />
          ))}
          {painel.planosEmRascunho
            .filter((p) => !painel.aEntregar.some((e) => e.plano?.id === p.plano.id))
            .map(({ pessoa, plano }) => (
              <Linha key={plano.id} para={`/nutricao/planos/${plano.id}`} titulo={`Plano de ${pessoa.nome}`} detalhe={`${tituloDoPlano(plano.mesRef)} · versão ${plano.numero}`} selo={<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">rascunho</span>} />
            ))}
          {painel.aEntregar.length + painel.checkpointsEmRascunho.length + painel.planosEmRascunho.length === 0 ? <Vazio titulo="Nenhum prazo nem rascunho">Tudo entregue.</Vazio> : null}
        </Coluna>

        <Coluna titulo="Entregas e retornos" contagem={painel.pdfNaoCompartilhado.length + painel.semConfirmacao.length + painel.retornos.length} icone={Send}>
          {painel.pdfNaoCompartilhado.map(({ pessoa, plano }) => (
            <Linha key={plano.id} para={`/nutricao/planos/${plano.id}`} titulo={`PDF de ${pessoa.nome} ainda não compartilhado`} detalhe={tituloDoPlano(plano.mesRef)} />
          ))}
          {painel.semConfirmacao.map(({ pessoa, plano, compartilhadoEm }) => (
            <Linha key={plano.id} para={`/nutricao/planos/${plano.id}`} titulo={`${pessoa.nome}: sem confirmação de recebimento`} detalhe={`compartilhado em ${dataCurta(compartilhadoEm.slice(0, 10))}`} />
          ))}
          {painel.retornos.map(({ pessoa, ultimoAtendimento }) => (
            <Linha key={pessoa.id} para={`/nutricao/pessoas/${pessoa.id}`} titulo={`Retorno de ${pessoa.nome}`} detalhe={`último atendimento em ${dataCurta(ultimoAtendimento)}`} />
          ))}
          {painel.pdfNaoCompartilhado.length + painel.semConfirmacao.length + painel.retornos.length === 0 ? <Vazio titulo="Nenhuma entrega pendente" /> : null}
        </Coluna>
      </div>
    </Modulo>
  );
}
