import { useMemo, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CalendarClock,
  CircleDollarSign,
  CheckSquare,
  Coins,
  FileText,
  History,
  Home,
  LayoutGrid,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Utensils,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DockMorph from "@/components/ui/dock-morph";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, canBaseModules, canComprovantes, canLembretesPagamento, cargoGroup, cargoLabels } from "@/lib/access";
import { cn } from "@/lib/utils";
import type { Cargo } from "@/types/database";
import bratanMark from "@/assets/bratan-mark.png";

type NavEntry = {
  label: string;
  shortLabel?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  allowed: (cargo: Cargo | null | undefined) => boolean;
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
      { label: "Tarefas", href: "/tarefas", icon: CheckSquare, allowed: canBaseModules },
      { label: "Almoço", href: "/almoco", icon: Utensils, allowed: canBaseModules },
      { label: "Mural", href: "/mural", icon: Bell, allowed: canBaseModules },
    ],
  },
  {
    label: "Carteira",
    detail: "saldo, check-ins e ranking",
    href: "/estalecas",
    icon: Coins,
    allowed: canBaseModules,
    entries: [
      { label: "Minhas Estalecas", shortLabel: "Estalecas", href: "/estalecas", icon: Coins, allowed: canBaseModules },
    ],
  },
  {
    label: "Documentos",
    detail: "POPs e comprovantes",
    href: "/pops-fluxos",
    icon: FileText,
    allowed: canBaseModules,
    entries: [
      { label: "POPs & Fluxos", shortLabel: "POPs", href: "/pops-fluxos", icon: FileText, allowed: canBaseModules },
      { label: "Comprovantes", href: "/comprovantes", icon: ReceiptText, allowed: canComprovantes },
    ],
  },
  {
    label: "Financeiro",
    detail: "combinados e pendências",
    href: "/lembretes-pagamento",
    icon: CalendarClock,
    allowed: canLembretesPagamento,
    entries: [
      { label: "Lembretes", href: "/lembretes-pagamento", icon: CalendarClock, allowed: canLembretesPagamento },
    ],
  },
  {
    label: "Administração",
    detail: "equipe, segurança e auditoria",
    href: "/administracao/colaboradores",
    icon: UsersRound,
    allowed: canAdministracao,
    entries: [
      { label: "Colaboradores", href: "/administracao/colaboradores", icon: UsersRound, allowed: canAdministracao },
      { label: "Gestão Estalecas", shortLabel: "Gestão", href: "/administracao/estalecas", icon: CircleDollarSign, allowed: canAdministracao },
      { label: "Segurança", href: "/administracao/seguranca", icon: ShieldCheck, allowed: canAdministracao },
      { label: "Auditoria", href: "/administracao/auditoria", icon: History, allowed: canAdministracao },
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

function visibleFlowGroups(cargo: Cargo | null | undefined) {
  return flowGroups
    .filter((group) => group.allowed(cargo))
    .map((group) => ({ ...group, entries: group.entries.filter((entry) => entry.allowed(cargo)) }))
    .filter((group) => group.entries.length > 0);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
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

function DesktopNav({ cargo }: { cargo: Cargo | null | undefined }) {
  const location = useLocation();
  const groups = visibleFlowGroups(cargo);

  return (
    <nav className="mt-8 hidden space-y-3 lg:block" aria-label="Navegação principal">
      <NavLink
        to={homeEntry.href}
        end
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

function MobileNav({ cargo, menuOpen, onOpenMenu }: { cargo: Cargo | null | undefined; menuOpen: boolean; onOpenMenu: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const groups = visibleFlowGroups(cargo);
  const coreItems: (NavEntry & { menu?: boolean })[] = [
    homeEntry,
    ...groups
      .filter((group) => ["Hoje", "Carteira", "Documentos"].includes(group.label))
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
    .filter((item) => item.allowed(cargo))
    .map((item) => ({
      icon: item.icon,
      label: item.shortLabel ?? item.label,
      active: item.menu ? menuOpen : item.href === "/" ? location.pathname === "/" || location.pathname === "/inicio" : location.pathname === item.href || location.pathname.startsWith(`${item.href}/`),
      onClick: () => (item.menu ? onOpenMenu() : navigate(item.href)),
    }));

  return (
    <nav className="lg:hidden" aria-label="Navegação principal">
      <DockMorph items={mobileItems} position="bottom" />
    </nav>
  );
}

function FlowLauncher({
  cargo,
  open,
  onClose,
}: {
  cargo: Cargo | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const groups = useMemo(() => visibleFlowGroups(cargo), [cargo]);

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
            <div className="flex items-center justify-between gap-4 border-b border-brand-oliva/12 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase text-brand-oliva">Fluxos Bratan</p>
                <h2 className="text-xl text-brand-musgo">Fluxos de trabalho</h2>
              </div>
              <Button type="button" size="icon" variant="ghost" className="rounded-full bg-white/50" onClick={onClose} aria-label="Fechar fluxos">
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {groups.map((group, index) => (
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
                          <Link to={entry.href}>
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
  const [flowLauncherOpen, setFlowLauncherOpen] = useState(false);

  return (
    <div className="mobile-app-shell isolate min-h-screen min-h-dvh overflow-x-hidden lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="ios-glass-quiet hidden border-r px-5 py-6 lg:block">
        <Brand />
        <DesktopNav cargo={pessoa?.cargo} />
      </aside>

      <div className="flex min-h-screen min-h-dvh flex-col pb-[calc(6.75rem+env(safe-area-inset-bottom))] lg:pb-0">
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
              </LiquidButton>
              {isPreview ? <Badge variant="gold" className="hidden sm:inline-flex">Prévia</Badge> : null}
              {pessoa?.cargo ? <Badge variant="outline" className="hidden max-w-36 truncate min-[430px]:inline-flex sm:max-w-none">{cargoLabels[pessoa.cargo]}</Badge> : null}
              {pessoa?.cargo ? <Badge variant="muted" className="hidden sm:inline-flex">{cargoGroup(pessoa.cargo)}</Badge> : null}
              <Button asChild variant="ghost" size="icon" className="bg-white/35 shadow-sm backdrop-blur-xl" aria-label="Meu perfil">
                <Link to="/meu-perfil">
                  <UserRound className="h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button type="button" variant="ghost" size="icon" className="bg-white/35 shadow-sm backdrop-blur-xl" aria-label="Sair" onClick={signOut}>
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>

        <main className="relative z-10 flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <FlowLauncher cargo={pessoa?.cargo} open={flowLauncherOpen} onClose={() => setFlowLauncherOpen(false)} />
      <MobileNav cargo={pessoa?.cargo} menuOpen={flowLauncherOpen} onOpenMenu={() => setFlowLauncherOpen(true)} />
    </div>
  );
}
