// O LUCRO DO MÊS, EXPLICADO (01/10/2026). Lucas: "arrume o lucro do mês, mas
// isso tem que estar muito bem explicado". A conta abre linha a linha, na ordem
// em que o dinheiro é dividido, e separa o que é CUSTO DO MÊS do que é CAIXA:
// o médico executor conta inteiro no mês do trabalho, mas sai do caixa em duas
// parcelas; o lucro dos sócios não é custo, é a divisão do lucro.
import { AlertTriangle, Calculator } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { mesLongoLabels, moneyFin, type GestaoMensal } from "./financeiroData";
import type { CompromissosDoMes } from "./motorLucroInteligente";

const nomeDoMes = (monthKey: string) => (mesLongoLabels[Number(monthKey.slice(5, 7)) - 1] ?? "").toLowerCase();
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type Linha = { sinal: "" | "−" | "="; rotulo: string; valor: number; frase: string; destaque?: boolean };

export function LucroDoMesExplicado({
  gestao,
  compromissos,
  apresentando = false,
}: {
  gestao: GestaoMensal;
  compromissos: CompromissosDoMes;
  apresentando?: boolean;
}) {
  if (!gestao.motorAtivo) return null;
  const mes = nomeDoMes(gestao.monthKey);
  const linhas: Linha[] = [
    { sinal: "", rotulo: "Faturamento das comandas", valor: gestao.faturamento, frase: "Tudo que os pacientes pagaram nas comandas do mês. O crediário fica fora." },
    { sinal: "−", rotulo: "Custos fixos", valor: gestao.custosFixos, frase: "Aluguel, energia, internet, plano de saúde, giro e carro." },
    { sinal: "−", rotulo: "Folha da equipe", valor: gestao.folhaMeritocracia, frase: "Salários, encargos e benefícios da equipe. O lucro dos sócios não entra aqui." },
    {
      sinal: "−",
      rotulo: `Médico executor de ${mes}`,
      valor: gestao.medicoExecutor,
      frase: `50% do lucro bruto dos produtos vendidos em ${mes}. Conta inteiro neste mês porque o trabalho é deste mês, mesmo sendo pago em duas parcelas.`,
    },
    { sinal: "−", rotulo: "Custos variáveis", valor: gestao.custosVariaveis, frase: "Medicações, faturas do cartão, impostos pagos, mentoria e o resto que varia." },
    { sinal: "−", rotulo: "Provisões", valor: gestao.provisoes, frase: "13º, férias, rescisão e impostos guardados para os próximos meses." },
    { sinal: "=", rotulo: `Lucro da empresa em ${mes}`, valor: gestao.lucroLiquido, frase: "É o resultado da operação, antes de separar o lucro dos sócios.", destaque: true },
    {
      sinal: "−",
      rotulo: "Lucro dos sócios",
      valor: gestao.lucroSociosDoMes,
      frase: "Os 40 mil da régua do Lucro Inteligente: 25 mil da Andrya e 15 mil do Dr. Daniel. É a divisão do lucro, não custo da operação.",
    },
    {
      sinal: "=",
      rotulo: "O que a empresa guarda",
      valor: gestao.resultadoDepoisDosSocios,
      frase: gestao.resultadoDepoisDosSocios < 0 ? "Negativo: o mês não vendeu o bastante para pagar a operação e o lucro dos sócios." : "Sobra depois de pagar a operação e o lucro dos sócios.",
      destaque: true,
    },
  ];
  const { executor } = compromissos;

  return (
    <section className="grid gap-3 rounded-xl border border-brand-musgo/30 bg-white/80 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Calculator className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
        <h3 className={cn("font-bold text-brand-musgo", apresentando ? "text-2xl" : "text-lg")}>Como o lucro de {mes} é calculado</h3>
        <InfoTip title="Custo do mês e caixa do mês são coisas diferentes">
          O lucro mede o que o mês custou, mesmo que parte seja paga depois. Por isso o médico executor entra inteiro no mês do trabalho.
          O caixa mede o que saiu do banco: do executor, sai só a parcela que vence no mês. A ponte logo abaixo leva um número ao outro.
        </InfoTip>
      </div>

      {gestao.contasAntigasDosSocios > 0.005 ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Há {moneyFin(gestao.contasAntigasDosSocios)} em contas de salário fixo dos sócios neste mês. O lucro dos sócios já vem da régua e o
            executor já vem do motor, então essas contas contam em dobro. Apague-as no Contas a Pagar.
          </span>
        </p>
      ) : null}

      <div className="grid gap-1.5">
        {linhas.map((linha) => (
          <div
            key={linha.rotulo}
            className={cn(
              "grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-2 rounded-lg px-3 py-2",
              linha.destaque ? (linha.valor < 0 ? "border border-red-200 bg-red-50/70" : "border border-emerald-300 bg-emerald-50/60") : "bg-brand-papel/60",
            )}
          >
            <span className="text-center font-bold text-brand-oliva">{linha.sinal}</span>
            <span className={cn("font-semibold text-brand-tinta", apresentando ? "text-lg" : "text-sm")}>{linha.rotulo}</span>
            <span className={cn("text-right font-bold tabular-nums", linha.valor < 0 ? "text-red-800" : "text-brand-musgo", apresentando ? "text-xl" : "text-base")}>
              {moneyFin(linha.valor)}
            </span>
            <span />
            <span className={cn("col-span-2 leading-snug text-muted-foreground", apresentando ? "text-sm" : "text-xs")}>{linha.frase}</span>
          </div>
        ))}
      </div>

      {gestao.crediario > 0.005 ? (
        <p className="text-sm text-brand-tinta">
          Com o crediário incluído no lucro ({moneyFin(gestao.crediario)}), a empresa fica com{" "}
          <strong className="tabular-nums">{moneyFin(gestao.resultadoDepoisDosSocios + gestao.crediario)}</strong> depois do lucro dos sócios.
        </p>
      ) : null}

      <div className="grid gap-1.5 rounded-lg border border-brand-dourado/40 bg-brand-creme/30 px-3 py-2.5">
        <p className="text-sm font-bold text-brand-musgo">No caixa de {mes}: as parcelas do executor</p>
        {executor.atrasadas.map((parcela) => (
          <p key={parcela.id} className="flex flex-wrap justify-between gap-2 text-sm text-red-800">
            <span>
              {parcela.numero}ª parcela de {nomeDoMes(parcela.mesDoTrabalho)} · venceu {diaCurto(parcela.vence)} e está atrasada
            </span>
            <span className="tabular-nums">falta {moneyFin(parcela.falta)}</span>
          </p>
        ))}
        {executor.vencemNoMes.length ? (
          executor.vencemNoMes.map((parcela) => (
            <p key={parcela.id} className="flex flex-wrap justify-between gap-2 text-sm text-brand-tinta">
              <span>
                {parcela.numero}ª parcela de {nomeDoMes(parcela.mesDoTrabalho)} · vence {diaCurto(parcela.vence)}
              </span>
              <span className="tabular-nums">
                {moneyFin(parcela.valor)} · {parcela.falta <= 0.005 ? "paga" : `falta ${moneyFin(parcela.falta)}`}
              </span>
            </p>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma parcela vence neste mês.</p>
        )}
        {executor.proximas.map((parcela) => (
          <p key={parcela.id} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {parcela.numero}ª parcela de {nomeDoMes(parcela.mesDoTrabalho)} · vence {diaCurto(parcela.vence)}, no mês seguinte
            </span>
            <span className="tabular-nums">{moneyFin(parcela.valor)}</span>
          </p>
        ))}
        <p className="text-xs text-muted-foreground">
          Todo mês vencem a 2ª parcela do mês anterior e a 1ª do mês atual. Os pagamentos e o lucro de cada sócio estão no Contas a Pagar.
        </p>
      </div>
    </section>
  );
}
