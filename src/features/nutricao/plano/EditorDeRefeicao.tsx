// UMA REFEIÇÃO NO EDITOR DO PLANO (28/09/2026).
//
// Edição direta, sem formulário: nome, horário, emoji, opcional; cada alimento
// com o texto dela, a medida caseira, os gramas e as substituições. Enter no
// último alimento cria o próximo. Alt + ↑/↓ reordena a refeição.
import { ArrowDown, ArrowUp, Leaf, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { azeiteSeAplica } from "../dominio/calculo";
import { novoItem, tipoPeloNome } from "../dominio/plano";
import type { Alimento, ItemRefeicao, MedidaCaseira, Refeicao, TipoRefeicao } from "../dominio/tipos";
import * as repo from "../store/repositorio";
import { Bolinha, NumeroEditavel } from "../ui/basicos";
import { BuscaDeAlimento } from "./BuscaDeAlimento";

const EMOJIS = ["", "☕", "🍎", "🍽️", "🥪", "🥗", "🍲", "🌙", "🍵", "🥣", "🍓", "🥤"];
const TIPOS: { id: TipoRefeicao; rotulo: string }[] = [
  { id: "cafe", rotulo: "café da manhã" },
  { id: "lanche", rotulo: "lanche" },
  { id: "almoco", rotulo: "almoço" },
  { id: "jantar", rotulo: "jantar" },
  { id: "ceia", rotulo: "ceia" },
  { id: "outra", rotulo: "outra" },
];

type Props = {
  refeicao: Refeicao;
  indice: number;
  total: number;
  alimentosPorId: Record<string, Alimento>;
  alimentos: Alimento[];
  medidas: MedidaCaseira[];
  editavel: boolean;
  kcal: number | null;
  aoMudar: (r: Refeicao) => void;
  aoMover: (delta: number) => void;
  aoRemover: () => void;
};

const campo = "h-8 rounded-lg border border-transparent bg-transparent px-2 text-sm hover:border-brand-oliva/15 focus:border-brand-dourado focus:bg-white/70 focus:outline-none disabled:opacity-80";

export function EditorDeRefeicao({ refeicao, indice, total, alimentosPorId, alimentos, medidas, editavel, kcal, aoMudar, aoMover, aoRemover }: Props) {
  const mudarItem = (id: string, parcial: Partial<ItemRefeicao>) => aoMudar({ ...refeicao, itens: refeicao.itens.map((i) => (i.id === id ? { ...i, ...parcial } : i)) });
  const adicionarItem = (parcial: Partial<ItemRefeicao> = {}) => {
    const item = novoItem(repo.novoId, parcial);
    aoMudar({ ...refeicao, itens: [...refeicao.itens, item] });
    window.setTimeout(() => document.getElementById(`item-${item.id}`)?.focus(), 30);
  };
  const azeiteAuto = refeicao.azeitePreparo === null;
  const comAzeite = azeiteSeAplica(refeicao);

  return (
    <section
      id={`refeicao-${refeicao.id}`}
      className="rounded-2xl border border-brand-oliva/14 bg-white/70 p-4 shadow-sm"
      onKeyDown={(e) => {
        if (!editavel || !e.altKey) return;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          aoMover(-1);
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          aoMover(1);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Emoji da refeição"
          value={refeicao.emoji}
          disabled={!editavel}
          onChange={(e) => aoMudar({ ...refeicao, emoji: e.target.value })}
          className="h-9 rounded-lg border border-brand-oliva/15 bg-white/60 px-1 text-base"
        >
          {EMOJIS.map((e) => (
            <option key={e || "sem"} value={e}>
              {e || "sem emoji"}
            </option>
          ))}
        </select>
        <input
          aria-label="Nome da refeição"
          value={refeicao.nome}
          disabled={!editavel}
          onChange={(e) => {
            const nome = e.target.value;
            aoMudar({ ...refeicao, nome, tipo: refeicao.tipo === tipoPeloNome(refeicao.nome) ? tipoPeloNome(nome) : refeicao.tipo });
          }}
          className={cn(campo, "min-w-[10rem] flex-1 text-base font-semibold text-brand-musgo")}
        />
        <input aria-label="Horário" placeholder="horário" value={refeicao.horario} disabled={!editavel} onChange={(e) => aoMudar({ ...refeicao, horario: e.target.value })} className={cn(campo, "w-20 font-mono")} />
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <input type="checkbox" checked={refeicao.opcional} disabled={!editavel} onChange={(e) => aoMudar({ ...refeicao, opcional: e.target.checked })} /> opcional
        </label>
        {kcal !== null && kcal > 0 ? <span className="font-mono text-xs text-muted-foreground">{kcal} kcal</span> : null}
        {editavel ? (
          <span className="ml-auto flex items-center gap-0.5">
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={indice === 0} onClick={() => aoMover(-1)} aria-label="Subir refeição (Alt ↑)">
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={indice === total - 1} onClick={() => aoMover(1)} aria-label="Descer refeição (Alt ↓)">
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-800" onClick={aoRemover} aria-label="Tirar refeição">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>

      <ul className="mt-3 grid gap-2">
        {refeicao.itens.map((item, i) => {
          const vinculado = item.alimentoId ? alimentosPorId[item.alimentoId] ?? null : null;
          return (
            <li key={item.id} className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2 rounded-xl px-1 py-1 hover:bg-white/60">
              <div className="pt-2.5">
                <Bolinha estado={item.legumes || vinculado ? "ok" : item.descricao ? "vazio" : "vazio"} />
              </div>
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-1">
                  <input
                    id={`item-${item.id}`}
                    aria-label="Alimento"
                    placeholder="alimento, como ela escreve"
                    value={item.descricao}
                    disabled={!editavel}
                    onChange={(e) => mudarItem(item.id, { descricao: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && i === refeicao.itens.length - 1) {
                        e.preventDefault();
                        adicionarItem();
                      }
                    }}
                    className={cn(campo, "min-w-[9rem] flex-1 font-semibold")}
                  />
                  <input aria-label="Medida caseira" placeholder="medida caseira" value={item.quantidade} disabled={!editavel} onChange={(e) => mudarItem(item.id, { quantidade: e.target.value })} className={cn(campo, "w-40")} />
                  <span className="inline-flex items-center">
                    <NumeroEditavel
                      aria-label="Gramas"
                      placeholder="g"
                      valor={item.gramas}
                      disabled={!editavel}
                      aoMudar={(n) => mudarItem(item.id, { gramas: n !== null && n > 0 ? n : null })}
                      className={cn(campo, "w-16 text-right font-mono tabular-nums")}
                    />
                    <span className="text-xs text-muted-foreground">g</span>
                  </span>
                  {editavel ? (
                    <button type="button" className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-800" onClick={() => aoMudar({ ...refeicao, itens: refeicao.itens.filter((x) => x.id !== item.id) })} aria-label={`Tirar ${item.descricao || "alimento"}`}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-2">
                  {editavel ? (
                    <BuscaDeAlimento
                      id={`busca-${item.id}`}
                      alimentos={alimentos}
                      medidas={medidas}
                      vinculado={vinculado}
                      sugestaoInicial={item.descricao}
                      aoEscolher={(a, m) => mudarItem(item.id, { alimentoId: a ? a.id : null, ...(m ? { quantidade: m.texto, gramas: m.gramas } : {}) })}
                    />
                  ) : vinculado ? (
                    <span className="text-[11px] text-muted-foreground">{vinculado.nome}</span>
                  ) : null}
                  <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Legumes e verduras: aciona o azeite de preparo no almoço e no jantar">
                    <input type="checkbox" checked={item.legumes} disabled={!editavel} onChange={(e) => mudarItem(item.id, { legumes: e.target.checked })} />
                    <Leaf className="h-3 w-3" aria-hidden="true" /> legumes e verduras
                  </label>
                  {item.origem === "acordo" ? <span className="rounded-full bg-brand-creme/70 px-2 text-[10px] font-bold text-brand-dourado">da consulta</span> : null}
                </div>
                {item.alternativas.map((alt) => (
                  <div key={alt.id} className="flex flex-wrap items-center gap-1 pl-2">
                    <span className="text-xs font-semibold text-muted-foreground">ou</span>
                    <input
                      aria-label="Substituição"
                      value={alt.descricao}
                      disabled={!editavel}
                      placeholder="substituição"
                      onChange={(e) => mudarItem(item.id, { alternativas: item.alternativas.map((a) => (a.id === alt.id ? { ...a, descricao: e.target.value } : a)) })}
                      className={cn(campo, "min-w-[8rem] flex-1 text-muted-foreground")}
                    />
                    <input
                      aria-label="Medida da substituição"
                      value={alt.quantidade}
                      disabled={!editavel}
                      placeholder="medida"
                      onChange={(e) => mudarItem(item.id, { alternativas: item.alternativas.map((a) => (a.id === alt.id ? { ...a, quantidade: e.target.value } : a)) })}
                      className={cn(campo, "w-36 text-muted-foreground")}
                    />
                    {editavel ? (
                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => mudarItem(item.id, { alternativas: item.alternativas.filter((a) => a.id !== alt.id) })} aria-label="Tirar substituição">
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground">fora do cálculo</span>
                  </div>
                ))}
                {editavel ? (
                  <div className="flex flex-wrap gap-2 pl-2">
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-brand-oliva hover:underline"
                      onClick={() => mudarItem(item.id, { alternativas: [...item.alternativas, { id: repo.novoId(), descricao: "", quantidade: "", gramas: null, alimentoId: null }] })}
                    >
                      + substituição
                    </button>
                    <input
                      aria-label="Observação do alimento"
                      value={item.observacao}
                      placeholder="observação (opcional)"
                      onChange={(e) => mudarItem(item.id, { observacao: e.target.value })}
                      className={cn(campo, "h-6 min-w-[10rem] flex-1 text-xs italic")}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {editavel ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-brand-oliva" onClick={() => adicionarItem()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> alimento
          </Button>
          <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-brand-oliva" onClick={() => adicionarItem({ descricao: "Legumes e verduras à vontade", legumes: true })}>
            <Leaf className="h-4 w-4" aria-hidden="true" /> legumes e verduras livres
          </Button>
          <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Azeite de preparo ({comAzeite ? "no cálculo" : "fora"})
            <select
              value={azeiteAuto ? "auto" : refeicao.azeitePreparo ? "sim" : "nao"}
              onChange={(e) => aoMudar({ ...refeicao, azeitePreparo: e.target.value === "auto" ? null : e.target.value === "sim" })}
              className="h-7 rounded-lg border border-brand-oliva/15 bg-white/60 px-1 text-[11px]"
            >
              <option value="auto">automático</option>
              <option value="sim">sempre</option>
              <option value="nao">nunca</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            tipo
            <select value={refeicao.tipo} onChange={(e) => aoMudar({ ...refeicao, tipo: e.target.value as TipoRefeicao })} className="h-7 rounded-lg border border-brand-oliva/15 bg-white/60 px-1 text-[11px]">
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {editavel || refeicao.observacao ? (
        <input
          aria-label="Observação da refeição"
          value={refeicao.observacao}
          disabled={!editavel}
          placeholder="observação da refeição (sai no documento)"
          onChange={(e) => aoMudar({ ...refeicao, observacao: e.target.value })}
          className={cn(campo, "mt-1 w-full text-xs italic")}
        />
      ) : null}
    </section>
  );
}
