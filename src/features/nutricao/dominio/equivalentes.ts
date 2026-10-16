// SUBSTITUIÇÕES AUTOMÁTICAS (16/10/2026).
//
// Áudio da Dra. Géssica (28/09/2026): "ali onde eu coloquei arroz pro
// paciente, eu quero que você já calcule pra mim o proporcional de batata,
// enfim, de outros carboidratos e já faça uma lista com as porções
// equivalentes". Resposta dela no mesmo dia: a equivalência é "pelo
// carboidrato". Para as carnes, a conta natural é pela proteína; cada grupo
// diz por qual nutriente se iguala, e ela troca na Biblioteca.
//
// As substituições aparecem no documento e continuam fora do cálculo (regra
// dela). As que o app cria levam a marca `auto`: gerar de novo troca só essas
// e nunca apaga uma que ela escreveu.
import { medidaPreferida, type Memoria } from "./memoria";
import { arredondarPasso, escreverQuantidade, gramasRedondos } from "./quantidade";
import type { Alimento, Alternativa, Id, ItemRefeicao, MomentoISO } from "./tipos";

export type BaseDaEquivalencia = "cho" | "ptn" | "lip";

export type GrupoSubstituicao = {
  id: Id;
  titulo: string;
  base: BaseDaEquivalencia;
  /** Nome como sai no documento + alimento da tabela. */
  alimentos: { alimentoId: Id; nome: string }[];
  versao: number;
  atualizadoEm: MomentoISO;
};

export const ROTULO_DA_BASE: Record<BaseDaEquivalencia, string> = { cho: "carboidrato", ptn: "proteína", lip: "gordura" };

const CRIADO_EM = "2026-10-16T00:00:00.000Z";

const grupo = (id: string, titulo: string, base: BaseDaEquivalencia, alimentos: [string, string][]): GrupoSubstituicao => ({
  id,
  titulo,
  base,
  alimentos: alimentos.map(([alimentoId, nome]) => ({ alimentoId, nome })),
  versao: 1,
  atualizadoEm: CRIADO_EM,
});

/** Grupos de partida (TACO 4ª ed.). Ela edita, tira e acrescenta na Biblioteca › Substituições. */
export const GRUPOS_INICIAIS: GrupoSubstituicao[] = [
  grupo("subst-carbo-refeicao", "Carboidratos do almoço e do jantar", "cho", [
    ["taco-3", "Arroz branco"],
    ["taco-1", "Arroz integral"],
    ["taco-91", "Batata inglesa cozida"],
    ["taco-88", "Batata-doce cozida"],
    ["taco-129", "Mandioca cozida"],
    ["taco-86", "Mandioquinha cozida"],
    ["taco-533", "Cuscuz de milho"],
  ]),
  grupo("subst-feijoes", "Feijões e leguminosas", "cho", [
    ["taco-561", "Feijão carioca"],
    ["taco-567", "Feijão preto"],
    ["taco-577", "Lentilha"],
  ]),
  grupo("subst-proteinas", "Proteínas do almoço e do jantar", "ptn", [
    ["taco-377", "Patinho grelhado"],
    ["taco-410", "Peito de frango grelhado"],
    ["taco-301", "Filé de peixe assado"],
    ["taco-317", "Salmão grelhado"],
    ["taco-326", "Carne moída"],
    ["taco-432", "Lombo suíno assado"],
    ["taco-488", "Ovo cozido"],
  ]),
  grupo("subst-paes", "Pães e cereais do café e dos lanches", "cho", [
    ["taco-53", "Pão francês"],
    ["taco-52", "Pão de forma integral"],
    ["taco-7", "Aveia em flocos"],
    ["taco-533", "Cuscuz de milho"],
    ["taco-63", "Torrada"],
  ]),
  grupo("subst-laticinios", "Leites, iogurtes e queijos", "ptn", [
    ["taco-448", "Iogurte natural"],
    ["taco-449", "Iogurte natural desnatado"],
    ["taco-457", "Leite desnatado"],
    ["taco-461", "Queijo minas frescal"],
    ["taco-469", "Ricota"],
  ]),
];

/** Grupos em que o alimento está (o primeiro é o que o botão usa). */
export function gruposDoAlimento(alimentoId: Id | null, grupos: GrupoSubstituicao[]): GrupoSubstituicao[] {
  if (!alimentoId) return [];
  return grupos.filter((g) => g.alimentos.some((a) => a.alimentoId === alimentoId));
}

function porGrama(alimento: Alimento, base: BaseDaEquivalencia): number {
  return (alimento.por100g[base] ?? 0) / 100;
}

/**
 * Para o alimento do item (com gramas), as porções dos outros alimentos do
 * grupo com a mesma quantidade do nutriente-base. Escreve no jeito dela quando
 * já conhece a medida caseira daquele alimento; senão, em gramas.
 */
export function gerarSubstituicoes(
  item: Pick<ItemRefeicao, "alimentoId" | "gramas" | "alternativas">,
  grupo: GrupoSubstituicao,
  alimentos: Record<Id, Alimento>,
  memoria: Memoria,
  novoId: () => Id,
): { alternativas: Alternativa[]; puladas: string[] } {
  const origem = item.alimentoId ? alimentos[item.alimentoId] : undefined;
  if (!origem || !item.gramas || item.gramas <= 0) return { alternativas: item.alternativas, puladas: [] };
  const alvo = item.gramas * porGrama(origem, grupo.base);
  if (!(alvo > 0)) return { alternativas: item.alternativas, puladas: [] };

  // As dela ficam; as automáticas anteriores saem e são refeitas.
  const dela = item.alternativas.filter((a) => !a.auto);
  const jaTem = new Set(dela.map((a) => a.alimentoId).filter(Boolean));
  const puladas: string[] = [];
  const novas: Alternativa[] = [];
  for (const membro of grupo.alimentos) {
    if (membro.alimentoId === item.alimentoId || jaTem.has(membro.alimentoId)) continue;
    const a = alimentos[membro.alimentoId];
    const pg = a ? porGrama(a, grupo.base) : 0;
    if (!a || !(pg > 0)) {
      puladas.push(`${membro.nome}: sem ${ROTULO_DA_BASE[grupo.base]} na tabela`);
      continue;
    }
    const gramasExatos = alvo / pg;
    // Porção fora do razoável não vira sugestão: mais de 4 vezes os gramas do original,
    // ou o dobro das calorias (6 ovos no lugar de 120 g de frango têm a mesma proteína e o dobro da energia).
    const kcalOrigem = item.gramas * ((origem.por100g.kcal ?? 0) / 100);
    const kcalSubst = gramasExatos * ((a.por100g.kcal ?? 0) / 100);
    const energiaFora = kcalOrigem > 0 && (kcalSubst > kcalOrigem * 2 || kcalSubst < kcalOrigem / 2);
    if (gramasExatos > item.gramas * 4 || gramasExatos < item.gramas / 4 || energiaFora) {
      puladas.push(`${membro.nome}: a porção equivalente ficaria ${Math.round(gramasExatos)} g${energiaFora ? ` (${Math.round(kcalSubst)} kcal contra ${Math.round(kcalOrigem)})` : ""}`);
      continue;
    }
    const medida = medidaPreferida(memoria, membro.alimentoId);
    let quantidade = "";
    let gramas: number;
    if (medida && medida.gramasPorUnidade > 0) {
      const numero = arredondarPasso(gramasExatos / medida.gramasPorUnidade, 0.5);
      quantidade = escreverQuantidade(numero, medida.unidade);
      gramas = Math.round(numero * medida.gramasPorUnidade);
    } else {
      gramas = gramasRedondos(gramasExatos);
    }
    novas.push({ id: novoId(), descricao: membro.nome, quantidade, gramas, alimentoId: membro.alimentoId, auto: true });
  }
  return { alternativas: [...dela, ...novas], puladas };
}
