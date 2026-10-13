// PROVA DO DINHEIRO (03/08/2026 — pedido do Lucas): a conta do banco é a régua.
// Ele digita o saldo do Itaú (do app do banco); o card desconta a reserva de
// impostos (provisão do mês anterior) e soma as notas contadas no cofre físico
// (registro do crediário). Resultado: o dinheiro NA MÃO, do jeito que ele confere.
//
// REDESENHO (08/10/2026, Papel & Musgo): digitar o saldo é ação, então é uma
// folha — o campo com rótulo em cima, a conta numa razão e o "na mão" em
// Fraunces. A conta e onde o saldo é guardado são os mesmos.
import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { BlocoFolha } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { Campo, classeDoCampoNumero } from "./pecasBancoFechamento";
import { Numero } from "./pecasResultados";
import {
  buildProvaDoDinheiro,
  moneyFin,
  parseFinAmount,
  type FinCrediarioProfit,
  type FinExpense,
} from "./financeiroData";

export function ProvaDoDinheiroCard({
  expenses,
  crediarioProfits,
  texto,
  atualizadoEm,
  onSaldoChange,
}: {
  expenses: FinExpense[];
  crediarioProfits: FinCrediarioProfit[];
  texto: string;
  atualizadoEm: string;
  onSaldoChange: (valor: string) => void;
}) {
  const saldo = parseFinAmount(texto);
  const hoje = todayISO();

  const prova = useMemo(
    () => buildProvaDoDinheiro(expenses, crediarioProfits, saldo, hoje),
    [expenses, crediarioProfits, saldo, hoje],
  );

  const linhas = [
    {
      label:
        prova.reservadoImpostos > 0
          ? `− Reservado p/ impostos (provisão de ${prova.reservaMes}, ainda na conta)`
          : `− Reservado p/ impostos: a provisão de ${prova.reservaMes} JÁ SAIU da conta`,
      valor: prova.reservadoImpostos,
      negativo: true,
    },
    { label: "= Livre no banco", valor: prova.livreNoBanco, destaque: false },
    { label: `+ Dinheiro em notas no cofre (contagem ${prova.notasMes})`, valor: prova.notasNoCofre, negativo: false },
  ];

  return (
    <BlocoFolha as="section" aria-labelledby="prova-do-dinheiro" respiro className="grid content-start gap-4">
      <h2 id="prova-do-dinheiro" className="flex items-start gap-2 text-xl font-bold leading-7 text-tinta">
        <Wallet className="mt-1 h-5 w-5 shrink-0 stroke-oliva" aria-hidden="true" />
        <span className="min-w-0">
          Prova do dinheiro — na mão hoje{" "}
          <InfoTip className="align-middle" title="Como funciona">
            A conta do banco é a régua: saldo do Itaú (você digita, direto do app do banco) menos a reserva de impostos,
            mais as notas contadas no cofre físico (o registro do crediário). A reserva só desconta enquanto a provisão
            do mês anterior estiver EM ABERTO — quando você marca como paga (o dinheiro saiu da conta de verdade), ela
            para de descontar, porque o saldo digitado já vem sem ela. Isso é POSIÇÃO DE CAIXA — o dinheiro que existe
            agora. O lucro da P12 é outra lente: o resultado do mês. Os dois estão certos; medem coisas diferentes.
          </InfoTip>
        </span>
      </h2>
      <Campo
        rotulo="Saldo do Itaú agora (do app do banco)"
        ajuda={
          atualizadoEm
            ? `informado em ${new Date(atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} (fica salvo neste aparelho)`
            : "digite uma vez — fica salvo neste aparelho"
        }
        className="max-w-sm"
      >
        <input
          id="saldo-itau"
          inputMode="decimal"
          placeholder="ex.: 35.427,61"
          value={texto}
          onChange={(event) => onSaldoChange(event.target.value)}
          className={classeDoCampoNumero}
        />
      </Campo>
      {saldo > 0 ? (
        <>
          <dl className="border-t border-fio-2">
            {linhas.map((linha) => (
              <div key={linha.label} className="flex items-baseline justify-between gap-3 border-b border-fio py-3">
                <dt className={cn("min-w-0 text-sm leading-5 text-tinta", linha.label.startsWith("=") ? "font-bold" : "font-medium")}>{linha.label}</dt>
                <dd className="m-0 whitespace-nowrap text-base font-bold leading-6 tabular-nums text-tinta">{moneyFin(linha.valor)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-controle bg-saber px-4 py-3 shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]">
            <span className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta">Na mão (banco livre + notas)</span>
            <Numero texto={moneyFin(prova.naMao)} tamanho="medio" tom={prova.naMao < 0 ? "RUIM" : "NEUTRO"} />
          </div>
        </>
      ) : (
        <p className="text-sm font-medium leading-5 text-tinta-2">
          Digite o saldo do Itaú para fechar a conta: banco − reserva de impostos + notas do cofre.
        </p>
      )}
    </BlocoFolha>
  );
}
