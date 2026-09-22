// MEU BRATAN — o portal do paciente (redesenho estilo Apple em 15/09/2026;
// quatro abas em 22/09/2026).
//
// Hoje · Corpo · Jornada · Você. O topo do Hoje é o anel da jornada (um
// segmento por mês do plano), a única superfície colorida da tela. Título
// grande que encolhe numa barra translúcida, cartões brancos de canto 20 px,
// números em fonte arredondada como no app Saúde. No celular a barra de abas
// fica embaixo; no computador vira um trilho à esquerda e os cartões se
// arrumam em duas colunas. Entra por link mágico ou senha; tudo vem da função
// portal-paciente.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, CalendarDays, Check, ChevronRight, FileText, Flag, Home, Pause, Play, Route as RouteIcon, Scale, Stethoscope, User } from "lucide-react";
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
import { SESSAO_DEMO, ambienteSemSupabase, assinarPush, carregarDados, criarSenhaDoPortal, emPrevia, entrarComSenha, entrarComToken, enviarPesagem, guardarSessao, lerSessao, responderConsulta, sairDoPortal, sairDoPush, enviarFoto, apagarFoto, marcarVozOuvida } from "./portalCliente";
import { chaveVapidParaBytes } from "./pushDoPaciente";
import { ANGULOS, fraseDasFotos, paresPorAngulo, rotuloDoAngulo, validarFoto, type AnguloDaFoto, type PortalFoto } from "./fotosDoPaciente";
import { reduzirFoto } from "./redimensionarFoto";
import { fraseDoCartao, opcoesDoCartao, textoDeCompartilhar, type OpcaoDoCartao } from "./cartaoCompartilhavel";
import { cartaoParaBlob, compartilharCartao, desenharCartao } from "./desenharCartao";
import { Confete } from "@/components/ui/motion-confetti";
import { CountUp } from "@/components/ui/count-up";
import { ABAS, abaDaRota, brl, brlCentavos, diaCurto, diaMes, linhaDoTempo, medicoesAntesDoPlano, nomeDoPlano, pacienteDesde, pendenciasDasAbas, proximaConsulta, fraseDoDia, oQueABalancaNaoMostra, resumoDaJornada, resumoEvolucao, resumoFinanceiro, resumoInBody, rotaDaAba, saudacao, temCurvaDeGordura, trilhaDoPlano, VISCERAL_LIMITE_NORMAL, type AbaDoPortal, type EventoDaJornada, type MarcoDoPlano, type PassoDaTrilha, type PortalDados, type ResumoDaJornada } from "./portalPaciente";

const METODO: Record<string, string> = { PIX: "Pix", DINHEIRO: "dinheiro", CARTAO_DEBITO: "débito", CARTAO_CREDITO: "crédito", BOLETO: "boleto", TRANSFERENCIA: "transferência" };
const CONSENT_LABEL: Record<string, string> = { LGPD: "uso dos seus dados para o atendimento", TRATAMENTO: "termo do tratamento", IA: "apoio de inteligência artificial", IMAGEM: "uso de imagem", MARKETING: "mensagens e novidades" };
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

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
//
// QUATRO ABAS (22/09/2026). Até aqui o portal era uma rolagem só, com doze
// cartões do mesmo peso, e a pergunta "onde eu estou no meu plano?" só tinha
// resposta no oitavo cartão. Agora cada aba responde a uma pergunta:
//   Hoje    — onde estou e o que faço agora: o anel dos meses, a consulta, o
//             corpo em uma linha, a voz do doutor
//   Corpo   — o que mudou: InBody, curva, pesagem, o que a balança não mostra, fotos
//   Jornada — o que já vivi e o que vem: a linha do tempo, o plano, a conquista
//   Você    — o que é meu: contrato e notas, avisos, senha, sair
// A rota guarda a aba (/meu, /meu/corpo, /meu/jornada, /meu/voce): o "voltar"
// do celular funciona e a recepção pode mandar link direto para uma delas.
// No celular a barra de abas fica embaixo (padrão do iOS); no computador vira
// um trilho à esquerda e os cartões se arrumam em duas colunas.

const ICONE_DA_ABA: Record<AbaDoPortal, ReactNode> = { hoje: <Home />, corpo: <Activity />, jornada: <RouteIcon />, voce: <User /> };
const ICONE_DO_EVENTO: Record<EventoDaJornada["tipo"], ReactNode> = {
  INICIO: <Flag size={17} strokeWidth={2.2} />,
  BIO: <Activity size={17} strokeWidth={2.2} />,
  CONSULTA: <Stethoscope size={17} strokeWidth={2.2} />,
  CHECK: <Check size={16} strokeWidth={3} />,
  HOJE: <i className="p-tempo-agora" />,
  PREVISTO: <CalendarDays size={17} strokeWidth={2.2} />,
};

function MeuPortal() {
  useIdentidadeDoPortal();
  const navigate = useNavigate();
  const location = useLocation();
  const aba = abaDaRota(location.pathname);
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
  // Qual medida a curva desenha. Peso é o padrão; gordura só aparece quando há
  // bioimpedância suficiente para formar uma linha.
  const [metricaDaCurva, setMetricaDaCurva] = useState<MetricaDaCurva>("peso");
  // A curva começa no fechamento do plano (decisão do Lucas, 17/09/2026). Quem
  // quiser ver a vida toda abre — e aí a virada aparece marcada no gráfico.
  const [verHistoricoTodo, setVerHistoricoTodo] = useState(false);
  const [barraCompacta, setBarraCompacta] = useState(false);
  // Ao trocar de aba pedindo uma seção (ex.: "Mandar a pesagem" de Hoje leva à
  // pesagem em Corpo), a rolagem acontece depois que a aba nova desenhou.
  const [pendenteRolar, setPendenteRolar] = useState<string | null>(null);
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
  }, [dados, aba]);

  // Aba nova começa do topo — como um app, não como uma página que continua rolada.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [aba]);

  useEffect(() => {
    if (!pendenteRolar) return;
    const el = document.getElementById(pendenteRolar);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendenteRolar(null);
  }, [pendenteRolar, aba, dados]);

  const marcos: MarcoDoPlano[] = useMemo(() => {
    if (!dados?.plano) return [];
    const deal = { id: dados.plano.dealId, closedAt: dados.plano.closedAt, programPhaseEnteredAt: dados.plano.programPhaseEnteredAt ?? undefined, updatedAt: dados.plano.updatedAt, createdAt: dados.plano.createdAt, programMilestonesDone: dados.plano.marcosFeitos } as unknown as CrmDeal;
    return buildMilestones(deal, hoje).map((m) => ({ key: m.key, type: m.type, n: m.n, total: m.total, label: m.label, expectedDate: m.expectedDate, done: m.done, overdue: m.overdue }));
  }, [dados, hoje]);

  // A linha do tempo é a lista mais longa do portal; só recalcula quando os dados mudam.
  const eventos = useMemo(() => (dados ? linhaDoTempo({ plano: dados.plano, consultas: dados.consultas, medicoes: dados.medicoes, marcos, hojeISO: hoje }) : []), [dados, marcos, hoje]);

  if (!sessao) return <SemSessao aoEntrar={(nova) => { setSessao(nova); void recarregar(); }} />;
  const proxima = dados ? proximaConsulta(dados.consultas, marcos, hoje) : null;
  const inicioDoPlano = dados?.plano?.inicio ?? null;
  const antesDoPlano = dados ? medicoesAntesDoPlano(dados.medicoes, inicioDoPlano) : 0;
  const evolucao = dados ? resumoEvolucao(dados.medicoes, hoje, verHistoricoTodo ? undefined : inicioDoPlano ?? undefined) : null;
  const financeiro = dados ? resumoFinanceiro(dados.comandas, dados.parcelasAbertas, hoje) : null;
  const trilha = dados?.plano ? trilhaDoPlano(marcos, dados.plano.inicio, hoje) : null;
  const jornada = trilha && dados?.plano ? resumoDaJornada(trilha, marcos, dados.plano.inicio, hoje) : null;
  // O NÚMERO ÚNICO (21/09/2026). Pedido do Lucas: "mostrar o Score no topo".
  // Segue o mesmo recorte da curva — do plano para frente por padrão.
  const inbody = dados ? resumoInBody(dados.medicoes, verHistoricoTodo ? undefined : inicioDoPlano ?? undefined) : null;
  // A FRASE DO DIA e O QUE A BALANÇA NÃO MOSTRA (21/09/2026, passo 2).
  const fraseTopo = dados ? fraseDoDia({ hojeISO: hoje, inbody, evolucao, proxima, trilha }) : "";
  const balanca = oQueABalancaNaoMostra(evolucao);
  // CARTÃO COMPARTILHÁVEL (21/09/2026, passo 5): só notícia boa; vazio = some.
  const opcoesDeCartao = opcoesDoCartao(evolucao, inbody);
  const ultimaPesagemPropria = dados?.medicoes.filter((m) => m.origem === "PACIENTE").sort((a, b) => b.dia.localeCompare(a.dia))[0] ?? null;
  const partes = proxima ? partesDaData(proxima.em) : null;
  const pendencias = pendenciasDasAbas(proxima);
  const desde = dados ? pacienteDesde(dados) : null;
  const mostrandoGordura = metricaDaCurva === "gordura";
  const deltaEmFoco = mostrandoGordura ? evolucao?.deltaGordura ?? null : evolucao?.deltaPeso ?? null;
  const fraseDaGordura =
    evolucao && evolucao.deltaGordura !== null && evolucao.deltaGordura < 0
      ? `Desde ${diaMes(evolucao.primeira.dia)} a sua gordura corporal caiu ${Math.abs(evolucao.deltaGordura).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pontos.`
      : evolucao && evolucao.deltaGordura !== null && evolucao.deltaGordura > 0
        ? "A gordura corporal subiu desde a primeira medição. A enfermagem vai olhar isso com você no próximo contato."
        : "A gordura corporal está estável entre as medições.";

  function irPara(destino: AbaDoPortal, secao?: string) {
    if (destino === aba) {
      if (secao) document.getElementById(secao)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (secao) setPendenteRolar(secao);
    navigate(rotaDaAba(destino));
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
  const rotuloDaAba = ABAS.find((a) => a.id === aba)?.rotulo ?? "Hoje";

  // O título e a frase de cada aba: a saudação só em Hoje; as outras dizem o que são.
  const cabecalho = dados
    ? aba === "hoje"
      ? { titulo: saudacao(dados.paciente.primeiroNome), frase: fraseTopo }
      : aba === "corpo"
        ? {
            titulo: "Seu corpo",
            frase: evolucao
              ? evolucao.pontos.length > 1
                ? `${evolucao.semanas} semanas de acompanhamento · última medição em ${diaMes(evolucao.ultima.dia)}.`
                : `Primeira medição em ${diaMes(evolucao.ultima.dia)}. A linha aparece a partir da segunda.`
              : "A primeira medição da enfermagem abre a sua curva. A pesagem que você mandar já entra aqui.",
          }
        : aba === "jornada"
          ? { titulo: "Sua jornada", frase: trilha ? trilha.frase : proxima ? `Próxima consulta ${proxima.quando}. Aqui ficam as suas consultas e bioimpedâncias, na ordem em que aconteceram.` : "Suas consultas e bioimpedâncias, na ordem em que aconteceram." }
          : { titulo: dados.paciente.nome, frase: desde ? `Paciente do Instituto Bratan desde ${diaMes(desde)}.` : "Seu espaço no Instituto Bratan." }
    : null;

  // ---- as partes da tela ----------------------------------------------------------

  const cartaoDaConsulta = (
    <section id="consulta" className="p-sec p-anim" aria-labelledby="t-consulta">
      <span className="t-sec" id="t-consulta">Próxima consulta</span>
      <div className="p-card p-consulta">
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
              <span className={`p-pill ${proxima.dias <= 2 ? "tint" : ""}`}>{proxima.quando}</span>
            </div>
            <p className="t-sub t-2">
              {proxima.tipo} com {proxima.profissional} · {proxima.local}
            </p>
            {proxima.status === "CONFIRMADA" ? (
              <span className="p-pill ok" style={{ justifySelf: "start" }}>
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
            <p className="t-title3">Ainda não foi marcada</p>
            <p className="t-sub t-2">A recepção entra em contato para combinar o dia. Assim que marcar, a consulta aparece aqui e você confirma com um toque.</p>
          </>
        )}
      </div>
    </section>
  );

  const formularioDePesagem = (
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
  );

  const painelHoje = dados ? (
    <>
      <section className="p-sec p-anim wide" aria-label="Onde você está na jornada">
        <HeroDaJornada jornada={jornada} plano={dados.plano} proxima={proxima} evolucao={evolucao} aoAbrir={() => irPara("jornada")} />
      </section>
      {cartaoDaConsulta}
      <section className="p-sec p-anim" aria-labelledby="t-corpo-linha">
        <span className="t-sec" id="t-corpo-linha">Seu corpo</span>
        <Toque className="p-card p-corpo-resumo" rotulo="Abrir a aba Corpo" aoTocar={() => irPara("corpo")}>
          {evolucao ? (
            <>
              <div className="p-corpo-topo">
                <div>
                  <p className="t-foot t-2">hoje · {diaMes(evolucao.ultima.dia)}</p>
                  <p className="p-num">
                    {fmt1(evolucao.ultima.pesoKg)}
                    <small>kg</small>
                  </p>
                </div>
                {evolucao.pontos.length > 1 ? <Faisca valores={evolucao.pontos.map((p) => p.peso)} /> : null}
              </div>
              <p className="t-sub">{evolucao.pontos.length > 1 && evolucao.deltaPeso !== null ? `${sinal(evolucao.deltaPeso)}${fmt1(Math.abs(evolucao.deltaPeso))} kg desde ${diaMes(evolucao.primeira.dia)}.` : "Primeira medição registrada. A linha aparece a partir da segunda."}</p>
              {evolucao.pontos.length > 1 ? (
                <div className="p-chips">
                  {evolucao.deltaGordura !== null ? <span className={`p-pill ${evolucao.deltaGordura < 0 ? "ok" : ""}`}>gordura {sinal(evolucao.deltaGordura)}{fmt1(Math.abs(evolucao.deltaGordura))} pts</span> : null}
                  {evolucao.deltaMassaMagra !== null ? <span className={`p-pill ${evolucao.deltaMassaMagra >= 0 ? "ok" : ""}`}>massa magra {sinal(evolucao.deltaMassaMagra)}{fmt1(Math.abs(evolucao.deltaMassaMagra))} kg</span> : null}
                  {inbody ? <span className="p-pill tint">InBody {inbody.score}{inbody.deltaScore !== null && inbody.deltaScore !== 0 ? ` · ${sinal(inbody.deltaScore)}${Math.abs(inbody.deltaScore)}` : ""}</span> : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="t-headline">Sua curva começa na primeira medição.</p>
              <p className="t-sub t-2">A enfermagem faz a bioimpedância na sua próxima visita. Até lá, a pesagem que você mandar já entra aqui.</p>
            </>
          )}
          <span className="p-link">
            {evolucao ? "Ver a evolução completa" : "Mandar a pesagem de hoje"} <ChevronRight size={16} />
          </span>
        </Toque>
      </section>
      {dados.vozDoDoutor ? <VozDoDoutor sessao={sessao} previa={previa} voz={dados.vozDoDoutor} /> : null}
    </>
  ) : null;

  const painelCorpo = dados ? (
    <>
      {inbody ? (
        <section id="inbody" className="p-sec p-anim" aria-labelledby="t-inbody">
          <span className="t-sec" id="t-inbody">Seu InBody · {diaMes(inbody.ultima.dia)}</span>
          <div className="p-card">
            <div className="p-metrica">
              <div>
                <p className="t-foot t-2">InBody Score</p>
                <p className="p-num">
                  <CountUp to={inbody.score} from={Math.max(0, inbody.score - 12)} duration={1.1} digitEffect="slide" />
                  <small>/100</small>
                </p>
              </div>
              {inbody.deltaScore !== null ? (
                <span className={`p-pill ${inbody.deltaScore > 0 ? "ok" : inbody.deltaScore < 0 ? "warn" : ""}`}>
                  {sinal(inbody.deltaScore)}
                  {Math.abs(inbody.deltaScore)} pts desde {diaMes(inbody.primeira.dia)}
                </span>
              ) : null}
            </div>
            <p className="t-body">{inbody.frase}</p>
            <div className="p-stats">
              <div className="p-stat">
                <span className="t-foot t-2">Gordura visceral</span>
                <b className="t-title3">{inbody.visceral === null ? "—" : `nível ${inbody.visceral}`}</b>
                <span className="t-foot t-2">{inbody.visceral === null ? "" : inbody.visceralAcimaDoNormal ? `ideal até ${VISCERAL_LIMITE_NORMAL}` : "na faixa ideal"}</span>
              </div>
              <div className="p-stat">
                <span className="t-foot t-2">Massa muscular</span>
                <b className="t-title3">{inbody.musculoKg === null ? "—" : `${fmt1(inbody.musculoKg)} kg`}</b>
                <span className="t-foot t-2">{inbody.deltaMusculo === null ? "músculo esquelético" : `${sinal(inbody.deltaMusculo)}${fmt1(Math.abs(inbody.deltaMusculo))} kg desde o começo`}</span>
              </div>
              <div className="p-stat">
                <span className="t-foot t-2">Metabolismo basal</span>
                <b className="t-title3">{inbody.tmbKcal === null ? "—" : `${Math.round(inbody.tmbKcal).toLocaleString("pt-BR")} kcal`}</b>
                <span className="t-foot t-2">o que o corpo gasta em repouso, por dia</span>
              </div>
              <div className="p-stat">
                <span className="t-foot t-2">Gordura corporal</span>
                <b className="t-title3">{inbody.ultima.gorduraPct === null ? "—" : `${fmt1(inbody.ultima.gorduraPct)}%`}</b>
                <span className="t-foot t-2">no mesmo exame</span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

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
              {evolucao.pontos.length > 1 ? <CurvaEvolucao resumo={evolucao} metrica={metricaDaCurva} inicioDoPlano={verHistoricoTodo ? inicioDoPlano : null} /> : <CurvaEsperando />}
              {antesDoPlano > 0 ? (
                <button type="button" className="p-btn plain" onClick={() => setVerHistoricoTodo((atual) => !atual)}>
                  {verHistoricoTodo ? "Ver só o meu plano" : `Ver desde o começo (mais ${antesDoPlano} ${antesDoPlano === 1 ? "medição" : "medições"})`}
                </button>
              ) : null}
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
              <p className="t-sub">{mostrandoGordura ? fraseDaGordura : evolucao.frase}</p>
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
              <button type="button" className="p-btn tonal" onClick={() => irPara("corpo", "pesagem")}>
                <Scale size={18} aria-hidden="true" />
                Mandar a pesagem de hoje
              </button>
            </div>
          )}
        </div>
      </section>

      {formularioDePesagem}

      {balanca ? (
        <section id="balanca" className="p-sec p-anim" aria-labelledby="t-balanca">
          <span className="t-sec" id="t-balanca">{balanca.titulo}</span>
          <div className={`p-card p-balanca ${balanca.tipo.toLowerCase()}`}>
            <p className="p-num p-balanca-num">{balanca.destaque}</p>
            <p className="t-body">{balanca.frase}</p>
          </div>
        </section>
      ) : null}

      <FotosDeEvolucao sessao={sessao} previa={previa} fotosIniciais={dados.fotos ?? []} />
    </>
  ) : null;

  const painelJornada = dados ? (
    <>
      {trilha && dados.plano ? (
        <section id="plano" className="p-sec p-anim" aria-labelledby="t-plano">
          <span className="t-sec" id="t-plano">{nomeDoPlano(dados.plano.canal)}</span>
          <div className="p-card">
            <div className="p-metrica">
              <div>
                <p className="t-title3">Mês {trilha.mesAtual} de {trilha.meses}</p>
                <p className="t-foot t-2">desde {diaMes(dados.plano.inicio)} · {trilha.feitos} de {trilha.total} passos concluídos</p>
              </div>
              {jornada ? <span className="p-pill tint">semana {jornada.semana}</span> : null}
            </div>
            <div className="p-progress" role="img" aria-label={`Mês ${trilha.mesAtual} de ${trilha.meses}`}>
              {trilha.passos.map((p) => (
                <i key={p.mes} className={p.estado === "feito" ? "on" : p.estado === "agora" ? "now" : ""} />
              ))}
            </div>
            <p className="t-foot t-2">Cada barra é um mês do plano. A linha do tempo abaixo mostra o que já aconteceu e o que vem.</p>
          </div>
        </section>
      ) : null}

      <section id="linha-do-tempo" className="p-sec p-anim" aria-labelledby="t-tempo">
        <span className="t-sec" id="t-tempo">Sua linha do tempo</span>
        <div className="p-card">
          {eventos.length > 1 ? (
            <LinhaDoTempo eventos={eventos} />
          ) : (
            <p className="t-body t-2">Suas consultas e bioimpedâncias vão aparecendo aqui, na ordem em que acontecerem.</p>
          )}
        </div>
      </section>

      {opcoesDeCartao.length ? <CartaoDaConquista opcoes={opcoesDeCartao} /> : null}
    </>
  ) : null;

  const painelVoce = dados ? (
    <>
      <section className="p-sec p-anim" aria-label="Seu perfil">
        <div className="p-card p-perfil">
          <span className="p-avatar" aria-hidden="true">{iniciais(dados.paciente.nome)}</span>
          <div className="p-cresce">
            <p className="t-headline">{dados.paciente.nome}</p>
            <p className="t-foot t-2">{[dados.plano ? nomeDoPlano(dados.plano.canal) : "", desde ? `desde ${diaMes(desde)}` : "", dados.paciente.login ?? ""].filter(Boolean).join(" · ") || "Instituto Bratan"}</p>
          </div>
        </div>
      </section>

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

      <AvisosNoCelular sessao={sessao} previa={previa} chavePublica={dados.pushPublicKey ?? null} />

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

      <footer className="p-rodape p-anim wide">
        {dados.consentimentos.some((c) => c.aceito) ? <p className="t-foot t-3">Você autorizou: {dados.consentimentos.filter((c) => c.aceito).map((c) => CONSENT_LABEL[c.tipo] ?? c.tipo.toLowerCase()).join(", ")}.</p> : null}
        <p className="t-foot t-3">Seus dados ficam só com o Instituto Bratan e aparecem aqui só para você. Para mudar algo, fale com a recepção.</p>
        <button type="button" className="p-btn plain" onClick={() => void sair()}>
          Sair deste aparelho
        </button>
      </footer>
    </>
  ) : null;

  return (
    <div className="portal p-app" data-aba={aba}>
      <Avisos />
      <div className="p-bar" data-visivel={barraCompacta} aria-hidden={!barraCompacta}>
        {rotuloDaAba}
      </div>
      {dados ? <TrilhoDeAbas aba={aba} pendencias={pendencias} nome={dados.paciente.nome} previa={previa} aoEscolher={(a) => irPara(a)} aoSair={() => void sair()} /> : null}
      <div className="p-wrap">
        {carregando ? (
          <Esqueleto />
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
        ) : dados && cabecalho ? (
          <>
            <div className="p-so-celular">
              <Marca previa={previa} />
            </div>
            <header className="p-cabeca p-anim" key={`cabeca-${aba}`}>
              <h1 ref={tituloRef} className="t-large">{cabecalho.titulo}</h1>
              <p className="t-sub t-2">{cabecalho.frase}</p>
            </header>
            <div className="p-painel p-grid" key={aba} aria-label={rotuloDaAba}>
              {aba === "hoje" ? painelHoje : aba === "corpo" ? painelCorpo : aba === "jornada" ? painelJornada : painelVoce}
            </div>
          </>
        ) : null}
      </div>
      {dados ? <BarraDeAbas aba={aba} pendencias={pendencias} aoEscolher={(a) => irPara(a)} /> : null}
    </div>
  );
}

// ---- peças da nova arquitetura ---------------------------------------------------

function iniciais(nome: string) {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "•";
}

/** Um cartão inteiro que se toca: semântica de botão sem colocar <p> dentro de <button>. */
function Toque({ children, className, rotulo, aoTocar }: { children: ReactNode; className?: string; rotulo: string; aoTocar: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={rotulo}
      className={`p-toque ${className ?? ""}`}
      onClick={aoTocar}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          aoTocar();
        }
      }}
    >
      {children}
    </div>
  );
}

/**
 * O ANEL DA JORNADA — a assinatura do portal (22/09/2026).
 *
 * Um segmento por mês do plano (seis no Programa de Acompanhamento). Meses
 * vencidos cheios, o mês de agora preenchido na proporção dos dias que já
 * passaram, os futuros só no trilho. É a grade do plano desenhada — não um
 * anel genérico de porcentagem: o paciente vê a caminhada inteira e o ponto
 * em que está, sem ler número nenhum. Os segmentos entram um a um.
 */
function AnelDaJornada({ segmentos, fracao, mesAtual }: { segmentos: PassoDaTrilha["estado"][]; fracao: number; mesAtual: number }) {
  const n = Math.max(1, segmentos.length);
  const r = 52;
  const C = 2 * Math.PI * r;
  const gap = n > 1 ? 12 : 0;
  const L = (C - n * gap) / n;
  return (
    <div className="p-anel" role="img" aria-label={`Mês ${mesAtual} de ${n} do plano`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        {segmentos.map((estado, i) => {
          const offset = -(i * (L + gap));
          const cheio = estado === "feito" ? L : estado === "agora" ? Math.max(L * fracao, 2) : 0;
          return (
            <g key={i} className="p-anel-seg" style={{ animationDelay: `${0.06 * i}s` }}>
              <circle cx="60" cy="60" r={r} className="p-anel-trilho" strokeDasharray={`${L} ${C - L}`} strokeDashoffset={offset} />
              {cheio > 0 ? <circle cx="60" cy="60" r={r} className={`p-anel-cheio ${estado}`} strokeDasharray={`${cheio} ${C - cheio}`} strokeDashoffset={offset} style={{ animationDelay: `${0.25 + 0.09 * i}s` }} /> : null}
            </g>
          );
        })}
      </svg>
      <div className="p-anel-centro">
        <span className="p-anel-rotulo">mês</span>
        <span className="p-anel-num">{mesAtual}</span>
        <span className="p-anel-de">de {n}</span>
      </div>
    </div>
  );
}

/** A tese do Hoje: onde a pessoa está na jornada, em um bloco só, na cor da casa. */
function HeroDaJornada({ jornada, plano, proxima, evolucao, aoAbrir }: { jornada: ResumoDaJornada | null; plano: PortalDados["plano"]; proxima: ReturnType<typeof proximaConsulta>; evolucao: ReturnType<typeof resumoEvolucao>; aoAbrir: () => void }) {
  if (jornada && plano) {
    return (
      <div className="p-hero">
        <span className="p-hero-eyebrow">{nomeDoPlano(plano.canal)}</span>
        <AnelDaJornada segmentos={jornada.segmentos} fracao={jornada.fracaoDoMes} mesAtual={jornada.mesAtual} />
        <div className="p-hero-texto">
          <p className="p-hero-titulo">{jornada.titulo}</p>
          <p className="p-hero-sub">{jornada.passos}</p>
          <p className="p-hero-sub p-hero-desde">desde {diaMes(plano.inicio)}</p>
        </div>
        <p className="p-hero-prox">{jornada.proximo}</p>
        <button type="button" className="p-hero-link" onClick={aoAbrir}>
          Ver a jornada <ChevronRight size={16} />
        </button>
      </div>
    );
  }
  // Sem plano com passos (só consulta ou tratamento): o bloco fala do acompanhamento.
  return (
    <div className="p-hero p-hero-simples">
      <div className="p-hero-texto">
        <span className="p-hero-eyebrow">Acompanhamento no Instituto Bratan</span>
        <p className="p-hero-titulo">{evolucao && evolucao.pontos.length > 1 ? `Acompanhando há ${evolucao.semanas} semanas` : "Seu espaço no Instituto"}</p>
        <p className="p-hero-sub">{proxima ? `Sua próxima consulta ${proxima.quando}, ${proxima.titulo}${proxima.hora ? `, às ${proxima.hora}` : ""}.` : "Quando a recepção marcar a sua próxima consulta, ela aparece aqui e você confirma com um toque."}</p>
        <button type="button" className="p-hero-link" onClick={aoAbrir}>
          Ver a jornada <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/** A faísca: a curva do peso em miniatura, para o cartão "Seu corpo" de Hoje. */
function Faisca({ valores }: { valores: number[] }) {
  const w = 104;
  const h = 40;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const pontos = valores.map((v, i) => [2 + (i / Math.max(1, valores.length - 1)) * (w - 4), h - 4 - ((v - min) / faixa) * (h - 8)] as const);
  const ultimo = pontos[pontos.length - 1];
  return (
    <svg className="p-faisca" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pontos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} />
      <circle cx={ultimo[0]} cy={ultimo[1]} r="3.2" />
    </svg>
  );
}

function LinhaDoTempo({ eventos }: { eventos: EventoDaJornada[] }) {
  return (
    <ol className="p-tempo">
      {eventos.map((e) => (
        <li key={e.id} className={e.estado} data-tipo={e.tipo}>
          <span className="p-tempo-marca" aria-hidden="true">{ICONE_DO_EVENTO[e.tipo]}</span>
          <div className="p-tempo-corpo">
            <span className="p-tempo-data">{e.quando}</span>
            <p className="t-body" style={{ fontWeight: 500 }}>{e.titulo}</p>
            {e.detalhe ? <p className="t-foot t-2">{e.detalhe}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A barra de abas do celular: quatro itens com rótulo e um pino que desliza até o ativo. */
function BarraDeAbas({ aba, pendencias, aoEscolher }: { aba: AbaDoPortal; pendencias: Partial<Record<AbaDoPortal, number>>; aoEscolher: (aba: AbaDoPortal) => void }) {
  const indice = Math.max(0, ABAS.findIndex((a) => a.id === aba));
  return (
    <nav className="p-tabbar" aria-label="Abas do portal" style={{ "--i": indice } as CSSProperties}>
      <span className="p-tabbar-pino" aria-hidden="true" />
      {ABAS.map((a) => (
        <button key={a.id} type="button" className="p-tab" aria-current={a.id === aba ? "page" : undefined} onClick={() => aoEscolher(a.id)}>
          <span className="p-tab-icone">
            {ICONE_DA_ABA[a.id]}
            {pendencias[a.id] ? <i className="p-tab-ponto" aria-label="tem algo para você responder" /> : null}
          </span>
          <span className="p-tab-rotulo">{a.rotulo}</span>
        </button>
      ))}
    </nav>
  );
}

/** No computador a barra vira um trilho à esquerda, com a marca em cima e a pessoa embaixo. */
function TrilhoDeAbas({ aba, pendencias, nome, previa, aoEscolher, aoSair }: { aba: AbaDoPortal; pendencias: Partial<Record<AbaDoPortal, number>>; nome: string; previa: boolean; aoEscolher: (aba: AbaDoPortal) => void; aoSair: () => void }) {
  return (
    <aside className="p-rail" aria-label="Navegação do portal">
      <div className="p-rail-marca">
        <img src={bratanMark} alt="" />
        <div>
          <b>Meu Bratan</b>
          <small>Instituto Bratan</small>
        </div>
      </div>
      {previa ? <span className="p-demo" style={{ marginLeft: 10, justifySelf: "start" }}>dados de exemplo</span> : null}
      <nav className="p-rail-nav" aria-label="Abas">
        {ABAS.map((a) => (
          <button key={a.id} type="button" className="p-rail-item" aria-current={a.id === aba ? "page" : undefined} onClick={() => aoEscolher(a.id)}>
            {ICONE_DA_ABA[a.id]}
            <span>{a.rotulo}</span>
            {pendencias[a.id] ? <i className="p-tab-ponto" aria-label="tem algo para você responder" /> : null}
          </button>
        ))}
      </nav>
      <div className="p-rail-fim">
        <div className="p-perfil">
          <span className="p-avatar mini" aria-hidden="true">{iniciais(nome)}</span>
          <div className="p-cresce">
            <p className="t-sub" style={{ fontWeight: 600 }}>{nome}</p>
            <button type="button" className="p-rail-sair" onClick={aoSair}>Sair deste aparelho</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Enquanto os dados não chegam: a forma da tela, respirando — não um relógio. */
function Esqueleto() {
  return (
    <div className="p-esqueleto" data-anima="carregando" role="status" aria-label="Preparando as suas informações">
      <div className="p-skel" style={{ width: 120, height: 14, marginTop: 18 }} />
      <div className="p-skel" style={{ width: "62%", height: 34 }} />
      <div className="p-skel" style={{ width: "88%", height: 16 }} />
      <div className="p-skel p-skel-hero" />
      <div className="p-skel" style={{ height: 150 }} />
      <div className="p-skel" style={{ height: 120 }} />
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

/**
 * AVISOS NO CELULAR (21/09/2026, passo 3 do portal).
 *
 * A regra do estudo: app que avisa quando chega DADO REAL segura o paciente;
 * app que avisa por avisar é desinstalado. Então há UM aviso — "sua
 * bioimpedância já está aqui" — e o paciente liga e desliga quando quiser.
 *
 * Web Push só existe com o app instalado (no iPhone, "Adicionar à Tela de
 * Início"). Fora disso o botão não aparece: prometer e não entregar é pior do
 * que não prometer.
 */
function AvisosNoCelular({ sessao, previa, chavePublica }: { sessao: string | null; previa: boolean; chavePublica: string | null }) {
  const suportado = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const instalado = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
  const [estado, setEstado] = useState<"carregando" | "desligado" | "ligado" | "negado" | "erro">("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!suportado) return setEstado("desligado");
    if (Notification.permission === "denied") return setEstado("negado");
    let vivo = true;
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (vivo) setEstado(sub ? "ligado" : "desligado");
      })
      .catch(() => {
        if (vivo) setEstado("desligado");
      });
    return () => {
      vivo = false;
    };
  }, [suportado]);

  async function ligar() {
    if (!chavePublica || !sessao || previa) return;
    setOcupado(true);
    setErro("");
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "negado" : "desligado");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapidParaBytes(chavePublica) });
      const json = sub.toJSON();
      const r = await assinarPush(sessao, { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } }, navigator.userAgent.slice(0, 120));
      if (!r.ok) {
        await sub.unsubscribe().catch(() => undefined);
        setErro(r.error ?? "Não consegui ligar os avisos agora.");
        setEstado("erro");
        return;
      }
      setEstado("ligado");
    } catch {
      setErro("Não consegui ligar os avisos neste aparelho.");
      setEstado("erro");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    if (!sessao) return;
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sairDoPush(sessao, sub.endpoint).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  // Sem chave pública os avisos estão desligados no Instituto: não há o que oferecer.
  if (!chavePublica && !previa) return null;

  return (
    <section id="avisos" className="p-sec p-anim" aria-labelledby="t-avisos">
      <span className="t-sec" id="t-avisos">Avisos no celular</span>
      <div className="p-card">
        <p className="t-headline">Saber na hora que a bioimpedância chegou</p>
        <p className="t-foot t-2">
          Um aviso só, quando a enfermagem colocar um exame novo aqui. Nada de propaganda, nada de lembrete diário.
        </p>
        {previa ? (
          <p className="t-foot t-2">Na prévia os avisos não são enviados — o botão aparece para quem entra pelo app.</p>
        ) : !suportado || !instalado ? (
          <p className="t-foot t-2">
            Para receber avisos, adicione o Meu Bratan à tela de início do celular (no iPhone: Compartilhar → Adicionar à Tela de Início) e abra por ali.
          </p>
        ) : estado === "negado" ? (
          <p className="t-foot t-2">Os avisos estão bloqueados nos ajustes do celular. Libere em Ajustes → Notificações → Meu Bratan.</p>
        ) : estado === "ligado" ? (
          <button type="button" className="p-btn plain" disabled={ocupado} onClick={() => void desligar()}>
            {ocupado ? "Um momento…" : "Avisos ligados · desligar"}
          </button>
        ) : (
          <button type="button" className="p-btn" disabled={ocupado || estado === "carregando"} onClick={() => void ligar()}>
            {ocupado ? "Ligando…" : "Ligar avisos"}
          </button>
        )}
        {erro ? <p className="t-foot" style={{ color: "#b45a3c" }}>{erro}</p> : null}
      </div>
    </section>
  );
}

/**
 * FOTOS DE EVOLUÇÃO (21/09/2026, passo 4 do portal).
 *
 * Em emagrecimento nada move mais do que a própria foto de três meses atrás ao
 * lado da de hoje — e é o que o paciente já faz sozinho, perdido no rolo da
 * câmera. Aqui: três ângulos, a primeira × a mais recente, e a promessa escrita
 * "só você vê". Nenhuma tela da equipe mostra isto; quem quiser mostra na
 * consulta, do próprio celular.
 *
 * A foto é reduzida no aparelho antes de sair (redimensionarFoto.ts): a função
 * recebe 200 KB, não 5 MB.
 */
function FotosDeEvolucao({ sessao, previa, fotosIniciais }: { sessao: string | null; previa: boolean; fotosIniciais: PortalFoto[] }) {
  const [fotos, setFotos] = useState<PortalFoto[]>(fotosIniciais);
  const [angulo, setAngulo] = useState<AnguloDaFoto>("FRENTE");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => setFotos(fotosIniciais), [fotosIniciais]);
  const pares = paresPorAngulo(fotos);

  async function escolher(arquivo: File | null) {
    if (!arquivo || !sessao || previa) return;
    setErro("");
    setOcupado(true);
    try {
      const reduzida = await reduzirFoto(arquivo);
      const problema = validarFoto(reduzida.tipo, reduzida.bytes);
      if (problema) return setErro(problema);
      const r = await enviarFoto(sessao, angulo, reduzida.base64, reduzida.tipo);
      if (!r.ok || !r.foto) return setErro(r.error ?? "Não consegui guardar a foto.");
      setFotos((atual) => [...atual, r.foto as PortalFoto]);
    } catch (falha) {
      setErro((falha as Error)?.message || "Não consegui abrir a foto.");
    } finally {
      setOcupado(false);
    }
  }

  async function apagar(foto: PortalFoto) {
    if (!sessao || previa) return;
    if (!window.confirm("Apagar esta foto? Ela some de verdade — não fica cópia em lugar nenhum.")) return;
    setOcupado(true);
    try {
      const r = await apagarFoto(sessao, foto.id);
      if (!r.ok) return setErro(r.error ?? "Não consegui apagar agora.");
      setFotos((atual) => atual.filter((f) => f.id !== foto.id));
    } finally {
      setOcupado(false);
    }
  }

  const par = pares.find((p) => p.angulo === angulo)!;
  const Quadro = ({ foto, rotulo }: { foto: PortalFoto | null; rotulo: string }) => (
    <div className="p-foto">
      {foto?.url ? (
        <>
          <img src={foto.url} alt={`${rotuloDoAngulo[foto.angulo]}, ${diaCurto(foto.dia)}`} loading="lazy" />
          <span className="p-foto-data">{diaCurto(foto.dia)}</span>
          {!previa ? (
            <button type="button" className="p-foto-apagar" aria-label="Apagar esta foto" disabled={ocupado} onClick={() => void apagar(foto)}>
              ×
            </button>
          ) : null}
        </>
      ) : (
        <span className="p-foto-vazia">{rotulo}</span>
      )}
    </div>
  );

  return (
    <section id="fotos" className="p-sec p-anim" aria-labelledby="t-fotos">
      <span className="t-sec" id="t-fotos">Suas fotos de evolução</span>
      <div className="p-card p-fotos">
        <p className="t-body">{fraseDasFotos(pares)}</p>
        <div className="p-seletor" role="group" aria-label="Ângulo">
          {ANGULOS.map((a) => (
            <button key={a} type="button" aria-pressed={angulo === a} onClick={() => setAngulo(a)}>
              {rotuloDoAngulo[a]}
            </button>
          ))}
        </div>
        <div className="p-fotos-par">
          <Quadro foto={par.primeira} rotulo={previa ? "A primeira foto fica aqui" : "Tire a primeira"} />
          <Quadro foto={par.ultima} rotulo={par.primeira ? "A próxima aparece aqui" : "E a mais recente, aqui"} />
        </div>
        {par.todas.length > 2 ? (
          <p className="t-foot t-2">
            Mais {par.todas.length - 2} {par.todas.length - 2 === 1 ? "foto" : "fotos"} deste ângulo entre a primeira e a mais recente.
          </p>
        ) : null}
        <div className="p-fotos-acoes">
          {previa ? (
            <p className="t-foot t-2">Na prévia não dá para mandar foto. Quem entra pelo app tira aqui, do próprio celular.</p>
          ) : (
            <>
              <label className="p-btn">
                {ocupado ? "Guardando…" : `Tirar foto ${rotuloDoAngulo[angulo].toLowerCase()}`}
                <input type="file" accept="image/*" capture="environment" disabled={ocupado} onChange={(e) => void escolher(e.target.files?.[0] ?? null).finally(() => (e.target.value = ""))} />
              </label>
              <label className="p-btn plain">
                Escolher do rolo
                <input type="file" accept="image/*" disabled={ocupado} onChange={(e) => void escolher(e.target.files?.[0] ?? null).finally(() => (e.target.value = ""))} />
              </label>
            </>
          )}
        </div>
        <p className="t-foot t-2">Mesma luz, mesma distância, mesma roupa: é isso que faz a comparação valer. Só você vê estas fotos — a equipe não tem acesso.</p>
        {erro ? <p className="t-foot" style={{ color: "#b45a3c" }}>{erro}</p> : null}
      </div>
    </section>
  );
}

/**
 * CARTÃO COMPARTILHÁVEL (21/09/2026, passo 5 do portal).
 *
 * É o paciente quem conta — a clínica não publica nada. O cartão é desenhado
 * no aparelho (desenharCartao.ts) e sai pelo compartilhar do celular: nada
 * passa pelo servidor e a equipe não fica sabendo. Sem foto, sem peso
 * absoluto: só o que mudou e há quanto tempo. O confete é o único momento
 * de festa do portal — e só depois que o cartão saiu.
 */
function CartaoDaConquista({ opcoes }: { opcoes: OpcaoDoCartao[] }) {
  const [chave, setChave] = useState(opcoes[0].chave);
  const opcao = opcoes.find((o) => o.chave === chave) ?? opcoes[0];
  const previaRef = useRef<HTMLCanvasElement>(null);
  const [disparos, setDisparos] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let vivo = true;
    void desenharCartao(opcao)
      .then((canvas) => {
        const alvo = previaRef.current;
        if (!vivo || !alvo) return;
        alvo.width = canvas.width;
        alvo.height = canvas.height;
        alvo.getContext("2d")?.drawImage(canvas, 0, 0);
      })
      .catch(() => setAviso("Não consegui desenhar o cartão neste navegador."));
    return () => {
      vivo = false;
    };
  }, [opcao]);

  async function compartilhar() {
    setAviso("");
    setOcupado(true);
    try {
      const canvas = await desenharCartao(opcao);
      const blob = await cartaoParaBlob(canvas);
      const resultado = await compartilharCartao(blob, textoDeCompartilhar(opcao));
      if (resultado === "CANCELADO") return;
      setDisparos((n) => n + 1);
      if (resultado === "BAIXADO") setAviso("A imagem foi salva no aparelho. No celular, o botão abre direto o WhatsApp e o Instagram.");
    } catch {
      setAviso("Não consegui compartilhar agora. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section id="conquista" className="p-sec p-anim" aria-labelledby="t-conquista">
      <span className="t-sec" id="t-conquista">Sua conquista, para contar</span>
      <div className="p-card p-conquista">
        <p className="t-body">{fraseDoCartao(opcoes)}</p>
        {opcoes.length > 1 ? (
          <div className="p-seletor wrap" role="group" aria-label="O que mostrar no cartão">
            {opcoes.map((o) => (
              <button key={o.chave} type="button" aria-pressed={o.chave === opcao.chave} onClick={() => setChave(o.chave)}>
                {o.rotulo}
              </button>
            ))}
          </div>
        ) : null}
        <div className="p-cartao-palco">
          <canvas ref={previaRef} className="p-cartao-previa" aria-label={`Cartão: ${opcao.numero} ${opcao.unidade}, ${opcao.legenda}`} />
          <Confete disparos={disparos} />
        </div>
        <button type="button" className="p-btn" disabled={ocupado} onClick={() => void compartilhar()}>
          {ocupado ? "Preparando…" : "Compartilhar"}
        </button>
        <p className="t-foot t-2">O cartão nasce no seu celular e vai só para quem você mandar. A clínica não publica nada por você.</p>
        {aviso ? <p className="t-foot t-2">{aviso}</p> : null}
      </div>
    </section>
  );
}

/**
 * A VOZ DO DOUTOR (22/09/2026, passo 6 do portal).
 *
 * Uma nota de áudio do Dr. Daniel para a fase em que o paciente está —
 * gravada por ele em Administração → Portal do paciente. Player próprio (o
 * <audio controls> do iPhone não segue o tema); o texto do que ele disse fica
 * embaixo, para quem não pode ouvir agora. Ao terminar, o portal registra que
 * ouviu — é o que diz ao doutor que a mensagem chega.
 */
function VozDoDoutor({ sessao, previa, voz }: { sessao: string | null; previa: boolean; voz: NonNullable<PortalDados["vozDoDoutor"]> }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [posicao, setPosicao] = useState(0);
  const [duracao, setDuracao] = useState(voz.duracaoS ?? 0);
  const [lerTexto, setLerTexto] = useState(!voz.urlAudio);
  const [ouvida, setOuvida] = useState(Boolean(voz.ouvidaEm));
  const [erro, setErro] = useState("");
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  async function alternar() {
    const a = audioRef.current;
    if (!a) return;
    try {
      if (a.paused) await a.play();
      else a.pause();
    } catch {
      setErro("Não consegui tocar o áudio neste aparelho. O texto está logo abaixo.");
      setLerTexto(true);
    }
  }
  function terminou() {
    setTocando(false);
    setPosicao(0);
    if (!ouvida) {
      setOuvida(true);
      if (sessao && !previa) void marcarVozOuvida(sessao, voz.id);
    }
  }
  const pct = duracao > 0 ? Math.min(100, (posicao / duracao) * 100) : 0;

  return (
    <section id="doutor" className="p-sec p-anim" aria-labelledby="t-doutor">
      <span className="t-sec" id="t-doutor">Uma palavra do Dr. Daniel</span>
      <div className="p-card p-voz">
        <div className="p-voz-cabeca">
          <span className="p-voz-avatar" aria-hidden="true">
            <img src={bratanMark} alt="" />
          </span>
          <div>
            <p className="t-title3">{voz.titulo}</p>
            <p className="t-foot t-2">{voz.rotuloDaFase} · {ouvida ? "você já ouviu esta mensagem" : voz.urlAudio ? "gravada para quem está nesta fase do plano" : "para quem está nesta fase do plano"}</p>
          </div>
        </div>
        {voz.urlAudio ? (
          <>
            <div className="p-voz-player">
              <button type="button" className="p-voz-play" aria-label={tocando ? "Pausar" : "Ouvir a mensagem"} onClick={() => void alternar()}>
                {tocando ? <Pause size={22} strokeWidth={2.4} /> : <Play size={22} strokeWidth={2.4} style={{ marginLeft: 3 }} />}
              </button>
              <div className="p-voz-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="p-voz-tempo">
                {fmt(posicao)} / {fmt(duracao)}
              </span>
            </div>
            <audio
              ref={audioRef}
              src={voz.urlAudio}
              preload="metadata"
              onPlay={() => setTocando(true)}
              onPause={() => setTocando(false)}
              onEnded={terminou}
              onTimeUpdate={(e) => setPosicao(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setDuracao(d);
              }}
              onError={() => {
                setErro("O áudio não abriu neste aparelho. O texto está logo abaixo.");
                setLerTexto(true);
              }}
            />
            {erro ? <p className="t-foot t-2">{erro}</p> : null}
            {voz.texto ? (
              <button type="button" className="p-btn plain" style={{ justifySelf: "start", paddingLeft: 0 }} onClick={() => setLerTexto((v) => !v)}>
                {lerTexto ? "Esconder o texto" : "Ler o que ele disse"}
              </button>
            ) : null}
          </>
        ) : null}
        {lerTexto && voz.texto ? <p className="p-voz-texto">{voz.texto}</p> : null}
      </div>
    </section>
  );
}
