// COMPROMISSOS DO LUCRO INTELIGENTE (01/10/2026) — o que o Instituto deve no mês
// ao médico executor (em duas parcelas) e aos sócios (os 40 mil da régua), com
// o que já foi pago e o que falta. Fica no Contas a Pagar e na tela do Lucro.
//
// Regra do Lucas: o compromisso entra uma vez só. Pagar é dar BAIXA — por
// transferência do Itaú ou por PIX de paciente que caiu na conta do sócio — e
// o motor abate sempre o que vence primeiro.
import { useMemo, useState } from "react";
import { ArrowRightLeft, Stethoscope, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-lg border px-3 py-2",
        futura ? "border-dashed border-brand-oliva/30 bg-white/50" : atrasada ? "border-red-300 bg-red-50/70" : quitada ? "border-emerald-300 bg-emerald-50/60" : "border-brand-dourado/40 bg-white/80",
      )}
    >
      <p className="text-sm font-semibold text-brand-tinta">
        {parcela.numero}ª parcela de {nomeDoMes(parcela.mesDoTrabalho)}{" "}
        <span className={cn("text-xs font-normal", atrasada ? "text-red-800" : "text-muted-foreground")}>
          {atrasada ? `venceu ${diaCurto(parcela.vence)} · atrasada` : `vence ${diaCurto(parcela.vence)}${futura ? " · mês que vem" : ""}`}
        </span>
      </p>
      <p className="text-right text-sm font-bold tabular-nums text-brand-musgo">{moneyFin(parcela.valor)}</p>
      {futura ? (
        <p className="col-span-2 text-xs text-muted-foreground">Ainda não vence: entra no caixa do mês seguinte, junto com a 1ª parcela daquele mês.</p>
      ) : semValor ? (
        <p className="col-span-2 text-xs text-muted-foreground">Ainda sem venda neste mês: a parcela cresce a cada comanda.</p>
      ) : (
        <p className={cn("col-span-2 text-xs", quitada ? "text-emerald-800" : atrasada ? "text-red-800" : "text-brand-tinta")}>
          {quitada ? "Paga." : `Pago ${moneyFin(parcela.pago)} · falta ${moneyFin(parcela.falta)}`}
        </p>
      )}
    </div>
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
    <Card className={cn("border-brand-dourado/40 bg-brand-creme/20", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg text-brand-musgo">
          <ArrowRightLeft className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
          Lucro Inteligente: o que o Instituto deve em {mes}
          <InfoTip title="Como estes compromissos são calculados">
            <strong>Médico executor:</strong> 50% do lucro bruto dos produtos vendidos no mês, o mesmo envelope da tela do Lucro
            Inteligente. O valor do mês é pago em duas parcelas: a 1ª vence no último dia útil do próprio mês e a 2ª no último dia útil do
            mês seguinte. Por isso, todo mês vencem a 2ª parcela do mês anterior e a 1ª do mês atual.{" "}
            <strong>Lucro dos sócios:</strong> os 40 mil da régua, 25 mil da Andrya e 15 mil do Dr. Daniel.{" "}
            <strong>Pagamento:</strong> transferência do Itaú ou PIX de paciente que caiu na conta do sócio. Cada pagamento abate o que vence
            primeiro e nunca vira custo de novo. A falta de um mês passa para o seguinte.
          </InfoTip>
          <Badge variant="muted">uma vez só · pagamento é baixa</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="grid content-start gap-2">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-musgo">
              <Stethoscope className="h-4 w-4" aria-hidden="true" />
              Médico executor · Dr. Daniel
            </p>
            <p className="text-sm text-brand-tinta">
              O trabalho de {mes}
              {hoje.slice(0, 7) === compromissos.mes ? " até hoje" : ""} vale <strong className="tabular-nums">{moneyFin(executor.doMes)}</strong>, pago em
              duas parcelas.
            </p>
            {executor.atrasadas.map((parcela) => (
              <LinhaDaParcela key={parcela.id} parcela={parcela} atrasada />
            ))}
            {executor.vencemNoMes.length ? (
              executor.vencemNoMes.map((parcela) => <LinhaDaParcela key={parcela.id} parcela={parcela} />)
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma parcela vence neste mês.</p>
            )}
            {executor.proximas.map((parcela) => (
              <LinhaDaParcela key={parcela.id} parcela={parcela} futura />
            ))}
            <p className="text-sm font-semibold text-brand-musgo">
              {executor.faltaNoMes > 0.005 ? `Falta pagar até o fim de ${mes}: ${moneyFin(executor.faltaNoMes)}` : `Em dia até o fim de ${mes}.`}
            </p>
            {executor.adiantado > 0.005 ? <p className="text-xs text-emerald-800">Pago a mais: {moneyFin(executor.adiantado)}. Abate a próxima parcela.</p> : null}
            {executor.pagamentosNoMes.length ? (
              <ul className="divide-y divide-brand-oliva/10 rounded-lg border border-brand-oliva/14 bg-white/70 text-xs">
                {executor.pagamentosNoMes.map((pagamento) => (
                  <li key={pagamento.id} className="flex justify-between gap-2 px-3 py-1.5">
                    <span className="truncate">{diaCurto(pagamento.dia)} · {pagamento.descricao}</span>
                    <span className="font-semibold tabular-nums">{moneyFin(pagamento.valor)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {readOnly ? null : (
              <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => abrir("executor")}>
                Registrar pagamento ao executor
              </Button>
            )}
          </section>

          <section className="grid content-start gap-2">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-musgo">
              <Trophy className="h-4 w-4" aria-hidden="true" />
              Lucro dos sócios · {moneyFin(socios.total)}
            </p>
            {socios.porSocio.map((socio) => {
              const deMesesAnteriores = Math.max(0, socio.falta - (socio.valor - socio.pago));
              const quitado = socio.falta <= 0.005;
              return (
                <div key={socio.socio} className={cn("grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-lg border px-3 py-2", quitado ? "border-emerald-300 bg-emerald-50/60" : "border-brand-musgo/30 bg-white/80")}>
                  <p className="text-sm font-semibold text-brand-tinta">
                    {socio.nome}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">vence {diaCurto(socio.vence)}</span>
                  </p>
                  <p className="text-right text-sm font-bold tabular-nums text-brand-musgo">{moneyFin(socio.valor)}</p>
                  <p className={cn("col-span-2 text-xs", quitado ? "text-emerald-800" : "text-brand-tinta")}>
                    {quitado ? "Pago." : `Pago no mês ${moneyFin(socio.pagoNoMes)} · falta ${moneyFin(socio.falta)}`}
                    {deMesesAnteriores > 0.005 ? ` · inclui ${moneyFin(deMesesAnteriores)} de meses anteriores` : ""}
                    {socio.adiantado > 0.005 ? ` · pago a mais ${moneyFin(socio.adiantado)}` : ""}
                  </p>
                  {!readOnly ? (
                    <Button type="button" size="sm" variant="ghost" className="col-span-2 h-7 justify-self-start px-2 text-xs" onClick={() => abrir(socio.socio)}>
                      Registrar pagamento a {socio.socio === "andrya" ? "Andrya" : "Dr. Daniel"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
            <p className="text-sm font-semibold text-brand-musgo">
              {socios.falta > 0.005 ? `Falta pagar aos sócios: ${moneyFin(socios.falta)}` : "Sócios em dia."}
            </p>
            <p className="text-xs text-muted-foreground">
              PIX de paciente que caiu direto na conta de um sócio também é pagamento: registre aqui com a forma &quot;PIX de paciente&quot;.
            </p>
          </section>
        </div>

        {form ? (
          <div className="grid gap-2 rounded-lg border border-brand-oliva/20 bg-white/85 p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_1.2fr_auto]">
            <select
              value={form.para}
              onChange={(event) => {
                const para = event.target.value as Destino;
                setForm({ ...form, para, valor: faltaPor[para] > 0.005 ? faltaPor[para].toFixed(2).replace(".", ",") : "" });
              }}
              className="h-10 rounded-md border border-input bg-white px-2 text-sm"
              aria-label="Para quem"
            >
              <option value="executor">Parcela do médico executor</option>
              <option value="andrya">Lucro da Andrya</option>
              <option value="daniel">Lucro do Dr. Daniel</option>
            </select>
            <select
              value={form.forma}
              onChange={(event) => setForm({ ...form, forma: event.target.value as "ITAU" | "PIX_PACIENTE" })}
              className="h-10 rounded-md border border-input bg-white px-2 text-sm"
              aria-label="Como foi pago"
            >
              <option value="ITAU">Transferência do Itaú</option>
              <option value="PIX_PACIENTE">PIX de paciente na conta do sócio</option>
            </select>
            <Input type="date" value={form.dia} onChange={(event) => setForm({ ...form, dia: event.target.value })} aria-label="Data do pagamento" />
            <Input value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} placeholder="Valor (R$)" inputMode="decimal" aria-label="Valor pago" />
            <Input
              value={form.observacao}
              onChange={(event) => setForm({ ...form, observacao: event.target.value })}
              placeholder={form.forma === "PIX_PACIENTE" ? "Paciente e dia da comanda" : "Comprovante ou observação"}
              aria-label="Observação"
            />
            <div className="flex gap-1.5">
              <Button type="button" size="sm" onClick={salvar}>Salvar</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </div>
        ) : null}
        {aviso ? <p className="text-sm text-brand-musgo">{aviso}</p> : null}
      </CardContent>
    </Card>
  );
}
