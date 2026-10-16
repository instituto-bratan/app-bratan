// UMA REFEIÇÃO NO EDITOR DO PLANO (28/09/2026).
//
// Edição direta, sem formulário: nome, horário, emoji, opcional; cada alimento
// com o texto dela, a medida caseira, os gramas e as substituições. Enter no
// último alimento cria o próximo. Alt + ↑/↓ reordena a refeição.
//
// 16/10/2026: a linha rápida ("4 colheres de sopa de arroz" + Enter), os gramas
// que acompanham a medida ("4 colheres" → "5 colheres"), o cadeado que deixa a
// quantidade fora do ajuste às metas e as substituições automáticas.
import { useState } from "react";
import { ArrowDown, ArrowUp, Leaf, Lock, LockOpen, Plus, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/features/crm/comercialVisual";
import { cn } from "@/lib/utils";
import { azeiteSeAplica } from "../dominio/calculo";
import { gerarSubstituicoes, gruposDoAlimento, ROTULO_DA_BASE, type GrupoSubstituicao } from "../dominio/equivalentes";
import { medidaConhecida, type Memoria } from "../dominio/memoria";
import { novoItem, tipoPeloNome } from "../dominio/plano";
import { gramasAoTrocarMedida, lerQuantidade } from "../dominio/quantidade";
import type { Alimento, ItemRefeicao, MedidaCaseira, Refeicao, TipoRefeicao } from "../dominio/tipos";
import * as repo from "../store/repositorio";
import { Bolinha, CAIXA_CAMPO, CAIXA_DISCRETA, NumeroEditavel } from "../ui/basicos";
import { BuscaDeAlimento } from "./BuscaDeAlimento";
import { LinhaRapida } from "./LinhaRapida";

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
  memoria: Memoria;
  grupos: GrupoSubstituicao[];
  editavel: boolean;
  kcal: number | null;
  aoMudar: (r: Refeicao) => void;
  aoMover: (delta: number) => void;
  aoRemover: () => void;
};

// Campo discreto: o texto dela parece texto, e só ganha contorno ao passar o mouse ou focar (Papel & Musgo, 08/10/2026).
const campo = cn(CAIXA_DISCRETA, "h-8 px-2 text-sm focus-visible:bg-folha");

export function EditorDeRefeicao({ refeicao, indice, total, alimentosPorId, alimentos, medidas, memoria, grupos, editavel, kcal, aoMudar, aoMover, aoRemover }: Props) {
  const [notaSubst, setNotaSubst] = useState<Record<string, string>>({});
  const mudarItem = (id: string, parcial: Partial<ItemRefeicao>) => aoMudar({ ...refeicao, itens: refeicao.itens.map((i) => (i.id === id ? { ...i, ...parcial } : i)) });
  const adicionarItem = (parcial: Partial<ItemRefeicao> = {}, focar = true) => {
    const item = novoItem(repo.novoId, parcial);
    aoMudar({ ...refeicao, itens: [...refeicao.itens, item] });
    if (focar) window.setTimeout(() => document.getElementById(`item-${item.id}`)?.focus(), 30);
  };
  /** A medida mudou ("4 colheres" → "5 colheres"): os gramas vão junto. */
  const mudarMedida = (item: ItemRefeicao, quantidade: string) => {
    const gramas = gramasAoTrocarMedida(item, quantidade);
    mudarItem(item.id, gramas !== null ? { quantidade, gramas } : { quantidade });
  };
  /** Vinculou o alimento da tabela e a medida já é conhecida: os gramas aparecem sozinhos. */
  const gramasPelaMedida = (alimentoId: string, quantidade: string): number | null => {
    const q = lerQuantidade(quantidade);
    if (!q || q.tipo !== "caseira") return q && q.tipo === "gramas" ? Math.round(q.numero) : null;
    const m = medidaConhecida(memoria, alimentoId, q.unidade);
    return m ? Math.round(q.numero * m.gramasPorUnidade) : null;
  };
  const substituir = (item: ItemRefeicao, grupo: GrupoSubstituicao) => {
    const r = gerarSubstituicoes(item, grupo, alimentosPorId, memoria, repo.novoId);
    mudarItem(item.id, { alternativas: r.alternativas });
    const feitas = r.alternativas.filter((a) => a.auto).length;
    setNotaSubst((n) => ({
      ...n,
      [item.id]: `${feitas} substituição(ões) pelo ${ROTULO_DA_BASE[grupo.base]} (${grupo.titulo})${r.puladas.length ? `. Fora: ${r.puladas.join("; ")}` : ""}.`,
    }));
  };
  const azeiteAuto = refeicao.azeitePreparo === null;
  const comAzeite = azeiteSeAplica(refeicao);

  return (
    <section
      id={`refeicao-${refeicao.id}`}
      className="rounded-bloco border border-fio bg-folha p-4"
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
          className={`${CAIXA_CAMPO} h-9 px-1 text-base`}
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
          className={cn(campo, "min-w-[10rem] flex-1 text-base font-semibold text-musgo")}
        />
        <input aria-label="Horário" placeholder="horário" value={refeicao.horario} disabled={!editavel} onChange={(e) => aoMudar({ ...refeicao, horario: e.target.value })} className={cn(campo, "w-20 tabular-nums")} />
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-tinta-2">
          <input type="checkbox" checked={refeicao.opcional} disabled={!editavel} onChange={(e) => aoMudar({ ...refeicao, opcional: e.target.checked })} /> opcional
        </label>
        {kcal !== null && kcal > 0 ? <span className="tabular-nums text-xs text-tinta-2">{kcal} kcal</span> : null}
        {editavel ? (
          <span className="ml-auto flex items-center gap-0.5">
            <button type="button" className="rounded p-1 text-tinta-2 hover:bg-saber disabled:opacity-30" disabled={indice === 0} onClick={() => aoMover(-1)} aria-label="Subir refeição (Alt ↑)">
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="rounded p-1 text-tinta-2 hover:bg-saber disabled:opacity-30" disabled={indice === total - 1} onClick={() => aoMover(1)} aria-label="Descer refeição (Alt ↓)">
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="rounded p-1 text-tinta-2 hover:bg-erro-claro hover:text-erro" onClick={aoRemover} aria-label="Tirar refeição">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>

      <ul className="mt-3 grid gap-2">
        {refeicao.itens.map((item, i) => {
          const vinculado = item.alimentoId ? alimentosPorId[item.alimentoId] ?? null : null;
          return (
            <li key={item.id} className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2 rounded-bloco px-1 py-1 hover:bg-papel">
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
                  <input aria-label="Medida caseira" placeholder="medida caseira" value={item.quantidade} disabled={!editavel} onChange={(e) => mudarMedida(item, e.target.value)} className={cn(campo, "w-40")} />
                  <span className="inline-flex items-center">
                    <NumeroEditavel
                      aria-label="Gramas"
                      placeholder="g"
                      valor={item.gramas}
                      disabled={!editavel}
                      aoMudar={(n) => mudarItem(item.id, { gramas: n !== null && n > 0 ? n : null })}
                      className={cn(campo, "w-16 text-right tabular-nums")}
                    />
                    <span className="text-xs text-tinta-2">g</span>
                  </span>
                  {editavel && !item.legumes ? (
                    <button
                      type="button"
                      className={cn("rounded p-1 hover:bg-saber", item.travado ? "text-ouro" : "text-tinta-2 opacity-60 hover:opacity-100")}
                      onClick={() => mudarItem(item.id, { travado: !item.travado })}
                      aria-pressed={Boolean(item.travado)}
                      aria-label={item.travado ? `Destravar ${item.descricao || "alimento"}: o ajuste às metas pode mudar a quantidade` : `Travar ${item.descricao || "alimento"}: o ajuste às metas não muda a quantidade`}
                      title={item.travado ? "Quantidade travada: o ajuste às metas não mexe" : "Travar a quantidade no ajuste às metas"}
                    >
                      {item.travado ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />}
                    </button>
                  ) : null}
                  {editavel ? (
                    <button type="button" className="rounded p-1 text-tinta-2 hover:bg-erro-claro hover:text-erro" onClick={() => aoMudar({ ...refeicao, itens: refeicao.itens.filter((x) => x.id !== item.id) })} aria-label={`Tirar ${item.descricao || "alimento"}`}>
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
                      aoEscolher={(a, m) => {
                        if (m) return mudarItem(item.id, { alimentoId: a ? a.id : null, quantidade: m.texto, gramas: m.gramas });
                        const gramas = a && !item.gramas ? gramasPelaMedida(a.id, item.quantidade) : null;
                        mudarItem(item.id, { alimentoId: a ? a.id : null, ...(gramas ? { gramas } : {}) });
                      }}
                    />
                  ) : vinculado ? (
                    <span className="text-xs text-tinta-2">{vinculado.nome}</span>
                  ) : null}
                  <label className="inline-flex items-center gap-1 text-xs text-tinta-2" title="Legumes e verduras: aciona o azeite de preparo no almoço e no jantar">
                    <input type="checkbox" checked={item.legumes} disabled={!editavel} onChange={(e) => mudarItem(item.id, { legumes: e.target.checked })} />
                    <Leaf className="h-3 w-3" aria-hidden="true" /> legumes e verduras
                  </label>
                  {item.origem === "acordo" ? <span className="rounded-controle bg-ouro-claro px-2 text-xs font-bold leading-5 text-ouro">da consulta</span> : null}
                </div>
                {item.alternativas.map((alt) => (
                  <div key={alt.id} className="flex flex-wrap items-center gap-1 pl-2">
                    <span className="text-xs font-semibold text-tinta-2">ou</span>
                    <input
                      aria-label="Substituição"
                      value={alt.descricao}
                      disabled={!editavel}
                      placeholder="substituição"
                      onChange={(e) => mudarItem(item.id, { alternativas: item.alternativas.map((a) => (a.id === alt.id ? { ...a, descricao: e.target.value } : a)) })}
                      className={cn(campo, "min-w-[8rem] flex-1 text-tinta-2")}
                    />
                    <input
                      aria-label="Medida da substituição"
                      value={alt.quantidade}
                      disabled={!editavel}
                      placeholder="medida"
                      onChange={(e) => mudarItem(item.id, { alternativas: item.alternativas.map((a) => (a.id === alt.id ? { ...a, quantidade: e.target.value } : a)) })}
                      className={cn(campo, "w-36 text-tinta-2")}
                    />
                    {alt.gramas ? <span className="tabular-nums text-xs text-tinta-2">{alt.gramas} g</span> : null}
                    {editavel ? (
                      <button type="button" className="rounded p-1 text-tinta-2 hover:bg-saber" onClick={() => mudarItem(item.id, { alternativas: item.alternativas.filter((a) => a.id !== alt.id) })} aria-label="Tirar substituição">
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ) : null}
                    <span className="text-xs text-tinta-2">{alt.auto ? "calculada · " : ""}fora do cálculo</span>
                  </div>
                ))}
                {notaSubst[item.id] ? <p className="pl-2 text-xs text-tinta-2">{notaSubst[item.id]}</p> : null}
                {editavel ? (
                  <div className="flex flex-wrap gap-2 pl-2">
                    <button
                      type="button"
                      className="text-xs font-semibold text-musgo hover:underline"
                      onClick={() => mudarItem(item.id, { alternativas: [...item.alternativas, { id: repo.novoId(), descricao: "", quantidade: "", gramas: null, alimentoId: null }] })}
                    >
                      + substituição
                    </button>
                    {(() => {
                      const doAlimento = gruposDoAlimento(item.alimentoId, grupos);
                      if (!doAlimento.length || !item.gramas) return null;
                      return doAlimento.slice(0, 2).map((g) => (
                        <button key={g.id} type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-musgo hover:underline" onClick={() => substituir(item, g)} title={`Porções com o mesmo ${ROTULO_DA_BASE[g.base]}: ${g.alimentos.map((x) => x.nome).join(", ")}`}>
                          <Wand2 className="h-3 w-3" aria-hidden="true" /> substituições pelo {ROTULO_DA_BASE[g.base]}
                          {doAlimento.length > 1 ? ` (${g.titulo.toLowerCase()})` : ""}
                        </button>
                      ));
                    })()}
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
        <div className="mt-2">
          <LinhaRapida id={`linha-${refeicao.id}`} alimentos={alimentos} memoria={memoria} aoAdicionar={(parcial) => adicionarItem(parcial, false)} />
        </div>
      ) : null}
      {editavel ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-tinta-2" onClick={() => adicionarItem()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> alimento
          </Button>
          <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-tinta-2" onClick={() => adicionarItem({ descricao: "Legumes e verduras à vontade", legumes: true })}>
            <Leaf className="h-4 w-4" aria-hidden="true" /> legumes e verduras livres
          </Button>
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-tinta-2">
            Azeite de preparo ({comAzeite ? "no cálculo" : "fora"})
            <select
              value={azeiteAuto ? "auto" : refeicao.azeitePreparo ? "sim" : "nao"}
              onChange={(e) => aoMudar({ ...refeicao, azeitePreparo: e.target.value === "auto" ? null : e.target.value === "sim" })}
              className="h-7 rounded-controle border border-borda-campo bg-folha text-tinta px-1 text-xs"
            >
              <option value="auto">automático</option>
              <option value="sim">sempre</option>
              <option value="nao">nunca</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-tinta-2">
            tipo
            <select value={refeicao.tipo} onChange={(e) => aoMudar({ ...refeicao, tipo: e.target.value as TipoRefeicao })} className="h-7 rounded-controle border border-borda-campo bg-folha text-tinta px-1 text-xs">
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
