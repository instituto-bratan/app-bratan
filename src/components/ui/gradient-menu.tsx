// gradient-menu — componente do 21st.dev adaptado ao projeto (15/09/2026).
// Original: círculos brancos que se abrem ao passar o mouse e ganham um gradiente.
// Adaptações: (1) aceita itens por props em vez de lista fixa; (2) no celular não
// existe hover, então o item ATIVO fica aberto (e o hover continua funcionando no
// computador); (3) ícones do lucide-react, que o app já usa, em vez do react-icons;
// (4) sem o wrapper de tela cheia do demo — quem posiciona é quem usa.
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type GradientMenuItem = {
  id: string;
  title: string;
  icon: ReactNode;
  gradientFrom: string;
  gradientTo: string;
};

export default function GradientMenu({
  items,
  activeId,
  onSelect,
  className,
  size = 44,
  openWidth = 124,
}: {
  items: GradientMenuItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  className?: string;
  /** Diâmetro do círculo fechado (px). */
  size?: number;
  /** Largura do item aberto (px). */
  openWidth?: number;
}) {
  return (
    <ul className={cn("flex items-center gap-1.5", className)} role="tablist" aria-label="Seções">
      {items.map(({ id, title, icon, gradientFrom, gradientTo }) => {
        const active = id === activeId;
        return (
          <li
            key={id}
            role="presentation"
            style={{ "--gradient-from": gradientFrom, "--gradient-to": gradientTo, height: size, width: active ? openWidth : size } as CSSProperties}
            className="group relative flex cursor-pointer items-center justify-center rounded-full bg-white shadow-lg transition-all duration-500 hover:shadow-none data-[active=true]:shadow-none"
            data-active={active}
            onMouseEnter={(event) => {
              if (!active) (event.currentTarget as HTMLLIElement).style.width = `${openWidth}px`;
            }}
            onMouseLeave={(event) => {
              if (!active) (event.currentTarget as HTMLLIElement).style.width = `${size}px`;
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={title}
              className="absolute inset-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-[var(--p-tint)]"
              onClick={() => onSelect?.(id)}
            />
            {/* Fundo em gradiente (hover ou ativo) */}
            <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] opacity-0 transition-all duration-500 group-hover:opacity-100 group-data-[active=true]:opacity-100" />
            {/* Brilho desfocado atrás */}
            <span className="pointer-events-none absolute inset-x-0 top-[10px] -z-10 h-full rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] opacity-0 blur-[15px] transition-all duration-500 group-hover:opacity-50 group-data-[active=true]:opacity-50" />
            {/* Ícone */}
            <span className="pointer-events-none relative z-10 transition-all delay-0 duration-500 group-hover:scale-0 group-data-[active=true]:scale-0">
              <span className="text-xl text-[var(--p-label-2)] [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
            </span>
            {/* Título */}
            <span className="pointer-events-none absolute scale-0 text-[13px] font-semibold uppercase tracking-wide text-white transition-all delay-150 duration-500 group-hover:scale-100 group-data-[active=true]:scale-100">
              {title}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
