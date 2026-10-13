// COMPROMISSOS DO LUCRO INTELIGENTE (01/10/2026) — o que o Instituto deve no mês
// ao médico executor (em duas parcelas) e aos sócios (os 40 mil da régua), com
// o que já foi pago e o que falta. Fica no Contas a Pagar e na tela do Lucro.
//
// Regra do Lucas: o compromisso entra uma vez só. Pagar é dar BAIXA — por
// transferência do Itaú ou por PIX de paciente que caiu na conta do sócio — e
// o motor abate sempre o que vence primeiro.
//
// REDESENHO (08/10/2026, Papel & Musgo, etapa 4): registrar pagamento é
// decisão, então o cartão é uma folha. Cada parcela e cada sócio viram uma
// linha (o que vence, o valor, o que falta, com a palavra da situação ao lado
// da cor); o formulário do pagamento abre embaixo, com rótulo em cima de cada
// campo. Aparece igual no Contas a Pagar e no Lucro Inteligente. A regra das
// duas parcelas, a baixa e o que é gravado são os mesmos.
import { useMemo, useState } from "react";
import { ArrowRightLeft, Stethoscope, Trophy } from "lucide-react";
import { BlocoFolha, Botao } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { Campo, RecadoDaTela, Selecao, classeDoCampo, classeDoCampoNumero } from "./pecasBancoFechamento";
import { Etiqueta, Rubrica } from "./pecasResultados";
import { mesLongoLabels, moneyFin, type FinExpense } from "./financeiroData";
import { novaTransferencia } from "./lucroInteligente";
import type { CompromissosDoMes, ParcelaDoExecutor, SocioDoMotor } from "./motorLucroInteligente";

const nomeDoMes = (monthKey: string) => (mesLongoLabels[Number(monthKey.slice(5, 7)) - 1] ?? "").toLowerCase();
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const parseValor = (texto: string) => Number(String(texto).replace(/\./g, "").replace(",", ".").trim());

type Destino = "executor" | SocioDoMotor;

function LinhaDaParcela({ parcela, futura, atrasada }: { parcela: ParcelaDoExecutor; futura?: boolean; atrasada?: boolean }) {
  const semValor = parcela.valor <= 0.005;
  const quitada = !semValor && parcela.falta <= 0.005;
  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-b border-fio py-3", futura && "text-tinta-2")}>
      <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold leading-5", futura ? "text-tinta-2" : "text-tinta")}>
        {parcela.numero}ª parcela de {nomeDoMes(parcela.mesDoTrabalho)}
        {atrasada ? (
          <Etiqueta tom="erro">venceu {diaCurto(parcela.vence)} · atrasada</Etiqueta>
        ) : (
          <span className="text-[13px] font-medium tabular-nums text-tinta-2">
            vence {diaCurto(parcela.vence)}
            {futura ? " · mês que vem" : ""}
          </span>
        )}
      </p>
      <p className={cn("whitespace-nowrap text-right text-sm font-bold leading-5 tabular-nums", futura ? "text-tinta-2" : "text-tinta")}>{moneyFin(parcela.valor)}</p>
      {futura ? (
        <p className="col-span-2 text-[13px] font-medium leading-5 text-tinta-2">Ainda não vence: entra no caixa do mês seguinte, junto com a 1ª parcela daquele mês.</p>
      ) : semValor ? (
        <p className="col-span-2 text-[13px] font-medium leading-5 text-tinta-2">Ainda sem venda neste mês: a parcela cresce a cada comanda.</p>
      ) : (
        <p className={cn("col-span-2 text-[13px] leading-5 tabular-nums", quitada ? "font-bold text-ok" : atrasada ? "font-bold text-erro" : "font-medium text-tinta")}>
          {quitada ? "Paga." : `Pago ${moneyFin(parcela.pago)} · falta ${moneyFin(parcela.falta)}`}
        </p>
      )}
    </li>
  );
}

export function CompromissosLucroCard({
  compromissos,
  readOnly,
  hoje,
  onRegistrar,
  className,
}: {
  compromissos: CompromissosDoMes;
  readOnly: boolean;
  hoje: string;
  onRegistrar: (conta: FinExpense) => void;
  className?: string;
}) {
  const { executor, socios } = compromissos;
  const mes = nomeDoMes(compromissos.mes);
  const faltaPor = useMemo(
    () => ({
      executor: executor.faltaNoMes,
      andrya: socios.porSocio.find((s) => s.socio === "andrya")?.falta ?? 0,
      daniel: socios.porSocio.find((s) => s.socio === "daniel")?.falta ?? 0,
    }),
    [executor.faltaNoMes, socios.porSocio],
  );
  const [form, setForm] = useState<{ para: Destino; forma: "ITAU" | "PIX_PACIENTE"; dia: string; valor: string; observacao: string } | null>(null);
  const [aviso, setAviso] = useState("");

  if (!compromissos.ativo) return null;

  function abrir(para: Destino) {
    const falta = faltaPor[para];
    setAviso("");
    setForm({ para, forma: "ITAU", dia: hoje, valor: falta > 0.005 ? falta.toFixed(2).replace(".", ",") : "", observacao: "" });
  }

  function salvar() {
    if (!form) return;
    const valor = parseValor(form.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      setAviso("Informe o valor pago.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dia)) {
      setAviso("Informe a data do pagamento.");
      return;
    }
    const conta = novaTransferencia({
      para: form.para === "executor" ? "medicoExecutor" : "socios",
      socio: form.para === "executor" ? "daniel" : form.para,
      dia: form.dia,
      valor,
      forma: form.forma,
      observacao: form.observacao,
    });
    onRegistrar(conta);
    const quem = form.para === "executor" ? "à parcela do médico executor" : form.para === "andrya" ? "ao lucro da Andrya" : "ao lucro do Dr. Daniel";
    setAviso(`Pagamento de ${moneyFin(valor)} registrado ${quem}. Ele abate o que vence primeiro.`);
    setForm(null);
  }

  return (
    <BlocoFolha as="section" aria-labelledby={`compromissos-${compromissos.mes}`} className={cn("grid gap-6 p-6 max-md:p-4", className)}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <ArrowRightLeft className="mt-1 h-5 w-5 shrink-0 stroke-oliva" aria-hidden="true" />
        <h2 id={`compromissos-${compromissos.mes}`} className="min-w-0 flex-1 basis-56 text-xl font-bold leading-7 text-tinta">
          Lucro Inteligente: o que o Instituto deve em {mes}{" "}
          <InfoTip className="align-middle" title="Como estes compromissos são calculados">
            <strong>Médico executor:</strong> 50% do lucro bruto dos produtos vendidos no mês, o mesmo envelope da tela do Lucro
            Inteligente. O valor do mês é pago em duas parcelas: a 1ª vence no último dia útil do próprio mês e a 2ª no último dia útil do
            mês seguinte. Por isso, todo mês vencem a 2ª parcela do mês anterior e a 1ª do mês atual.{" "}
            <strong>Lucro dos sócios:</strong> os 40 mil da régua, 25 mil da Andrya e 15 mil do Dr. Daniel.{" "}
            <strong>Pagamento:</strong> transferência do Itaú ou PIX de paciente que caiu na conta do sócio. Cada pagamento abate o que vence
            primeiro e nunca vira custo de novo. A falta de um mês passa para o seguinte.
          </InfoTip>
        </h2>
        <Etiqueta className="mt-1">uma vez só · pagamento é baixa</Etiqueta>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-label="Médico executor" className="grid content-start gap-3">
          <Rubrica as="h3" className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 stroke-oliva" aria-hidden="true" />
            Médico executor · Dr. Daniel
          </Rubrica>
          <p className="text-sm font-medium leading-5 text-tinta">
            O trabalho de {mes}
            {hoje.slice(0, 7) === compromissos.mes ? " até hoje" : ""} vale <strong className="font-bold tabular-nums">{moneyFin(executor.doMes)}</strong>, pago em
            duas parcelas.
          </p>
          <ul className="border-t border-fio-2">
            {executor.atrasadas.map((parcela) => (
              <LinhaDaParcela key={parcela.id} parcela={parcela} atrasada />
            ))}
            {executor.vencemNoMes.length ? (
              executor.vencemNoMes.map((parcela) => <LinhaDaParcela key={parcela.id} parcela={parcela} />)
            ) : (
              <li className="border-b border-fio py-3 text-[13px] font-medium leading-5 text-tinta-2">Nenhuma parcela vence neste mês.</li>
            )}
            {executor.proximas.map((parcela) => (
              <LinhaDaParcela key={parcela.id} parcela={parcela} futura />
            ))}
          </ul>
          <p className={cn("text-sm font-bold leading-5 tabular-nums", executor.faltaNoMes > 0.005 ? "text-tinta" : "text-ok")}>
            {executor.faltaNoMes > 0.005 ? `Falta pagar até o fim de ${mes}: ${moneyFin(executor.faltaNoMes)}` : `Em dia até o fim de ${mes}.`}
          </p>
          {executor.adiantado > 0.005 ? <p className="text-[13px] font-bold leading-5 text-ok">Pago a mais: {moneyFin(executor.adiantado)}. Abate a próxima parcela.</p> : null}
          {executor.pagamentosNoMes.length ? (
            <ul className="rounded-controle bg-saber px-3 text-[13px] leading-5">
              {executor.pagamentosNoMes.map((pagamento) => (
                <li key={pagamento.id} className="flex justify-between gap-3 border-b border-fio py-2 last:border-b-0">
                  <span className="min-w-0 truncate font-medium text-tinta">
                    <span className="tabular-nums text-tinta-2">{diaCurto(pagamento.dia)}</span> · {pagamento.descricao}
                  </span>
                  <span className="font-bold tabular-nums text-tinta">{moneyFin(pagamento.valor)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {readOnly ? null : (
            <Botao tamanho="pq" className="justify-self-start" onClick={() => abrir("executor")}>
              Registrar pagamento ao executor
            </Botao>
          )}
        </section>

        <section aria-label="Lucro dos sócios" className="grid content-start gap-3">
          <Rubrica as="h3" className="flex items-center gap-2">
            <Trophy className="h-4 w-4 stroke-oliva" aria-hidden="true" />
            Lucro dos sócios · <span className="tabular-nums">{moneyFin(socios.total)}</span>
          </Rubrica>
          <ul className="border-t border-fio-2">
            {socios.porSocio.map((socio) => {
              const deMesesAnteriores = Math.max(0, socio.falta - (socio.valor - socio.pago));
              const quitado = socio.falta <= 0.005;
              return (
                <li key={socio.socio} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-b border-fio py-3">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold leading-5 text-tinta">
                    {socio.nome}
                    <span className="text-[13px] font-medium tabular-nums text-tinta-2">vence {diaCurto(socio.vence)}</span>
                  </p>
                  <p className="whitespace-nowrap text-right text-sm font-bold leading-5 tabular-nums text-tinta">{moneyFin(socio.valor)}</p>
                  <p className={cn("col-span-2 text-[13px] leading-5 tabular-nums", quitado ? "font-bold text-ok" : "font-medium text-tinta")}>
                    {quitado ? "Pago." : `Pago no mês ${moneyFin(socio.pagoNoMes)} · falta ${moneyFin(socio.falta)}`}
                    {deMesesAnteriores > 0.005 ? ` · inclui ${moneyFin(deMesesAnteriores)} de meses anteriores` : ""}
                    {socio.adiantado > 0.005 ? ` · pago a mais ${moneyFin(socio.adiantado)}` : ""}
                  </p>
                  {!readOnly ? (
                    <Botao tamanho="pq" variante="fantasma" className="col-span-2 -ml-3 justify-self-start" onClick={() => abrir(socio.socio)}>
                      Registrar pagamento a {socio.socio === "andrya" ? "Andrya" : "Dr. Daniel"}
                    </Botao>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className={cn("text-sm font-bold leading-5 tabular-nums", socios.falta > 0.005 ? "text-tinta" : "text-ok")}>
            {socios.falta > 0.005 ? `Falta pagar aos sócios: ${moneyFin(socios.falta)}` : "Sócios em dia."}
          </p>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            PIX de paciente que caiu direto na conta de um sócio também é pagamento: registre aqui com a forma &quot;PIX de paciente&quot;.
          </p>
        </section>
      </div>

      {form ? (
        <div className="grid gap-4 rounded-bloco bg-saber p-5 max-md:p-4">
          <Rubrica as="h3">Registrar pagamento</Rubrica>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_0.9fr_0.8fr_1.2fr]">
            <Campo rotulo="Para quem">
              <Selecao
                value={form.para}
                onChange={(event) => {
                  const para = event.target.value as Destino;
                  setForm({ ...form, para, valor: faltaPor[para] > 0.005 ? faltaPor[para].toFixed(2).replace(".", ",") : "" });
                }}
                aria-label="Para quem"
              >
                <option value="executor">Parcela do médico executor</option>
                <option value="andrya">Lucro da Andrya</option>
                <option value="daniel">Lucro do Dr. Daniel</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Como foi pago">
              <Selecao value={form.forma} onChange={(event) => setForm({ ...form, forma: event.target.value as "ITAU" | "PIX_PACIENTE" })} aria-label="Como foi pago">
                <option value="ITAU">Transferência do Itaú</option>
                <option value="PIX_PACIENTE">PIX de paciente na conta do sócio</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Data">
              <input type="date" value={form.dia} onChange={(event) => setForm({ ...form, dia: event.target.value })} aria-label="Data do pagamento" className={classeDoCampo} />
            </Campo>
            <Campo rotulo="Valor (R$)">
              <input value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} placeholder="0,00" inputMode="decimal" aria-label="Valor pago" className={classeDoCampoNumero} />
            </Campo>
            <Campo rotulo="Observação">
              <input
                value={form.observacao}
                onChange={(event) => setForm({ ...form, observacao: event.target.value })}
                placeholder={form.forma === "PIX_PACIENTE" ? "Paciente e dia da comanda" : "Comprovante ou observação"}
                aria-label="Observação"
                className={classeDoCampo}
              />
            </Campo>
          </div>
          <div className="flex flex-wrap gap-2">
            <Botao variante="primario" onClick={salvar}>
              Salvar
            </Botao>
            <Botao variante="fantasma" onClick={() => setForm(null)}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : null}
      {aviso ? <RecadoDaTela tom={/^Informe/.test(aviso) ? "atencao" : "ok"}>{aviso}</RecadoDaTela> : null}
    </BlocoFolha>
  );
}
