import { Suspense, useEffect, useMemo, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bell,
  Boxes,
  BrainCircuit,
  CalendarClock,
  CalendarRange,
  CheckSquare,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileText,
  Gift,
  Goal,
  HandCoins,
  HeartPulse,
  History,
  Home,
  Landmark,
  LayoutGrid,
  LogOut,
  Megaphone,
  MessageCircle,
  Moon,
  PiggyBank,
  Plug,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  Target,
  UserRound,
  UserRoundCheck,
  UsersRound,
  Utensils,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DockMorph from "@/components/ui/dock-morph";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { PageGuideButton } from "@/components/ui/page-guide";
import { useAuth } from "@/hooks/useAuth";
import { BalaoDoDia } from "@/components/BalaoDoDia";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Avisos } from "@/components/ui/avisos";
import { useConfigNegocio } from "@/lib/useConfigNegocio";
import { useIntegracoes } from "@/lib/useIntegracoes";
import { PublicadorDoResumo } from "@/features/financeiro/PublicadorDoResumo";
import { useAvatar } from "@/features/perfil/avatarStore";
import { isCoordenacao, canAcompanhamento, canAdministracao, canBaseModules, canComprovantes, canCrmBratan, canFinanceiroView, canInteligencia360, canLancarDia, canLembretesPagamento, canManageAcessos, canMarketing, canSeeModule, cargoGroup, cargoLabels, type ModuleKey,
  canFinanceiroFull,
} from "@/lib/access";
import type { Pessoa } from "@/types/database";
import { prefetchRoute } from "@/lib/routePreload";
import { cn } from "@/lib/utils";
import { aplicarTema, ehEscuro, guardarTema, iniciarTema, lerTema, rotuloTema, type Tema } from "@/lib/tema";
import type { Cargo } from "@/types/database";
import bratanMark from "@/assets/bratan-mark.png";

type NavEntry = {
  label: string;
  shortLabel?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  allowed: (cargo: Cargo | null | undefined) => boolean;
  /** Tela do controle de Acessos por pessoa: quando presente, a exceção
   *  gravada vence a regra de cargo (inclusive para MOSTRAR a mais). */
  module?: ModuleKey;
};

type FlowGroup = {
  label: string;
  detail: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  allowed: (cargo: Cargo | null | undefined) => boolean;
  entries: NavEntry[];
};

const homeEntry: NavEntry = { label: "Início", href: "/", icon: Home, allowed: () => true };

const flowGroups: FlowGroup[] = [
  {
    label: "Hoje",
    detail: "tarefas, almoço e mural",
    href: "/tarefas",
    icon: CheckSquare,
    allowed: canBaseModules,
    entries: [
      { label: "Tarefas", href: "/tarefas", icon: CheckSquare, allowed: canBaseModules, module: "hoje" },
      { label: "Almoço", href: "/almoco", icon: Utensils, allowed: canBaseModules, module: "hoje" },
      { label: "Mural", href: "/mural", icon: Bell, allowed: canBaseModules, module: "hoje" },
    ],
  },
  {
    label: "Carteira",
    detail: "saldo, check-ins e ranking",
    href: "/estalecas",
    icon: Coins,
    allowed: canBaseModules,
    entries: [
      { label: "Minhas Estalecas", shortLabel: "Estalecas", href: "/estalecas", icon: Coins, allowed: canBaseModules, module: "estalecas" },
    ],
  },
  {
    label: "CRM",
    detail: "tarefas, vendas e cadências",
    href: "/crm/minhas-tarefas",
    icon: MessageCircle,
    allowed: canCrmBratan,
    entries: [
      { label: "Minhas Tarefas", shortLabel: "Tarefas", href: "/crm/minhas-tarefas", icon: ClipboardList, allowed: canCrmBratan, module: "crm" },
      { label: "Kanban Comercial", shortLabel: "Kanban", href: "/crm/vendas", icon: Target, allowed: canCrmBratan, module: "crm" },
      { label: "Cadências", href: "/crm/cadencias", icon: MessageCircle, allowed: canCrmBratan, module: "crm" },
      { label: "Planilha de Cadências", shortLabel: "Planilha", href: "/crm/planilha", icon: ClipboardList, allowed: canCrmBratan, module: "crm" },
      { label: "Gestão de Vendas (coordenador)", shortLabel: "Gestão de Vendas", href: "/crm/coordenador", icon: ClipboardList, allowed: canCrmBratan, module: "crm" },
      { label: "Check-in semanal", shortLabel: "Check-in", href: "/crm/checkin", icon: CalendarRange, allowed: canCrmBratan, module: "crm" },
      { label: "Acompanhamento", shortLabel: "Plano", href: "/acompanhamento", icon: HeartPulse, allowed: canAcompanhamento, module: "acompanhamento" },
      { label: "Indicações", href: "/crm/indicacoes", icon: Gift, allowed: canCrmBratan, module: "crm" },
      { label: "NPS da Concierge", shortLabel: "NPS", href: "/concierge/nps", icon: HeartPulse, allowed: (cargo) => canAdministracao(cargo) || cargo === "secretaria_executiva", module: "concierge-nps" },
    ],
  },
  {
    label: "Estoque",
    detail: "recepção e enfermagem",
    href: "/estoque",
    icon: Boxes,
    // Donas dos setores + coordenação; a exceção por pessoa (Acessos) vence.
    allowed: (cargo) => cargo === "recepcionista" || cargo === "enfermeira" || cargo === "nutricionista" || canFinanceiroView(cargo) || canAdministracao(cargo),
    entries: [
      { label: "Estoque", href: "/estoque", icon: Boxes, allowed: () => true, module: "estoque" },
    ],
  },
  {
    label: "Documentos",
    detail: "POPs e comprovantes",
    href: "/pops-fluxos",
    icon: FileText,
    allowed: canBaseModules,
    entries: [
      { label: "POPs & Fluxos", shortLabel: "POPs", href: "/pops-fluxos", icon: FileText, allowed: canBaseModules, module: "pops" },
      { label: "Comprovantes", href: "/comprovantes", icon: ReceiptText, allowed: canComprovantes, module: "comprovantes" },
    ],
  },
  {
    label: "Financeiro",
    detail: "caixa, contas e P12",
    href: "/financeiro/lancar-dia",
    icon: CalendarClock,
    allowed: (cargo) => canLancarDia(cargo) || canFinanceiroView(cargo),
    entries: [
      { label: "Lançar Dia", shortLabel: "Caixa", href: "/financeiro/lancar-dia", icon: HandCoins, allowed: canLancarDia, module: "fin-lancar-dia" },
      { label: "Painel do Mês (reunião)", shortLabel: "Painel", href: "/financeiro/painel", icon: BarChart3, allowed: canFinanceiroView, module: "fin-gestao" },
      { label: "Extrato do banco", shortLabel: "Extrato", href: "/financeiro/extrato", icon: Landmark, allowed: canFinanceiroView, module: "fin-extrato" },
      { label: "Contas a Pagar", shortLabel: "Contas", href: "/financeiro/contas", icon: ReceiptText, allowed: canLembretesPagamento, module: "fin-contas" },
      { label: "Compras", href: "/financeiro/compras", icon: ShoppingCart, allowed: canFinanceiroView, module: "fin-compras" },
      { label: "Crediário (Dinheiro)", shortLabel: "Crediário", href: "/financeiro/crediario", icon: HandCoins, allowed: canLembretesPagamento, module: "fin-crediario" },
      { label: "Fechamento", href: "/financeiro/fechamento", icon: ShieldCheck, allowed: canLembretesPagamento, module: "fin-fechamento" },
      { label: "Poupança", href: "/financeiro/poupanca", icon: Coins, allowed: canLembretesPagamento, module: "fin-poupanca" },
      { label: "Impostos & NFs", shortLabel: "NFs", href: "/financeiro/impostos", icon: FileText, allowed: canLembretesPagamento, module: "fin-impostos" },
      { label: "Repasses Nutri/Psi", shortLabel: "Repasses", href: "/financeiro/repasses", icon: UsersRound, allowed: canLembretesPagamento, module: "fin-repasses" },
      { label: "P12 ao vivo", shortLabel: "P12", href: "/financeiro/p12", icon: CircleDollarSign, allowed: canLembretesPagamento, module: "fin-p12" },
      { label: "Metas do Mês", shortLabel: "Metas", href: "/financeiro/metas", icon: Goal, allowed: canFinanceiroView, module: "fin-metas" },
      { label: "PDCA do Dr. Daniel", shortLabel: "PDCA", href: "/financeiro/pdca", icon: RefreshCw, allowed: canLembretesPagamento, module: "fin-pdca" },
      { label: "Lucro Inteligente", shortLabel: "Lucro", href: "/financeiro/lucro", icon: PiggyBank, allowed: canLembretesPagamento, module: "fin-lucro" },
      { label: "Lembretes", href: "/lembretes-pagamento", icon: CalendarClock, allowed: canLembretesPagamento, module: "fin-contas" },
    ],
  },
  {
    label: "Marketing",
    detail: "briefing do mês e plano de conteúdo",
    href: "/marketing",
    icon: Megaphone,
    allowed: canMarketing,
    entries: [
      { label: "Briefing do Mês", shortLabel: "Briefing", href: "/marketing", icon: Megaphone, allowed: canMarketing, module: "marketing" },
    ],
  },
  {
    label: "Inteligência",
    detail: "360, indicadores e ações",
    href: "/inteligencia-360",
    icon: BrainCircuit,
    allowed: canInteligencia360,
    entries: [
      { label: "Dashboard 360", shortLabel: "360", href: "/inteligencia-360", icon: BrainCircuit, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Ticket Médio", href: "/inteligencia-360/ticket-medio", icon: Target, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Precificação", href: "/inteligencia-360/precificacao", icon: HandCoins, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Comercial", href: "/inteligencia-360/comercial", icon: CircleDollarSign, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Jornada", href: "/inteligencia-360/jornada-paciente", icon: UserRoundCheck, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Réguas", href: "/inteligencia-360/reguas", icon: MessageCircle, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Retenção", href: "/inteligencia-360/retencao-resgate", icon: RefreshCw, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Experiência", href: "/inteligencia-360/experiencia", icon: HeartPulse, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Recebíveis", href: "/inteligencia-360/recebiveis", icon: ReceiptText, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Ações", href: "/inteligencia-360/acoes", icon: ClipboardList, allowed: canInteligencia360, module: "inteligencia360" },
      { label: "Configurações", href: "/inteligencia-360/configuracoes", icon: ShieldCheck, allowed: canAdministracao },
    ],
  },
  {
    label: "Administração",
    detail: "equipe, acessos e auditoria",
    href: "/administracao/colaboradores",
    icon: UsersRound,
    allowed: canAdministracao,
    entries: [
      { label: "Colaboradores", href: "/administracao/colaboradores", icon: UsersRound, allowed: canAdministracao },
      // Acessos por pessoa: só Lucas, Dr. Daniel e CEO (fixo por cargo).
      { label: "Acessos", href: "/administracao/acessos", icon: ShieldCheck, allowed: canManageAcessos },
      { label: "Gestão Estalecas", shortLabel: "Gestão", href: "/administracao/estalecas", icon: CircleDollarSign, allowed: canAdministracao },
      { label: "Segurança", href: "/administracao/seguranca", icon: ShieldCheck, allowed: canAdministracao },
      { label: "Auditoria", href: "/administracao/auditoria", icon: History, allowed: canAdministracao },
      { label: "O que a IA fez", shortLabel: "IA", href: "/administracao/ia", icon: BrainCircuit, allowed: (cargo) => canAdministracao(cargo) || canFinanceiroFull(cargo) },
      { label: "Configurações do negócio", shortLabel: "Config", href: "/administracao/configuracoes", icon: SlidersHorizontal, allowed: canManageAcessos },
      { label: "Integrações", href: "/administracao/integracoes", icon: Plug, allowed: (cargo) => isCoordenacao(cargo) },
      { label: "Cofre de compliance", shortLabel: "Compliance", href: "/administracao/compliance", icon: ShieldCheck, allowed: (cargo) => isCoordenacao(cargo) },
    ],
  },
];

function isEntryActive(pathname: string, entry: NavEntry) {
  if (entry.href === "/") return pathname === "/" || pathname === "/inicio";
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

function isGroupActive(pathname: string, group: FlowGroup) {
  return pathname === group.href || pathname.startsWith(`${group.href}/`) || group.entries.some((entry) => isEntryActive(pathname, entry));
}

// Visibilidade por PESSOA: telas com `module` seguem o controle de Acessos
// (exceção pode esconder OU liberar a mais que o cargo); as demais seguem o
// cargo. O grupo aparece se sobrar qualquer tela visível dentro dele.
function entryVisible(pessoa: Pessoa | null | undefined, entry: NavEntry) {
  return entry.module ? canSeeModule(pessoa, entry.module) : entry.allowed(pessoa?.cargo);
}

function visibleFlowGroups(pessoa: Pessoa | null | undefined) {
  return flowGroups
    .map((group) => ({ ...group, entries: group.entries.filter((entry) => entryVisible(pessoa, entry)) }))
    .filter((group) => group.entries.length > 0)
    // O atalho do grupo aponta pra 1ª tela visível (senão levaria a uma porta trancada).
    .map((group) => ({ ...group, href: group.entries[0]?.href ?? group.href }));
}

function preloadRouteProps(href: string) {
  return {
    onPointerEnter: () => prefetchRoute(href),
    onFocus: () => prefetchRoute(href),
    onTouchStart: () => prefetchRoute(href),
  };
}

function PageFallback() {
  return (
    <div className="grid min-h-[42vh] place-items-center px-4">
      <div className="ios-glass-quiet flex items-center gap-3 rounded-full border px-4 py-3 text-sm font-semibold text-brand-musgo">
        <span className="h-2.5 w-2.5 rounded-full bg-brand-dourado motion-safe:animate-pulse" aria-hidden="true" />
        Preparando tela
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      {...preloadRouteProps("/")}
      className={cn(
        "flex min-w-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "gap-2" : "gap-3",
      )}
    >
      <div className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border border-white/55 bg-white/58 p-1.5 shadow-sm backdrop-blur-xl",
        compact ? "h-10 w-10 sm:h-12 sm:w-12" : "h-12 w-12",
      )}>
        <img src={bratanMark} alt="" className="h-full w-full object-contain" aria-hidden="true" />
      </div>
      <div className={cn("min-w-0", compact && "max-[374px]:hidden")}>
        <p className={cn("font-semibold uppercase text-brand-oliva", compact ? "hidden text-[10px] sm:block sm:text-xs" : "text-xs")}>
          Instituto Bratan
        </p>
        <p className={cn("truncate font-heading text-brand-musgo", compact ? "text-base sm:text-xl" : "text-xl")}>APP BRATAN</p>
      </div>
    </Link>
  );
}

function DesktopNav({ pessoa }: { pessoa: Pessoa | null | undefined }) {
  const location = useLocation();
  const groups = visibleFlowGroups(pessoa);

  return (
    <nav className="mt-8 hidden space-y-3 lg:block" aria-label="Navegação principal">
      <NavLink
        to={homeEntry.href}
        end
        {...preloadRouteProps(homeEntry.href)}
        className={({ isActive }) =>
          cn(
            "ios-pressable flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors",
            isActive ? "bg-brand-musgo text-brand-papel shadow-sm" : "text-brand-tinta hover:bg-white/70",
          )
        }
      >
        <homeEntry.icon className="h-4 w-4" aria-hidden="true" />
        {homeEntry.label}
      </NavLink>

      {groups.map((group) => {
        const groupActive = isGroupActive(location.pathname, group);
        const Icon = group.icon;

        return (
          <div key={group.label} className="rounded-xl border border-brand-oliva/10 bg-white/28 p-1.5">
            <NavLink
              to={group.href}
              {...preloadRouteProps(group.href)}
              className={cn(
                "ios-pressable flex items-center gap-3 rounded-lg px-3 py-3 transition-colors",
                groupActive ? "bg-brand-musgo text-brand-papel shadow-sm" : "text-brand-tinta hover:bg-white/70",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{group.label}</span>
                <span className={cn("block truncate text-xs", groupActive ? "text-brand-papel/76" : "text-muted-foreground")}>{group.detail}</span>
              </span>
            </NavLink>

            <AnimatePresence initial={false}>
              {groupActive ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-1 px-1 pb-1 pt-2">
                    {group.entries.map((entry) => (
                      <NavLink
                        key={entry.href}
                        to={entry.href}
                        {...preloadRouteProps(entry.href)}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                            isActive ? "bg-white text-brand-musgo shadow-sm" : "text-brand-tinta/78 hover:bg-white/60",
                          )
                        }
                      >
                        <entry.icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {entry.label}
                      </NavLink>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}

function MobileNav({ pessoa, menuOpen, onOpenMenu }: { pessoa: Pessoa | null | undefined; menuOpen: boolean; onOpenMenu: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const groups = visibleFlowGroups(pessoa);
  const coreItems: (NavEntry & { menu?: boolean })[] = [
    homeEntry,
    ...groups
      .filter((group) => ["Hoje", "CRM", "Carteira", "Documentos"].includes(group.label))
      .map((group) => ({
        label: group.label,
        shortLabel: group.label === "Documentos" ? "Docs" : group.label,
        href: group.href,
        icon: group.icon,
        allowed: group.allowed,
      })),
    { label: "Menu", href: "#menu", icon: LayoutGrid, allowed: () => true, menu: true },
  ];
  const mobileItems = coreItems
    .filter((item) => item.menu || item.href === "/" || groups.some((group) => group.href === item.href))
    .map((item) => ({
      icon: item.icon,
      label: item.shortLabel ?? item.label,
      active: item.menu ? menuOpen : item.href === "/" ? location.pathname === "/" || location.pathname === "/inicio" : location.pathname === item.href || location.pathname.startsWith(`${item.href}/`),
      onClick: () => {
        if (item.menu) {
          onOpenMenu();
          return;
        }
        prefetchRoute(item.href);
        navigate(item.href);
      },
    }));

  return (
    <nav className="lg:hidden" aria-label="Navegação principal">
      <DockMorph items={mobileItems} position="bottom" />
    </nav>
  );
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function FlowLauncher({
  pessoa,
  open,
  onClose,
}: {
  pessoa: Pessoa | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const groups = useMemo(() => visibleFlowGroups(pessoa), [pessoa]);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // ⌘K "FAZER" (14/09/2026, proposta 4.2): além de achar telas, o atalho entende
  // um valor ("1234" → lançar conta de R$ 1.234) e verbos do dia a dia
  // ("comanda", "fechamento", "toque", "comprovante"). Só mostra o que a pessoa pode abrir.
  const acoes = useMemo(() => {
    const term = normalizeSearch(query.trim());
    if (!term) return [] as { chave: string; rotulo: string; href: string }[];
    const visiveis = new Set(groups.flatMap((group) => group.entries.map((entry) => entry.href.split("?")[0])));
    const podeIr = (href: string) => visiveis.has(href.split("?")[0]) || href === "/";
    const lista: { chave: string; rotulo: string; href: string }[] = [];
    const numero = query.trim().match(/^r?\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
    if (numero) {
      const bruto = numero[1];
      const valor = bruto.includes(",") ? Number(bruto.replace(/\./g, "").replace(",", ".")) : Number(bruto.replace(/\.(?=\d{3}(?:\D|$))/g, ""));
      if (Number.isFinite(valor) && valor > 0) {
        const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
        if (podeIr("/financeiro/contas")) lista.push({ chave: "conta", rotulo: `Lançar conta a pagar de ${fmt}`, href: `/financeiro/contas?valor=${valor.toFixed(2)}` });
        if (podeIr("/financeiro/lancar-dia")) lista.push({ chave: "comanda", rotulo: `Lançar comanda de ${fmt}`, href: "/financeiro/lancar-dia" });
      }
    }
    const comandos: { palavras: string[]; rotulo: string; href: string }[] = [
      { palavras: ["conta", "boleto", "pagar", "lancar conta", "despesa"], rotulo: "Lançar conta a pagar", href: "/financeiro/contas" },
      { palavras: ["comanda", "venda", "lancar dia", "recebi"], rotulo: "Lançar comanda do dia", href: "/financeiro/lancar-dia" },
      { palavras: ["fechamento", "fechar", "registrar fechamento", "aderiu"], rotulo: "Registrar fechamento (Kanban)", href: "/crm/vendas" },
      { palavras: ["toque", "tarefa", "cadencia", "ligar", "mensagem"], rotulo: "Meus toques do CRM", href: "/crm/minhas-tarefas" },
      { palavras: ["comprovante", "pix do paciente", "anexar"], rotulo: "Anexar comprovante", href: "/comprovantes" },
      { palavras: ["extrato", "conciliar", "itau", "banco"], rotulo: "Conciliar extrato do Itaú", href: "/financeiro/extrato" },
      { palavras: ["lucro", "envelope", "transferir", "repasse"], rotulo: "Lucro Inteligente (envelopes)", href: "/financeiro/lucro" },
      { palavras: ["painel", "reuniao", "apresentar", "mes"], rotulo: "Painel do Mês", href: "/financeiro/painel" },
      { palavras: ["estoque", "contar", "compra", "pedido"], rotulo: "Estoque e compras", href: "/estoque" },
      { palavras: ["nps", "pesquisa", "satisfacao"], rotulo: "NPS da Concierge", href: "/concierge/nps" },
      { palavras: ["configuracao", "limite", "regra", "vigencia"], rotulo: "Configurações do negócio", href: "/administracao/configuracoes" },
      { palavras: ["ia", "inteligencia artificial", "governanca"], rotulo: "Governança de IA", href: "/administracao/ia" },
      { palavras: ["integracao", "whatsapp oficial", "nota fiscal", "nfse", "push", "feegow", "supersign"], rotulo: "Integrações", href: "/administracao/integracoes" },
      { palavras: ["lgpd", "compliance", "dpo", "consentimento", "incidente", "ripd"], rotulo: "Cofre de compliance", href: "/administracao/compliance" },
      { palavras: ["fila", "hoje", "home", "inicio"], rotulo: "Fila do dia (Home)", href: "/" },
    ];
    for (const comando of comandos) {
      if (!podeIr(comando.href)) continue;
      if (comando.palavras.some((palavra) => normalizeSearch(palavra).includes(term) || term.includes(normalizeSearch(palavra)))) {
        if (!lista.some((item) => item.href === comando.href)) lista.push({ chave: comando.href, rotulo: comando.rotulo, href: comando.href });
      }
    }
    return lista.slice(0, 5);
  }, [query, groups]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredGroups = useMemo(() => {
    const term = normalizeSearch(query.trim());
    if (!term) return groups;
    return groups
      .map((group) => {
        const groupMatch = normalizeSearch(`${group.label} ${group.detail}`).includes(term);
        const entries = groupMatch ? group.entries : group.entries.filter((entry) => normalizeSearch(entry.label).includes(term));
        return { ...group, entries };
      })
      .filter((group) => group.entries.length > 0);
  }, [groups, query]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-brand-tinta/18 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] backdrop-blur-sm lg:items-center lg:pb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="ios-glass w-full max-w-3xl overflow-hidden rounded-[28px] border"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-brand-oliva/12 px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-brand-oliva">Fluxos Bratan</p>
                  <h2 className="text-xl text-brand-musgo">Fluxos de trabalho</h2>
                </div>
                <Button type="button" size="icon" variant="ghost" className="rounded-full bg-white/50" onClick={onClose} aria-label="Fechar fluxos">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar tela, ou digitar um valor / verbo (ex.: 1250, comanda, toque)…"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && acoes[0]) {
                      event.preventDefault();
                      onClose();
                      navigate(acoes[0].href);
                    }
                  }}
                  autoFocus={typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches}
                  className="h-11 w-full rounded-xl border border-brand-oliva/18 bg-white/70 pl-10 pr-3 text-sm text-brand-tinta placeholder:text-muted-foreground/70 focus-visible:border-brand-dourado/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dourado/25"
                  aria-label="Buscar módulo ou fluxo"
                />
              </div>
            </div>

            <div className="max-h-[62vh] overflow-y-auto p-4 sm:p-5">
              {acoes.length ? (
                <div className="mb-3 rounded-2xl border border-brand-dourado/40 bg-brand-creme/40 p-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-oliva">Fazer</p>
                  <div className="grid gap-1.5">
                    {acoes.map((acao, index) => (
                      <Button
                        key={acao.chave}
                        type="button"
                        variant={index === 0 ? "default" : "outline"}
                        className="justify-start"
                        onClick={() => {
                          onClose();
                          prefetchRoute(acao.href.split("?")[0]);
                          navigate(acao.href);
                        }}
                      >
                        {acao.rotulo}
                        {index === 0 ? <span className="ml-auto text-[10px] opacity-70">Enter</span> : null}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              {filteredGroups.length === 0 && !acoes.length ? (
                <p className="px-1 py-8 text-center text-sm text-muted-foreground">
                  Nada encontrado para "{query.trim()}". Tente outro nome, como "tarefas" ou "kanban" — ou um valor, como "1250".
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredGroups.map((group, index) => (
                  <motion.section
                    key={group.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: index * 0.035, ease: [0.4, 0, 0.2, 1] }}
                    className="rounded-2xl border border-brand-oliva/14 bg-white/58 p-3 backdrop-blur-xl"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-musgo text-brand-papel">
                        <group.icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-brand-tinta">{group.label}</p>
                        <p className="truncate text-xs text-muted-foreground">{group.detail}</p>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      {group.entries.map((entry, entryIndex) => (
                        <Button
                          key={entry.href}
                          asChild
                          variant={entryIndex === 0 ? "default" : "outline"}
                          className="justify-start gap-2"
                          onClick={onClose}
                        >
                          <Link to={entry.href} {...preloadRouteProps(entry.href)}>
                            <entry.icon className="h-4 w-4" aria-hidden="true" />
                            {entry.label}
                          </Link>
                        </Button>
                      ))}
                    </div>
                  </motion.section>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function AppLayout() {
  const { pessoa, isPreview, signOut } = useAuth();
  // CONFIGURAÇÕES COM VIGÊNCIA (14/09/2026): carrega uma vez e enche o cache dos motores.
  useConfigNegocio();
  // INTEGRAÇÕES (15/09/2026): o que está ligado (WhatsApp oficial, NFS-e, contrato, agendas, push).
  useIntegracoes();
  const location = useLocation();
  const [flowLauncherOpen, setFlowLauncherOpen] = useState(false);
  // TEMA (16/09/2026): a escolha é de quem usa e vale para o app inteiro.
  const [tema, setTema] = useState<Tema>(() => (typeof window === "undefined" ? "sistema" : lerTema()));
  useEffect(() => iniciarTema(), []);
  useEffect(() => aplicarTema(tema), [tema]);
  const escuro = typeof window === "undefined" ? false : ehEscuro(tema);
  function alternarTema() {
    // Um toque troca entre claro e escuro; segurar volta a seguir o aparelho.
    const proximo: Tema = escuro ? "claro" : "escuro";
    setTema(proximo);
    guardarTema(proximo);
  }
  function seguirAparelho() {
    setTema("sistema");
    guardarTema("sistema");
  }
  const avatar = useAvatar(pessoa?.id);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setFlowLauncherOpen((open) => !open);
        return;
      }
      if (event.key === "Escape") setFlowLauncherOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="mobile-app-shell isolate min-h-screen min-h-dvh overflow-x-hidden lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="ios-glass-quiet hidden min-w-0 border-r px-5 py-6 lg:block">
        <Brand />
        <DesktopNav pessoa={pessoa} />
      </aside>

      <div className="flex min-h-screen min-h-dvh min-w-0 flex-col pb-[calc(6.75rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="ios-glass sticky top-0 z-30 border-b ios-safe-top">
          <div className="flex min-h-16 items-center justify-between gap-2 px-3 sm:min-h-20 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <div className="hidden lg:block">
              <p className="text-sm text-muted-foreground">Hub operacional interno</p>
            </div>
            <div className="flex items-center gap-2">
              <LiquidButton type="button" size="sm" className="hidden h-9 px-4 sm:inline-flex" onClick={() => setFlowLauncherOpen(true)}>
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                Fluxos
                <span className="hidden rounded border border-brand-oliva/25 bg-white/45 px-1.5 py-0.5 text-[10px] font-semibold text-brand-oliva lg:inline" aria-hidden="true">
                  ⌘K
                </span>
              </LiquidButton>
              {isPreview ? <Badge variant="gold" className="hidden sm:inline-flex">Prévia</Badge> : null}
              {pessoa?.cargo ? <Badge variant="outline" className="hidden max-w-36 truncate min-[430px]:inline-flex sm:max-w-none">{cargoLabels[pessoa.cargo]}</Badge> : null}
              {pessoa?.cargo ? <Badge variant="muted" className="hidden sm:inline-flex">{cargoGroup(pessoa.cargo)}</Badge> : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="bg-white/35 shadow-sm backdrop-blur-xl"
                aria-label={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
                title={`Tema: ${rotuloTema[tema]}. Toque para ${escuro ? "clarear" : "escurecer"}; toque duplo para seguir o aparelho.`}
                onClick={alternarTema}
                onDoubleClick={seguirAparelho}
              >
                {escuro ? <SunMedium className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
              </Button>
              <Button asChild variant="ghost" size="icon" className="overflow-hidden rounded-full bg-white/35 shadow-sm backdrop-blur-xl" aria-label="Meu perfil">
                <Link to="/meu-perfil" {...preloadRouteProps("/meu-perfil")}>
                  {avatar ? (
                    <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <UserRound className="h-5 w-5" aria-hidden="true" />
                  )}
                </Link>
              </Button>
              <Button type="button" variant="ghost" size="icon" className="bg-white/35 shadow-sm backdrop-blur-xl" aria-label="Sair" onClick={signOut}>
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>

        <main className="app-content-frame relative z-10 flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <Suspense fallback={<PageFallback />}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <ErrorBoundary rotulo={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </motion.div>
          </Suspense>
        </main>
        <PageGuideButton pathname={location.pathname} />
      </div>

      {/* BALÃO DO DIA (08/09/2026): meta do dia + cabe gastar, em todas as telas, arrastável.
          O Publicador recalcula e grava o retrato enquanto alguém do financeiro estiver logado. */}
      <PublicadorDoResumo />
      <BalaoDoDia />
      <Avisos />

      <FlowLauncher pessoa={pessoa} open={flowLauncherOpen} onClose={() => setFlowLauncherOpen(false)} />
      <MobileNav pessoa={pessoa} menuOpen={flowLauncherOpen} onOpenMenu={() => setFlowLauncherOpen(true)} />
    </div>
  );
}
