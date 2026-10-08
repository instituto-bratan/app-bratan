// AS CONTAS DA FILA DO DIA, PELA JANELA DE DATAS (08/10/2026, revisão das
// etapas 2 e 3 do redesenho).
//
// A Fila do dia das contas (buildFilaFinanceira) olha as vencidas dos últimos
// 90 dias e as que se pagam nos próximos 7 — e, com o dia de pagar, a conta de
// sábado, domingo ou feriado entra no dia útil ANTERIOR. Só que a busca do banco
// é por ANO (listRemoteFinExpenses(ano)): a casca e o Início buscavam só o ano
// de hoje e Contas a pagar, o ano do mês escolhido. Na virada do ano a fila se
// perdia: em 31/12/2026 a conta de 02/01/2027 (sábado), que se paga nesse dia,
// não vinha; em 04/01/2027 as vencidas de dezembro sumiam do Início e da casca,
// mas não de Contas a pagar. Agora os três montam a fila com os ANOS DA JANELA
// (de hoje − 90 a hoje + 14 dias), nas MESMAS chaves de cache por ano
// (["fin-expenses", ano]), e Contas a pagar completa a sua lista com o ano que
// faltar, qualquer que seja o mês do seletor.
//
// Módulo puro (testado em tests/etapa2-3-revisao.test.mjs).
import type { FinExpense } from "./financeiroData";

/** A janela que a fila olha: vencidas até 90 dias; 7 dias à frente mais a folga do dia de pagar (feriado + fim de semana). */
export const JANELA_DA_FILA = { diasAntes: 90, diasDepois: 14 } as const;

function somaDias(iso: string, dias: number) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/**
 * Os anos que a fila de hoje precisa: só o ano de hoje quase sempre; também o
 * seguinte a partir de 18/12 (o que vence no começo de janeiro); também o
 * anterior até o fim de março (as vencidas de dezembro, dentro dos 90 dias).
 */
export function anosDaFila(hoje: string): number[] {
  const de = Number(somaDias(hoje, -JANELA_DA_FILA.diasAntes).slice(0, 4));
  const ate = Number(somaDias(hoje, JANELA_DA_FILA.diasDepois).slice(0, 4));
  const anos: number[] = [];
  for (let ano = de; ano <= ate; ano += 1) anos.push(ano);
  return anos;
}

/** Junta as listas de cada ano numa só, sem repetir conta (a mesma conta em duas listas vale uma vez). */
export function juntarContas(listas: ReadonlyArray<readonly FinExpense[] | undefined | null>): FinExpense[] {
  const vistas = new Set<string>();
  const saida: FinExpense[] = [];
  for (const lista of listas) {
    for (const conta of lista ?? []) {
      if (vistas.has(conta.id)) continue;
      vistas.add(conta.id);
      saida.push(conta);
    }
  }
  return saida;
}

/**
 * A lista da fila de Contas a pagar: as contas da TELA (os anos que o seletor de
 * mês já carregou, com as mudanças feitas agora mesmo) mais as dos anos da janela
 * que a tela não carregou. A conta de um ano que a tela tem vale como a tela
 * mostra — inclusive quando foi excluída ali e o banco ainda não respondeu.
 */
export function contasDaFilaDaTela(entrada: { daTela: readonly FinExpense[]; anosDaTela: readonly number[]; deFora: readonly FinExpense[] }): FinExpense[] {
  const anos = new Set(entrada.anosDaTela);
  const deFora = entrada.deFora.filter((conta) => !anos.has(Number(String(conta.dueDate ?? "").slice(0, 4))));
  return juntarContas([entrada.daTela, deFora]);
}
