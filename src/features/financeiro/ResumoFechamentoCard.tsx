// RESUMO DE FECHAMENTO (25/08/2026, pedido do Lucas): "adapte isso também ao
// aplicativo. Não quero uma outra aba, mas eu queria que ficasse fácil."
//
// Então mora aqui dentro do Painel do Mês — que JÁ é a tela da reunião de
// fechamento. O card faz a divisão que o documento em papel não fazia: o app
// CALCULA o que sai dos lançamentos (cinza, sem campo para digitar) e a pessoa
// só preenche o que é decisão de reunião ou o que só quem olha o banco sabe
// (fundo creme). No fim, "Imprimir" devolve a folha no formato que ele leva.
import { useMemo } from "react";
import { FileText, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  moneyFin,
  monthKeyLabel,
  type FinCategory,
  type FinExpense,
  type FinProvisionRule,
  type FinSale,
} from "./financeiroData";
import {
  buildResumoFechamento,
  CATEGORIA_IMPOSTOS_PROVISAO,
  DIVISAO_LUCRO,
  fechamentoEscritoVazio,
  type FechamentoEscrito,
} from "./resumoFechamento";

export function ResumoFechamentoCard({
  sales,
  expenses,
  categories,
  provisionRules,
  monthKey,
  meta,
  escrito,
  onEscritoChange,
  onSalvar,
  readOnly = false,
}: {
  sales: FinSale[];
  expenses: FinExpense[];
  categories: FinCategory[];
  provisionRules: FinProvisionRule[];
  monthKey: string;
  meta: number;
  escrito: FechamentoEscrito;
  onEscritoChange: (proximo: FechamentoEscrito) => void;
  onSalvar?: () => void;
  readOnly?: boolean;
}) {
  const resumo = useMemo(
    () =>
      buildResumoFechamento({
        sales,
        expenses,
        categories,
        provisionRules,
        monthKey,
        meta,
        escrito,
        categoriaImpostos: CATEGORIA_IMPOSTOS_PROVISAO,
      }),
    [sales, expenses, categories, provisionRules, monthKey, meta, escrito],
  );

  const anotacao = (chave: keyof FechamentoEscrito) => ({
    value: escrito[chave],
    onChange: (evento: React.ChangeEvent<HTMLTextAreaElement>) =>
      onEscritoChange({ ...escrito, [chave]: evento.target.value }),
    onBlur: () => (readOnly ? undefined : onSalvar?.()),
    disabled: readOnly,
    rows: 3,
    className: "mt-1 w-full rounded-md border border-input bg-white/72 px-3 py-2 text-sm",
  });

  const campo = (chave: keyof FechamentoEscrito) => ({
    value: escrito[chave],
    onChange: (evento: React.ChangeEvent<HTMLInputElement>) =>
      onEscritoChange({ ...escrito, [chave]: evento.target.value }),
    // Sai do campo, grava. Ninguém precisa lembrar de subir a tela para salvar.
    onBlur: () => (readOnly ? undefined : onSalvar?.()),
    disabled: readOnly,
  });

  function imprimir() {
    const linhaProv = resumo.provisoesFixas
      .map((linha) => `<tr><td>${linha.nome}</td><td class="num">${moneyFin(linha.valor)}</td></tr>`)
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo de fechamento — ${monthKeyLabel(monthKey)}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,sans-serif;color:#2B2E24;margin:30px;font-size:13px}
        h1{font-size:19px;text-align:center;margin:0 0 4px}
        p.meta{text-align:center;color:#666;font-size:11px;margin:0 0 18px}
        h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#4D563B;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
        table{width:100%;border-collapse:collapse}
        td{padding:3px 0;vertical-align:top}
        td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
        .linha{display:flex;justify-content:space-between;padding:3px 0}
        .destaque{background:#F8EDBD;padding:8px 10px;margin-top:6px;font-weight:bold;display:flex;justify-content:space-between}
        .socios{margin-top:8px;font-size:15px}
        .socios div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #ccc}
        .escrito{white-space:pre-wrap;min-height:34px;border-bottom:1px solid #ddd;padding:4px 0;color:#333}
      </style></head><body>
      <h1>RESUMO DE FECHAMENTO — ${monthKeyLabel(monthKey).toUpperCase()}</h1>
      <p class="meta">Instituto Bratan · reunião de fechamento · sem valores do crediário</p>

      <h2>Saldos</h2>
      <div class="linha"><span>Saldo Itaú</span><strong>${moneyFin(resumo.saldos.itau)}</strong></div>
      <div class="linha"><span>Saldo Safra${escrito.saldoSafraNota ? ` (${escrito.saldoSafraNota})` : ""}</span><strong>${moneyFin(resumo.saldos.safra)}</strong></div>
      <div class="linha"><span>Saldo Santander</span><strong>${escrito.saldoSantander || "—"}</strong></div>
      <div class="linha"><span>Dinheiro</span><strong>${moneyFin(resumo.saldos.dinheiro)}</strong></div>

      <h2>Entrou × saiu</h2>
      <div class="linha"><span>Entrada total + impostos provisionados</span><strong>${moneyFin(resumo.entradaTotalComImpostos)}</strong></div>
      <div class="linha"><span>Saída total</span><strong>${moneyFin(resumo.saidaTotal)}</strong></div>

      <h2>Meta da equipe</h2>
      <div class="linha"><span>Entrada SEM impostos no mês</span><strong>${moneyFin(resumo.entradaSemImpostos)}</strong></div>
      <div class="linha"><span>Meta do mês</span><strong>${moneyFin(resumo.meta)}</strong></div>
      <div class="linha"><span>${resumo.bateuMeta ? "Passou da meta em" : "Faltou"}</span><strong>${moneyFin(Math.abs(resumo.faltaParaMeta))}</strong></div>

      <h2>Adiantamentos</h2>
      <div class="escrito">${escrito.adiantamentos || "—"}</div>

      <h2>Poupança — impostos e afins</h2>
      <table>
        <tr><td><strong>IMPOSTOS</strong></td><td class="num"><strong>${moneyFin(resumo.impostosProvisionados)}</strong></td></tr>
        ${linhaProv}
      </table>
      <div class="destaque"><span>TOTAL A PROVISIONAR</span><span>${moneyFin(resumo.totalProvisoes)}</span></div>

      <h2>Anotações da reunião — ficou acordado o provisionamento apenas do:</h2>
      <div class="escrito">${escrito.provisionamentoAcordado || "—"}</div>
      <div class="destaque"><span>PROVISIONADO DE FATO</span><span>${moneyFin(resumo.provisionamentoAcordadoValor)}</span></div>

      <h2>Distribuição de lucro — pagamentos conta sócia</h2>
      <div class="escrito">${escrito.pagamentosContaSocia || "—"}</div>

      <h2>Distribuição de lucro real</h2>
      <div class="linha"><span>Lucro do mês pelos lançamentos</span><strong>${moneyFin(resumo.lucroDoMes)}</strong></div>
      <div class="destaque"><span>TOTAL DISTRIBUÍDO</span><span>${moneyFin(resumo.lucroDistribuido)}</span></div>
      <div class="socios">
        <div><span>ANDRYA — ${Math.round(DIVISAO_LUCRO.andrya * 100)}%</span><strong>${moneyFin(resumo.divisao.andrya)}</strong></div>
        <div><span>DANIEL — ${Math.round(DIVISAO_LUCRO.daniel * 100)}%</span><strong>${moneyFin(resumo.divisao.daniel)}</strong></div>
      </div>
      <script>window.print()</script></body></html>`;
    const janela = window.open("", "_blank", "width=900,height=760");
    if (!janela) return;
    janela.document.write(html);
    janela.document.close();
  }

  const Derivado = ({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "bom" | "ruim" }) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-brand-oliva/12 py-1.5 last:border-0">
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      <span className={cn("text-sm font-bold tabular-nums", tom === "bom" ? "text-emerald-700" : tom === "ruim" ? "text-rose-700" : "text-brand-tinta")}>
        {valor}
      </span>
    </div>
  );

  return (
    <Card className="border-brand-dourado/40 bg-white/70">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            Resumo de fechamento — {monthKeyLabel(monthKey)}
            <InfoTip title="O que é digitado e o que é calculado">
              O que sai dos lançamentos aparece pronto, sem campo: entrada, saída, meta, provisões e o lucro. Você só
              preenche o que o app não tem como saber — os saldos das contas no dia e as decisões da reunião. Este
              fechamento NÃO leva crediário, e o lucro é sempre dividido {Math.round(DIVISAO_LUCRO.andrya * 100)}% Andrya
              / {Math.round(DIVISAO_LUCRO.daniel * 100)}% Daniel.
            </InfoTip>
          </CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={imprimir}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" /> Imprimir a folha
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* ---- saldos: digitados (só quem olha o banco sabe) ---- */}
        <div className="grid gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/30 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-oliva">Saldos no dia do fechamento</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Itaú</Label>
              <Input {...campo("saldoItau")} placeholder="18.614,54" inputMode="decimal" />
            </div>
            <div>
              <Label>Safra</Label>
              <Input {...campo("saldoSafra")} placeholder="23.885,46" inputMode="decimal" />
            </div>
            <div>
              <Label>Observação do Safra</Label>
              <Input {...campo("saldoSafraNota")} placeholder="Ex.: poupança de junho e julho" />
            </div>
            <div>
              <Label>Santander</Label>
              <Input {...campo("saldoSantander")} placeholder="conta inativa" />
            </div>
            <div>
              <Label>Dinheiro</Label>
              <Input {...campo("dinheiro")} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="flex items-end">
              <p className="w-full rounded-md border border-brand-oliva/20 bg-white/70 px-3 py-2 text-sm">
                Somando: <strong className="tabular-nums">{moneyFin(resumo.saldos.total)}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* ---- derivado: entrou × saiu × meta ---- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-brand-oliva/20 bg-white/60 p-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-oliva">Entrou × saiu (dos lançamentos)</p>
            <Derivado rotulo="Entrada total + impostos prov." valor={moneyFin(resumo.entradaTotalComImpostos)} />
            <Derivado rotulo="Saída total" valor={moneyFin(resumo.saidaTotal)} />
            <Derivado rotulo="Lucro do mês (sem crediário)" valor={moneyFin(resumo.lucroDoMes)} tom={resumo.lucroDoMes >= 0 ? "bom" : "ruim"} />
          </div>
          <div className="rounded-lg border border-brand-oliva/20 bg-white/60 p-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-oliva">Meta da equipe</p>
            <Derivado rotulo="Entrada SEM impostos" valor={moneyFin(resumo.entradaSemImpostos)} />
            <Derivado rotulo="Meta do mês" valor={moneyFin(resumo.meta)} />
            <Derivado
              rotulo={resumo.bateuMeta ? "Passou da meta em" : "Faltou"}
              valor={moneyFin(Math.abs(resumo.faltaParaMeta))}
              tom={resumo.bateuMeta ? "bom" : "ruim"}
            />
          </div>
        </div>

        {/* ---- provisões: derivadas das regras ---- */}
        <div className="rounded-lg border border-brand-oliva/20 bg-white/60 p-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-oliva">
            Poupança — impostos e afins
            <InfoTip title="De onde vem">
              Os impostos são a provisão lançada no mês; as outras linhas vêm das regras de provisão cadastradas (13º,
              férias, rescisão, urgências, início de ano, confraternização). Mudou a regra, muda aqui sozinho.
            </InfoTip>
          </p>
          <Derivado rotulo="IMPOSTOS" valor={moneyFin(resumo.impostosProvisionados)} />
          {resumo.provisoesFixas.map((linha) => (
            <Derivado key={linha.nome} rotulo={linha.nome} valor={moneyFin(linha.valor)} />
          ))}
          <div className="mt-2 flex items-baseline justify-between rounded-md bg-brand-creme/60 px-3 py-2">
            <span className="text-sm font-bold text-brand-tinta">Total a provisionar</span>
            <span className="text-base font-bold tabular-nums text-brand-musgo">{moneyFin(resumo.totalProvisoes)}</span>
          </div>
        </div>

        {/* ---- decisões da reunião: digitadas ---- */}
        <div className="grid gap-3 rounded-lg border border-brand-dourado/35 bg-brand-creme/30 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-oliva">Decisões da reunião</p>
          <div>
            <Label>Adiantamentos</Label>
            <Input {...campo("adiantamentos")} placeholder="Ex.: 2.000,00 — adiantamento da Aline" />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div>
              <Label>Ficou acordado o provisionamento apenas do:</Label>
              <textarea {...anotacao("provisionamentoAcordado")} placeholder="Ex.: impostos do mês + 13º dos sócios" />
            </div>
            <div>
              <Label>Valor provisionado</Label>
              <Input {...campo("provisionamentoValor")} placeholder="0,00" inputMode="decimal" className="sm:w-40" />
            </div>
          </div>
          <div>
            <Label>Distribuição de lucro — pagamentos conta sócia</Label>
            <textarea {...anotacao("pagamentosContaSocia")} placeholder="Ex.: cartão da CEO 4.200,00 · convênio 1.100,00" />
          </div>
        </div>

        {/* ---- a divisão, sempre 80/20 ---- */}
        <div className="grid gap-2 rounded-lg border border-brand-musgo/30 bg-brand-papel p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-oliva">Distribuição de lucro real</p>
            <div>
              <Label className="text-xs">Total distribuído (em branco = lucro do mês)</Label>
              <Input {...campo("lucroDistribuido")} placeholder={moneyFin(resumo.lucroDoMes)} inputMode="decimal" className="sm:w-48" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { nome: "Andrya", pct: DIVISAO_LUCRO.andrya, valor: resumo.divisao.andrya },
              { nome: "Daniel", pct: DIVISAO_LUCRO.daniel, valor: resumo.divisao.daniel },
            ].map((socio) => (
              <div key={socio.nome} className="rounded-lg border border-brand-dourado/40 bg-brand-creme/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-brand-oliva">
                  {socio.nome} — {Math.round(socio.pct * 100)}%
                </p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-brand-musgo">{moneyFin(socio.valor)}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            A divisão {Math.round(DIVISAO_LUCRO.andrya * 100)}/{Math.round(DIVISAO_LUCRO.daniel * 100)} é fixa por decisão
            societária — o app calcula, não deixa digitar errado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
