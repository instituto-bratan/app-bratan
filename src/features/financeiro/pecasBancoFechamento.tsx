// PEÇAS DAS TELAS DE BANCO E FECHAMENTO — Papel & Musgo (08/10/2026, redesenho etapa 3).
//
// Extrato, Poupança, Fechamento do dia, Impostos & NFs e Repasses usam o mesmo
// vocabulário da imagem 03 aprovada: campo com rótulo em cima (40 px, contorno
// 3:1), número principal em Fraunces com o "R$" pequeno, razão do mês (rótulo à
// esquerda, valor tabular à direita), linha de lista, tabela de comparar e o
// recado da tela. Moram aqui, e não em src/components/ui, porque só estas telas
// usam por enquanto (a fundação é de outra etapa). Nada de vidro, degradê ou
// sombra pesada; oliva e dourado nunca como cor de texto.
import * as React from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- campo

/** Campo do guia: 40 px, raio 6, contorno borda-campo (3:1), foco em anel musgo de 2 px. */
export const classeDoCampo =
  "h-10 w-full min-w-0 rounded-controle border border-borda-campo bg-folha px-3 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 transition-colors duration-150 ease-papel hover:border-tinta-2 " +
  "focus-visible:border-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco " +
  "disabled:cursor-not-allowed disabled:border-fio-2 disabled:bg-saber disabled:text-tinta-2";

/** O mesmo campo para valor em R$: algarismos de largura igual, alinhados à direita. */
export const classeDoCampoNumero = `${classeDoCampo} text-right tabular-nums`;

/** Rótulo em cima, ajuda embaixo (guia, seção 09). */
export function Campo({
  rotulo,
  ajuda,
  children,
  className,
}: {
  rotulo: React.ReactNode;
  ajuda?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid min-w-0 content-start gap-2", className)}>
      <span className="text-[13px] font-bold leading-5 text-tinta">{rotulo}</span>
      {children}
      {ajuda ? <span className="text-[13px] font-medium leading-5 text-tinta-2">{ajuda}</span> : null}
    </label>
  );
}

/** Seleção com a cara do campo (a seta é do desenho, não do navegador). */
export const Selecao = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Selecao(
  { className, children, ...resto },
  ref,
) {
  return (
    <span className={cn("relative block min-w-0", className)}>
      <select ref={ref} className={cn(classeDoCampo, "cursor-pointer appearance-none pr-9 font-semibold")} {...resto}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-2" aria-hidden="true" />
    </span>
  );
});

// ---------------------------------------------------------------- texto

/** Rubrica: caixa alta 12/700, a sobrancelha dos blocos. */
export function Rubrica({ children, id, className, as = "p" }: { children: React.ReactNode; id?: string; className?: string; as?: "p" | "h2" | "h3" }) {
  const Elemento = as;
  return (
    <Elemento id={id} className={cn("text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2", className)}>
      {children}
    </Elemento>
  );
}

const reais = (valor: number) => Math.abs(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Número principal: Fraunces, com "R$" menor em Manrope, como papel timbrado. Nunca dentro de tabela. */
export function NumeroGrande({
  valor,
  medio = false,
  tom,
  semMoeda = false,
  className,
}: {
  /** Em reais. Negativo ganha o sinal "−" antes do R$. */
  valor: number | string;
  medio?: boolean;
  tom?: "atencao" | "erro";
  /** Para contagens ("4 de 6"): sem o R$. */
  semMoeda?: boolean;
  className?: string;
}) {
  const negativo = typeof valor === "number" && valor < -0.004;
  const texto = typeof valor === "number" ? reais(valor) : valor;
  return (
    <p
      className={cn(
        "whitespace-nowrap font-serifa font-normal leading-none tracking-[-0.01em] tabular-nums",
        medio ? "text-[32px]" : "text-[40px] max-md:text-[32px]",
        tom === "atencao" ? "text-atencao" : tom === "erro" ? "text-erro" : "text-tinta",
        className,
      )}
    >
      {semMoeda ? null : (
        <span className={cn("mr-1 font-sans font-bold text-tinta-2", medio ? "align-[.8em] text-[13px]" : "align-[.95em] text-sm")}>
          {negativo ? "−R$" : "R$"}
        </span>
      )}
      {texto}
    </p>
  );
}

// ---------------------------------------------------------------- razão do mês

export type TomDaLinha = "ok" | "atencao" | "erro";

const COR_DO_TOM: Record<TomDaLinha, string> = { ok: "text-ok", atencao: "text-atencao", erro: "text-erro" };

export type LinhaDaRazao = {
  rotulo: React.ReactNode;
  valor: React.ReactNode;
  /** Pinta o valor (ok = verde da situação; atenção = laranja). */
  tom?: TomDaLinha;
  /** Ícone ou amostra de 12–16 px antes do rótulo. */
  marca?: React.ReactNode;
  /** Uma linha a mais, embaixo do rótulo. */
  detalhe?: React.ReactNode;
  /** Valor em 14 px (o padrão é 16). */
  valorMenor?: boolean;
};

/** A razão do bloco "saber": rótulo à esquerda, valor tabular à direita, fio entre as linhas. */
export function Razao({ linhas, className }: { linhas: LinhaDaRazao[]; className?: string }) {
  return (
    <dl className={cn("border-t border-fio-2", className)}>
      {linhas.map((linha, indice) => (
        <div key={indice} className="flex items-start justify-between gap-3 border-b border-fio py-3">
          <dt className="min-w-0 text-sm font-medium leading-5 text-tinta-2">
            <span className="flex items-center gap-3">
              {linha.marca}
              <span className="min-w-0">{linha.rotulo}</span>
            </span>
            {linha.detalhe ? <span className="mt-0.5 block text-[13px] leading-5">{linha.detalhe}</span> : null}
          </dt>
          <dd
            className={cn(
              "m-0 whitespace-nowrap font-bold tabular-nums",
              linha.valorMenor ? "text-sm leading-5" : "text-base leading-6",
              linha.tom ? COR_DO_TOM[linha.tom] : "text-tinta",
            )}
          >
            {linha.valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- blocos e listas

/** Cabeçalho de um bloco: título 16/700, a soma em tinta e a frase de ajuda embaixo. */
export function TituloDoBloco({
  titulo,
  soma,
  ajuda,
  acoes,
  id,
  nivel = "h2",
  className,
}: {
  titulo: React.ReactNode;
  /** "3 contas · R$ 3.420,00" — já com o tom, se precisar. */
  soma?: React.ReactNode;
  ajuda?: React.ReactNode;
  acoes?: React.ReactNode;
  id?: string;
  nivel?: "h2" | "h3";
  className?: string;
}) {
  const Titulo = nivel;
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-6 pb-3 pt-5 max-md:px-4 max-md:pt-4", className)}>
      <div className="min-w-0 flex-1">
        <Titulo id={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-bold leading-6 text-tinta">
          {titulo}
          {soma ? <span className="whitespace-nowrap text-sm font-bold tabular-nums leading-6">{soma}</span> : null}
        </Titulo>
        {ajuda ? <p className="mt-1 max-w-[72ch] text-[13px] font-medium leading-5 text-tinta-2">{ajuda}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}

/** Uma linha de lista na folha: título e meta à esquerda, valor tabular à direita, ações na ponta. */
export function Linha({
  titulo,
  meta,
  valor,
  tomDoValor,
  acoes,
  antes,
  className,
}: {
  titulo: React.ReactNode;
  /** Pedaços da meta: entram separados por "·". */
  meta?: React.ReactNode[];
  valor?: React.ReactNode;
  tomDoValor?: TomDaLinha | "fraco";
  acoes?: React.ReactNode;
  /** Algo antes do título (caixa de marcar, ícone). */
  antes?: React.ReactNode;
  className?: string;
}) {
  const pedacos = (meta ?? []).filter((pedaco) => pedaco !== null && pedaco !== undefined && pedaco !== false && pedaco !== "");
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-fio px-6 py-3 transition-colors duration-150 ease-papel hover:bg-saber/70 max-md:px-4",
        className,
      )}
    >
      {antes}
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-bold leading-5 text-tinta [overflow-wrap:anywhere]">{titulo}</p>
        {pedacos.length ? (
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium leading-5 text-tinta-2">
            {pedacos.map((pedaco, indice) => (
              <React.Fragment key={indice}>
                {indice ? (
                  <span className="text-fio-2" aria-hidden="true">
                    ·
                  </span>
                ) : null}
                <span className="min-w-0">{pedaco}</span>
              </React.Fragment>
            ))}
          </p>
        ) : null}
      </div>
      {valor !== undefined && valor !== null ? (
        <span
          className={cn(
            "ml-auto whitespace-nowrap text-sm font-bold leading-5 tabular-nums",
            tomDoValor === "fraco" ? "font-medium text-tinta-2" : tomDoValor ? COR_DO_TOM[tomDoValor] : "text-tinta",
          )}
        >
          {valor}
        </span>
      ) : null}
      {acoes ? <div className="flex flex-wrap items-center justify-end gap-1">{acoes}</div> : null}
    </li>
  );
}

/** Lista vazia: diz que está em dia, com o ✓ desenhado (não emoji). */
export function Vazio({ children, className, tom = "ok" }: { children: React.ReactNode; className?: string; tom?: "ok" | "neutro" }) {
  return (
    <p className={cn("flex items-start gap-2 border-t border-fio px-6 py-4 text-sm font-medium leading-5 text-tinta-2 max-md:px-4", className)}>
      {tom === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" strokeWidth={2.5} aria-hidden="true" /> : null}
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------- recado

/** O recado da tela depois de uma ação ("Movimento registrado"). Lido pelo leitor de tela. */
export function RecadoDaTela({ tom = "ok", children, className }: { tom?: TomDaLinha; children: React.ReactNode; className?: string }) {
  const Icone = tom === "erro" ? XCircle : tom === "atencao" ? AlertTriangle : CheckCircle2;
  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-bloco px-4 py-3 text-sm font-semibold leading-5 text-tinta",
        tom === "erro" ? "bg-erro-claro" : tom === "atencao" ? "bg-atencao-claro" : "bg-ok-claro",
        className,
      )}
    >
      <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", COR_DO_TOM[tom])} aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------- leituras (filtros em texto)

/** Botões de escolher uma leitura da tela (Nutricionista · Psicóloga), como os filtros da imagem 03. */
export function Leituras<T extends string>({
  opcoes,
  valor,
  onMudar,
  rotulo,
  className,
}: {
  opcoes: { valor: T; rotulo: React.ReactNode }[];
  valor: T;
  onMudar: (valor: T) => void;
  /** Nome do grupo para o leitor de tela. */
  rotulo: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className={cn("flex flex-wrap gap-2", className)}>
      {opcoes.map((opcao) => {
        const ativa = opcao.valor === valor;
        return (
          <button
            key={opcao.valor}
            type="button"
            aria-pressed={ativa}
            onClick={() => onMudar(opcao.valor)}
            className={cn(
              // Até 32 px de altura; no celular a escolha comprida quebra a linha em vez de vazar a borda.
              "inline-flex min-h-[32px] max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-controle border px-3 py-1 text-left font-sans text-[13px] font-semibold leading-5 transition-colors duration-150 ease-papel",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
              ativa ? "border-musgo bg-folha text-tinta shadow-[inset_0_0_0_1px_rgb(var(--musgo-rgb))]" : "border-fio-2 bg-transparent text-tinta-2 hover:text-tinta",
            )}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- tabela

/** Tabela de comparar (guia, seção 08): cabeçalho 12/700 em caixa alta, valor por último e à direita. */
export const tabela = {
  tabela: "w-full border-collapse font-sans text-sm font-medium leading-5 text-tinta",
  th: "h-10 whitespace-nowrap border-b border-fio-2 px-4 text-left align-middle text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2",
  thNum: "h-10 whitespace-nowrap border-b border-fio-2 px-4 text-right align-middle text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2",
  linha: "transition-colors duration-150 ease-papel hover:bg-saber/70",
  td: "border-b border-fio px-4 py-3 align-middle",
  tdNum: "whitespace-nowrap border-b border-fio px-4 py-3 text-right align-middle tabular-nums",
  pe: "border-t border-fio-2 px-4 py-3 font-bold",
  peNum: "whitespace-nowrap border-t border-fio-2 px-4 py-3 text-right font-bold tabular-nums",
} as const;

// ---------------------------------------------------------------- origem dos dados

/** "Supabase + local" ou "Somente local": o rodapé discreto que dizia o selo antigo. */
export function OrigemDosDados({ modo, className }: { modo: string; className?: string }) {
  return <p className={cn("text-xs font-medium leading-4 text-tinta-2", className)}>Dados: {modo}</p>;
}

/** "outubro de 2026" a partir de "2026-10". */
export function nomeDoMes(chave: string) {
  const [ano, mes] = chave.split("-").map(Number);
  if (!ano || !mes) return chave;
  return new Date(ano, mes - 1, 15).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/**
 * A rubrica do saber ("Outubro em contas", imagem 03): só o mês quando é o ano
 * de hoje; com o ano quando não é ("dezembro de 2025"). Cabe numa linha.
 */
export function mesDaRubrica(chave: string, hoje: string) {
  const [ano, mes] = chave.split("-").map(Number);
  if (!ano || !mes) return chave;
  if (String(ano) !== hoje.slice(0, 4)) return nomeDoMes(chave);
  return new Date(ano, mes - 1, 15).toLocaleDateString("pt-BR", { month: "long" });
}
