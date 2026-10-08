// CONTADOR — a bolinha numérica do menu (Papel & Musgo, 08/10/2026).
//
// Só no que é crítico. No Início ela conta SÓ as decisões pendentes (decisão do
// Lucas em 08/10/2026: hoje 6 = 3 pedidos + 2 contas + 1 fechamento); as notas
// fiscais sem CPF NÃO entram nessa conta — vão para Avisos, como prioridade.
// Tons: padrão (musgo, pendências) · suave (dentro de aba ou filtro) · alerta
// (vencido). Zero não aparece. Acima de 99 vira "99+".
import { cn } from "@/lib/utils";
import { textoDoContador } from "./papel-musgo";

export type TomContador = "padrao" | "suave" | "alerta";

const TONS: Record<TomContador, string> = {
  padrao: "bg-musgo text-sobre-musgo font-extrabold",
  suave: "bg-fio text-tinta-2 font-bold",
  alerta: "bg-erro text-folha font-extrabold",
};

export type ContadorProps = {
  valor: number;
  tom?: TomContador;
  /** O que o número quer dizer, para o leitor de tela ("6 decisões pendentes"). */
  rotulo?: string;
  max?: number;
  mostrarZero?: boolean;
  className?: string;
};

export function Contador({ valor, tom = "padrao", rotulo, max, mostrarZero, className }: ContadorProps) {
  const texto = textoDoContador(valor, { max, mostrarZero });
  if (texto === null) return null;
  return (
    <span
      className={cn(
        "inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-bloco px-1.5 font-sans text-xs leading-none tabular-nums",
        TONS[tom],
        className,
      )}
    >
      <span aria-hidden={rotulo ? true : undefined}>{texto}</span>
      {rotulo ? <span className="sr-only">{rotulo}</span> : null}
    </span>
  );
}
