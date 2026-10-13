// HOJE — A PRIMEIRA TELA DO DIA DA NUTRICIONISTA (28/09/2026).
//
// Tudo o que pede ação, cada item abrindo a tarefa exata: consultas de hoje,
// planos a entregar no prazo de 72 horas úteis, rascunhos, entregas que ainda
// não terminaram e retornos a organizar.
import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Send, Stethoscope } from "lucide-react";
import { Contador, LinkSeta } from "@/components/ui/fundacao";
import { Button } from "@/features/crm/comercialVisual";
import { cn } from "@/lib/utils";
import { montarPainel } from "../dominio/painel";
import { feriadosNacionais } from "../dominio/prazos";
import { tituloDoPlano } from "../dominio/plano";
import { capitalizarPrimeira, dataCurta, diaMes } from "../dominio/texto";
import { useAgenda, useConfig, useNutricaoPronta, usePessoas, useTodosAtendimentos, useTodosPlanos } from "../store/hooks";
import * as repo from "../store/repositorio";
import { abrirAtendimentoDeHoje, BotaoNovaConsulta, SeloEstacao } from "../ui/acoes";
import { CabecalhoDaPagina, Carregando, Etiqueta, Modulo, RUBRICA_N, SeloFicticio, Vazio } from "../ui/basicos";
import { fraseDoDia } from "../dominio/frases";

const ROTULO_TIPO = { checkpoint: "Checkpoint", primeira: "Primeira consulta", retorno: "Retorno" } as const;

// PAPEL & MUSGO (08/10/2026): cada coluna é UMA folha com as linhas separadas
// por fio (itens do mesmo tipo em lista, não em cartõezinhos); o selo de prazo
// diz a situação com palavra e cor (atrasado em atenção, vence hoje em ouro).
function Linha({ para, titulo, detalhe, selo, acao }: { para?: string; titulo: ReactNode; detalhe?: ReactNode; selo?: ReactNode; acao?: ReactNode }) {
  const conteudo = (
    <>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-5 text-tinta">{titulo}</p>
        {detalhe ? <p className="mt-0.5 text-[13px] font-medium leading-5 text-tinta-2">{detalhe}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {selo}
        {acao ?? (para ? <ArrowRight className="h-4 w-4 text-tinta-2" aria-hidden="true" /> : null)}
      </div>
    </>
  );
  const classe = "flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 ease-papel";
  return para ? (
    <Link
      to={para}
      className={cn(classe, "hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco")}
    >
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

function Coluna({ titulo, contagem, children, rodape, vazio, icone: Icone }: { titulo: string; contagem: number; children: ReactNode; rodape?: ReactNode; vazio?: ReactNode; icone: typeof FileText }) {
  return (
    <section className="grid min-w-0 content-start gap-3" aria-label={titulo}>
      <h2 className="flex items-center gap-2 font-sans text-base font-bold leading-6 text-tinta">
        <Icone className="h-4 w-4 text-oliva" aria-hidden="true" /> {titulo}
        <Contador valor={contagem} tom="suave" />
      </h2>
      {contagem === 0 && vazio ? (
        <p className="rounded-bloco bg-saber px-4 py-4 text-[13px] font-medium leading-5 text-tinta-2">{vazio}</p>
      ) : (
        <div className="divide-y divide-fio overflow-hidden rounded-bloco border border-fio bg-folha">{children}</div>
      )}
      {rodape}
    </section>
  );
}

function SeloPrazo({ estado, rotulo }: { estado: "no_prazo" | "vence_hoje" | "atrasado"; rotulo: string }) {
  return <Etiqueta tom={estado === "atrasado" ? "atencao" : estado === "vence_hoje" ? "ouro" : "ok"}>{rotulo}</Etiqueta>;
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
  const frase = fraseDoDia({
    consultas: painel.agenda.length,
    planosAEntregar: painel.aEntregar.length,
    atrasados: painel.aEntregar.filter((e) => e.situacao.estado === "atrasado").length,
  });

  const abrir = async (pessoaId: string, tipo: keyof typeof ROTULO_TIPO) => {
    const pessoa = pessoas.find((p) => p.id === pessoaId);
    if (!pessoa) return;
    navegar(`/nutricao/consultas/${await abrirAtendimentoDeHoje(pessoa, tipo)}`);
  };

  return (
    <Modulo>
      <CabecalhoDaPagina
        sobretitulo="Pacientes · Nutrição"
        titulo={capitalizarPrimeira(dataLonga)}
        detalhe={
          <>
            <strong>{frase.destaque}</strong> {frase.resto} {frase.alerta ? <span className="alerta">{frase.alerta}</span> : null}
          </>
        }
        acoes={<BotaoNovaConsulta />}
        rodape={
          <>
            <SeloEstacao detalhado />
            <LinkSeta to="/nutricao/guia">Guia de uso</LinkSeta>
          </>
        }
      />
      {pessoas.length === 0 ? (
        <div className="mb-6 rounded-bloco bg-saber p-6 max-md:p-4">
          <p className={RUBRICA_N}>Primeiros passos</p>
          <ol className="mt-3 grid gap-3 text-sm font-medium leading-6 text-tinta sm:grid-cols-2 lg:grid-cols-4">
            <li><span className="mr-1.5 font-bold tabular-nums text-tinta-2">01</span>Cadastre a pessoa em <Link to="/nutricao/pessoas" className="font-semibold text-musgo hover:underline">Pessoas</Link>, com os suplementos dela.</li>
            <li><span className="mr-1.5 font-bold tabular-nums text-tinta-2">02</span>Abra a consulta pelo botão Nova consulta e ligue o consentimento.</li>
            <li><span className="mr-1.5 font-bold tabular-nums text-tinta-2">03</span>Grave, encerre e espere a transcrição.</li>
            <li><span className="mr-1.5 font-bold tabular-nums text-tinta-2">04</span>Leve as falas para as linhas, copie para o iClinic e finalize.</li>
          </ol>
          <p className="mt-3 text-[13px] font-medium text-tinta-2">
            O passo a passo completo está no <Link to="/nutricao/guia" className="font-bold text-musgo underline-offset-[3px] hover:underline">Guia de uso</Link>.
          </p>
        </div>
      ) : null}
      {temFicticia ? (
        <p className="mb-6 rounded-bloco bg-ouro-claro px-4 py-3 text-[13px] font-semibold leading-5 text-ouro">
          Piloto com pessoas fictícias. Nomes, falas e quantidades foram inventados para testar o módulo e não são orientação clínica.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Coluna
          titulo="Consultas de hoje"
          contagem={painel.agenda.length}
          icone={Stethoscope}
          vazio="Nada na agenda de hoje. Use “Nova consulta” quando alguém chegar."
          rodape={<LinkSeta to="/nutricao/pessoas" className="justify-self-start">Pôr alguém na agenda de hoje</LinkSeta>}
        >
          {painel.agenda.map((item) => {
              const at = item.atendimento;
              const selo = at ? <Etiqueta tom={at.estado === "finalizado" ? "ok" : "ouro"}>{at.estado === "finalizado" ? "finalizado" : "em registro"}</Etiqueta> : null;
              return (
                <Linha
                  key={item.id}
                  titulo={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-serifa text-base font-normal tabular-nums text-tinta">{item.hora}</span> {item.pessoa.nome} {item.pessoa.ficticia ? <SeloFicticio /> : null}
                    </span>
                  }
                  detalhe={`${ROTULO_TIPO[item.tipo]}${item.pessoa.faseAcompanhamento ? ` · mês ${item.pessoa.faseAcompanhamento.mes} de ${item.pessoa.faseAcompanhamento.total}` : ""}`}
                  selo={selo}
                  acao={
                    <div className="flex flex-wrap justify-end gap-1.5">
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
          })}
        </Coluna>

        <Coluna
          titulo="Prazos e rascunhos"
          contagem={painel.aEntregar.length + painel.checkpointsEmRascunho.length + painel.planosEmRascunho.length}
          icone={FileText}
          vazio="Nenhum prazo nem rascunho: tudo entregue."
        >
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
              selo={<Etiqueta>rascunho</Etiqueta>}
            />
          ))}
          {painel.planosEmRascunho
            .filter((p) => !painel.aEntregar.some((e) => e.plano?.id === p.plano.id))
            .map(({ pessoa, plano }) => (
              <Linha key={plano.id} para={`/nutricao/planos/${plano.id}`} titulo={`Plano de ${pessoa.nome}`} detalhe={`${tituloDoPlano(plano.mesRef)} · versão ${plano.numero}`} selo={<Etiqueta>rascunho</Etiqueta>} />
            ))}
        </Coluna>

        <Coluna
          titulo="Entregas e retornos"
          contagem={painel.pdfNaoCompartilhado.length + painel.semConfirmacao.length + painel.retornos.length}
          icone={Send}
          vazio="Nenhuma entrega pendente."
        >
          {painel.pdfNaoCompartilhado.map(({ pessoa, plano }) => (
            <Linha key={plano.id} para={`/nutricao/planos/${plano.id}`} titulo={`PDF de ${pessoa.nome} ainda não compartilhado`} detalhe={tituloDoPlano(plano.mesRef)} />
          ))}
          {painel.semConfirmacao.map(({ pessoa, plano, compartilhadoEm }) => (
            <Linha key={plano.id} para={`/nutricao/planos/${plano.id}`} titulo={`${pessoa.nome}: sem confirmação de recebimento`} detalhe={`compartilhado em ${dataCurta(compartilhadoEm.slice(0, 10))}`} />
          ))}
          {painel.retornos.map(({ pessoa, ultimoAtendimento }) => (
            <Linha key={pessoa.id} para={`/nutricao/pessoas/${pessoa.id}`} titulo={`Retorno de ${pessoa.nome}`} detalhe={`último atendimento em ${dataCurta(ultimoAtendimento)}`} />
          ))}
        </Coluna>
      </div>
    </Modulo>
  );
}
