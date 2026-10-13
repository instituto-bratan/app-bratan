// O LUCRO DO MÊS, EXPLICADO (01/10/2026). Lucas: "arrume o lucro do mês, mas
// isso tem que estar muito bem explicado". A conta abre linha a linha, na ordem
// em que o dinheiro é dividido, e separa o que é CUSTO DO MÊS do que é CAIXA:
// o médico executor conta inteiro no mês do trabalho, mas sai do caixa em duas
// parcelas; o lucro dos sócios não é custo, é a divisão do lucro.
//
// REDESENHO (08/10/2026, Papel & Musgo): a conta virou uma razão no bloco
// "saber" — o sinal numa coluna, o rótulo com a frase embaixo e o valor
// tabular à direita; as duas linhas de "=" sobem para a folha com o número em
// Fraunces. As parcelas do executor ficam numa lista logo abaixo. A conta, as
// frases e os números são os mesmos.
import { Calculator } from "lucide-react";
import { BlocoSaber } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { RecadoDaTela } from "./pecasBancoFechamento";
import { Rubrica } from "./pecasResultados";
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

  const textoDaLinha = apresentando ? "text-lg leading-7" : "text-sm leading-5";
  const textoDaFrase = apresentando ? "text-sm leading-5" : "text-[13px] leading-5";

  return (
    <BlocoSaber as="section" aria-labelledby={`lucro-explicado-${gestao.monthKey}`} className="grid gap-4 p-0 max-md:p-0">
      <div className="flex items-start gap-2 px-6 pt-5 max-md:px-4 max-md:pt-4">
        <Calculator className="mt-0.5 h-5 w-5 shrink-0 stroke-oliva" aria-hidden="true" />
        <h3 id={`lucro-explicado-${gestao.monthKey}`} className={cn("font-bold text-tinta", apresentando ? "text-2xl leading-8" : "text-base leading-6")}>
          Como o lucro de {mes} é calculado{" "}
          <InfoTip className="align-middle" title="Custo do mês e caixa do mês são coisas diferentes">
            O lucro mede o que o mês custou, mesmo que parte seja paga depois. Por isso o médico executor entra inteiro no mês do trabalho.
            O caixa mede o que saiu do banco: do executor, sai só a parcela que vence no mês. A ponte logo abaixo leva um número ao outro.
          </InfoTip>
        </h3>
      </div>

      {gestao.contasAntigasDosSocios > 0.005 ? (
        <RecadoDaTela tom="atencao" className="mx-6 max-md:mx-4">
          Há {moneyFin(gestao.contasAntigasDosSocios)} em contas de salário fixo dos sócios neste mês. O lucro dos sócios já vem da régua e o
          executor já vem do motor, então essas contas contam em dobro. Apague-as no Contas a Pagar.
        </RecadoDaTela>
      ) : null}

      <dl className="border-t border-fio-2">
        {linhas.map((linha) => (
          <div
            key={linha.rotulo}
            className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-fio px-6 py-3 max-md:px-4", linha.destaque && "bg-folha")}
          >
            <dt className="flex min-w-0 gap-3">
              <span className="w-4 shrink-0 text-center text-base font-bold leading-6 text-tinta-2" aria-hidden="true">
                {linha.sinal || "\u00a0"}
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className={cn("text-tinta", textoDaLinha, linha.destaque ? "font-bold" : "font-semibold")}>
                  {linha.sinal === "−" ? <span className="sr-only">menos </span> : linha.sinal === "=" ? <span className="sr-only">igual a </span> : null}
                  {linha.rotulo}
                </span>
                <span className={cn("max-w-[90ch] font-medium text-tinta-2", textoDaFrase)}>{linha.frase}</span>
              </span>
            </dt>
            <dd
              className={cn(
                "m-0 whitespace-nowrap text-right tabular-nums",
                linha.destaque ? "font-serifa text-2xl font-normal leading-8" : cn("font-bold", apresentando ? "text-xl leading-7" : "text-base leading-6"),
                linha.valor < 0 ? "text-erro" : "text-tinta",
              )}
            >
              {moneyFin(linha.valor)}
            </dd>
          </div>
        ))}
      </dl>

      {gestao.crediario > 0.005 ? (
        <p className="px-6 text-sm font-medium leading-5 text-tinta max-md:px-4">
          Com o crediário incluído no lucro ({moneyFin(gestao.crediario)}), a empresa fica com{" "}
          <strong className="font-bold tabular-nums">{moneyFin(gestao.resultadoDepoisDosSocios + gestao.crediario)}</strong> depois do lucro dos sócios.
        </p>
      ) : null}

      <div className="grid gap-2 px-6 pb-5 max-md:px-4 max-md:pb-4">
        <Rubrica as="h3">No caixa de {mes}: as parcelas do executor</Rubrica>
        <ul className="border-t border-fio-2">
          {executor.atrasadas.map((parcela) => (
            <li key={parcela.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-fio py-2 text-sm font-bold leading-5 text-erro">
              <span>
                {parcela.numero}ª parcela de {nomeDoMes(parcela.mesDoTrabalho)} · venceu {diaCurto(parcela.vence)} e está atrasada
              </span>
              <span className="tabular-nums">falta {moneyFin(parcela.falta)}</span>
            </li>
          ))}
          {executor.vencemNoMes.length ? (
            executor.vencemNoMes.map((parcela) => (
              <li key={parcela.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-fio py-2 text-sm font-medium leading-5 text-tinta">
                <span>
                  {parcela.numero}ª parcela de {nomeDoMes(parcela.mesDoTrabalho)} · vence {diaCurto(parcela.vence)}
                </span>
                <span className="font-bold tabular-nums">
                  {moneyFin(parcela.valor)} · {parcela.falta <= 0.005 ? <span className="text-ok">paga</span> : `falta ${moneyFin(parcela.falta)}`}
                </span>
              </li>
            ))
          ) : (
            <li className="border-b border-fio py-2 text-sm font-medium leading-5 text-tinta-2">Nenhuma parcela vence neste mês.</li>
          )}
          {executor.proximas.map((parcela) => (
            <li key={parcela.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-fio py-2 text-[13px] font-medium leading-5 text-tinta-2">
              <span>
                {parcela.numero}ª parcela de {nomeDoMes(parcela.mesDoTrabalho)} · vence {diaCurto(parcela.vence)}, no mês seguinte
              </span>
              <span className="tabular-nums">{moneyFin(parcela.valor)}</span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] font-medium leading-5 text-tinta-2">
          Todo mês vencem a 2ª parcela do mês anterior e a 1ª do mês atual. Os pagamentos e o lucro de cada sócio estão no Contas a Pagar.
        </p>
      </div>
    </BlocoSaber>
  );
}
