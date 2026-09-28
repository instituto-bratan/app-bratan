// O EDITOR DO PLANO ALIMENTAR (28/09/2026).
//
// Três colunas: estrutura (refeições e blocos), edição direta, e a folha A4
// com as abas Prévia e Cálculo. A prévia é a mesma página do PDF. Plano
// finalizado não se edita: vira uma versão nova, e a antiga fica guardada.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, Copy, Download, FilePlus2, GitCompare, ListPlus, Lock, MessageCircle, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule } from "@/lib/access";
import { calcularPlano } from "../dominio/calculo";
import { CONFIG_PADRAO } from "../dominio/config";
import { normalizarParaBusca } from "../dominio/extracao";
import { alimentosDoRetrato, blocoDaBiblioteca, cabecalhoDoDocumento, diferencas, duplicarPlano, estadoDaEntrega, finalizarPlano, marcarSubstituido, novaRefeicao, novoItem, registrarEntrega, tituloDoPlano } from "../dominio/plano";
import { revisarPlano } from "../dominio/revisao";
import { dataCurta, mesPorExtenso, mesRefDe } from "../dominio/texto";
import type { Alimento, BlocoPlano, IdentificacaoProfissional, Plano, Refeicao, RegrasDoCalculo, TipoEventoEntrega } from "../dominio/tipos";
import { DocumentoPlano, type InfoDaPaginacao } from "../documento/DocumentoPlano";
import { baixar, gerarPdf, nomeDoArquivo } from "../documento/exportar";
import { EditorDeRefeicao } from "../plano/EditorDeRefeicao";
import { PainelDoCalculo } from "../plano/PainelDoCalculo";
import { FalaDeOrigem } from "../consulta/FalaDeOrigem";
import { useAlimentos, useAtendimento, useAtualizarNutricao, useBiblioteca, useConfig, useIdentificacao, useMedidas, useNutricaoPronta, usePessoa, usePlano, usePlanosDaPessoa, useRascunho } from "../store/hooks";
import * as repo from "../store/repositorio";
import { Abas, Cartao, Carregando, Dialogo, Modulo, SeloFicticio, SeloSalvamento, Vazio } from "../ui/basicos";

function mover<T>(lista: T[], indice: number, delta: number): T[] {
  const alvo = indice + delta;
  if (alvo < 0 || alvo >= lista.length) return lista;
  const copia = lista.slice();
  const [item] = copia.splice(indice, 1);
  copia.splice(alvo, 0, item);
  return copia;
}

const CANAIS = ["WhatsApp", "E-mail", "Impresso na consulta", "Portal do paciente"];

// Objeto fixo: um objeto novo a cada render faria a folha se medir sem parar.
const SEM_IDENTIFICACAO: IdentificacaoProfissional = { linhas: [], versao: 0 };

export function NutricaoPlanoPage() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { pessoa: usuario } = useAuth();
  const pronto = useNutricaoPronta();
  const { data: original, isLoading } = usePlano(id);
  const { data: pessoa } = usePessoa(original?.pessoaId);
  const { data: anteriorPlano } = usePlano(original?.origem.deId ?? undefined);
  const { data: atendimento } = useAtendimento(original?.atendimentoId ?? undefined);
  const { data: planosDaPessoa = [] } = usePlanosDaPessoa(original?.pessoaId);
  const { data: alimentos = [] } = useAlimentos();
  const { data: medidas = [] } = useMedidas();
  const { data: biblioteca = [] } = useBiblioteca();
  const { data: identificacao } = useIdentificacao();
  const { data: config = CONFIG_PADRAO } = useConfig();
  const atualizar = useAtualizarNutricao();
  const { rascunho: plano, alterar, salvarJa, recarregar, estado } = useRascunho<Plano>(original, repo.salvarPlano);

  const [aba, setAba] = useState<"previa" | "calculo">("previa");
  const [paginacao, setPaginacao] = useState<InfoDaPaginacao | null>(null);
  const [revisaoAberta, setRevisaoAberta] = useState(false);
  const [comparacaoAberta, setComparacaoAberta] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [aguardandoImpressao, setAguardandoImpressao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.6);
  const [destinoAcordo, setDestinoAcordo] = useState<Record<string, string>>({});
  const colunaPrevia = useRef<HTMLDivElement>(null);
  const documentoRef = useRef<HTMLDivElement>(null);
  // Eventos de entrega um de cada vez: cada um lê o plano depois que o anterior gravou.
  const filaDeEntrega = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    const el = colunaPrevia.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(([entrada]) => setZoom(Math.min(1, Math.max(0.35, (entrada.contentRect.width - 8) / 794))));
    observador.observe(el);
    return () => observador.disconnect();
  }, [plano?.id]);

  // Plano finalizado: valores da tabela, regras e identificação do dia da finalização.
  const congelado = Boolean(plano && plano.estado !== "rascunho");
  const alimentosPorId = useMemo(() => {
    const mapa = Object.fromEntries(alimentos.map((a) => [a.id, a])) as Record<string, Alimento>;
    if (plano && plano.estado !== "rascunho") for (const a of alimentosDoRetrato(plano)) mapa[a.id] = a;
    return mapa;
  }, [alimentos, plano]);
  const regras: RegrasDoCalculo = (congelado && plano?.regrasDoCalculo) || { azeiteGramas: config.azeiteGramas, azeiteAlimentoId: config.azeiteAlimentoId, caloriasPor: config.caloriasPor };
  const calculo = useMemo(
    () =>
      plano
        ? calcularPlano(plano.refeicoes, alimentosPorId, { azeiteGramas: regras.azeiteGramas, azeite: alimentosPorId[regras.azeiteAlimentoId] ?? null, pesoKg: plano.pesoReferencia?.kg ?? null, caloriasPor: regras.caloriasPor })
        : null,
    [plano, alimentosPorId, regras.azeiteGramas, regras.azeiteAlimentoId, regras.caloriasPor],
  );

  if (pronto.isLoading || isLoading) return <Carregando texto="Abrindo o plano" />;
  if (!plano || !pessoa || !calculo) {
    return (
      <Modulo>
        <Vazio titulo="Plano não encontrado" acao={<Button asChild><Link to="/nutricao">Voltar para Hoje</Link></Button>} />
      </Modulo>
    );
  }

  const podeEditarModulo = canEditModule(usuario, "nutricao");
  const editavel = podeEditarModulo && plano.estado === "rascunho";
  const ident = (congelado && plano.identificacaoUsada) || identificacao || SEM_IDENTIFICACAO;
  const revisao = revisarPlano(plano, ident, calculo, paginacao);
  const entrega = estadoDaEntrega(plano);
  const difs = anteriorPlano ? diferencas(anteriorPlano, plano) : [];
  const acordos = (atendimento?.organizacao?.acordos ?? []).filter((a) => !(plano.acordosResolvidos ?? []).includes(a.id));

  const mudarRefeicao = (r: Refeicao) => alterar((p) => ({ ...p, refeicoes: p.refeicoes.map((x) => (x.id === r.id ? r : x)) }));
  const mudarBloco = (b: BlocoPlano) => alterar((p) => ({ ...p, blocos: p.blocos.map((x) => (x.id === b.id ? b : x)) }));
  const kcalDaRefeicao = (rid: string) => calculo.porRefeicao.find((r) => r.refeicaoId === rid)?.kcal ?? null;

  /** Refeição sugerida para o acordo: só quando o nome bate inteiro; senão ela escolhe. */
  const refeicaoSugerida = (nome: string) => plano.refeicoes.find((r) => normalizarParaBusca(r.nome) === normalizarParaBusca(nome))?.id ?? "";

  const aplicarAcordo = (acordoId: string, refeicaoId: string, texto: string) => {
    if (!refeicaoId) return;
    alterar((p) => ({
      ...p,
      acordosResolvidos: [...(p.acordosResolvidos ?? []), acordoId],
      refeicoes: p.refeicoes.map((r) => (r.id === refeicaoId ? { ...r, itens: [...r.itens, novoItem(repo.novoId, { descricao: texto, origem: "acordo" })] } : r)),
    }));
  };

  const finalizar = async () => {
    try {
      const final = finalizarPlano(plano, alimentos, repo.agora(), { identificacao: ident, regras });
      const salvo = await salvarJa(final);
      if (salvo) {
        // Um plano vigente por pessoa: todo outro finalizado passa a substituído.
        for (const outro of await repo.listarPlanosDaPessoa(plano.pessoaId)) {
          if (outro.id !== salvo.id && outro.estado === "finalizado") await repo.salvarPlano(marcarSubstituido(outro, repo.agora()), outro.versao);
        }
        await atualizar();
        setRevisaoAberta(false);
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    }
  };

  /** Eventos de entrega partem do plano gravado mais recente: nenhum evento some por cima de outro. */
  const registrar = (tipo: TipoEventoEntrega, canal: string | null = null, extra: Partial<Plano> = {}) => {
    const em = repo.agora();
    const vez = filaDeEntrega.current.then(async () => {
      const atual = (await repo.lerPlano(plano.id)) ?? plano;
      await salvarJa(registrarEntrega({ ...atual, ...extra }, { tipo, em, canal }));
    });
    filaDeEntrega.current = vez.catch(() => undefined);
    return vez;
  };

  const gerar = async () => {
    const doc = documentoRef.current;
    if (!doc) return;
    setGerando(true);
    setAviso(null);
    try {
      const { titulo, nome } = cabecalhoDoDocumento(plano);
      const r = await gerarPdf(doc, `${titulo} · ${nome}`);
      if (r.pelaEstacao) {
        baixar(r.blob, nomeDoArquivo(mesPorExtenso(plano.mesRef), nome));
        // Quem só vê pode baixar o PDF, mas não muda o registro.
        if (podeEditarModulo) await registrar("pdf_gerado", null, { pdf: { geradoEm: repo.agora(), hash: r.hash, paginas: paginacao?.paginas ?? 0 } });
      } else {
        setAguardandoImpressao(r.motivo);
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  };

  const novaVersao = async () => {
    const copia = duplicarPlano(plano, { mesRef: mesRefDe(repo.hoje()), novoId: repo.novoId, agora: repo.agora(), atendimentoId: plano.atendimentoId });
    const numero = planosDaPessoa.reduce((m, p) => Math.max(m, p.numero), plano.numero) + 1;
    const salvo = await repo.salvarPlano({ ...copia, numero, versao: 0 }, null);
    await atualizar();
    navegar(`/nutricao/planos/${salvo.id}`);
  };

  const mensagem = `Olá, ${pessoa.nome.split(" ")[0]}! Seu plano alimentar de ${mesPorExtenso(plano.mesRef).replace(/ de \d{4}$/, "")} está pronto e segue em anexo. Qualquer dúvida, me chame por aqui.\n\n${ident.linhas[0] ?? ""}`;
  const blocosDisponiveis = biblioteca.filter((b) => !plano.blocos.some((x) => x.origem?.blocoId === b.id));

  return (
    <Modulo className="max-w-[1680px]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/nutricao/pessoas/${pessoa.id}?aba=planos`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-oliva hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {pessoa.nome}
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold text-brand-musgo">
            {tituloDoPlano(plano.mesRef)} {pessoa.ficticia ? <SeloFicticio /> : null}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>versão {plano.numero}</span>
            <span>·</span>
            <span>
              {plano.estado === "rascunho" ? "rascunho" : plano.estado === "finalizado" ? `finalizado em ${dataCurta(plano.finalizadoEm?.slice(0, 10))}` : `substituído em ${dataCurta(plano.substituidoEm?.slice(0, 10))}`}
            </span>
            {plano.origem.tipo === "duplicado" && anteriorPlano ? (
              <>
                <span>·</span>
                <Link className="hover:underline" to={`/nutricao/planos/${anteriorPlano.id}`}>
                  a partir da versão {anteriorPlano.numero} ({mesPorExtenso(anteriorPlano.mesRef)})
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeloSalvamento estado={estado} />
          {estado.tipo === "conflito" ? (
            <Button type="button" size="sm" variant="outline" onClick={async () => { const b = await repo.lerPlano(plano.id); if (b) recarregar(b); }}>
              Recarregar a versão gravada
            </Button>
          ) : null}
          {anteriorPlano ? (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setComparacaoAberta(true)}>
              <GitCompare className="h-4 w-4" aria-hidden="true" /> {difs.length} mudança(s) desde a versão {anteriorPlano.numero}
            </Button>
          ) : null}
          {editavel ? (
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setRevisaoAberta(true)}>
              <Lock className="h-4 w-4" aria-hidden="true" /> Revisar e finalizar
            </Button>
          ) : null}
          {plano.estado !== "rascunho" && podeEditarModulo ? (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => void novaVersao()}>
              <FilePlus2 className="h-4 w-4" aria-hidden="true" /> Nova versão a partir desta
            </Button>
          ) : null}
        </div>
      </div>

      {plano.estado === "finalizado" ? (
        <Cartao titulo="Entrega" className="mb-4">
          <div className="grid gap-3">
            <ol className="flex flex-wrap items-center gap-2 text-sm">
              {[
                { ok: entrega.pdfGerado, rotulo: entrega.pdfGeradoEm ? `PDF gerado ${dataCurta(entrega.pdfGeradoEm.slice(0, 10))}` : "PDF não gerado" },
                { ok: Boolean(entrega.anexadoEm), rotulo: entrega.anexadoEm ? "anexado ao iClinic" : "não anexado ao iClinic" },
                { ok: Boolean(entrega.compartilhadoEm), rotulo: entrega.compartilhadoEm ? `compartilhado · ${entrega.canal}` : "não compartilhado" },
                { ok: Boolean(entrega.recebidoEm), rotulo: entrega.recebidoEm ? "recebimento confirmado" : "sem confirmação de recebimento" },
              ].map((etapa, i) => (
                <li key={i} className={etapa.ok ? "rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800" : "rounded-full bg-muted px-2.5 py-1 text-muted-foreground"}>
                  {etapa.ok ? <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {etapa.rotulo}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" className="gap-1.5" disabled={gerando} onClick={() => void gerar()}>
                <Download className="h-4 w-4" aria-hidden="true" /> {gerando ? "Gerando…" : entrega.pdfGerado ? "Gerar o PDF de novo" : "Gerar PDF"}
              </Button>
              {podeEditarModulo && !entrega.anexadoEm ? (
                <Button type="button" size="sm" variant="outline" disabled={gerando} onClick={() => void registrar("anexado_prontuario")}>
                  Anexei no iClinic
                </Button>
              ) : null}
              {podeEditarModulo && !entrega.compartilhadoEm
                ? CANAIS.map((canal) => (
                    <Button key={canal} type="button" size="sm" variant="outline" className="gap-1.5" disabled={gerando} onClick={() => void registrar("compartilhado", canal)}>
                      <Send className="h-3.5 w-3.5" aria-hidden="true" /> Enviei por {canal}
                    </Button>
                  ))
                : null}
              {podeEditarModulo && entrega.compartilhadoEm && !entrega.recebidoEm ? (
                <Button type="button" size="sm" variant="outline" disabled={gerando} onClick={() => void registrar("recebimento_confirmado")}>
                  A pessoa confirmou que recebeu
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => {
                  void navigator.clipboard?.writeText(mensagem).catch(() => undefined);
                  setAviso("Mensagem copiada. Cole no WhatsApp junto com o PDF.");
                }}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> Copiar mensagem de entrega
              </Button>
            </div>
            {aguardandoImpressao ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {aguardandoImpressao}: abri a impressão do navegador com as mesmas páginas. Escolha “Salvar como PDF”.
                <Button type="button" size="sm" variant="outline" disabled={!podeEditarModulo} onClick={() => { setAguardandoImpressao(null); void registrar("pdf_gerado", "impressão do navegador"); }}>
                  Salvei o PDF
                </Button>
              </div>
            ) : null}
            {plano.pdf ? <p className="text-[11px] text-muted-foreground">Código de verificação do último PDF: {plano.pdf.hash.slice(0, 16)}… · {plano.pdf.paginas} página(s)</p> : null}
          </div>
        </Cartao>
      ) : null}
      {aviso ? <p className="mb-3 rounded-xl bg-brand-creme/50 px-3 py-2 text-sm">{aviso}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(400px,0.85fr)] 2xl:grid-cols-[190px_minmax(0,1fr)_minmax(460px,0.85fr)]">
        <nav className="hidden 2xl:block" aria-label="Estrutura do plano">
          <div className="sticky top-24 grid gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-brand-oliva">Refeições</p>
            <ol className="grid gap-1 text-sm">
              {plano.refeicoes.map((r) => (
                <li key={r.id}>
                  <a href={`#refeicao-${r.id}`} className="flex justify-between gap-2 rounded-lg px-2 py-1 hover:bg-muted">
                    <span className="truncate">
                      {r.emoji} {r.nome}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{r.horario || (r.opcional ? "opc." : "")}</span>
                  </a>
                </li>
              ))}
            </ol>
            <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.07em] text-brand-oliva">Blocos</p>
            <ol className="grid gap-1 text-sm">
              {plano.blocos.map((b) => (
                <li key={b.id}>
                  <a href={`#bloco-${b.id}`} className="block truncate rounded-lg px-2 py-1 hover:bg-muted">
                    {b.titulo} <span className="text-[11px] text-muted-foreground">{b.itens.filter((i) => i.incluido).length}/{b.itens.length}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="grid content-start gap-4">
          {acordos.length && editavel ? (
            <Cartao titulo="Combinados na consulta" acoes={<Sparkles className="h-4 w-4 nutri-texto-ia" aria-hidden="true" />}>
              <p className="mb-2 text-sm text-muted-foreground">Da gravação de {dataCurta(atendimento?.data)}. “Pôr no plano” cria o alimento na refeição, sem quantidade: a medida é sua.</p>
              <div className="grid gap-2">
                {acordos.map((a) => (
                  <div key={a.id} className="nutri-sugestao grid gap-1.5 px-3 py-2 text-sm">
                    <p>
                      <strong>{a.refeicao}:</strong> {a.acordo}
                    </p>
                    <FalaDeOrigem evidencias={a.evidencias} segmentos={atendimento?.transcricao?.segmentos ?? []} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        aria-label="Refeição do acordo"
                        value={destinoAcordo[a.id] ?? refeicaoSugerida(a.refeicao)}
                        onChange={(e) => setDestinoAcordo((d) => ({ ...d, [a.id]: e.target.value }))}
                        className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm"
                      >
                        <option value="">escolha a refeição</option>
                        {plano.refeicoes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nome}
                          </option>
                        ))}
                      </select>
                      <Button type="button" size="sm" className="h-8" disabled={!(destinoAcordo[a.id] ?? refeicaoSugerida(a.refeicao))} onClick={() => aplicarAcordo(a.id, destinoAcordo[a.id] ?? refeicaoSugerida(a.refeicao), a.acordo)}>
                        Pôr no plano
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => alterar((p) => ({ ...p, acordosResolvidos: [...(p.acordosResolvidos ?? []), a.id] }))}>
                        Já resolvi
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Cartao>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-oliva/12 bg-white/50 px-4 py-3 text-sm">
            <label className="inline-flex items-center gap-2" htmlFor="nome-documento">
              <span className="whitespace-nowrap font-semibold text-muted-foreground">Nome no documento</span>
              <input
                id="nome-documento"
                value={plano.nomeDocumento}
                disabled={!editavel}
                onChange={(e) => alterar((p) => ({ ...p, nomeDocumento: e.target.value }))}
                className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 font-semibold"
              />
            </label>
            <label className="inline-flex items-center gap-2" htmlFor="mes-plano">
              <span className="font-semibold text-muted-foreground">Mês</span>
              <input id="mes-plano" type="month" value={plano.mesRef} disabled={!editavel} onChange={(e) => e.target.value && alterar((p) => ({ ...p, mesRef: e.target.value }))} className="h-8 rounded-lg border border-brand-oliva/20 bg-white/70 px-2" />
            </label>
          </div>

          {plano.refeicoes.map((r, i) => (
            <EditorDeRefeicao
              key={r.id}
              refeicao={r}
              indice={i}
              total={plano.refeicoes.length}
              alimentosPorId={alimentosPorId}
              alimentos={alimentos}
              medidas={medidas}
              editavel={editavel}
              kcal={kcalDaRefeicao(r.id)}
              aoMudar={mudarRefeicao}
              aoMover={(delta) => alterar((p) => ({ ...p, refeicoes: mover(p.refeicoes, i, delta) }))}
              aoRemover={() => alterar((p) => ({ ...p, refeicoes: p.refeicoes.filter((x) => x.id !== r.id) }))}
            />
          ))}
          {editavel ? (
            <Button type="button" variant="outline" className="justify-self-start gap-1.5" onClick={() => alterar((p) => ({ ...p, refeicoes: [...p.refeicoes, novaRefeicao({ nome: "Ceia", tipo: "ceia", emoji: "🍵" }, repo.novoId)] }))}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Refeição
            </Button>
          ) : null}

          {plano.blocos.map((b) => (
            <section key={b.id} id={`bloco-${b.id}`} className="rounded-2xl border border-brand-oliva/14 bg-white/70 p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label="Título do bloco" value={b.titulo} disabled={!editavel} onChange={(e) => mudarBloco({ ...b, titulo: e.target.value })} className="h-8 min-w-[12rem] flex-1 rounded-lg border border-transparent bg-transparent px-2 font-semibold text-brand-musgo hover:border-brand-oliva/15 focus:border-brand-dourado focus:outline-none" />
                {b.origem ? <span className="text-[11px] text-muted-foreground">cópia da biblioteca · versão {b.origem.versao}</span> : null}
                {editavel ? (
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-800" onClick={() => alterar((p) => ({ ...p, blocos: p.blocos.filter((x) => x.id !== b.id) }))} aria-label={`Tirar o bloco ${b.titulo}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <ul className="mt-2 grid gap-1">
                {b.itens.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-2"
                      checked={item.incluido}
                      disabled={!editavel}
                      aria-label={`Incluir: ${item.texto}`}
                      onChange={(e) => mudarBloco({ ...b, itens: b.itens.map((x) => (x.id === item.id ? { ...x, incluido: e.target.checked } : x)) })}
                    />
                    <input
                      value={item.texto}
                      disabled={!editavel}
                      aria-label="Texto do item"
                      onChange={(e) => mudarBloco({ ...b, itens: b.itens.map((x) => (x.id === item.id ? { ...x, texto: e.target.value } : x)) })}
                      className={`h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm hover:border-brand-oliva/15 focus:border-brand-dourado focus:outline-none ${item.incluido ? "" : "text-muted-foreground line-through"}`}
                    />
                  </li>
                ))}
              </ul>
              {editavel ? (
                <button type="button" className="mt-1 text-[11px] font-semibold text-brand-oliva hover:underline" onClick={() => mudarBloco({ ...b, itens: [...b.itens, { id: repo.novoId(), texto: "", incluido: true }] })}>
                  + item
                </button>
              ) : null}
            </section>
          ))}
          {editavel && blocosDisponiveis.length ? (
            <div className="flex flex-wrap gap-2">
              {blocosDisponiveis.map((b) => (
                <Button key={b.id} type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => alterar((p) => ({ ...p, blocos: [...p.blocos, blocoDaBiblioteca(b, repo.novoId)] }))}>
                  <ListPlus className="h-4 w-4" aria-hidden="true" /> {b.titulo}
                </Button>
              ))}
            </div>
          ) : null}

          <label className="grid gap-1 text-sm" htmlFor="observacoes-finais">
            <span className="font-semibold text-muted-foreground">Observações finais (saem no documento)</span>
            <textarea
              id="observacoes-finais"
              rows={2}
              value={plano.observacoesFinais}
              disabled={!editavel}
              onChange={(e) => alterar((p) => ({ ...p, observacoesFinais: e.target.value }))}
              className="rounded-xl border border-brand-oliva/15 bg-white/60 p-2 text-sm focus:border-brand-dourado focus:outline-none"
              placeholder="Por exemplo: Azeite apenas no preparo."
            />
          </label>
        </div>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Abas rotulo="Prévia ou cálculo" atual={aba} aoMudar={setAba} abas={[{ id: "previa", rotulo: `Prévia${paginacao ? ` · ${paginacao.paginas} pág.` : ""}` }, { id: "calculo", rotulo: `Cálculo · ${calculo.kcal} kcal` }]} />
          </div>
          {/* Fora da tela (e não display:none) na aba Cálculo: a folha continua medida e pronta para o PDF. */}
          <div
            ref={colunaPrevia}
            aria-hidden={aba !== "previa"}
            className={aba === "previa" ? "max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl bg-brand-tinta/[0.04] p-1" : "pointer-events-none fixed -left-[100000px] top-0 w-[480px]"}
          >
            <DocumentoPlano ref={documentoRef} plano={plano} identificacao={ident} zoom={zoom} aoPaginar={setPaginacao} />
          </div>
          {aba === "calculo" ? (
            <Cartao>
              <PainelDoCalculo
                key={plano.id}
                plano={plano}
                resultado={calculo}
                regras={regras}
                editavel={editavel}
                aoMudarMetas={(metas) => alterar((p) => ({ ...p, metas }))}
                aoMudarPeso={(kg) => alterar((p) => ({ ...p, pesoReferencia: kg === null ? null : { kg, origem: p.pesoReferencia?.origem ?? "digitado" } }))}
              />
            </Cartao>
          ) : null}
        </div>
      </div>

      <Dialogo
        aberto={revisaoAberta}
        aoFechar={() => setRevisaoAberta(false)}
        titulo="Revisar antes de finalizar"
        largura="max-w-2xl"
        acoes={
          <>
            <Button type="button" variant="ghost" onClick={() => setRevisaoAberta(false)}>
              Voltar ao plano
            </Button>
            <Button type="button" className="gap-1.5" disabled={!revisao.podeFinalizar} onClick={() => void finalizar()}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Finalizar plano
            </Button>
          </>
        }
      >
        <ul className="grid gap-1.5">
          {revisao.itens.map((i) => (
            <li key={i.id} className="flex items-start gap-2">
              {i.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" /> : <X className={`mt-0.5 h-4 w-4 shrink-0 ${i.bloqueia ? "text-red-700" : "text-amber-700"}`} aria-hidden="true" />}
              <span className={i.bloqueia ? "text-red-800" : undefined}>{i.texto}</span>
            </li>
          ))}
        </ul>
        {difs.length ? (
          <div className="rounded-xl border border-brand-oliva/12 p-3">
            <p className="mb-1 font-semibold">Mudanças desde a versão {anteriorPlano?.numero}</p>
            <ul className="grid gap-0.5 text-muted-foreground">
              {difs.map((d, i) => (
                <li key={i}>• {d.descricao}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-muted-foreground">Finalizar congela esta versão com os valores da tabela de hoje. {anteriorPlano?.estado === "finalizado" ? `A versão ${anteriorPlano.numero} passa a “substituída” e continua guardada.` : ""}</p>
      </Dialogo>

      <Dialogo aberto={comparacaoAberta} aoFechar={() => setComparacaoAberta(false)} titulo={`O que mudou desde a versão ${anteriorPlano?.numero ?? ""}`}>
        {difs.length ? (
          <ul className="grid gap-1">
            {difs.map((d, i) => (
              <li key={i}>• {d.descricao}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nada mudou ainda em relação à versão anterior.</p>
        )}
        <Button asChild variant="outline" size="sm" className="justify-self-start gap-1.5">
          <Link to={`/nutricao/planos/${anteriorPlano?.id ?? ""}`}>
            <Copy className="h-4 w-4" aria-hidden="true" /> Abrir a versão {anteriorPlano?.numero}
          </Link>
        </Button>
      </Dialogo>
    </Modulo>
  );
}
