// MEU BRATAN — o portal do paciente, redesenho estilo Apple (15/09/2026).
//
// Uma página só, no celular: título grande que encolhe numa barra translúcida,
// o bilhete da próxima consulta (única superfície colorida), a curva no espírito
// do app Saúde, a trilha dos seis meses, o que fechou, a pesagem e os documentos.
// A navegação é um dock flutuante (gradient-menu do 21st.dev) que abre a seção
// visível e leva às outras com um toque. O carregamento usa o loading-state do
// 21st.dev. Entra por link mágico; tudo vem da função portal-paciente.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { CurvaEsperando, CurvaEvolucao, type MetricaDaCurva } from "./CurvaEvolucao";
import { InterruptorDoPortal } from "./InterruptorDoPortal";
import { dadosDemo, dadosDemoNovo } from "./portalDemo";
import { SESSAO_DEMO, ambienteSemSupabase, carregarDados, criarSenhaDoPortal, emPrevia, entrarComSenha, entrarComToken, enviarPesagem, guardarSessao, lerSessao, responderConsulta, sairDoPortal } from "./portalCliente";
import { brl, brlCentavos, diaCurto, diaMes, nomeDoPlano, proximaConsulta, resumoEvolucao, resumoFinanceiro, saudacao, temCurvaDeGordura, trilhaDoPlano, type MarcoDoPlano, type PortalDados } from "./portalPaciente";

const METODO: Record<string, string> = { PIX: "Pix", DINHEIRO: "dinheiro", CARTAO_DEBITO: "débito", CARTAO_CREDITO: "crédito", BOLETO: "boleto", TRANSFERENCIA: "transferência" };
const CONSENT_LABEL: Record<string, string> = { LGPD: "uso dos seus dados para o atendimento", TRATAMENTO: "termo do tratamento", IA: "apoio de inteligência artificial", IMAGEM: "uso de imagem", MARKETING: "mensagens e novidades" };
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// As seções e o dock. As cores saíram das de sistema da Apple (16/09/2026): azul,
// rosa e roxo brigavam com o verde da casa, e o dock é o único elemento sempre
// visível. Agora é uma escala do próprio verde, do mais fechado ao mais aberto,
// com o dourado da marca reservado à trilha do plano — a única cor que não é verde,
// porque marca o caminho que o paciente percorre.
const SECOES: GradientMenuItem[] = [
  { id: "consulta", title: "Consulta", icon: <CalendarDays />, gradientFrom: "var(--p-dk-consulta-1)", gradientTo: "var(--p-dk-consulta-2)" },
  { id: "evolucao", title: "Evolução", icon: <Activity />, gradientFrom: "var(--p-dk-evolucao-1)", gradientTo: "var(--p-dk-evolucao-2)" },
  { id: "plano", title: "Plano", icon: <RouteIcon />, gradientFrom: "var(--p-dk-plano-1)", gradientTo: "var(--p-dk-plano-2)" },
  { id: "pesagem", title: "Pesagem", icon: <Scale />, gradientFrom: "var(--p-dk-pesagem-1)", gradientTo: "var(--p-dk-pesagem-2)" },
  { id: "documentos", title: "Docs", icon: <FileText />, gradientFrom: "var(--p-dk-docs-1)", gradientTo: "var(--p-dk-docs-2)" },
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
    // O iPhone usa o apple-touch-icon da PÁGINA ao adicionar à tela de início (o
    // manifesto não vale para isso), então o portal troca o do app pelo seu.
    const toque = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const antes = { manifest: manifest?.href ?? "", tema: tema?.content ?? "", titulo: document.title, fundo: raiz.style.backgroundColor, barra: barra?.content ?? "", toque: toque?.getAttribute("href") ?? "" };
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
    if (toque) toque.href = "/meu-apple-touch-icon.png";
    document.title = "Meu Bratan";
    pintar();
    escuro.addEventListener("change", pintar);
    return () => {
      escuro.removeEventListener("change", pintar);
      if (manifest) manifest.href = antes.manifest;
      if (tema) tema.content = antes.tema;
      if (barra) barra.content = antes.barra || "black-translucent";
      if (toque && antes.toque) toque.href = antes.toque;
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
  const demo = params.get("demo") === "1" || params.get("demo") === "novo";
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (ambienteSemSupabase || demo) {
        try {
          window.localStorage.setItem("meu-bratan-demo", params.get("demo") === "novo" ? "novo" : "andamento");
        } catch {
          /* sem localStorage: cai no retrato padrão */
        }
        guardarSessao(SESSAO_DEMO);
        navigate("/meu", { replace: true });
        return;
      }
      if (!token) {
        // Sem token não é beco sem saída: quem já criou senha entra pela tela
        // de sempre, em /meu.
        navigate("/meu", { replace: true });
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
              <p className="t-foot t-3">O link vale por uma semana. Se você já criou a sua senha, entre por aqui mesmo — senão, a recepção manda outro link na hora.</p>
              <Link to="/meu" className="p-btn full">Entrar com a minha senha</Link>
            </>
          ) : (
            <div data-anima="carregando"><LoadingState label="Preparando" variant="Dots" showElapsed={false} /></div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Sem sessão: entrar com o próprio login --------------------------------------
// Até 16/09/2026 o paciente só entrava pelo link, que vencia em uma semana. Agora
// ele cria uma senha no primeiro acesso e entra quando quiser, do aparelho que
// quiser. O link continua existindo para o primeiro acesso e para quem esquecer.
function SemSessao({ aoEntrar }: { aoEntrar: (sessao: string) => void }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEntrando(true);
    try {
      const r = await entrarComSenha(login, senha);
      if (!r.ok || !r.sessao) {
        setErro(r.error ?? "Não consegui entrar agora.");
        return;
      }
      guardarSessao(r.sessao);
      aoEntrar(r.sessao);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="portal">
      <div className="p-entrar">
        <div className="p-card p-anim">
          <img src={bratanMark} alt="" style={{ width: 56, height: 56, borderRadius: 14 }} />
          <h1 className="t-title2">Seu espaço no Instituto Bratan</h1>
          <p className="t-body t-2">Próxima consulta, sua evolução, seu plano e a pesagem da semana, num lugar só.</p>
          <form className="p-form" onSubmit={entrar}>
            <label className="p-rotulo" htmlFor="portal-login">E-mail ou celular</label>
            <input
              id="portal-login"
              className="p-entrada"
              type="text"
              inputMode="email"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="voce@email.com"
            />
            <label className="p-rotulo" htmlFor="portal-senha">Senha</label>
            <input
              id="portal-senha"
              className="p-entrada"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="a senha que você criou"
            />
            {erro ? <p className="t-foot" style={{ color: "var(--p-bad)" }}>{erro}</p> : null}
            <button type="submit" className="p-btn full" disabled={entrando || !login.trim() || senha.length < 8}>
              {entrando ? "Entrando" : "Entrar"}
            </button>
          </form>
          <p className="t-foot t-3">
            Primeira vez por aqui, ou esqueceu a senha? Abra o link que a recepção mandou no seu WhatsApp — lá dentro você cria a sua senha.
          </p>
          {ambienteSemSupabase ? (
            <Link to="/meu/entrar" className="p-btn plain">
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
  const [sessao, setSessao] = useState(() => lerSessao());
  const previa = emPrevia(sessao);
  const [dados, setDados] = useState<PortalDados | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [peso, setPeso] = useState("");
  // CRIAR SENHA (16/09/2026): quem entrou pelo link deixa de depender dele.
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [novoLogin, setNovoLogin] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [secaoAtiva, setSecaoAtiva] = useState("consulta");
  // Qual medida a curva desenha. Peso é o padrão; gordura só aparece quando há
  // bioimpedância suficiente para formar uma linha.
  const [metricaDaCurva, setMetricaDaCurva] = useState<MetricaDaCurva>("peso");
  const [barraCompacta, setBarraCompacta] = useState(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  async function salvarSenha(e: FormEvent) {
    e.preventDefault();
    if (!sessao) return;
    setSalvandoSenha(true);
    try {
      const r = await criarSenhaDoPortal(sessao, novoLogin, novaSenha);
      if (!r.ok) {
        toast(r.error ?? "Não consegui guardar a senha.", { tom: "erro" });
        return;
      }
      toast("Pronto. Agora você entra por aqui quando quiser, com esse e-mail e a sua senha.", { tom: "ok", duracaoMs: 7000 });
      setSenhaAberta(false);
      setNovaSenha("");
      await recarregar();
    } finally {
      setSalvandoSenha(false);
    }
  }

  const recarregar = useCallback(async () => {
    if (!sessao) return;
    if (previa) {
      // /meu/entrar?demo=1 mostra quem está no meio do plano; ?demo=novo mostra
      // o primeiro acesso, que é o que a maioria vê (16/09/2026).
      const novo = new URLSearchParams(window.location.search).get("demo") === "novo" || window.localStorage.getItem("meu-bratan-demo") === "novo";
      setDados(novo ? dadosDemoNovo(hoje) : dadosDemo(hoje));
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
    const alvos = secoesVisiveis.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => Boolean(el));
    const visiveis = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visiveis.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        let melhor = "";
        let maior = 0;
        for (const s of secoesVisiveis) {
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

  // O dock mostra só o que existe na página. Antes ele listava "Plano" mesmo para
  // quem não tem plano, e o toque não levava a lugar nenhum (16/09/2026).
  //
  // Este useMemo precisa ficar ANTES do `if (!sessao)` lá embaixo: com ele
  // depois, a tela de login rodava um hook a menos que a tela cheia, e o React
  // derrubava a página inteira ao entrar (erro #310).
  const secoesVisiveis = useMemo(
    () =>
      SECOES.filter((secao) => {
        if (secao.id === "plano") return Boolean(dados?.plano) && marcos.length > 0;
        if (secao.id === "documentos") return Boolean(dados?.documentos.length);
        if (secao.id === "evolucao") return Boolean(dados);
        return true;
      }),
    [dados],
  );


  if (!sessao) return <SemSessao aoEntrar={(nova) => { setSessao(nova); void recarregar(); }} />;
  const proxima = dados ? proximaConsulta(dados.consultas, marcos, hoje) : null;
  const evolucao = dados ? resumoEvolucao(dados.medicoes, hoje) : null;
  const financeiro = dados ? resumoFinanceiro(dados.comandas, dados.parcelasAbertas, hoje) : null;
  const trilha = dados?.plano ? trilhaDoPlano(marcos, dados.plano.inicio, hoje) : null;
  const ultimaPesagemPropria = dados?.medicoes.filter((m) => m.origem === "PACIENTE").sort((a, b) => b.dia.localeCompare(a.dia))[0] ?? null;
  const partes = proxima ? partesDaData(proxima.em) : null;
  const mostrandoGordura = metricaDaCurva === "gordura";
  const deltaEmFoco = mostrandoGordura ? evolucao?.deltaGordura ?? null : evolucao?.deltaPeso ?? null;
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
            <div data-anima="carregando"><LoadingState label="Preparando as suas informações" variant="Dots" showElapsed={false} /></div>
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
                    <p className="t-title2">Ainda não foi marcada</p>
                    <p className="p-det">A recepção entra em contato para combinar o dia. Assim que marcar, a consulta aparece aqui e você confirma com um toque.</p>
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
                          {mostrandoGordura ? fmt1(evolucao.ultima.gorduraPct ?? 0) : fmt1(evolucao.ultima.pesoKg)}
                          <small>{mostrandoGordura ? "%" : "kg"}</small>
                        </p>
                      </div>
                      {deltaEmFoco !== null && evolucao.pontos.length > 1 ? (
                        <span className={`p-pill ${deltaEmFoco < 0 ? "ok" : deltaEmFoco > 0 ? "warn" : ""}`}>
                          {sinal(deltaEmFoco)}
                          {fmt1(Math.abs(deltaEmFoco))} {mostrandoGordura ? "pts" : "kg"} desde {diaMes(evolucao.primeira.dia)}
                        </span>
                      ) : null}
                    </div>
                    {evolucao.pontos.length > 1 ? <CurvaEvolucao resumo={evolucao} metrica={metricaDaCurva} /> : <CurvaEsperando />}
                    {/* A gordura só vira curva quando existem duas medições com o
                        percentual. Perder peso mantendo massa magra é o que
                        motiva — e esse número vivia escondido num quadradinho. */}
                    {evolucao.pontos.length > 1 && temCurvaDeGordura(evolucao) ? (
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <InterruptorDoPortal
                          ligado={mostrandoGordura}
                          aoTrocar={(ligado) => setMetricaDaCurva(ligado ? "gordura" : "peso")}
                          rotuloDesligado="Peso"
                          rotuloLigado="Gordura"
                          descricao="Trocar a curva entre peso e gordura corporal"
                        />
                      </div>
                    ) : null}
                    <p className="t-sub">{evolucao.frase}</p>
                    {evolucao.pontos.length > 1 && (evolucao.deltaGordura !== null || evolucao.deltaMassaMagra !== null || evolucao.deltaCintura !== null) ? (
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
                    {evolucao.pontos.length > 1 ? <p className="t-foot t-3">Pontos cheios: medições da enfermagem. Vazados: pesagens que você mandou.</p> : <p className="t-foot t-3">Esta é a sua primeira medição. A linha aparece a partir da segunda.</p>}
                  </>
                ) : (
                  <div className="p-vazio">
                    <CurvaEsperando />
                    <div className="p-vazio-texto">
                      <p className="t-headline">Sua curva começa na primeira medição.</p>
                      <p className="t-sub t-2">A enfermagem faz a bioimpedância na sua próxima visita. Até lá, a pesagem que você mandar já entra aqui.</p>
                    </div>
                    <button type="button" className="p-btn tonal" onClick={() => document.getElementById("pesagem")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                      <Scale size={18} aria-hidden="true" />
                      Mandar a pesagem de hoje
                    </button>
                  </div>
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
            {financeiro && !dados.comandas.length ? (
              <section id="fechou" className="p-sec p-anim" aria-labelledby="t-fin">
                <span className="t-sec" id="t-fin">O que você fechou</span>
                <div className="p-card">
                  <p className="t-body t-2">{financeiro.frase}</p>
                </div>
              </section>
            ) : financeiro ? (
              <section id="fechou" className="p-sec p-anim" aria-labelledby="t-fin">
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

            {/* SENHA PRÓPRIA (16/09/2026): enquanto o paciente não tem, o portal
                oferece criar — é o que tira a dependência do link de 7 dias. */}
            {!previa && dados.paciente.temSenha === false ? (
              <section className="p-sec p-anim">
                <span className="t-sec">Entrar quando quiser</span>
                <div className="p-card">
                  {senhaAberta ? (
                    <form className="p-form" onSubmit={salvarSenha}>
                      <label className="p-rotulo" htmlFor="novo-login">Seu e-mail ou celular</label>
                      <input id="novo-login" className="p-entrada" type="text" inputMode="email" autoComplete="username" value={novoLogin} onChange={(e) => setNovoLogin(e.target.value)} placeholder="voce@email.com" />
                      <label className="p-rotulo" htmlFor="nova-senha">Crie uma senha</label>
                      <input id="nova-senha" className="p-entrada" type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="pelo menos 8 caracteres" />
                      <div className="p-botoes">
                        <button type="submit" className="p-btn full" disabled={salvandoSenha || !novoLogin.trim() || novaSenha.length < 8}>
                          {salvandoSenha ? "Guardando" : "Guardar e usar daqui em diante"}
                        </button>
                        <button type="button" className="p-btn plain" onClick={() => setSenhaAberta(false)}>Agora não</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="t-headline">Crie uma senha e não dependa mais do link.</p>
                      <p className="t-sub t-2">Com e-mail e senha você abre o seu espaço de qualquer aparelho, na hora que quiser.</p>
                      <button type="button" className="p-btn tonal" onClick={() => setSenhaAberta(true)}>Criar minha senha</button>
                    </>
                  )}
                </div>
              </section>
            ) : null}

            <footer className="p-rodape p-anim">
              {dados.consentimentos.some((c) => c.aceito) ? <p className="t-foot t-3">Você autorizou: {dados.consentimentos.filter((c) => c.aceito).map((c) => CONSENT_LABEL[c.tipo] ?? c.tipo.toLowerCase()).join(", ")}.</p> : null}
              <p className="t-foot t-3">Seus dados ficam só com o Instituto Bratan e aparecem aqui só para você. Para mudar algo, fale com a recepção.</p>
              <button type="button" className="p-btn plain" onClick={() => void sair()}>
                Sair deste aparelho
              </button>
            </footer>

            <nav className="p-dock" aria-label="Ir para a seção">
              <GradientMenu items={secoesVisiveis} activeId={secaoAtiva} onSelect={irPara} />
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
