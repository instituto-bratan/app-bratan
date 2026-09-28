// A CONSULTA: GRAVAR, REGISTRAR, CONFERIR, FINALIZAR (28/09/2026).
//
// Duas colunas: à esquerda o roteiro dela (14 linhas, suplementos, conduta);
// à direita a folha do prontuário se escrevendo, pronta para colar no iClinic.
// Finalizar congela o registro e cria o prazo do plano; corrigir depois é
// retificação, com motivo, e o que havia antes fica guardado.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, CheckCircle2, FileText, History, Lock, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule } from "@/lib/access";
import { aceitarSugestao, confirmarAnterior, editarBio, editarTexto, trazerDoAnterior, valorVazio } from "../dominio/campos";
import { CONFIG_PADRAO } from "../dominio/config";
import { feriadosNacionais, prazoDoPlano } from "../dominio/prazos";
import { aplicarRetificacao, finalizarAtendimento, pendenciasParaFinalizar, type ConteudoRetificavel } from "../dominio/resumo";
import { ROTEIRO, rotuloDoCampo } from "../dominio/roteiro";
import { sincronizarPrescricoes } from "../dominio/suplementos";
import { dataCurta, diaMes, normalizarTexto } from "../dominio/texto";
import type { Atendimento, CampoId, ConferenciaUso } from "../dominio/tipos";
import { useAtendimento, useAtendimentosDaPessoa, useConfig, useItensUso, useNutricaoPronta, usePessoa, useRascunho } from "../store/hooks";
import * as repo from "../store/repositorio";
import { Bolinha, Cartao, Carregando, Dialogo, Interruptor, LinhaQueCresce, Modulo, SeloFicticio, SeloSalvamento, Vazio } from "../ui/basicos";
import { ConferenciaDeSuplementos, sugestaoDaConferencia } from "../consulta/ConferenciaDeSuplementos";
import { FalaDeOrigem } from "../consulta/FalaDeOrigem";
import { FolhaDoProntuario } from "../consulta/FolhaDoProntuario";
import { LinhaDoRoteiro } from "../consulta/LinhaDoRoteiro";
import { PainelDaGravacao } from "../consulta/PainelDaGravacao";

const TITULO_TIPO = { checkpoint: "Checkpoint", primeira: "Primeira consulta", retorno: "Retorno" } as const;

function focarProximoCampo(atual: HTMLElement) {
  const todos = Array.from(document.querySelectorAll<HTMLElement>("[data-campo] textarea, [data-campo] input"));
  const i = todos.indexOf(atual);
  todos[i + 1]?.focus();
}

export function NutricaoConsultaPage() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { pessoa: usuario } = useAuth();
  const pronto = useNutricaoPronta();
  const { data: original, isLoading } = useAtendimento(id);
  const { data: pessoa } = usePessoa(original?.pessoaId);
  const { data: historico = [] } = useAtendimentosDaPessoa(original?.pessoaId);
  const { data: itensUso = [] } = useItensUso(original?.pessoaId);
  const { data: config = CONFIG_PADRAO } = useConfig();
  const { rascunho: at, alterar, salvarJa, recarregar, estado } = useRascunho<Atendimento>(original, repo.salvarAtendimento);
  // Gravação, transcrição e IA só escrevem em rascunho: resultado que chega depois de
  // finalizar é descartado (o registro finalizado só muda por retificação).
  const alterarSeRascunho = (fn: (a: Atendimento) => Atendimento) => alterar((a) => (a.estado === "rascunho" ? fn(a) : a));
  const alterarSeRascunhoRef = useRef(alterarSeRascunho);
  alterarSeRascunhoRef.current = alterarSeRascunho;

  const [edicao, setEdicao] = useState<ConteudoRetificavel | null>(null);
  const [finalizarAberto, setFinalizarAberto] = useState(false);
  const [retificarAberto, setRetificarAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [loteAberto, setLoteAberto] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const [gravacaoOcupada, setGravacaoOcupada] = useState(false);

  const anterior = useMemo(() => (at ? historico.find((a) => a.id !== at.id && a.estado === "finalizado" && a.data <= at.data) ?? null : null), [historico, at]);

  const podeEditarModulo = canEditModule(usuario, "nutricao");

  // Enquanto é rascunho, a prescrição acompanha a lista registrada (e itens novos entram).
  // Só quem edita sincroniza: abrir para ver não grava nada.
  const idDoAtendimento = at?.id;
  const rascunhoAberto = at?.estado === "rascunho";
  useEffect(() => {
    if (!podeEditarModulo || !idDoAtendimento || !rascunhoAberto || itensUso.length === 0) return;
    alterarSeRascunhoRef.current((a) => {
      const lista = sincronizarPrescricoes(a.suplementos, itensUso, repo.novoId);
      return lista === a.suplementos ? a : { ...a, suplementos: lista };
    });
  }, [itensUso, idDoAtendimento, rascunhoAberto, podeEditarModulo]);

  if (pronto.isLoading || isLoading) return <Carregando texto="Abrindo a consulta" />;
  if (!at || !pessoa) {
    return (
      <Modulo>
        <Vazio titulo="Consulta não encontrada" acao={<Button asChild><Link to="/nutricao">Voltar para Hoje</Link></Button>}>
          Ela pode ter sido aberta em outro navegador. Os dados do piloto ficam neste computador.
        </Vazio>
      </Modulo>
    );
  }

  const finalizado = at.estado === "finalizado";
  const retificando = edicao !== null;
  const editavel = podeEditarModulo && (!finalizado || retificando);
  const conteudo: ConteudoRetificavel = edicao ?? { campos: at.campos, suplementos: at.suplementos, conduta: at.conduta, linhaPlano: at.linhaPlano };
  const vista: Atendimento = { ...at, ...conteudo };

  const mudarConteudo = (fn: (c: ConteudoRetificavel) => ConteudoRetificavel) => {
    if (retificando) setEdicao((c) => (c ? fn(c) : c));
    else alterar((a) => ({ ...a, ...fn({ campos: a.campos, suplementos: a.suplementos, conduta: a.conduta, linhaPlano: a.linhaPlano }) }));
  };
  const mudarCampo = (campo: CampoId, fn: (v: Atendimento["campos"][CampoId]) => Atendimento["campos"][CampoId]) =>
    mudarConteudo((c) => ({ ...c, campos: { ...c.campos, [campo]: fn(c.campos[campo]) } }));

  // Sugestões da IA só existem para o rascunho; num registro finalizado não se revisa nada.
  const org = finalizado ? null : at.organizacao;
  const sugestaoDoCampo = (campo: CampoId) => org?.campos.find((s) => s.campo === campo && s.estado === "pendente") ?? null;
  const resolverSugestaoCampo = (campo: CampoId, decisao: "aceita" | "editada" | "recusada", textoEditado?: string) => {
    const sugestao = sugestaoDoCampo(campo);
    if (!sugestao) return;
    if (decisao !== "recusada") mudarCampo(campo, (v) => aceitarSugestao(v, sugestao, repo.agora(), textoEditado));
    alterar((a) => (a.organizacao ? { ...a, organizacao: { ...a.organizacao, campos: a.organizacao.campos.map((s) => (s === sugestao || (s.campo === campo && s.estado === "pendente") ? { ...s, estado: decisao } : s)) } } : a));
  };

  const pendentesSemIncerteza = (org?.campos ?? []).filter((s) => s.estado === "pendente" && !s.incerto);
  const aceitarEmLote = () => {
    const agora = repo.agora();
    mudarConteudo((c) => {
      const campos = { ...c.campos };
      for (const s of pendentesSemIncerteza) campos[s.campo] = aceitarSugestao(campos[s.campo], s, agora);
      return { ...c, campos };
    });
    const aceitas = new Set(pendentesSemIncerteza);
    alterar((a) => (a.organizacao ? { ...a, organizacao: { ...a.organizacao, campos: a.organizacao.campos.map((s) => (aceitas.has(s) ? { ...s, estado: "aceita" } : s)) } } : a));
    setLoteAberto(false);
  };

  const resolverSugestaoSuplemento = (indice: number, aceitar: boolean) => {
    const s = org?.suplementos[indice];
    if (!s) return;
    if (aceitar) {
      mudarConteudo((c) => {
        const alvo = c.suplementos.find((x) => sugestaoDaConferencia(x, [{ ...s, estado: "pendente" }]) === 0);
        const aplicado: Partial<ConferenciaUso> = {
          usoRelatado: s.usoRelatado,
          adesao: s.adesao,
          orientacao: s.orientacao,
          orientadoEm: s.orientacao.trim() ? at.data : null,
          origem: "ia_aceita",
          evidencias: s.evidencias,
        };
        if (alvo) return { ...c, suplementos: c.suplementos.map((x) => (x.id === alvo.id ? { ...x, ...aplicado } : x)) };
        return { ...c, suplementos: [...c.suplementos, { id: repo.novoId(), itemId: null, nome: s.nome, prescricao: "", ...aplicado } as ConferenciaUso] };
      });
    }
    alterar((a) => (a.organizacao ? { ...a, organizacao: { ...a.organizacao, suplementos: a.organizacao.suplementos.map((x, i) => (i === indice ? { ...x, estado: aceitar ? "aceita" : "recusada" } : x)) } } : a));
  };

  const resolverConduta = (aceitar: boolean) => {
    const c = org?.conduta;
    if (!c) return;
    if (aceitar) mudarConteudo((x) => ({ ...x, conduta: normalizarTexto([x.conduta, c.texto].filter(Boolean).join(" ")) }));
    alterar((a) => (a.organizacao?.conduta ? { ...a, organizacao: { ...a.organizacao, conduta: { ...a.organizacao.conduta, estado: aceitar ? "aceita" : "recusada" } } } : a));
  };

  const resolverNaoClassificado = (idItem: string, destino: CampoId | "conduta" | null) => {
    const item = org?.naoClassificados.find((n) => n.id === idItem);
    if (!item) return;
    if (destino === "conduta") mudarConteudo((x) => ({ ...x, conduta: normalizarTexto([x.conduta, item.texto].filter(Boolean).join(" ")) }));
    else if (destino) {
      mudarCampo(destino, (v) => {
        const texto = v.estado === "anterior_pendente" || !v.texto ? item.texto : `${v.texto}; ${item.texto}`;
        return { ...editarTexto(v, texto, repo.agora()), origem: "ia_editada", evidencias: [...(v.estado === "anterior_pendente" ? [] : v.evidencias), ...item.evidencias] };
      });
    }
    alterar((a) => (a.organizacao ? { ...a, organizacao: { ...a.organizacao, naoClassificados: a.organizacao.naoClassificados.map((n) => (n.id === idItem ? { ...n, estado: destino ? "levado" : "descartado" } : n)) } } : a));
  };

  const pendencias = pendenciasParaFinalizar(vista);
  const anoHoje = Number(repo.hoje().slice(0, 4));
  const feriados = [...feriadosNacionais(anoHoje), ...feriadosNacionais(anoHoje + 1), ...config.feriados];
  const prazoPrevisto = prazoDoPlano(repo.hoje(), config.diasUteisPrazoPlano, feriados);

  const finalizar = async () => {
    setErroAcao(null);
    try {
      const final = finalizarAtendimento(at, repo.agora(), prazoPrevisto);
      const salvo = await salvarJa(final);
      if (salvo) {
        // O áudio de todas as gravações desta consulta ganha data para ser apagado.
        const [a, m, d] = repo.hoje().split("-").map(Number);
        const apagarEm = new Date(Date.UTC(a, m - 1, d + config.diasRetencaoAudio)).toISOString().slice(0, 10);
        for (const g of await repo.listarGravacoes()) {
          if (g.atendimentoId === salvo.id && !g.apagarEm) await repo.salvarGravacao({ ...g, apagarEm });
        }
      }
      setFinalizarAberto(false);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : String(e));
    }
  };

  const salvarRetificacao = async () => {
    if (!edicao) return;
    setErroAcao(null);
    try {
      const novo = aplicarRetificacao(at, edicao, motivo, usuario?.nome ?? "Nutricionista", repo.agora());
      const salvo = await salvarJa(novo);
      if (salvo) {
        setEdicao(null);
        setMotivo("");
        setRetificarAberto(false);
      }
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : String(e));
    }
  };

  const titulo = `${TITULO_TIPO[at.tipo]}${at.numeroCheckpoint && at.tipo === "checkpoint" ? ` ${at.numeroCheckpoint}${pessoa.faseAcompanhamento ? ` de ${pessoa.faseAcompanhamento.total}` : ""}` : ""}`;

  return (
    <Modulo>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/nutricao/pessoas/${pessoa.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-oliva hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {pessoa.nome}
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold text-brand-musgo">
            {titulo} <span className="text-base font-normal text-muted-foreground">· {dataCurta(at.data)}</span>
            {pessoa.ficticia ? <SeloFicticio /> : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {finalizado
              ? `Finalizado em ${dataCurta(at.finalizadoEm?.slice(0, 10))}${at.prazoPlano ? ` · plano até ${diaMes(at.prazoPlano)}` : ""}${at.retificacoes.length ? ` · ${at.retificacoes.length} retificação(ões)` : ""}`
              : anterior
                ? `Atendimento anterior: ${dataCurta(anterior.data)}`
                : "Sem atendimento anterior registrado aqui"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeloSalvamento estado={estado} />
          {estado.tipo === "conflito" ? (
            <Button type="button" size="sm" variant="outline" onClick={async () => { const doBanco = await repo.lerAtendimento(at.id); if (doBanco) recarregar(doBanco); }}>
              Recarregar a versão gravada
            </Button>
          ) : null}
          {!finalizado && anterior && editavel ? (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => alterar((a) => repo.trazerTudoDoAnterior(a, anterior))} title="Cada linha vem marcada com a data e só entra no texto depois de confirmada">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Trazer o anterior para conferir
            </Button>
          ) : null}
          {finalizado && !retificando && podeEditarModulo ? (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setEdicao({ campos: at.campos, suplementos: at.suplementos, conduta: at.conduta, linhaPlano: at.linhaPlano })}>
              <History className="h-4 w-4" aria-hidden="true" /> Retificar
            </Button>
          ) : null}
          {retificando ? (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEdicao(null)}>
                Cancelar retificação
              </Button>
              <Button type="button" size="sm" onClick={() => setRetificarAberto(true)}>
                Salvar retificação
              </Button>
            </>
          ) : null}
          {!finalizado && editavel ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={gravacaoOcupada}
              title={gravacaoOcupada ? "Espere a gravação, a transcrição ou a organização terminar" : undefined}
              onClick={() => setFinalizarAberto(true)}
            >
              <Lock className="h-4 w-4" aria-hidden="true" /> Finalizar checkpoint
            </Button>
          ) : null}
          {finalizado && podeEditarModulo ? (
            <Button type="button" size="sm" className="gap-1.5" onClick={() => navegar(`/nutricao/pessoas/${pessoa.id}?aba=planos&novoPara=${at.id}`)}>
              <FileText className="h-4 w-4" aria-hidden="true" /> Montar o plano
            </Button>
          ) : null}
        </div>
      </div>

      {retificando ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Retificando. As mudanças só valem quando você salvar com o motivo; o registro de {dataCurta(at.finalizadoEm?.slice(0, 10))} fica guardado como estava.
        </p>
      ) : null}

      {!finalizado ? (
        <div className="mb-4">
          <PainelDaGravacao atendimento={at} pessoa={pessoa} itensUso={itensUso} anterior={anterior} config={config} editavel={editavel} alterar={alterarSeRascunho} aoMudarOcupado={setGravacaoOcupada} />
        </div>
      ) : null}

      {org && pendentesSemIncerteza.length > 1 && editavel ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-[color:var(--n-ia)] bg-[color:var(--n-ia-fundo)] px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 nutri-texto-ia" aria-hidden="true" /> {pendentesSemIncerteza.length} sugestões sem incerteza aguardando revisão.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => setLoteAberto(true)}>
            Revisar e aceitar de uma vez
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
        <div className="grid content-start gap-4">
          <Cartao titulo="Roteiro do checkpoint">
            {ROTEIRO.map((linha) => {
              const valor = conteudo.campos[linha.id];
              return (
                <LinhaDoRoteiro
                  key={linha.id}
                  linha={linha}
                  valor={valor}
                  anterior={anterior ? { valor: anterior.campos[linha.id], data: anterior.data } : null}
                  sugestao={sugestaoDoCampo(linha.id)}
                  segmentos={at.transcricao?.segmentos ?? []}
                  config={config}
                  editavel={editavel}
                  permitirAnterior={!finalizado}
                  aoEditarTexto={(texto) => mudarCampo(linha.id, (v) => editarTexto(v, texto, repo.agora()))}
                  aoEditarBio={(bio) => mudarCampo(linha.id, (v) => editarBio(v, bio, repo.agora()))}
                  aoTrazerAnterior={() => anterior && mudarCampo(linha.id, () => trazerDoAnterior(anterior.campos[linha.id], anterior.data))}
                  aoConfirmarAnterior={() => mudarCampo(linha.id, (v) => confirmarAnterior(v, repo.agora()))}
                  aoLimpar={() => mudarCampo(linha.id, () => valorVazio())}
                  aoAceitar={(textoEditado) => resolverSugestaoCampo(linha.id, textoEditado === undefined ? "aceita" : "editada", textoEditado)}
                  aoRecusar={() => resolverSugestaoCampo(linha.id, "recusada")}
                  aoProximo={focarProximoCampo}
                />
              );
            })}
          </Cartao>

          <Cartao titulo="Suplementos e medicamentos">
            <ConferenciaDeSuplementos
              pessoaId={pessoa.id}
              conferencias={conteudo.suplementos}
              sugestoes={org?.suplementos ?? []}
              segmentos={at.transcricao?.segmentos ?? []}
              dataAtendimento={at.data}
              editavel={editavel}
              aoMudar={(lista) => mudarConteudo((c) => ({ ...c, suplementos: lista }))}
              aoResolverSugestao={resolverSugestaoSuplemento}
            />
          </Cartao>

          {org && org.naoClassificados.some((n) => n.estado === "pendente") ? (
            <Cartao titulo="Mencionado na consulta e sem tema">
              <p className="mb-2 text-sm text-muted-foreground">Nada do que foi dito fica de fora: leve cada item para uma linha, para a conduta, ou descarte.</p>
              <div className="grid gap-2">
                {org.naoClassificados
                  .filter((n) => n.estado === "pendente")
                  .map((n) => (
                    <div key={n.id} className="nutri-sugestao grid gap-2 px-3 py-2 text-sm">
                      <p className="font-medium">{n.texto}</p>
                      <FalaDeOrigem evidencias={n.evidencias} segmentos={at.transcricao?.segmentos ?? []} />
                      {editavel ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <label className="text-xs text-muted-foreground" htmlFor={`destino-${n.id}`}>
                            Levar para
                          </label>
                          <select
                            id={`destino-${n.id}`}
                            className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm"
                            defaultValue=""
                            onChange={(e) => e.target.value && resolverNaoClassificado(n.id, e.target.value as CampoId | "conduta")}
                          >
                            <option value="" disabled>
                              escolha a linha
                            </option>
                            {ROTEIRO.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.rotulo}
                              </option>
                            ))}
                            <option value="conduta">Conduta e orientações</option>
                          </select>
                          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => resolverNaoClassificado(n.id, null)}>
                            Descartar
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
              </div>
            </Cartao>
          ) : null}

          <Cartao titulo="Conduta e próximo passo">
            <div className="grid gap-3">
              {org?.conduta && org.conduta.estado === "pendente" ? (
                <div className="nutri-sugestao grid gap-1.5 px-3 py-2 text-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wide nutri-texto-ia">conduta dita na consulta</span>
                  <p>{org.conduta.texto}</p>
                  <FalaDeOrigem evidencias={org.conduta.evidencias} segmentos={at.transcricao?.segmentos ?? []} />
                  {editavel ? (
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" className="h-8" onClick={() => resolverConduta(true)}>
                        Acrescentar à conduta
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => resolverConduta(false)}>
                        Recusar
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <label className="grid gap-1 text-sm" htmlFor="conduta">
                <span className="font-semibold text-brand-musgo">Conduta e orientações (fica no módulo)</span>
                <LinhaQueCresce id="conduta" value={conteudo.conduta} disabled={!editavel} placeholder="O que ficou combinado hoje" onChange={(e) => mudarConteudo((c) => ({ ...c, conduta: e.target.value }))} className="border-brand-oliva/14" />
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <Interruptor
                  id="linha-plano"
                  ligado={conteudo.linhaPlano.ativa}
                  aoMudar={(v) => mudarConteudo((c) => ({ ...c, linhaPlano: { ...c.linhaPlano, ativa: v } }))}
                  rotulo="Incluir a linha do plano no prontuário"
                />
                <label className="inline-flex items-center gap-2 text-sm" htmlFor="proximo">
                  <CalendarClock className="h-4 w-4 text-brand-oliva" aria-hidden="true" /> Próximo acompanhamento
                  <input
                    id="proximo"
                    type="date"
                    disabled={!editavel || finalizado}
                    value={at.proximoAcompanhamento ?? ""}
                    onChange={(e) => alterar((a) => ({ ...a, proximoAcompanhamento: e.target.value || null }))}
                    className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm"
                  />
                </label>
              </div>
              {conteudo.linhaPlano.ativa ? (
                <LinhaQueCresce value={conteudo.linhaPlano.texto} disabled={!editavel} onChange={(e) => mudarConteudo((c) => ({ ...c, linhaPlano: { ...c.linhaPlano, texto: e.target.value } }))} aria-label="Texto da linha do plano" className="border-brand-oliva/14" />
              ) : null}
            </div>
          </Cartao>

          {org && org.descartadas.length ? (
            <details className="rounded-xl border border-brand-oliva/12 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-semibold text-muted-foreground">{org.descartadas.length} sugestão(ões) descartadas pela conferência automática</summary>
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {org.descartadas.map((d, i) => (
                  <li key={i}>
                    <strong>{d.onde}:</strong> {d.texto} <em>({d.motivo})</em>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {at.retificacoes.length ? (
            <Cartao titulo="Retificações">
              <ul className="grid gap-1 text-sm">
                {at.retificacoes.map((r, i) => (
                  <li key={i}>
                    {dataCurta(r.em.slice(0, 10))} · {r.autor}: {r.motivo}
                  </li>
                ))}
              </ul>
            </Cartao>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:rounded-2xl">
          <FolhaDoProntuario atendimento={vista} config={config} aoCopiar={() => (podeEditarModulo && !finalizado ? alterar((a) => ({ ...a, textoCopiadoEm: repo.agora() })) : undefined)} />
        </div>
      </div>

      <Dialogo
        aberto={finalizarAberto}
        aoFechar={() => setFinalizarAberto(false)}
        titulo={pendencias.length ? "Antes de finalizar" : "Finalizar o checkpoint"}
        acoes={
          pendencias.length ? (
            <Button type="button" onClick={() => setFinalizarAberto(false)}>
              Voltar e resolver
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => setFinalizarAberto(false)}>
                Voltar
              </Button>
              <Button type="button" className="gap-1.5" onClick={() => void finalizar()}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Finalizar
              </Button>
            </>
          )
        }
      >
        {pendencias.length ? (
          <ul className="grid gap-1.5">
            {pendencias.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <Bolinha estado={p.tipo === "anterior_pendente" ? "anterior" : "ia"} className="mt-1" />
                <span>{p.descricao}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p>O registro fica congelado. Corrigir depois é retificação, com motivo, e o que havia antes fica guardado.</p>
            {at.linhaPlano.ativa ? (
              <p>
                O plano entra nos prazos com entrega até <strong>{dataCurta(prazoPrevisto)}</strong> ({config.diasUteisPrazoPlano} dias úteis).
              </p>
            ) : null}
            {!at.textoCopiadoEm ? <p className="text-amber-800">Você ainda não copiou o texto para o iClinic.</p> : null}
          </>
        )}
        {erroAcao ? <p className="text-red-800">{erroAcao}</p> : null}
      </Dialogo>

      <Dialogo
        aberto={retificarAberto}
        aoFechar={() => setRetificarAberto(false)}
        titulo="Motivo da retificação"
        acoes={
          <>
            <Button type="button" variant="ghost" onClick={() => setRetificarAberto(false)}>
              Voltar
            </Button>
            <Button type="button" onClick={() => void salvarRetificacao()} disabled={!motivo.trim()}>
              Salvar retificação
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground">Fica registrado com seu nome, a data e o motivo. O texto anterior continua guardado.</p>
        <LinhaQueCresce value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Por exemplo: o sono foi anotado errado na consulta" className="border-brand-oliva/20" />
        {erroAcao ? <p className="text-red-800">{erroAcao}</p> : null}
      </Dialogo>

      <Dialogo
        aberto={loteAberto}
        aoFechar={() => setLoteAberto(false)}
        titulo="Aceitar as sugestões sem incerteza"
        largura="max-w-2xl"
        acoes={
          <>
            <Button type="button" variant="ghost" onClick={() => setLoteAberto(false)}>
              Voltar
            </Button>
            <Button type="button" onClick={aceitarEmLote}>
              Aceitar estas {pendentesSemIncerteza.length}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground">Confira cada linha com a fala de origem. As marcadas como incertas continuam para revisão uma a uma.</p>
        <ul className="grid gap-2">
          {pendentesSemIncerteza.map((s) => (
            <li key={s.campo} className="rounded-xl border border-brand-oliva/12 p-2">
              <p>
                <strong>{rotuloDoCampo(s.campo)}:</strong> {s.campo === "bio" ? "números da bioimpedância" : s.texto}
              </p>
              <FalaDeOrigem evidencias={s.evidencias} segmentos={at.transcricao?.segmentos ?? []} />
            </li>
          ))}
        </ul>
      </Dialogo>
    </Modulo>
  );
}
