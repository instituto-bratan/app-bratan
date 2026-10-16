// MODELOS DE PLANO (16/10/2026).
//
// Um plano bom vira ponto de partida para o próximo paciente: "Salvar como
// modelo" guarda refeições, alimentos, substituições, listas e metas, sem nada
// da pessoa (nome, peso, consulta, entrega). "Começar de um modelo" cria o
// rascunho com ids novos; com as metas e o peso da pessoa, o "Ajustar às metas"
// acerta as quantidades em um clique.
import { novoPlano } from "./plano";
import type { BlocoPlano, Id, MetasPlano, MomentoISO, Plano, Refeicao } from "./tipos";

export type ModeloPlano = {
  id: Id;
  nome: string;
  descricao: string;
  refeicoes: Refeicao[];
  blocos: BlocoPlano[];
  observacoesFinais: string;
  metas: MetasPlano;
  /** Plano de onde saiu (só referência; apagar o plano não muda o modelo). */
  dePlanoId: Id | null;
  versao: number;
  criadoEm: MomentoISO;
  atualizadoEm: MomentoISO;
};

function copia<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Ids novos em tudo, para o rascunho nunca dividir item com o modelo. */
function renovarIds(refeicoes: Refeicao[], blocos: BlocoPlano[], novoId: () => Id): { refeicoes: Refeicao[]; blocos: BlocoPlano[] } {
  return {
    refeicoes: refeicoes.map((r) => ({
      ...r,
      id: novoId(),
      itens: r.itens.map((i) => ({ ...i, id: novoId(), origem: null, alternativas: i.alternativas.map((a) => ({ ...a, id: novoId() })) })),
    })),
    blocos: blocos.map((b) => ({ ...b, id: novoId(), itens: b.itens.map((x) => ({ ...x, id: novoId() })) })),
  };
}

export function modeloDoPlano(plano: Plano, dados: { nome: string; descricao: string }, novoId: () => Id, agora: MomentoISO): ModeloPlano {
  const { refeicoes, blocos } = renovarIds(copia(plano.refeicoes), copia(plano.blocos), novoId);
  return {
    id: novoId(),
    nome: dados.nome.trim() || "Modelo sem nome",
    descricao: dados.descricao.trim(),
    refeicoes,
    blocos,
    observacoesFinais: plano.observacoesFinais,
    metas: { ...plano.metas },
    dePlanoId: plano.id,
    versao: 0,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

export type PlanoDoModeloParams = {
  modelo: ModeloPlano;
  pessoa: { id: Id; nome: string; nomeDocumento: string };
  mesRef: string;
  numero: number;
  atendimentoId: Id | null;
  /** Peso da pessoa (último plano ou bioimpedância): sem ele, a meta em g/kg não vira gramas. */
  pesoReferencia: Plano["pesoReferencia"];
  novoId: () => Id;
  agora: MomentoISO;
};

export function planoDoModelo(p: PlanoDoModeloParams): Plano {
  const base = novoPlano({ pessoa: p.pessoa, mesRef: p.mesRef, numero: p.numero, atendimentoId: p.atendimentoId, novoId: p.novoId, agora: p.agora, blocos: [] });
  const { refeicoes, blocos } = renovarIds(copia(p.modelo.refeicoes), copia(p.modelo.blocos), p.novoId);
  return {
    ...base,
    origem: { tipo: "modelo", deId: p.modelo.id },
    refeicoes,
    blocos,
    observacoesFinais: p.modelo.observacoesFinais,
    metas: { ...p.modelo.metas },
    pesoReferencia: p.pesoReferencia,
  };
}

/** Resumo de uma linha para a lista de modelos: "5 refeições · 1600 kcal · proteína 1,6 g/kg". */
export function resumoDoModelo(m: ModeloPlano): string {
  const refeicoes = m.refeicoes.filter((r) => r.itens.some((i) => i.descricao.trim())).length;
  const partes = [`${refeicoes} refeiç${refeicoes === 1 ? "ão" : "ões"}`];
  if (m.metas.kcal) partes.push(`${m.metas.kcal} kcal`);
  if (m.metas.ptnGkg) partes.push(`proteína ${String(m.metas.ptnGkg).replace(".", ",")} g/kg`);
  return partes.join(" · ");
}
