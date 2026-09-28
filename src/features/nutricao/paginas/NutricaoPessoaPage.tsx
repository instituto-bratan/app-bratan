// A FICHA DA PESSOA (28/09/2026).
//
// Visão geral enxuta (o resto nasce dos checkpoints), preparação da consulta
// com data e origem de cada informação, atendimentos, planos e a lista de
// suplementos e medicamentos. Vazio é "não informado", nunca "nenhum".
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarPlus, Copy, FilePlus2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule } from "@/lib/access";
import { CONFIG_PADRAO } from "../dominio/config";
import { blocoDaBiblioteca, duplicarPlano, estadoDaEntrega, novoPlano, tituloDoPlano } from "../dominio/plano";
import { linhasDaFolha } from "../dominio/resumo";
import { textoDaPrescricao } from "../dominio/suplementos";
import { dataCurta, formatarNumero, mesRefDe } from "../dominio/texto";
import type { Atendimento, ItemUso, OrigemRegistro, Pessoa, Plano, RegistroTexto } from "../dominio/tipos";
import { useAtendimentosDaPessoa, useAtualizarNutricao, useBiblioteca, useConfig, useItensUso, useNutricaoPronta, usePessoa, usePlanosDaPessoa, useRascunho } from "../store/hooks";
import * as repo from "../store/repositorio";
import { BotaoNovaConsulta } from "../ui/acoes";
import { Abas, Bolinha, CabecalhoDaPagina, Cartao, Carregando, Dialogo, Modulo, SeloFicticio, SeloSalvamento, Vazio } from "../ui/basicos";

type Aba = "visao" | "preparo" | "atendimentos" | "planos" | "suplementos";

const ORIGEM: Record<OrigemRegistro, string> = { relato: "relato da pessoa", profissional: "registro profissional", ia_revisada: "da gravação, revisado" };
const TIPO = { checkpoint: "Checkpoint", primeira: "Primeira consulta", retorno: "Retorno" } as const;

function ListaDeRegistros({ titulo, registros, editavel, aoMudar }: { titulo: string; registros: RegistroTexto[]; editavel: boolean; aoMudar: (r: RegistroTexto[]) => void }) {
  const [texto, setTexto] = useState("");
  const [origem, setOrigem] = useState<OrigemRegistro>("relato");
  return (
    <Cartao titulo={titulo}>
      {registros.length === 0 ? <p className="text-sm italic text-muted-foreground">não informado</p> : null}
      <ul className="grid gap-1.5">
        {registros.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
            <span>
              {r.texto} <span className="text-[11px] text-muted-foreground">· {ORIGEM[r.origem]} · {dataCurta(r.em)}</span>
            </span>
            {editavel ? (
              <button type="button" className="rounded p-0.5 text-muted-foreground hover:text-red-800" onClick={() => aoMudar(registros.filter((x) => x.id !== r.id))} aria-label={`Tirar ${r.texto}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {editavel ? (
        <form
          className="mt-2 flex flex-wrap gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            aoMudar([...registros, { id: repo.novoId(), texto: texto.trim(), origem, em: repo.hoje(), atendimentoId: null }]);
            setTexto("");
          }}
        >
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="acrescentar" aria-label={`Acrescentar em ${titulo}`} className="h-8 min-w-[8rem] flex-1 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm" />
          <select value={origem} onChange={(e) => setOrigem(e.target.value as OrigemRegistro)} aria-label="Origem" className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-1 text-xs">
            <option value="relato">relato da pessoa</option>
            <option value="profissional">registro profissional</option>
          </select>
          <Button type="submit" size="sm" variant="outline" className="h-8">
            Acrescentar
          </Button>
        </form>
      ) : null}
    </Cartao>
  );
}

function Preparacao({ pessoa, atendimentos, itens, planos }: { pessoa: Pessoa; atendimentos: Atendimento[]; itens: ItemUso[]; planos: Plano[] }) {
  const { data: config = CONFIG_PADRAO } = useConfig();
  const ultimo = atendimentos.find((a) => a.estado === "finalizado") ?? null;
  const bios = atendimentos.filter((a) => a.campos.bio.bio && a.campos.bio.estado === "preenchido").slice(0, 6);
  const vigente = planos.find((p) => p.estado === "finalizado") ?? null;
  if (!ultimo) return <Vazio titulo="Ainda não há checkpoint finalizado">A preparação mostra o último checkpoint, a conduta e a evolução da bioimpedância assim que houver um.</Vazio>;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Cartao titulo={`Último checkpoint · ${dataCurta(ultimo.data)}`} acoes={<Link to={`/nutricao/consultas/${ultimo.id}`} className="text-xs font-semibold text-brand-oliva hover:underline">abrir</Link>}>
        <div className="nutri-folha-linhas">
          {linhasDaFolha(ultimo, config)
            .filter((l) => l.campo || l.estado === "suplemento" || l.estado === "titulo")
            .map((l, i) => (
              <div key={i} className="nutri-folha-linha" data-estado={l.estado}>
                {l.estado === "titulo" ? <span /> : <Bolinha estado={l.estado === "nao_informado" ? "vazio" : "ok"} />}
                <span className="nutri-folha-texto">
                  {l.rotulo ? <strong className="font-semibold">{l.rotulo}: </strong> : null}
                  {l.texto}
                </span>
              </div>
            ))}
        </div>
        {ultimo.conduta ? (
          <p className="mt-3 text-sm">
            <strong>Conduta:</strong> {ultimo.conduta}
          </p>
        ) : null}
      </Cartao>
      <div className="grid content-start gap-4">
        <Cartao titulo="Bioimpedância">
          {bios.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">não informado</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 text-left">Data</th>
                  <th className="py-1 text-right">Peso</th>
                  <th className="py-1 text-right">PGC</th>
                  <th className="py-1 text-right">{config.siglaVisceral}</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {bios.map((a) => (
                  <tr key={a.id} className="border-t border-brand-oliva/10">
                    <td className="py-1 font-sans">{dataCurta(a.data)}</td>
                    <td className="py-1 text-right">{a.campos.bio.bio?.pesoKg !== null && a.campos.bio.bio?.pesoKg !== undefined ? `${formatarNumero(a.campos.bio.bio.pesoKg, 1)} kg` : "—"}</td>
                    <td className="py-1 text-right">{a.campos.bio.bio?.pgc !== null && a.campos.bio.bio?.pgc !== undefined ? `${formatarNumero(a.campos.bio.bio.pgc, 1)}%` : "—"}</td>
                    <td className="py-1 text-right">{a.campos.bio.bio?.visceral ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
        <Cartao titulo="Suplementos e medicamentos em uso">
          {itens.filter((i) => i.situacao === "em_uso").length === 0 ? <p className="text-sm italic text-muted-foreground">não informado</p> : null}
          <ul className="grid gap-1 text-sm">
            {itens
              .filter((i) => i.situacao === "em_uso")
              .map((i) => (
                <li key={i.id}>
                  <strong>{i.nome}</strong> · {textoDaPrescricao(i) || "sem detalhe"}{" "}
                  <span className="text-[11px] text-muted-foreground">
                    · {i.fonte === "prescricao" ? `prescrição de ${i.responsavel || "profissional não informado"}` : "uso relatado pela pessoa"} · registrado em {dataCurta(i.registradoEm)}
                  </span>
                </li>
              ))}
          </ul>
        </Cartao>
        <Cartao titulo="Plano vigente">
          {vigente ? (
            <Link to={`/nutricao/planos/${vigente.id}`} className="flex items-center justify-between gap-2 text-sm hover:underline">
              <span>
                {tituloDoPlano(vigente.mesRef)} · versão {vigente.numero}
              </span>
              <ArrowRight className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
            </Link>
          ) : (
            <p className="text-sm italic text-muted-foreground">nenhum plano finalizado</p>
          )}
        </Cartao>
        {pessoa.objetivos.length ? (
          <Cartao titulo="Objetivos">
            <ul className="text-sm">
              {pessoa.objetivos.map((o) => (
                <li key={o.id}>
                  {o.texto} <span className="text-[11px] text-muted-foreground">· {ORIGEM[o.origem]} · {dataCurta(o.em)}</span>
                </li>
              ))}
            </ul>
          </Cartao>
        ) : null}
      </div>
    </div>
  );
}

function ItemDeUso({ item, editavel }: { item: ItemUso; editavel: boolean }) {
  const { rascunho, alterar, estado } = useRascunho<ItemUso>(item, repo.salvarItemUso);
  if (!rascunho) return null;
  const campo = (rotulo: string, chave: "nome" | "dose" | "frequencia" | "horario" | "responsavel" | "observacoes", largura = "w-40") => (
    <label className="grid gap-0.5 text-xs">
      <span className="font-semibold text-muted-foreground">{rotulo}</span>
      <input value={rascunho[chave]} disabled={!editavel} onChange={(e) => alterar((x) => ({ ...x, [chave]: e.target.value }))} className={`h-8 ${largura} rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm`} />
    </label>
  );
  return (
    <div className="grid gap-2 rounded-xl border border-brand-oliva/12 bg-white/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        {campo("Nome", "nome", "w-48")}
        {campo("Dose e unidade", "dose", "w-32")}
        {campo("Frequência", "frequencia", "w-32")}
        {campo("Horário", "horario", "w-36")}
        <label className="grid gap-0.5 text-xs">
          <span className="font-semibold text-muted-foreground">Tipo</span>
          <select value={rascunho.tipo} disabled={!editavel} onChange={(e) => alterar((x) => ({ ...x, tipo: e.target.value as ItemUso["tipo"] }))} className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-1 text-sm">
            <option value="suplemento">suplemento</option>
            <option value="medicamento">medicamento</option>
          </select>
        </label>
        <label className="grid gap-0.5 text-xs">
          <span className="font-semibold text-muted-foreground">Situação</span>
          <select value={rascunho.situacao} disabled={!editavel} onChange={(e) => alterar((x) => ({ ...x, situacao: e.target.value as ItemUso["situacao"] }))} className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-1 text-sm">
            <option value="em_uso">em uso</option>
            <option value="suspenso">suspenso</option>
            <option value="concluido">concluído</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-0.5 text-xs">
          <span className="font-semibold text-muted-foreground">De onde veio</span>
          <select value={rascunho.fonte} disabled={!editavel} onChange={(e) => alterar((x) => ({ ...x, fonte: e.target.value as ItemUso["fonte"] }))} className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-1 text-sm">
            <option value="prescricao">orientação ou prescrição registrada</option>
            <option value="relato">uso relatado pela pessoa</option>
          </select>
        </label>
        {campo("Profissional responsável", "responsavel", "w-48")}
        <label className="grid gap-0.5 text-xs">
          <span className="font-semibold text-muted-foreground">Início</span>
          <input type="date" value={rascunho.inicio ?? ""} disabled={!editavel} onChange={(e) => alterar((x) => ({ ...x, inicio: e.target.value || null }))} className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm" />
        </label>
        <label className="grid gap-0.5 text-xs">
          <span className="font-semibold text-muted-foreground">Término</span>
          <input type="date" value={rascunho.termino ?? ""} disabled={!editavel} onChange={(e) => alterar((x) => ({ ...x, termino: e.target.value || null }))} className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm" />
        </label>
        {campo("Observações", "observacoes", "w-56")}
        <SeloSalvamento estado={estado} />
      </div>
    </div>
  );
}

export function NutricaoPessoaPage() {
  const { id } = useParams();
  const [parametros, setParametros] = useSearchParams();
  const navegar = useNavigate();
  const { pessoa: usuario } = useAuth();
  const pronto = useNutricaoPronta();
  const { data: original, isLoading } = usePessoa(id);
  const { data: atendimentos = [] } = useAtendimentosDaPessoa(id);
  const { data: itens = [] } = useItensUso(id);
  const { data: planos = [] } = usePlanosDaPessoa(id);
  const { data: biblioteca = [] } = useBiblioteca();
  const atualizar = useAtualizarNutricao();
  const { rascunho: pessoa, alterar, estado } = useRascunho<Pessoa>(original, repo.salvarPessoa);
  const [horaAgenda, setHoraAgenda] = useState("");
  const [agendado, setAgendado] = useState<string | null>(null);

  const aba = (parametros.get("aba") as Aba) || "visao";
  const novoPara = parametros.get("novoPara");
  const atendimentoDoPlano = useMemo(() => atendimentos.find((a) => a.id === novoPara) ?? null, [atendimentos, novoPara]);
  const [dialogoPlano, setDialogoPlano] = useState(false);
  useEffect(() => {
    if (novoPara) setDialogoPlano(true);
  }, [novoPara]);

  if (pronto.isLoading || isLoading) return <Carregando />;
  if (!pessoa) return <Modulo><Vazio titulo="Pessoa não encontrada" acao={<Button asChild><Link to="/nutricao/pessoas">Ver pessoas</Link></Button>} /></Modulo>;

  const editavel = canEditModule(usuario, "nutricao");
  const mudarAba = (nova: Aba) => setParametros((p) => { p.set("aba", nova); p.delete("novoPara"); return p; });
  const ultimoFinalizado = planos.find((p) => p.estado === "finalizado") ?? null;

  const criarPlano = async (modo: "branco" | "duplicar") => {
    const numero = planos.reduce((m, p) => Math.max(m, p.numero), 0) + 1;
    const atendimentoRef = atendimentoDoPlano ?? atendimentos.find((a) => a.estado === "finalizado") ?? null;
    const bio = atendimentoRef?.campos.bio.bio;
    const peso = bio?.pesoKg ? { kg: bio.pesoKg, origem: `Bio de ${dataCurta(atendimentoRef?.data)}` } : null;
    const base =
      modo === "duplicar" && ultimoFinalizado
        ? duplicarPlano(ultimoFinalizado, { mesRef: mesRefDe(repo.hoje()), novoId: repo.novoId, agora: repo.agora(), atendimentoId: atendimentoRef?.id ?? null })
        : novoPlano({ pessoa, mesRef: mesRefDe(repo.hoje()), numero, atendimentoId: atendimentoRef?.id ?? null, novoId: repo.novoId, agora: repo.agora(), blocos: biblioteca.map((b) => blocoDaBiblioteca(b, repo.novoId)) });
    const salvo = await repo.salvarPlano({ ...base, numero, pesoReferencia: peso ?? base.pesoReferencia, versao: 0 }, null);
    await atualizar();
    navegar(`/nutricao/planos/${salvo.id}`);
  };

  const porNaAgenda = async () => {
    await repo.salvarItemAgenda({ id: repo.novoId(), data: repo.hoje(), hora: horaAgenda || "—", pessoaId: pessoa.id, tipo: atendimentos.length ? "checkpoint" : "primeira", versao: 0 });
    await atualizar();
    setAgendado(horaAgenda || "hoje");
  };

  return (
    <Modulo>
      <CabecalhoDaPagina
        sobretitulo={<Link to="/nutricao/pessoas" className="hover:underline">Nutrição · Pessoas</Link>}
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {pessoa.nome} {pessoa.ficticia ? <SeloFicticio /> : null}
          </span>
        }
        detalhe={
          <span className="flex flex-wrap items-center gap-2">
            {pessoa.faseAcompanhamento ? `Plano de Acompanhamento · mês ${pessoa.faseAcompanhamento.mes} de ${pessoa.faseAcompanhamento.total}` : "Fora do Plano de Acompanhamento"}
            <span>·</span>
            <span>Alergias e intolerâncias: {pessoa.alergias.length ? pessoa.alergias.map((a) => a.texto).join(", ") : <em>não informado</em>}</span>
            <SeloSalvamento estado={estado} />
          </span>
        }
        acoes={
          <>
            {editavel ? (
              <span className="inline-flex items-center gap-1.5">
                <input type="time" value={horaAgenda} onChange={(e) => setHoraAgenda(e.target.value)} aria-label="Horário na agenda de hoje" className="h-10 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm" />
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => void porNaAgenda()}>
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {agendado ? `Na agenda (${agendado})` : "Pôr na agenda de hoje"}
                </Button>
              </span>
            ) : null}
            {editavel ? <BotaoNovaConsulta pessoa={pessoa} rotulo="Consulta de hoje" /> : null}
          </>
        }
      />

      <div className="mb-5">
        <Abas
          rotulo="Seções da ficha"
          atual={aba}
          aoMudar={mudarAba}
          abas={[
            { id: "visao", rotulo: "Visão geral" },
            { id: "preparo", rotulo: "Preparar consulta" },
            { id: "atendimentos", rotulo: `Atendimentos (${atendimentos.length})` },
            { id: "planos", rotulo: `Planos (${planos.length})` },
            { id: "suplementos", rotulo: `Suplementos e medicamentos (${itens.length})` },
          ]}
        />
      </div>

      {aba === "visao" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Cartao titulo="Dados">
            <div className="grid gap-2 text-sm">
              <label className="grid gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground">Nome completo</span>
                <input value={pessoa.nome} disabled={!editavel} onChange={(e) => alterar((p) => ({ ...p, nome: e.target.value }))} className="h-9 rounded-lg border border-brand-oliva/20 bg-white/70 px-2" />
              </label>
              <label className="grid gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground">Nome no plano alimentar (sem “paciente”)</span>
                <input value={pessoa.nomeDocumento} disabled={!editavel} onChange={(e) => alterar((p) => ({ ...p, nomeDocumento: e.target.value }))} className="h-9 rounded-lg border border-brand-oliva/20 bg-white/70 px-2" />
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="grid gap-0.5">
                  <span className="text-xs font-semibold text-muted-foreground">Nascimento</span>
                  <input type="date" value={pessoa.nascimento ?? ""} disabled={!editavel} onChange={(e) => alterar((p) => ({ ...p, nascimento: e.target.value || null }))} className="h-9 rounded-lg border border-brand-oliva/20 bg-white/70 px-2" />
                </label>
                <label className="grid gap-0.5">
                  <span className="text-xs font-semibold text-muted-foreground">Telefone</span>
                  <input value={pessoa.telefone ?? ""} disabled={!editavel} onChange={(e) => alterar((p) => ({ ...p, telefone: e.target.value || null }))} className="h-9 rounded-lg border border-brand-oliva/20 bg-white/70 px-2" />
                </label>
                <label className="grid gap-0.5">
                  <span className="text-xs font-semibold text-muted-foreground">Mês do acompanhamento</span>
                  <span className="flex items-center gap-1">
                    <input
                      inputMode="numeric"
                      value={pessoa.faseAcompanhamento?.mes ?? ""}
                      disabled={!editavel}
                      onChange={(e) => {
                        const mes = Number(e.target.value);
                        alterar((p) => ({ ...p, faseAcompanhamento: mes > 0 ? { mes, total: p.faseAcompanhamento?.total ?? 6 } : null }));
                      }}
                      className="h-9 w-14 rounded-lg border border-brand-oliva/20 bg-white/70 px-2"
                    />
                    <span className="text-muted-foreground">de {pessoa.faseAcompanhamento?.total ?? 6}</span>
                  </span>
                </label>
              </div>
            </div>
          </Cartao>
          <ListaDeRegistros titulo="Objetivos relatados" registros={pessoa.objetivos} editavel={editavel} aoMudar={(r) => alterar((p) => ({ ...p, objetivos: r }))} />
          <ListaDeRegistros titulo="Preferências e aversões" registros={pessoa.preferencias} editavel={editavel} aoMudar={(r) => alterar((p) => ({ ...p, preferencias: r }))} />
          <ListaDeRegistros titulo="Restrições alimentares" registros={pessoa.restricoes} editavel={editavel} aoMudar={(r) => alterar((p) => ({ ...p, restricoes: r }))} />
          <ListaDeRegistros titulo="Alergias e intolerâncias" registros={pessoa.alergias} editavel={editavel} aoMudar={(r) => alterar((p) => ({ ...p, alergias: r }))} />
        </div>
      ) : null}

      {aba === "preparo" ? <Preparacao pessoa={pessoa} atendimentos={atendimentos} itens={itens} planos={planos} /> : null}

      {aba === "atendimentos" ? (
        <div className="grid gap-2">
          {atendimentos.length === 0 ? <Vazio titulo="Nenhum atendimento registrado aqui" acao={editavel ? <BotaoNovaConsulta pessoa={pessoa} rotulo="Começar a consulta de hoje" /> : null} /> : null}
          {atendimentos.map((a) => (
            <Link key={a.id} to={`/nutricao/consultas/${a.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-brand-oliva/12 bg-white/60 px-3 py-2.5 hover:border-brand-dourado/50">
              <span>
                <strong>{dataCurta(a.data)}</strong> · {TIPO[a.tipo]}
                {a.numeroCheckpoint && a.tipo === "checkpoint" ? ` ${a.numeroCheckpoint}` : ""}
              </span>
              <span className={a.estado === "finalizado" ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800" : "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800"}>
                {a.estado === "finalizado" ? `finalizado${a.retificacoes.length ? " · retificado" : ""}` : "rascunho"}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {aba === "planos" ? (
        <div className="grid gap-3">
          {editavel ? (
            <div className="flex flex-wrap gap-2">
              {ultimoFinalizado ? (
                <Button type="button" className="gap-1.5" onClick={() => void criarPlano("duplicar")}>
                  <Copy className="h-4 w-4" aria-hidden="true" /> Duplicar a versão {ultimoFinalizado.numero} ({tituloDoPlano(ultimoFinalizado.mesRef).replace("Plano alimentar — ", "")})
                </Button>
              ) : null}
              <Button type="button" variant="outline" className="gap-1.5" onClick={() => void criarPlano("branco")}>
                <FilePlus2 className="h-4 w-4" aria-hidden="true" /> Plano novo com as listas
              </Button>
            </div>
          ) : null}
          {planos.length === 0 ? <Vazio titulo="Nenhum plano ainda">Comece por um plano novo: as listas de frutas e de legumes já entram como cópia.</Vazio> : null}
          {planos.map((p) => {
            const e = estadoDaEntrega(p);
            return (
              <Link key={p.id} to={`/nutricao/planos/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-oliva/12 bg-white/60 px-3 py-2.5 hover:border-brand-dourado/50">
                <span>
                  <strong>{tituloDoPlano(p.mesRef)}</strong> · versão {p.numero}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                  <span className={p.estado === "rascunho" ? "rounded-full bg-amber-50 px-2 py-0.5 text-amber-800" : p.estado === "finalizado" ? "rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800" : "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"}>
                    {p.estado === "rascunho" ? "rascunho" : p.estado === "finalizado" ? "vigente" : "substituído"}
                  </span>
                  {p.estado !== "rascunho" ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {e.etapa === "recebido" ? "recebido" : e.etapa === "compartilhado" ? `compartilhado · ${e.canal}` : e.etapa === "pdf_gerado" ? "PDF gerado, não compartilhado" : "sem PDF"}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {aba === "suplementos" ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">Registro do que foi prescrito ou relatado. O sistema não cria, sugere nem muda dose: só guarda o que você registrar, com a origem.</p>
          {itens.map((i) => (
            <ItemDeUso key={i.id} item={i} editavel={editavel} />
          ))}
          {editavel ? (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start gap-1.5"
              onClick={async () => {
                await repo.salvarItemUso(repo.itemUsoNovo(pessoa.id), null);
                await atualizar();
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Suplemento ou medicamento
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialogo
        aberto={dialogoPlano}
        aoFechar={() => {
          setDialogoPlano(false);
          setParametros((p) => { p.delete("novoPara"); return p; });
        }}
        titulo={atendimentoDoPlano ? `Plano do checkpoint de ${dataCurta(atendimentoDoPlano.data)}` : "Novo plano"}
        acoes={
          editavel ? (
            <>
              <Button type="button" variant="outline" onClick={() => void criarPlano("branco")}>
                Plano novo com as listas
              </Button>
              {ultimoFinalizado ? (
                <Button type="button" onClick={() => void criarPlano("duplicar")}>
                  Duplicar a versão {ultimoFinalizado.numero}
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        <p>{ultimoFinalizado ? `Duplicar a versão ${ultimoFinalizado.numero} (${tituloDoPlano(ultimoFinalizado.mesRef)}) cria a versão nova em rascunho; a anterior fica guardada como está.` : "Ainda não há plano finalizado para duplicar."}</p>
        {atendimentoDoPlano?.campos.bio.bio?.pesoKg ? <p className="text-muted-foreground">Peso de referência do cálculo: {formatarNumero(atendimentoDoPlano.campos.bio.bio.pesoKg, 1)} kg (bio de {dataCurta(atendimentoDoPlano.data)}).</p> : null}
      </Dialogo>
    </Modulo>
  );
}
