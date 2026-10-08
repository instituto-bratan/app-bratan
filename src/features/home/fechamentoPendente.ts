// O FECHAMENTO DE ONTEM SEM CONFERIR — a regra da Home (14/09/2026), num módulo
// só dela desde 08/10/2026. Dois lugares usam a MESMA conta: a Fila do dia da
// Home ("Fechamento de 05/10 sem conferir") e o contador do Início na casca
// (redesenho Papel & Musgo: 6 = 3 pedidos + 2 contas + 1 fechamento). A casca
// carrega em toda tela; morando aqui, ela não arrasta a Fila do dia inteira
// para o pacote principal.
import { saleTotal, type FinReconciliation, type FinSale } from "@/features/financeiro/financeiroData";
import { diaUtilAnterior } from "@/features/financeiro/recebiveisRede";

/** O fechamento de ontem (dia útil anterior) ficou sem conferir? */
export function fechamentoPendente(sales: FinSale[], reconciliations: FinReconciliation[], hoje: string): { dia: string; total: number } | null {
  const dia = diaUtilAnterior(hoje);
  const total = Math.round(sales.filter((sale) => sale.saleDate === dia).reduce((soma, sale) => soma + saleTotal(sale), 0) * 100) / 100;
  if (total <= 0.005) return null;
  if (reconciliations.some((rec) => rec.day === dia && rec.status !== "PENDENTE")) return null;
  return { dia, total };
}
