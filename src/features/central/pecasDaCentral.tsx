// PEÇAS DA CENTRAL BRATAN (28/10/2026) — Papel & Musgo.
//
// "Decidir em folha, saber em papel": as decisões que esperam a pessoa moram
// numa FOLHA (com borda); a saúde do sistema, os 8 cartões das frentes e o
// disjuntor são para SABER (fundo saber, sem borda, sem sombra). A situação de
// cada frente vai sempre com ícone + palavra + cor — a cor nunca fala sozinha.
// Oliva e dourado nunca como cor de texto. Os números chegam prontos (com a
// frase) de central.ts; aqui só se desenha.
import * as React from "react";
import { Bell, ChevronRight, CircleCheck, CircleDashed, Hammer, Hourglass, PowerOff, TriangleAlert, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { BlocoFolha, BlocoSaber } from "@/components/ui/blocos";
import { LinkSeta } from "@/components/ui/botao";
import { cn } from "@/lib/utils";
import {
  DIAS_DO_DISJUNTOR,
  FRENTES,
  SITUACOES,
  type CartaoDaFrente,
  type DecisoesDaCentral,
  type EstadoNoDisjuntor,
  type LinhaDoDisjuntor,
  type SaudeDoSistema,
  type SituacaoDaFrente,
  type Tom,
} from "./central";

/** Rubrica: 12/700, caixa alta, tinta 2 (a mesma do Início). */
export function Rubrica({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn("text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2", className)}>
      {children}
    </h2>
  );
}

// ---------------------------------------------------------------- selo da situação

const ICONE_DA_SITUACAO: Record<SituacaoDaFrente, LucideIcon> = {
  "no-ar": CircleCheck,
  "com-erro": TriangleAlert,
  "sem-uso": Hourglass,
  desligado: PowerOff,
  "a-construir": Hammer,
};

const COR_DA_SITUACAO: Record<SituacaoDaFrente, string> = {
  "no-ar": "bg-ok-claro text-ok",
  "com-erro": "bg-erro-claro text-erro",
  "sem-uso": "bg-atencao-claro text-atencao",
  desligado: "bg-fio text-tinta-2",
  "a-construir": "border border-dashed border-fio-2 bg-folha text-tinta-2",
};

/** "● No ar" · "▲ Com erro" — ícone, palavra e cor juntos. */
export function SeloDaFrente({ situacao, className }: { situacao: SituacaoDaFrente; className?: string }) {
  const Icone = ICONE_DA_SITUACAO[situacao];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-controle px-2 text-[13px] font-bold leading-5",
        COR_DA_SITUACAO[situacao],
        className,
      )}
    >
      <Icone className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
      {SITUACOES[situacao].palavra}
    </span>
  );
}

const COR_DO_TOM: Record<Tom, string> = {
  ok: "text-ok",
  atencao: "text-atencao",
  erro: "text-erro",
  neutro: "text-tinta-2",
};

const ICONE_DO_TOM: Record<Tom, LucideIcon> = {
  ok: CircleCheck,
  atencao: TriangleAlert,
  erro: TriangleAlert,
  neutro: CircleDashed,
};

const PALAVRA_DO_TOM: Record<Tom, string> = { ok: "Tudo certo", atencao: "Atenção", erro: "Erro", neutro: "Sem leitura" };

// ---------------------------------------------------------------- decisões esperando você

export function BlocoDasDecisoes({ decisoes, carregando }: { decisoes: DecisoesDaCentral; carregando: boolean }) {
  return (
    <BlocoFolha as="section" aria-labelledby="central-decisoes" className="flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 pb-3 pt-5 max-md:px-4">
        <h2 id="central-decisoes" className="text-base font-bold leading-6 text-tinta">
          Decisões esperando você
        </h2>
        <p className="text-sm font-semibold leading-6 text-tinta-2">{carregando && !decisoes.total ? "Conferindo…" : decisoes.frase}</p>
      </div>
      {decisoes.linhas.length ? (
        <ul>
          {decisoes.linhas.map((linha) => (
            <li key={linha.id} className="border-t border-fio">
              <Link
                to={linha.href}
                className="flex min-h-14 items-center gap-3 px-6 py-3 text-sm font-semibold leading-5 text-tinta transition-colors hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco max-md:px-4"
              >
                <span className="min-w-0 flex-1">{linha.texto}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-fio px-6 py-4 text-sm font-medium leading-6 text-tinta-2 max-md:px-4">
          Os pedidos para aprovar, as contas do dia e o fechamento de ontem aparecem aqui — os mesmos do Início.
        </p>
      )}
      {decisoes.aviso ? (
        <Link
          to={decisoes.aviso.href}
          className="flex items-center gap-3 border-t border-fio-2 bg-papel px-6 py-3 text-[13px] font-semibold leading-5 text-tinta-2 hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco max-md:px-4"
        >
          <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Em Avisos: <strong className="font-bold text-tinta">{decisoes.aviso.texto}</strong>.
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : null}
      <div className="border-t border-fio px-6 py-3 max-md:px-4">
        <LinkSeta to="/">Abrir o Para decidir</LinkSeta>
      </div>
    </BlocoFolha>
  );
}

// ---------------------------------------------------------------- saúde do sistema

export function BlocoDaSaude({ saude, carregando }: { saude: SaudeDoSistema | null; carregando: boolean }) {
  const IconeGeral = ICONE_DO_TOM[saude?.tom ?? "neutro"];
  return (
    <BlocoSaber as="section" aria-labelledby="central-saude" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Rubrica id="central-saude">Saúde do sistema</Rubrica>
        {saude ? (
          <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-bold leading-5", COR_DO_TOM[saude.tom])}>
            <IconeGeral className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
            {PALAVRA_DO_TOM[saude.tom]}
          </span>
        ) : null}
      </div>
      {saude ? (
        <>
          <p className="text-sm font-semibold leading-[22px] text-tinta">{saude.frase}</p>
          <ul className="grid gap-3">
            {saude.itens.map((item) => {
              const Icone = ICONE_DO_TOM[item.tom];
              return (
                <li key={item.id} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-2 border-t border-fio-2 pt-3">
                  <Icone className={cn("mt-0.5 h-4 w-4", COR_DO_TOM[item.tom])} strokeWidth={2.25} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold leading-5 text-tinta">
                      {item.titulo}
                      <span className="sr-only"> ({PALAVRA_DO_TOM[item.tom]})</span>
                    </p>
                    <p className="text-[13px] font-medium leading-5 text-tinta-2 [overflow-wrap:anywhere]">
                      {item.valor !== "—" ? <strong className="font-bold tabular-nums text-tinta">{item.valor}</strong> : null} {item.frase}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm font-medium leading-6 text-tinta-2">{carregando ? "Lendo as rotinas, as chamadas e as integrações…" : "Sem leitura do banco agora."}</p>
      )}
    </BlocoSaber>
  );
}

// ---------------------------------------------------------------- cartão de uma frente

function NumeroDaFrente({ valor }: { valor: string }) {
  const vazio = valor === "—";
  return (
    <p
      className={cn(
        "whitespace-nowrap font-serifa text-[32px] font-normal leading-none tracking-[-0.01em] [font-variant-numeric:lining-nums_tabular-nums]",
        vazio ? "text-tinta-2" : "text-tinta",
      )}
    >
      {valor}
    </p>
  );
}

export function CartaoDaFrenteView({ frente }: { frente: CartaoDaFrente }) {
  const idTitulo = `central-frente-${frente.id}`;
  const temUso = frente.uso.hoje !== null || frente.uso.seteDias !== null;
  return (
    <BlocoSaber as="article" aria-labelledby={idTitulo} className="flex min-w-0 flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-fio-2 bg-folha text-[13px] font-bold tabular-nums text-tinta-2"
          >
            {frente.numero}
          </span>
          <h3 id={idTitulo} className="min-w-0 pt-0.5 text-base font-bold leading-6 text-tinta [text-wrap:balance]">
            <span className="sr-only">Frente {frente.numero}: </span>
            {frente.nome}
          </h3>
        </div>
        <SeloDaFrente situacao={frente.situacao} />
      </header>

      <p className="text-[13px] font-medium leading-5 text-tinta-2">{frente.porque}</p>

      <div className="grid gap-1.5">
        <NumeroDaFrente valor={frente.destaque.valor} />
        <p className="text-sm font-medium leading-[22px] text-tinta-2">{frente.destaque.frase}</p>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-fio-2 pt-3 text-[13px] leading-5">
        <dt className="font-bold text-tinta">Uso</dt>
        <dd className="min-w-0 font-medium text-tinta-2">
          {temUso ? (
            <>
              <span className="font-bold tabular-nums text-tinta">Hoje {frente.uso.hoje ?? 0}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-bold tabular-nums text-tinta">7 dias {frente.uso.seteDias ?? 0}</span>
              <span className="block">{frente.uso.frase}</span>
            </>
          ) : (
            <span>{`${frente.uso.frase.charAt(0).toUpperCase()}${frente.uso.frase.slice(1)}.`}</span>
          )}
        </dd>
      </dl>

      {frente.travou.length ? (
        <div className="grid gap-1.5">
          <p className="text-[13px] font-bold leading-5 text-tinta">Travou</p>
          <ul className="grid gap-1.5">
            {frente.travou.map((item) => (
              <li key={item} className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2 text-[13px] font-medium leading-5 text-tinta">
                <TriangleAlert className="mt-[3px] h-3.5 w-3.5 text-atencao" strokeWidth={2.25} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {frente.aConstruir.length || frente.semUso.length ? (
        <div className="grid gap-1 text-[13px] font-medium leading-5 text-tinta-2">
          {frente.aConstruir.length ? (
            <p>
              <strong className="font-bold text-tinta">A construir:</strong> {frente.aConstruir.join(", ")}.
            </p>
          ) : null}
          {frente.semUso.length ? (
            <p>
              <strong className="font-bold text-tinta">Parado há {DIAS_DO_DISJUNTOR}+ dias:</strong>{" "}
              {frente.semUso
                .slice(0, 3)
                .map((item) => `${item.rotulo} (${item.dias === null ? "nunca usado" : `${item.dias} dias`})`)
                .join(" · ")}
              {frente.semUso.length > 3 ? ` · e mais ${frente.semUso.length - 3}` : ""}.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-fio-2 pt-3">
        {/* basis-64: no celular o link desce para baixo do texto, em vez de espremê-lo. */}
        <p className="min-w-0 flex-1 basis-64 text-[13px] font-medium leading-5 text-tinta-2">
          <strong className="font-bold text-tinta">Próximo passo:</strong> {frente.proximoPasso}
        </p>
        {frente.link ? <LinkSeta to={frente.link.to}>{frente.link.rotulo}</LinkSeta> : null}
      </div>
    </BlocoSaber>
  );
}

// ---------------------------------------------------------------- disjuntor de 30 dias

const PALAVRA_DO_ESTADO: Record<EstadoNoDisjuntor, string> = {
  parado: `Parado (${DIAS_DO_DISJUNTOR}+ dias)`,
  nunca: "Nunca usado",
  "a-construir": "A construir",
  desligada: "Desligada",
  "em-uso": "Em uso",
};

const COR_DO_ESTADO: Record<EstadoNoDisjuntor, string> = {
  parado: "text-atencao",
  nunca: "text-atencao",
  "a-construir": "text-tinta-2",
  desligada: "text-tinta-2",
  "em-uso": "text-ok",
};

const ICONE_DO_ESTADO: Record<EstadoNoDisjuntor, LucideIcon> = {
  parado: Hourglass,
  nunca: Hourglass,
  "a-construir": Hammer,
  desligada: PowerOff,
  "em-uso": CircleCheck,
};

const NOME_DA_FRENTE = Object.fromEntries(FRENTES.map((frente) => [frente.id, frente.nome])) as Record<string, string>;

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  // Brasília (UTC−3), como o resto da Central.
  const local = new Date(t - 3 * 3_600_000).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)}`;
}

export function TabelaDoDisjuntor({ linhas }: { linhas: LinhaDoDisjuntor[] }) {
  const [todos, setTodos] = React.useState(false);
  const comAtencao = linhas.filter((linha) => linha.estado !== "em-uso");
  const mostradas = todos ? linhas : comAtencao;
  const parados = linhas.filter((linha) => linha.estado === "parado" || linha.estado === "nunca").length;
  return (
    <BlocoSaber as="section" aria-labelledby="central-disjuntor" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <Rubrica id="central-disjuntor">Disjuntor de {DIAS_DO_DISJUNTOR} dias · só leitura</Rubrica>
        <button
          type="button"
          onClick={() => setTodos((atual) => !atual)}
          aria-pressed={todos}
          className="rounded-sm text-sm font-bold leading-5 text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
        >
          {todos ? "Mostrar só o que pede atenção" : `Mostrar todos (${linhas.length})`}
        </button>
      </div>
      <p className="max-w-[72ch] text-sm font-medium leading-[22px] text-tinta-2">
        <strong className="font-bold text-tinta">
          {parados === 1 ? "1 recurso está parado" : `${parados} recursos estão parados`} há {DIAS_DO_DISJUNTOR} dias ou mais (ou nunca foram usados).
        </strong>{" "}
        Cada tela e cada integração mostra há quantos dias não é usada, pela tabela dela e pelo histórico do app. Nesta versão a Central só mostra; desligar um recurso parado
        daqui fica para a próxima.
      </p>
      {mostradas.length ? (
        <div className="-mx-6 overflow-x-auto max-md:-mx-4">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px] leading-5">
            <caption className="sr-only">Dias desde o último uso de cada tela e integração</caption>
            <thead>
              <tr className="border-b border-fio-2 text-xs font-bold uppercase tracking-[0.06em] text-tinta-2">
                <th scope="col" className="py-2 pl-6 pr-3 font-bold max-md:pl-4">
                  Recurso
                </th>
                <th scope="col" className="px-3 py-2 font-bold">
                  Frente
                </th>
                <th scope="col" className="px-3 py-2 font-bold">
                  Último uso
                </th>
                <th scope="col" className="py-2 pl-3 pr-6 font-bold max-md:pr-4">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {mostradas.map((linha) => {
                const Icone = ICONE_DO_ESTADO[linha.estado];
                return (
                  <tr key={linha.chave} className="border-b border-fio last:border-b-0">
                    <th scope="row" className="py-2.5 pl-6 pr-3 font-semibold text-tinta max-md:pl-4">
                      {linha.rotulo}
                    </th>
                    <td className="px-3 py-2.5 font-medium text-tinta-2">{NOME_DA_FRENTE[linha.frente] ?? linha.frente}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums text-tinta-2">{dataCurta(linha.ultimoUso)}</td>
                    <td className="py-2.5 pl-3 pr-6 max-md:pr-4">
                      <span className={cn("inline-flex items-center gap-1.5 font-bold", COR_DO_ESTADO[linha.estado])}>
                        <Icone className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />
                        {PALAVRA_DO_ESTADO[linha.estado]}
                      </span>
                      <span className="block font-medium text-tinta-2">{linha.frase}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm font-medium leading-6 text-tinta-2">Todas as telas e integrações foram usadas nos últimos {DIAS_DO_DISJUNTOR} dias.</p>
      )}
    </BlocoSaber>
  );
}
