// DINHEIRO DA COMANDA VAI PARA O CREDIÁRIO (29/09/2026, pedido do Lucas).
//
// Regra da casa desde 20/08 (fechamento do Kanban): nota física mora no caixa
// do crediário e é reconhecida como lucro no mês; a comanda é o que o banco
// confere (PIX, cartão). O Lançar Dia não seguia a regra: o dinheiro ficava na
// comanda, entrava no faturamento e nunca chegava ao crediário.
//
// Agora os dois caminhos fazem a mesma coisa. A parte em dinheiro sai da
// comanda (os itens são repartidos no valor que sobrou) e vira uma entrada no
// crediário ligada ao paciente e à comanda. A comanda MOSTRA essa parte, com a
// marca "no Crediário · fora do faturamento", para ninguém achar que sumiu.
import { ratearValores } from "./catalogoPrecificacao";

type ItemBase = { amount: number; description?: string; itemType: string };
type PagamentoBase = { method: string; amount: number };

const round2 = (valor: number) => Math.round(valor * 100) / 100;

const TIPO_SEM_DESCRICAO: Record<string, string> = {
  CONSULTA: "Consulta",
  RETORNO: "Retorno",
  SINAL: "Sinal",
  BIOIMPEDANCIA: "Bioimpedância",
  TRATAMENTO: "Tratamento",
  PSICOLOGA: "Psicóloga",
  NUTRICIONISTA: "Nutricionista",
  DESTRAVAR: "Destravar 360",
};

export function separarDinheiro<I extends ItemBase, P extends PagamentoBase>(itens: I[], pagamentos: P[]) {
  const dinheiro = round2(pagamentos.filter((p) => p.method === "DINHEIRO").reduce((soma, p) => soma + (p.amount || 0), 0));
  const totalDosItens = round2(itens.reduce((soma, item) => soma + (item.amount || 0), 0));
  const resto = round2(Math.max(0, totalDosItens - dinheiro));
  const pagamentosDaComanda = pagamentos.filter((p) => p.method !== "DINHEIRO" && p.amount > 0);
  const valores = resto > 0 ? ratearValores(itens.map((item) => item.amount), resto) : itens.map(() => 0);
  const itensDaComanda = itens.map((item, indice) => ({ ...item, amount: valores[indice] ?? 0 })).filter((item) => item.amount > 0);
  // Item sem descrição leva o tipo (27/10/2026): pago todo em espécie, esta
  // frase é a única coisa que diz ao CRM se foi consulta ou tratamento (pagou
  // depois → o cartão do "Não fechou" fecha sozinho).
  const resumoDosItens = itens
    .filter((item) => item.amount > 0)
    .map((item) => (item.description ?? "").trim() || TIPO_SEM_DESCRICAO[item.itemType] || "")
    .filter(Boolean)
    .join(" + ");
  return { dinheiro, resto, totalDosItens, itensDaComanda, pagamentosDaComanda, resumoDosItens, soDinheiro: dinheiro > 0 && resto <= 0 };
}

/** A chave da entrada no crediário. Presa à comanda: editar regrava, nunca duplica. */
export function chaveDoCrediario(saleId: string) {
  return `fcash-${saleId.replace(/^fsale-/, "")}`;
}

export function descricaoDoCrediario(paciente: string, resumo: string) {
  return `Comanda — ${paciente.trim()} (dinheiro)${resumo ? ` · ${resumo}` : ""}`.slice(0, 300);
}

export type DinheiroNoCrediario = { id: string; dia: string; valor: number; descricao: string; contactRef: string | null; saleRef: string | null };

/** A frase que aparece na comanda. */
export function fraseDoDinheiro(valor: number, formatar: (n: number) => string) {
  return `${formatar(valor)} em dinheiro · no Crediário, fora do faturamento`;
}

/** Entradas do dia que não estão presas a nenhuma comanda da lista (pagamento todo em dinheiro, ou fechamento do Kanban). */
export function dinheiroSemComanda(entradas: DinheiroNoCrediario[], idsDasComandas: string[]) {
  const ids = new Set(idsDasComandas);
  return entradas.filter((entrada) => !entrada.saleRef || !ids.has(entrada.saleRef));
}

/** O nome do paciente que está na descrição ("Comanda — Fulano (dinheiro)" ou "Fechamento — Fulano (dinheiro)"). */
export function pacienteDaDescricao(descricao: string) {
  const m = /^(?:Comanda|Fechamento)\s+—\s+(.+?)\s+\(dinheiro\)/.exec(descricao ?? "");
  return m ? m[1] : descricao;
}
