import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarClock,
  CheckSquare,
  FileText,
  History,
  Home,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Utensils,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DockMorph from "@/components/ui/dock-morph";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, canBaseModules, canComprovantes, canLembretesPagamento, cargoGroup, cargoLabels } from "@/lib/access";
import { cn } from "@/lib/utils";
import type { Cargo } from "@/types/database";
import bratanMark from "@/assets/bratan-mark.png";

const navItems = [
  { label: "Início", href: "/", icon: Home, mobile: true, allowed: () => true },
  { label: "Tarefas", href: "/tarefas", icon: CheckSquare, mobile: true, allowed: canBaseModules },
  { label: "Almoço", href: "/almoco", icon: Utensils, mobile: true, allowed: canBaseModules },
  { label: "Mural", href: "/mural", icon: Bell, mobile: true, allowed: canBaseModules },
  { label: "POPs & Fluxos", href: "/pops-fluxos", icon: FileText, mobile: true, allowed: canBaseModules },
  { label: "Comprovantes", href: "/comprovantes", icon: ReceiptText, mobile: true, allowed: canComprovantes },
  { label: "Lembretes", href: "/lembretes-pagamento", icon: CalendarClock, mobile: true, allowed: canLembretesPagamento },
  { label: "Colaboradores", href: "/administracao/colaboradores", icon: UsersRound, mobile: false, allowed: canAdministracao },
  { label: "Segurança", href: "/administracao/seguranca", icon: ShieldCheck, mobile: false, allowed: canAdministracao },
  { label: "Auditoria", href: "/administracao/auditoria", icon: History, mobile: false, allowed: canAdministracao },
];

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
  const allowedItems = navItems.filter((item) => item.allowed(cargo));

  return (
    <nav className="mt-8 hidden space-y-1 lg:block" aria-label="Navegação principal">
      {allowedItems.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/"}
          className={({ isActive }) =>
            cn(
              "ios-pressable flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              isActive ? "bg-brand-musgo text-brand-papel shadow-sm" : "text-brand-tinta hover:bg-white/70",
            )
          }
        >
          <item.icon className="h-4 w-4" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function MobileNav({ cargo }: { cargo: Cargo | null | undefined }) {
  const navigate = useNavigate();
  const location = useLocation();
  const mobileItems = navItems
    .filter((item) => item.mobile && item.allowed(cargo))
    .map((item) => ({
      icon: item.icon,
      label: item.label,
      active: item.href === "/" ? location.pathname === "/" || location.pathname === "/inicio" : location.pathname === item.href,
      onClick: () => navigate(item.href),
    }));

  return (
    <nav className="lg:hidden" aria-label="Navegação principal">
      <DockMorph items={mobileItems} position="bottom" />
    </nav>
  );
}

export function AppLayout() {
  const { pessoa, isPreview, signOut } = useAuth();

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

      <MobileNav cargo={pessoa?.cargo} />
    </div>
  );
}
