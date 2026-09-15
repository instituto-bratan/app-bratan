// MEU BRATAN — o portal do paciente, redesenho estilo Apple (15/09/2026).
//
// Uma página só, no celular: título grande que encolhe numa barra translúcida,
// o bilhete da próxima consulta (única superfície colorida), a curva no espírito
// do app Saúde, a trilha dos seis meses, o que fechou, a pesagem e os documentos.
// A navegação é um dock flutuante (gradient-menu do 21st.dev) que abre a seção
// visível e leva às outras com um toque. O carregamento usa o loading-state do
// 21st.dev. Entra por link mágico; tudo vem da função portal-paciente.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, CalendarDays, Check, ChevronRight, FileText, Route as RouteIcon, Scale } from "lucide-react";
import GradientMenu, { type GradientMenuItem } from "@/components/ui/gradient-menu";
import LoadingState from "@/components/ui/loading-state";
import { Avisos, toast } from "@/components/ui/avisos";
import { todayISO } from "@/lib/localStore";
import { buildMilestones } from "@/features/programa/programaData";
import type { CrmDeal } from "@/features/crm/crmData";
import bratanMark from "@/assets/bratan-mark.png";
import "./portal.css";
import { CurvaEvolucao } from "./CurvaEvolucao";
import { dadosDemo } from "./portalDemo";
import { SESSAO_DEMO, ambienteSemSupabase, carregarDados, emPrevia, entrarComToken, enviarPesagem, guardarSessao, lerSessao, responderConsulta, sairDoPortal } from "./portalCliente";
import { brl, brlCentavos, diaCurto, diaMes, nomeDoPlano, proximaConsulta, resumoEvolucao, resumoFinanceiro, saudacao, trilhaDoPlano, type MarcoDoPlano, type PortalDados } from "./portalPaciente";

const METODO: Record<string, string> = { PIX: "Pix", DINHEIRO: "dinheiro", CARTAO_DEBITO: "débito", CARTAO_CREDITO: "crédito", BOLETO: "boleto", TRANSFERENCIA: "transferência" };
const CONSENT_LABEL: Record<string, string> = { LGPD: "uso dos seus dados para o atendimento", TRATAMENTO: "termo do tratamento", IA: "apoio de inteligência artificial", IMAGEM: "uso de imagem", MARKETING: "mensagens e novidades" };
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// As seções e o dock (cores dos gradientes = cores de sistema da Apple).
const SECOES: GradientMenuItem[] = [
  { id: "consulta", title: "Consulta", icon: <CalendarDays />, gradientFrom: "#0A84FF", gradientTo: "#5E5CE6" },
  { id: "evolucao", title: "Evolução", icon: <Activity />, gradientFrom: "#34C759", gradientTo: "#30B0C7" },
  { id: "plano", title: "Plano", icon: <RouteIcon />, gradientFrom: "#C6A862", gradientTo: "#FF9F0A" },
  { id: "pesagem", title: "Pesagem", icon: <Scale />, gradientFrom: "#FF375F", gradientTo: "#FF6482" },
  { id: "documentos", title: "Docs", icon: <FileText />, gradientFrom: "#8E8E93", gradientTo: "#636366" },
];

function partesDaData(iso: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return { dia: d.getDate(), semana: DIAS[d.getDay()], mes: MESES[d.getMonth()] };
}

/** As duas cores de fundo do portal, nesta ordem: clara e escura. */
const FUNDO = { claro: "#F2F2F7", escuro: "#102019" } as const;

/** Marca o navegador como "Meu Bratan" enquanto o portal está aberto (manifesto, cor, título).
 *  No iPhone a barra do Safari e a área que aparece ao "puxar" a página usam estas cores:
 *  sem acompanhar o tema do aparelho, a moldura fica clara com a página escura. */
function useIdentidadeDoPortal() {
  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const tema = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const raiz = document.documentElement;
    const barra = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
    const antes = { manifest: manifest?.href ?? "", tema: tema?.content ?? "", titulo: document.title, fundo: raiz.style.backgroundColor, barra: barra?.content ?? "" };
    const escuro = window.matchMedia("(prefers-color-scheme: dark)");
    const pintar = () => {
      const cor = escuro.matches ? FUNDO.escuro : FUNDO.claro;
      if (tema) tema.content = cor;
      raiz.style.backgroundColor = cor;
      // instalado na tela de início do iPhone: as horas e a bateria são brancas com
      // "black-translucent" e pretas com "default" — no fundo claro só a segunda dá para ler.
      if (barra) barra.content = escuro.matches ? "black-translucent" : "default";
    };
    if (manifest) manifest.href = "/meu.webmanifest";
    document.title = "Meu Bratan";
    pintar();
    escuro.addEventListener("change", pintar);
    return () => {
      escuro.removeEventListener("change", pintar);
      if (manifest) manifest.href = antes.manifest;
      if (tema) tema.content = antes.tema;
      if (barra) barra.content = antes.barra || "black-translucent";
      raiz.style.backgroundColor = antes.fundo;
      document.title = antes.titulo;
    };
  }, []);
}

function Marca({ previa = false }: { previa?: boolean }) {
  return (
    <div className="p-marca">
      <img src={bratanMark} alt="" />
      <span className="t-foot t-2" style={{ fontWeight: 600 }}>Instituto Bratan</span>
      {previa ? <span className="p-demo">dados de exemplo</span> : null}
    </div>
  );
}

// ---- Entrar pelo link -----------------------------------------------------------
function EntrarPage() {
  useIdentidadeDoPortal();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [erro, setErro] = useState("");
  const token = params.get("t") ?? "";
  const demo = params.get("demo") === "1";
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (ambienteSemSupabase || demo) {
        guardarSessao(SESSAO_DEMO);
        navigate("/meu", { replace: true });
        return;
      }
      if (!token) {
        setErro("Este link está incompleto. Peça um novo para a recepção.");
        return;
      }
      const r = await entrarComToken(token);
      if (!vivo) return;
      if (!r.ok || !r.sessao) {
        setErro(r.error ?? "Não consegui abrir o seu portal.");
        return;
      }
      guardarSessao(r.sessao);
      navigate("/meu", { replace: true });
    })();
    return () => {
      vivo = false;
    };
  }, [token, demo, navigate]);
  return (
    <div className="portal">
      <div className="p-entrar">
        <div className="p-card p-anim">
          <img src={bratanMark} alt="" style={{ width: 56, height: 56, borderRadius: 14 }} />
          <h1 className="t-title2">{erro ? "Não deu para entrar" : "Abrindo o seu espaço"}</h1>
          {erro ? (
            <>
              <p className="t-body t-2">{erro}</p>
              <p className="t-foot t-3">O link vale por uma semana e funciona no aparelho em que você abre. Se precisar, a recepção manda outro na hora.</p>
            </>
          ) : (
            <LoadingState label="Preparando" variant="Dots" showElapsed={false} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Sem sessão -----------------------------------------------------------------
function SemSessao() {
  return (
    <div className="portal">
      <div className="p-entrar">
        <div className="p-card p-anim">
          <img src={bratanMark} alt="" style={{ width: 56, height: 56, borderRadius: 14 }} />
          <h1 className="t-title2">Este é o seu espaço no Instituto Bratan</h1>
          <p className="t-body t-2">Próxima consulta, sua evolução, seu plano e a pesagem da semana, num lugar só.</p>
          <p className="t-foot t-3">Para entrar, abra o link que a recepção mandou no seu WhatsApp. Não tem senha para decorar.</p>
          {ambienteSemSupabase ? (
            <Link to="/meu/entrar" className="p-btn full">
              Ver com dados de exemplo
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---- A página -------------------------------------------------------------------
function MeuPortal() {
  useIdentidadeDoPortal();
  const navigate = useNavigate();
  const hoje = todayISO();
  const [sessao] = useState(() => lerSessao());
  const previa = emPrevia(sessao);
  const [dados, setDados] = useState<PortalDados | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [peso, setPeso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [secaoAtiva, setSecaoAtiva] = useState("consulta");
  const [barraCompacta, setBarraCompacta] = useState(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  const recarregar = useCallback(async () => {
    if (!sessao) return;
    if (previa) {
      setDados(dadosDemo(hoje));
      setCarregando(false);
      return;
    }
    const r = await carregarDados(sessao);
    if (!r.ok || !r.dados) {
      if (r.sessaoInvalida) guardarSessao(null);
      setErro(r.error ?? "Não consegui carregar.");
      setCarregando(false);
      return;
    }
    setDados(r.dados);
    setErro("");
    setCarregando(false);
  }, [sessao, hoje, previa]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Barra compacta quando o título grande sai da tela (padrão do iOS).
  useEffect(() => {
    const alvo = tituloRef.current;
    if (!alvo || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([entry]) => setBarraCompacta(!entry.isIntersecting), { rootMargin: "-56px 0px 0px 0px", threshold: 0 });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [dados]);

  // Seção visível → item aberto no dock.
  useEffect(() => {
    if (!dados || typeof IntersectionObserver === "undefined") return;
    const alvos = SECOES.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => Boolean(el));
    const visiveis = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visiveis.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        let melhor = "";
        let maior = 0;
        for (const s of SECOES) {
          const v = visiveis.get(s.id) ?? 0;
          if (v > maior) {
            maior = v;
            melhor = s.id;
          }
        }
        if (melhor) setSecaoAtiva(melhor);
      },
      { rootMargin: "-25% 0px -45% 0px", threshold: [0, 0.2, 0.5, 0.8, 1] },
    );
    alvos.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [dados]);

  const marcos: MarcoDoPlano[] = useMemo(() => {
    if (!dados?.plano) return [];
    const deal = { id: dados.plano.dealId, closedAt: dados.plano.closedAt, programPhaseEnteredAt: dados.plano.programPhaseEnteredAt ?? undefined, updatedAt: dados.plano.updatedAt, createdAt: dados.plano.createdAt, programMilestonesDone: dados.plano.marcosFeitos } as unknown as CrmDeal;
    return buildMilestones(deal, hoje).map((m) => ({ key: m.key, type: m.type, n: m.n, total: m.total, label: m.label, expectedDate: m.expectedDate, done: m.done, overdue: m.overdue }));
  }, [dados, hoje]);

  if (!sessao) return <SemSessao />;
  const proxima = dados ? proximaConsulta(dados.consultas, marcos, hoje) : null;
  const evolucao = dados ? resumoEvolucao(dados.medicoes, hoje) : null;
  const financeiro = dados ? resumoFinanceiro(dados.comandas, dados.parcelasAbertas, hoje) : null;
  const trilha = dados?.plano ? trilhaDoPlano(marcos, dados.plano.inicio, hoje) : null;
  const ultimaPesagemPropria = dados?.medicoes.filter((m) => m.origem === "PACIENTE").sort((a, b) => b.dia.localeCompare(a.dia))[0] ?? null;
  const partes = proxima ? partesDaData(proxima.em) : null;

  function irPara(id: string) {
    setSecaoAtiva(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function mandarPesagem() {
    const valor = Number(peso.replace(",", "."));
    if (!(valor >= 30 && valor <= 300)) return toast("Confira o peso: em quilos, com vírgula (ex.: 82,4).", { tom: "atencao" });
    setEnviando(true);
    try {
      if (previa) {
        setDados((atual) => (atual ? { ...atual, medicoes: [...atual.medicoes, { id: `demo-${Date.now()}`, dia: hoje, pesoKg: valor, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" }] } : atual));
        setPeso("");
        toast("Pesagem guardada (exemplo).", { tom: "ok" });
        return;
      }
      const r = await enviarPesagem(sessao!, valor);
      if (!r.ok) return toast(r.error ?? "Não consegui guardar.", { tom: "erro" });
      setPeso("");
      toast(r.atualizou ? "Pesagem de hoje atualizada. Obrigado!" : "Pesagem guardada. A enfermagem acompanha por aqui.", { tom: "ok" });
      await recarregar();
    } finally {
      setEnviando(false);
    }
  }

  async function responder(resposta: "CONFIRMO" | "REMARCAR") {
    if (!proxima?.id || proxima.origem === "PREVISTA") return;
    setRespondendo(true);
    try {
      if (previa) {
        setDados((atual) => (atual ? { ...atual, consultas: atual.consultas.map((c) => (c.id === proxima.id ? { ...c, status: resposta === "CONFIRMO" ? "CONFIRMADA" : "REMARCAR" } : c)) } : atual));
        toast(resposta === "CONFIRMO" ? "Consulta confirmada (exemplo)." : "Pedido de remarcação enviado (exemplo).", { tom: "ok" });
        return;
      }
      const r = await responderConsulta(sessao!, proxima.id, proxima.origem, resposta);
      if (!r.ok) return toast(r.error ?? "Não consegui registrar.", { tom: "erro" });
      toast(resposta === "CONFIRMO" ? "Consulta confirmada. Até lá!" : "Avisamos a recepção. Ela vai te chamar para combinar outro horário.", { tom: "ok", duracaoMs: 6000 });
      await recarregar();
    } finally {
      setRespondendo(false);
    }
  }

  async function sair() {
    if (!previa && sessao) await sairDoPortal(sessao).catch(() => undefined);
    guardarSessao(null);
    navigate("/meu", { replace: true });
    window.location.reload();
  }

  const fmt1 = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const sinal = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");

  return (
    <div className="portal">
      <Avisos />
      <div className="p-bar" data-visivel={barraCompacta} aria-hidden={!barraCompacta}>
        Meu Bratan
      </div>
      <div className="p-wrap">
        {carregando ? (
          <div className="p-entrar" style={{ minHeight: "70dvh" }}>
            <LoadingState label="Preparando as suas informações" variant="Dots" showElapsed={false} />
          </div>
        ) : erro ? (
          <>
            <Marca />
            <div className="p-card p-anim">
              <h2 className="t-title2">Não consegui carregar</h2>
              <p className="t-body t-2">{erro}</p>
              <div className="p-botoes">
                <button type="button" className="p-btn full" onClick={() => void recarregar()}>
                  Tentar de novo
                </button>
                <button type="button" className="p-btn plain full" onClick={() => void sair()}>
                  Sair deste aparelho
                </button>
              </div>
            </div>
          </>
        ) : dados ? (
          <>
            <Marca previa={previa} />
            <header className="p-cabeca p-anim">
              <h1 ref={tituloRef} className="t-large">{saudacao(dados.paciente.primeiroNome)}</h1>
              <p className="t-sub t-2">{trilha ? trilha.frase : "Aqui está o seu espaço no Instituto."}</p>
            </header>

            {/* ---- Próxima consulta: o bilhete ---- */}
            <section id="consulta" className="p-sec p-anim" aria-labelledby="t-consulta">
              <div className="p-bilhete">
                <span className="t-sec" id="t-consulta">Próxima consulta</span>
                {proxima && partes ? (
                  <>
                    <div className="p-data">
                      <span className="p-dia">{partes.dia}</span>
                      <div className="p-quando-col">
                        <b>{partes.semana}</b>
                        <span>
                          {partes.mes}
                          {proxima.hora ? ` · ${proxima.hora}` : ""}
                        </span>
                      </div>
                    </div>
                    <p className="p-em">{proxima.quando}</p>
                    <p className="p-det">
                      {proxima.tipo} com {proxima.profissional} · {proxima.local}
                      {proxima.origem === "PREVISTA" ? ". Data prevista pelo seu plano; a recepção confirma o dia e a hora." : ""}
                    </p>
                    {proxima.status === "CONFIRMADA" ? (
                      <span className="p-pill" style={{ justifySelf: "start" }}>
                        <Check size={14} strokeWidth={3} /> você confirmou
                      </span>
                    ) : proxima.status === "REMARCAR" ? (
                      <span className="p-pill" style={{ justifySelf: "start" }}>a recepção vai te chamar para remarcar</span>
                    ) : null}
                    {proxima.podeResponder ? (
                      <div className="p-botoes">
                        <button type="button" className="p-btn full" disabled={respondendo} onClick={() => void responder("CONFIRMO")}>
                          Confirmo, estarei lá
                        </button>
                        <button type="button" className="p-btn plain full" disabled={respondendo} onClick={() => void responder("REMARCAR")}>
                          Preciso remarcar
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="t-title2">Sem consulta marcada</p>
                    <p className="p-det">Quando a recepção agendar, ela aparece aqui e você confirma com um toque.</p>
                  </>
                )}
              </div>
            </section>

            {/* ---- Evolução ---- */}
            <section id="evolucao" className="p-sec p-anim" aria-labelledby="t-evolucao">
              <span className="t-sec" id="t-evolucao">Sua evolução</span>
              <div className="p-card">
                {evolucao ? (
                  <>
                    <div className="p-metrica">
                      <div>
                        <p className="t-foot t-2">hoje · {diaMes(evolucao.ultima.dia)}</p>
                        <p className="p-num">
                          {fmt1(evolucao.ultima.pesoKg)}
                          <small>kg</small>
                        </p>
                      </div>
                      {evolucao.deltaPeso !== null && evolucao.pontos.length > 1 ? (
                        <span className={`p-pill ${evolucao.deltaPeso < 0 ? "ok" : evolucao.deltaPeso > 0 ? "warn" : ""}`}>
                          {sinal(evolucao.deltaPeso)}
                          {fmt1(Math.abs(evolucao.deltaPeso))} kg desde {diaMes(evolucao.primeira.dia)}
                        </span>
                      ) : null}
                    </div>
                    {evolucao.pontos.length > 1 ? <CurvaEvolucao resumo={evolucao} /> : null}
                    <p className="t-sub">{evolucao.frase}</p>
                    {evolucao.deltaGordura !== null || evolucao.deltaMassaMagra !== null || evolucao.deltaCintura !== null ? (
                      <div className="p-stats">
                        <div className="p-stat">
                          <span className="t-foot t-2">Gordura corporal</span>
                          <b>{evolucao.deltaGordura === null ? "—" : `${sinal(evolucao.deltaGordura)}${fmt1(Math.abs(evolucao.deltaGordura))} pts`}</b>
                        </div>
                        <div className="p-stat">
                          <span className="t-foot t-2">Massa magra</span>
                          <b>{evolucao.deltaMassaMagra === null ? "—" : `${sinal(evolucao.deltaMassaMagra)}${fmt1(Math.abs(evolucao.deltaMassaMagra))} kg`}</b>
                        </div>
                        <div className="p-stat">
                          <span className="t-foot t-2">Cintura</span>
                          <b>{evolucao.deltaCintura === null ? "—" : `${sinal(evolucao.deltaCintura)}${fmt1(Math.abs(evolucao.deltaCintura))} cm`}</b>
                        </div>
                        <div className="p-stat">
                          <span className="t-foot t-2">Acompanhando há</span>
                          <b>{evolucao.semanas} sem.</b>
                        </div>
                      </div>
                    ) : null}
                    <p className="t-foot t-3">Pontos cheios: medições da enfermagem. Vazados: pesagens que você mandou.</p>
                  </>
                ) : (
                  <p className="t-body t-2">A sua curva começa na próxima bioimpedância com a enfermagem. Se quiser, já mande a pesagem desta semana logo abaixo.</p>
                )}
              </div>
            </section>

            {/* ---- Plano ---- */}
            {trilha && dados.plano ? (
              <section id="plano" className="p-sec p-anim" aria-labelledby="t-plano">
                <span className="t-sec" id="t-plano">{nomeDoPlano(dados.plano.canal)}</span>
                <div className="p-card">
                  <div>
                    <p className="t-title3">Mês {trilha.mesAtual} de 6</p>
                    <p className="t-foot t-2">desde {diaMes(dados.plano.inicio)} · {trilha.feitos} de {trilha.total} passos concluídos</p>
                  </div>
                  <div className="p-progress" role="img" aria-label={`Mês ${trilha.mesAtual} de 6`}>
                    {trilha.passos.map((p) => (
                      <i key={p.mes} className={p.estado === "feito" ? "on" : p.estado === "agora" ? "now" : ""} />
                    ))}
                  </div>
                  <ul className="p-lista">
                    {(trilha.passos.find((p) => p.estado === "agora") ?? trilha.passos[trilha.passos.length - 1]).marcos.map((m) => (
                      <li key={m.key} className="p-row">
                        <span className={`p-check ${m.done ? "on" : m.overdue ? "late" : ""}`}>{m.done ? <Check size={14} strokeWidth={3} /> : null}</span>
                        <div className="p-cresce">
                          <p className="t-body" style={{ fontWeight: 500 }}>{m.label}</p>
                          <p className="t-foot t-2">{m.done ? "feito" : `previsto para ${diaMes(m.expectedDate)}`} · com {m.quem}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}

            {/* ---- Pesagem ---- */}
            <section id="pesagem" className="p-sec p-anim" aria-labelledby="t-pesagem">
              <span className="t-sec" id="t-pesagem">Pesagem da semana</span>
              <div className="p-card">
                <p className="t-headline">Quanto a balança marcou hoje?</p>
                <form
                  className="p-campo"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void mandarPesagem();
                  }}
                >
                  <input inputMode="decimal" placeholder="82,4" value={peso} onChange={(e) => setPeso(e.target.value)} aria-label="Peso em quilos" />
                  <span className="p-unid">kg</span>
                  <button type="submit" className="p-btn mini" disabled={enviando || !peso.trim()}>
                    {enviando ? "Enviando" : "Enviar"}
                  </button>
                </form>
                <p className="t-foot t-2">
                  {ultimaPesagemPropria ? `Sua última pesagem foi em ${diaCurto(ultimaPesagemPropria.dia)}: ${fmt1(ultimaPesagemPropria.pesoKg)} kg. ` : ""}
                  Uma vez por semana, de manhã, antes do café. A enfermagem vê por aqui e entra em contato se precisar.
                </p>
              </div>
            </section>

            {/* ---- O que fechou ---- */}
            {financeiro ? (
              <section className="p-sec p-anim" aria-labelledby="t-fin">
                <span className="t-sec" id="t-fin">O que você fechou</span>
                <div className="p-card">
                  <div className="p-metrica">
                    <div>
                      <p className="t-foot t-2">já pago</p>
                      <p className="p-num" style={{ fontSize: 34 }}>{brl(financeiro.pago)}</p>
                    </div>
                    {financeiro.emAberto > 0.005 ? <span className="p-pill">falta {brl(financeiro.emAberto)}</span> : <span className="p-pill ok"><Check size={14} strokeWidth={3} /> tudo em dia</span>}
                  </div>
                  {financeiro.contratado > 0 ? (
                    <div className="p-track" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, Math.round((financeiro.pago / Math.max(financeiro.contratado, financeiro.pago + financeiro.emAberto)) * 100))}%` }} />
                    </div>
                  ) : null}
                  <ul className="p-lista">
                    {dados.comandas.map((c) => (
                      <li key={c.id} className="p-row">
                        <div className="p-cresce">
                          <p className="t-body" style={{ fontWeight: 500 }}>{c.itens.map((i) => i.descricao).join(" + ")}</p>
                          <p className="t-foot t-2">
                            {diaCurto(c.dia)} · {c.pagamentos.map((p) => `${METODO[p.metodo] ?? p.metodo.toLowerCase()}${p.parcelas > 1 ? ` ${p.parcelas}x` : ""}`).join(" · ") || "sem pagamento registrado"}
                          </p>
                        </div>
                        <span className="p-valor">{brl(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                  {financeiro.parcelas.length ? (
                    <>
                      <span className="t-sec" style={{ padding: 0 }}>Parcelas a vencer</span>
                      <ul className="p-lista">
                        {financeiro.parcelas.map((p) => (
                          <li key={p.id} className="p-row">
                            <div className="p-cresce">
                              <p className="t-body">{diaCurto(p.prevista)}</p>
                              {p.observacao ? <p className="t-foot t-2">{p.observacao}</p> : null}
                            </div>
                            <span className="p-valor">{brlCentavos(p.valor)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* ---- Documentos ---- */}
            <section id="documentos" className="p-sec p-anim" aria-labelledby="t-docs">
              <span className="t-sec" id="t-docs">Documentos</span>
              <div className="p-card">
                {dados.documentos.length ? (
                  <ul className="p-lista">
                    {dados.documentos.map((d, i) => {
                      const corpo = (
                        <>
                          <span className="p-check" style={{ borderColor: "transparent", background: "var(--p-tint-soft)", color: "var(--p-tint)" }}>
                            <FileText size={14} />
                          </span>
                          <div className="p-cresce">
                            <p className="t-body" style={{ fontWeight: 500 }}>{d.titulo}</p>
                            <p className="t-foot t-2">{diaCurto(d.dia)}{d.url ? "" : " · peça o arquivo à recepção"}</p>
                          </div>
                          {d.url ? <ChevronRight size={18} className="p-chev" /> : null}
                        </>
                      );
                      return d.url ? (
                        <li key={`${d.tipo}-${i}`}>
                          <a className="p-row" href={d.url} target="_blank" rel="noreferrer">
                            {corpo}
                          </a>
                        </li>
                      ) : (
                        <li key={`${d.tipo}-${i}`} className="p-row">
                          {corpo}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="t-body t-2">Seu contrato e as notas fiscais aparecem aqui conforme forem emitidos.</p>
                )}
              </div>
            </section>

            <footer className="p-rodape p-anim">
              {dados.consentimentos.length ? <p className="t-foot t-3">Você autorizou: {dados.consentimentos.filter((c) => c.aceito).map((c) => CONSENT_LABEL[c.tipo] ?? c.tipo.toLowerCase()).join(", ") || "nada registrado ainda"}.</p> : null}
              <p className="t-foot t-3">Seus dados ficam só com o Instituto Bratan e aparecem aqui só para você. Para mudar algo, fale com a recepção.</p>
              <button type="button" className="p-btn plain" onClick={() => void sair()}>
                Sair deste aparelho
              </button>
            </footer>

            <nav className="p-dock" aria-label="Ir para a seção">
              <GradientMenu items={SECOES} activeId={secaoAtiva} onSelect={irPara} />
            </nav>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function PortalPacienteApp() {
  return (
    <Routes>
      <Route path="entrar" element={<EntrarPage />} />
      <Route path="*" element={<MeuPortal />} />
    </Routes>
  );
}
