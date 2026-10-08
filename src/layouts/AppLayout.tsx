// ---------------------------------------------------------------------------
// A CASCA DO APP (08/10/2026) — redesenho "Papel & Musgo", etapa 1, aprovado
// pelo Lucas em 08/10 ("pode implantar"). Imagens 01, 05, 06 e 07 da proposta.
//
// O que mudou e por quê:
//  · O menu deixa de ter uma lista própria (eram 12 grupos e 62 entradas escritas
//    aqui): tudo vem do MAPA DE NAVEGAÇÃO (src/lib/navegacao.ts) — 7 grupos +
//    Ajustes no rodapé, 29 itens, cada cargo só com os seus grupos, com a MESMA
//    regra de acesso de 07/10 (ninguém ganha nem perde uma tela).
//  · Computador: menu "mesa" preso na altura da tela, com o grupo aberto como
//    folha e o fio de ouro no item atual; contador do Início (SÓ decisões, decisão
//    do Lucas); FIXADOS (até 5); Ajustes e o cartão da pessoa no pé. Topo com o
//    caminho (Grupo › Item; a aba fica na barra de abas), a busca ⌘K, a data, o
//    sino de Avisos e a ajuda.
//  · Celular: barra de baixo com 5 itens COM NOME (Início · Buscar · Novo ·
//    Financeiro · Menu), gaveta do menu e folha do Novo.
//  · Itens que juntam telas (Financeiro › Pagar, Início › Hoje…) ganham a barra
//    de abas; cada aba é a rota de sempre. NENHUMA URL muda.
// As peças moram em src/layouts/casca/*; as regras puras, em casca.ts,
// comandos.ts e contadores.ts (testadas em tests/casca.test.mjs).
// ---------------------------------------------------------------------------
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { BalaoDoDia } from "@/components/BalaoDoDia";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Avisos } from "@/components/ui/avisos";
import { ContextoAbasDaPagina } from "@/components/ui/cabecalho";
import { GuiaDaTela } from "@/components/ui/page-guide";
import { PublicadorDoResumo } from "@/features/financeiro/PublicadorDoResumo";
import { useAuth } from "@/hooks/useAuth";
import { acoesRapidas, caminhoDaRota, itensDaBarraDoCelular, itensDoMenu, podeVerDestino } from "@/lib/navegacao";
import { findPageGuide } from "@/lib/pageGuides";
import { aplicarTema, guardarTema, iniciarTema, lerTema, type Tema } from "@/lib/tema";
import { useCarregarConfigDoMotor } from "@/lib/useConfigDoMotor";
import { useConfigNegocio } from "@/lib/useConfigNegocio";
import { useIntegracoes } from "@/lib/useIntegracoes";
import { AbasDoItem } from "./casca/AbasDoItem";
import { mostraBarraDeAbas } from "./casca/casca";
import { BarraDoCelular, FolhaDoNovo, GavetaDoMenu } from "./casca/BarraDoCelular";
import { BuscaRapida } from "./casca/BuscaRapida";
import { ContextoDosContadores } from "./casca/contexto";
import { MenuLateral } from "./casca/MenuLateral";
import { Topo } from "./casca/Topo";
import { useContadoresDaCasca } from "./casca/useContadores";
import { useFixados } from "./casca/useFixados";

type Sobreposicao = "buscar" | "novo" | "menu" | null;

function PaginaCarregando() {
  return (
    <div className="grid min-h-[42vh] place-items-center px-4">
      <p className="flex items-center gap-3 rounded-bloco bg-saber px-4 py-3 font-sans text-sm font-semibold text-tinta-2" role="status">
        <span className="h-2.5 w-2.5 rounded-full bg-dourado motion-safe:animate-pulse" aria-hidden="true" />
        Preparando a tela
      </p>
    </div>
  );
}

export function AppLayout() {
  const { pessoa, isPreview, signOut } = useAuth();
  // CONFIGURAÇÕES COM VIGÊNCIA (14/09/2026): carrega uma vez e enche o cache dos motores.
  const config = useConfigNegocio();
  // Motor do Lucro Inteligente (01/10/2026): a régua chega para todas as telas do lucro.
  useCarregarConfigDoMotor();
  // INTEGRAÇÕES (15/09/2026): o que está ligado (WhatsApp oficial, NFS-e, contrato, agendas, push).
  const integracoes = useIntegracoes();
  const location = useLocation();
  const navegar = useNavigate();
  const reduzirMovimento = useReducedMotion();

  // TEMA (16/09/2026): a escolha é de quem usa e vale para o app inteiro. Desde
  // 08/10 ela mora no cartão da pessoa (Claro · Escuro · Como no aparelho).
  const [tema, setTema] = useState<Tema>(() => (typeof window === "undefined" ? "sistema" : lerTema()));
  useEffect(() => iniciarTema(), []);
  useEffect(() => aplicarTema(tema), [tema]);
  const escolherTema = useCallback((proximo: Tema) => {
    setTema(proximo);
    guardarTema(proximo);
  }, []);

  // O que está aberto por cima da tela: a busca, o Novo ou a gaveta do menu (celular).
  const [aberto, setAberto] = useState<Sobreposicao>(null);
  const [guiaAberto, setGuiaAberto] = useState(false);
  const fechar = useCallback(() => setAberto(null), []);
  const fecharGuia = useCallback(() => setGuiaAberto(false), []);

  // Tudo do mapa, só com o que ESTA pessoa vê.
  const grupos = useMemo(() => itensDoMenu(pessoa), [pessoa]);
  const caminho = useMemo(() => caminhoDaRota(location.pathname, { pessoa }), [location.pathname, pessoa]);
  const barra = useMemo(() => itensDaBarraDoCelular(pessoa), [pessoa]);
  const acoes = useMemo(() => acoesRapidas(pessoa), [pessoa]);
  const { fixados, alternar, estaFixado, limite } = useFixados(pessoa);

  const focusLigada = Boolean(integracoes.data?.some((integracao) => integracao.chave === "focus_nfse" && integracao.ligada));
  const contadores = useContadoresDaCasca({ linhasDeConfig: config.linhas, focusLigada });

  // Trocou de tela: fecha o que estava aberto por cima.
  useEffect(() => {
    setAberto(null);
    setGuiaAberto(false);
  }, [location.pathname]);

  // ⌘K / Ctrl+K abre e fecha a busca de qualquer tela.
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if ((evento.metaKey || evento.ctrlKey) && !evento.altKey && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        setAberto((atual) => (atual === "buscar" ? null : "buscar"));
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // Link com âncora (ex.: Avisos → /financeiro/impostos#lote-de-notas): a tela
  // chega aos poucos (carga preguiçosa + dados), então espera o alvo aparecer.
  useEffect(() => {
    const alvo = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!alvo || alvo === "conteudo") return undefined;
    let tentativas = 0;
    const relogio = window.setInterval(() => {
      tentativas += 1;
      const elemento = document.getElementById(alvo);
      if (elemento) {
        elemento.scrollIntoView({ behavior: reduzirMovimento ? "auto" : "smooth", block: "start" });
        window.clearInterval(relogio);
      } else if (tentativas > 50) {
        window.clearInterval(relogio);
      }
    }, 100);
    return () => window.clearInterval(relogio);
  }, [location.pathname, location.hash, reduzirMovimento]);

  const ehInicio = location.pathname === "/" || location.pathname === "/inicio";
  // Revisão de 08/10/2026: o alfinete só aparece em tela que a pessoa abre. Numa
  // tela trancada (a limpeza em /financeiro/contas pela URL) ele não gravava
  // nada e ainda avisava "saiu dos Fixados".
  const destinoAtual = caminho?.destino && caminho.destino.buscavel && podeVerDestino(pessoa, caminho.destino) ? caminho.destino : null;
  const fixar = destinoAtual
    ? { rotulo: destinoAtual.rotulo, fixado: estaFixado(destinoAtual.id), onAlternar: () => void alternar(destinoAtual.id) }
    : null;
  const temGuia = Boolean(findPageGuide(location.pathname));
  // A mesma barra, entregue ao Cabecalho da tela para ir logo abaixo do título.
  const abasNoCabecalho = useMemo(() => (mostraBarraDeAbas(caminho) ? <AbasDoItem caminho={caminho} className="" /> : null), [caminho]);
  const sair = useCallback(() => void signOut(), [signOut]);
  const propsDaPessoa = { pessoa, isPreview, tema, onTema: escolherTema, onSair: sair };

  return (
    <ContextoDosContadores.Provider value={contadores}>
      {/* overflow-x-clip (não hidden): corta o que vaza para o lado sem virar área de
          rolagem, senão o position: sticky do menu, do topo e das colunas fixas não funciona (28/09/2026). */}
      <div className="mobile-app-shell isolate min-h-screen min-h-dvh overflow-x-clip bg-papel md:grid md:grid-cols-[var(--menu-largura)_minmax(0,1fr)]">
        <a
          href="#conteudo"
          onClick={(evento) => {
            evento.preventDefault();
            document.getElementById("conteudo")?.focus();
          }}
          className="sr-only z-[70] rounded-controle bg-musgo px-4 py-2 font-sans text-sm font-bold text-sobre-musgo focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Pular para o conteúdo
        </a>

        <MenuLateral
          grupos={grupos}
          caminho={caminho}
          fixados={fixados}
          limiteFixados={limite}
          onSoltarFixado={alternar}
          valorDe={contadores.valor}
          {...propsDaPessoa}
        />

        <div className="flex min-h-screen min-h-dvh min-w-0 flex-col">
          <Topo
            caminho={caminho}
            ehInicio={ehInicio}
            onAbrirBusca={() => setAberto("buscar")}
            avisos={contadores.valor("avisos")}
            temGuia={temGuia}
            onAbrirGuia={() => setGuiaAberto(true)}
            fixar={fixar}
          />

          <main
            id="conteudo"
            tabIndex={-1}
            className="app-content-frame group/conteudo relative z-10 flex-1 px-[var(--conteudo-lado)] pb-16 pt-8 outline-none max-md:pb-[calc(104px+env(safe-area-inset-bottom))] max-md:pt-6"
          >
            {/* A barra de abas do item: no alto do conteúdo só enquanto a tela não
                tem o Cabecalho novo; com ele, a barra desce para logo abaixo do
                título (imagem 03 aprovada) e esta some (revisão de 08/10/2026). */}
            <div className="group-has-[[data-abas-no-cabecalho]]/conteudo:hidden">
              <AbasDoItem caminho={caminho} />
            </div>
            <Suspense fallback={<PaginaCarregando />}>
              <motion.div
                key={location.pathname}
                initial={reduzirMovimento ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <ErrorBoundary rotulo={location.pathname}>
                  <ContextoAbasDaPagina.Provider value={abasNoCabecalho}>
                    <Outlet />
                  </ContextoAbasDaPagina.Provider>
                </ErrorBoundary>
              </motion.div>
            </Suspense>
          </main>
        </div>

        {/* BALÃO DO DIA (08/09/2026): meta do dia + cabe gastar, em todas as telas, arrastável.
            O Publicador recalcula e grava o retrato enquanto alguém do financeiro estiver logado. */}
        <PublicadorDoResumo />
        <BalaoDoDia />
        <Avisos />

        <BuscaRapida
          pessoa={pessoa}
          aberta={aberto === "buscar"}
          onFechar={fechar}
          fixados={fixados}
          estaFixado={estaFixado}
          onAlternarFixado={alternar}
        />
        <GuiaDaTela pathname={location.pathname} aberto={guiaAberto} onFechar={fecharGuia} />

        <BarraDoCelular
          itens={barra}
          caminho={caminho}
          ehInicio={ehInicio}
          aberto={aberto}
          onAcao={(acao) => setAberto((atual) => (atual === acao ? null : acao))}
          valorDe={contadores.valor}
        />
        <FolhaDoNovo
          aberta={aberto === "novo"}
          onFechar={fechar}
          acoes={acoes}
          onEscolher={(href) => {
            fechar();
            navegar(href);
          }}
        />
        <GavetaDoMenu
          aberta={aberto === "menu"}
          onFechar={fechar}
          grupos={grupos}
          caminho={caminho}
          fixados={fixados}
          limiteFixados={limite}
          valorDe={contadores.valor}
          {...propsDaPessoa}
        />
      </div>
    </ContextoDosContadores.Provider>
  );
}
