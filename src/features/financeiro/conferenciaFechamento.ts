// CONFERÊNCIA DO FECHAMENTO — nasceu de um furo real (18/08/2026).
//
// O Lucas viu no extrato que o adiantamento do dia 13/08 (R$ 20.309,14) era
// maior que o cartão lançado no dia 12/08 (R$ 14.702,00) e desconfiou de um
// paciente da agenda do Dr. Daniel que não aparecia no app. Estava certo:
// GABRIEL PIRES MORANGO fechou R$ 13.808,00 no Kanban em 12/08 e não virou
// comanda, nem comprovante, nem crediário. Ficou invisível para o financeiro.
//
// A lição: FECHAR no Kanban e LANÇAR o dinheiro são dois atos, e nada avisava
// quando o segundo não acontecia. Este módulo é esse aviso — puro, sem React,
// para poder ser testado.
import type { CrmDeal, CrmState } from "@/features/crm/crmData";
import type { PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import type { FinSale } from "./financeiroData";

export type PendenciaFechamento = {
  chave: "FECHOU_SEM_COMANDA" | "COMANDA_MENOR_QUE_VENDA" | "VEIO_DA_PLANILHA";
  titulo: string;
  porque: string;
  oQueFazer: string;
  gravidade: "ALTA" | "MEDIA" | "BAIXA";
  pessoas: { contactId: string; nome: string; detalhe: string; valor: number }[];
};

/**
 * Negociação fechada no app tem id "deal-...". As que vieram da importação da
 * planilha começam com "imp-" e trazem valores de antes do app existir — o
 * dinheiro delas entrou por fora, então acusar como furo só geraria alarme
 * falso. Ficam separadas, em gravidade baixa.
 */
function veioDaPlanilha(deal: CrmDeal) {
  return deal.id.startsWith("imp-");
}

const GANHOU = new Set(["WON_FULL", "WON_PARTIAL"]);

function brl(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function diaBR(iso: string) {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

/**
 * O que o paciente já tem de dinheiro registrado: comandas (qualquer forma) e
 * crediário em aberto (lembrete de pagamento). Os dois contam, porque quem
 * fecha e combina pagar dia 21 não está com dinheiro faltando — está com
 * dinheiro agendado. Foi o caso da Fabiana (R$ 8.831 para 21/08): sem essa
 * regra ela apareceria como furo do mesmo tamanho do Gabriel, e não é.
 */
function registradoDoPaciente(contactId: string, sales: FinSale[], lembretes: PagamentoLembrete[]) {
  let comandas = 0;
  for (const sale of sales) {
    if (sale.crmContactRef !== contactId) continue;
    for (const payment of sale.payments) comandas += payment.amount || 0;
  }
  let crediario = 0;
  for (const lembrete of lembretes) {
    if (lembrete.deletedAt) continue;
    if (lembrete.crmContactRef !== contactId) continue;
    if (lembrete.status !== "aberto") continue;
    crediario += lembrete.valorPendente || 0;
  }
  return { comandas, crediario, total: comandas + crediario };
}

/**
 * Confere, para as negociações ganhas numa janela de dias, se o dinheiro
 * apareceu em algum lugar do financeiro.
 *
 * @param diasParaTras quantos dias olhar para trás a partir de hoje (padrão 45).
 */
export function conferenciaFechamentos(
  state: CrmState,
  sales: FinSale[],
  lembretes: PagamentoLembrete[],
  todayISO: string,
  diasParaTras = 45,
): PendenciaFechamento[] {
  const limite = new Date(`${todayISO}T12:00:00`);
  limite.setDate(limite.getDate() - diasParaTras);
  const desde = limite.toISOString().slice(0, 10);

  const nomePor = new Map(state.contacts.map((contact) => [contact.id, contact.fullName]));

  const semNada: PendenciaFechamento["pessoas"] = [];
  const parcial: PendenciaFechamento["pessoas"] = [];
  const daPlanilha: PendenciaFechamento["pessoas"] = [];

  for (const deal of state.deals) {
    if (!GANHOU.has(deal.status)) continue;
    const fechou = (deal.closedAt || "").slice(0, 10);
    if (!fechou || fechou < desde || fechou > todayISO) continue;
    const vendido = deal.soldAmount || 0;
    if (vendido <= 0) continue;

    const nome = nomePor.get(deal.contactId) ?? deal.title;
    const registrado = registradoDoPaciente(deal.contactId, sales, lembretes);
    // Sobra de até R$ 1 é arredondamento, não furo.
    const falta = Math.round((vendido - registrado.total) * 100) / 100;
    if (falta <= 1) continue;

    const pessoa = {
      contactId: deal.contactId,
      nome,
      detalhe:
        registrado.total > 0
          ? `fechou ${brl(vendido)} em ${diaBR(fechou)} · registrado ${brl(registrado.total)} · falta ${brl(falta)}`
          : `fechou ${brl(vendido)} em ${diaBR(fechou)} · nada lançado`,
      valor: falta,
    };
    if (veioDaPlanilha(deal)) daPlanilha.push(pessoa);
    else if (registrado.total === 0) semNada.push(pessoa);
    else parcial.push(pessoa);
  }

  const ordenar = (lista: PendenciaFechamento["pessoas"]) => lista.sort((a, b) => b.valor - a.valor);
  const soma = (lista: PendenciaFechamento["pessoas"]) =>
    Math.round(lista.reduce((total, pessoa) => total + pessoa.valor, 0) * 100) / 100;

  const pendencias: PendenciaFechamento[] = [];
  if (semNada.length) {
    pendencias.push({
      chave: "FECHOU_SEM_COMANDA",
      titulo: `${semNada.length} fechamento(s) sem nenhum lançamento — ${brl(soma(semNada))}`,
      porque:
        "A venda foi dada como ganha no Kanban e não existe comanda, comprovante nem crediário. Para o financeiro, esse dinheiro não existe: não entra no faturamento, não gera nota e ninguém cobra o que ficou em aberto.",
      oQueFazer:
        "Abrir a ficha, ver como o paciente pagou e lançar o fechamento (comanda + comprovante). Se ainda não pagou, criar o lembrete com a data combinada.",
      gravidade: "ALTA",
      pessoas: ordenar(semNada),
    });
  }
  if (parcial.length) {
    pendencias.push({
      chave: "COMANDA_MENOR_QUE_VENDA",
      titulo: `${parcial.length} venda(s) com dinheiro faltando — ${brl(soma(parcial))}`,
      porque:
        "O que foi lançado (comanda + crediário em aberto) é menor que o valor fechado. Ou a venda foi digitada maior do que o combinado, ou falta lançar uma parte do pagamento.",
      oQueFazer: "Comparar o valor fechado com o que o paciente pagou e acertar o lado que estiver errado.",
      gravidade: "MEDIA",
      pessoas: ordenar(parcial),
    });
  }
  if (daPlanilha.length) {
    pendencias.push({
      chave: "VEIO_DA_PLANILHA",
      titulo: `${daPlanilha.length} venda(s) importada(s) da planilha sem comanda — ${brl(soma(daPlanilha))}`,
      porque:
        "Essas negociações entraram na importação da planilha antiga, com o valor já vendido. O dinheiro provavelmente entrou antes do app, mas os números continuam contando no ranking e na meta.",
      oQueFazer: "Só confirmar de onde veio o valor. Não precisa lançar comanda para trás.",
      gravidade: "BAIXA",
      pessoas: ordenar(daPlanilha),
    });
  }
  return pendencias;
}
