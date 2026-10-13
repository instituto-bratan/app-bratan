// AS FRASES DAS TELAS DE AJUSTES — redesenho Papel & Musgo, etapa 4 (08/10/2026).
//
// O Lucas rejeita número solto: no cabeçalho de cada tela de Ajustes o número
// vem explicado numa frase ("10 pessoas ativas; 2 ainda sem login"). As contas
// que montam essas frases são DERIVADAS do que a tela já carregava (nada novo é
// gravado) e moram aqui, sem React, para os testes de node conferirem
// (tests/etapa4-ajustes.test.mjs).

/** "1 pessoa" · "3 pessoas" (o plural simples das frases). */
export function contagem(n: number, singular: string, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "Uma", "Duas"… até dez, para começar a frase do cabeçalho. */
export function porExtenso(n: number, genero: "f" | "m" = "f"): string {
  const femininos = ["Nenhuma", "Uma", "Duas", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];
  const masculinos = ["Nenhum", "Um", "Dois", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];
  const lista = genero === "f" ? femininos : masculinos;
  return n >= 0 && n <= 10 && Number.isInteger(n) ? lista[n] : String(n);
}

/** Primeira letra em maiúscula. */
export function maiuscula(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Quantas pessoas têm ao menos uma exceção de acesso gravada (Acessos). */
export function pessoasComExcecao(lista: { acessos?: Record<string, string> | null }[]) {
  return lista.filter((pessoa) => Object.keys(pessoa.acessos ?? {}).length > 0).length;
}

/**
 * "1 exceção" · "3 exceções" — a mesma conta que a lista de Acessos já mostrava.
 * (08/10/2026: o plural antigo colava "ões" depois de "exceção" e saía
 * "3 exceçãoões"; o teste da etapa 4 pegou.)
 */
export function textoDasExcecoes(n: number) {
  if (!n) return "padrão do cargo";
  return n === 1 ? "1 exceção" : `${n} exceções`;
}

/** O que a etiqueta do sinal de Segurança diz e em que tom (a palavra continua a mesma de antes). */
export function etiquetaDoSinal(level: "ok" | "attention" | "critical"): { palavra: "ok" | "atenção"; tom: "ok" | "atencao" | "erro" } {
  if (level === "ok") return { palavra: "ok", tom: "ok" };
  return { palavra: "atenção", tom: level === "critical" ? "erro" : "atencao" };
}

/** Itens do Cofre de compliance: `false` = pendente, `true` = em dia, `null` = só informação. */
export function pendentesDoCofre(estados: (boolean | null)[]) {
  return estados.filter((estado) => estado === false).length;
}

/** "08/10" a partir de um ISO "2026-10-08…". */
export function diaCurto(iso: string | null | undefined) {
  return iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

/** "08/10/2026" a partir de um ISO "2026-10-08…" (sem fuso: a data já é a local). */
export function diaCompleto(iso: string | null | undefined) {
  return iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
}

/** Nome sem os colchetes dos cadastros-semente ("[CEO]" → "CEO"), só para a inicial do avatar. */
export function nomeParaInicial(nome: string) {
  return nome.replace(/[[\]]/g, "").trim() || nome;
}
