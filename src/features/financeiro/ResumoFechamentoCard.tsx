// RESUMO DE FECHAMENTO (25/08/2026, pedido do Lucas): "adapte isso também ao
// aplicativo. Não quero uma outra aba, mas eu queria que ficasse fácil."
//
// Então mora aqui dentro do Painel do Mês — que JÁ é a tela da reunião de
// fechamento. O card faz a divisão que o documento em papel não fazia: o app
// CALCULA o que sai dos lançamentos (cinza, sem campo para digitar) e a pessoa
// só preenche o que é decisão de reunião ou o que só quem olha o banco sabe
// (fundo creme). No fim, "Imprimir" devolve a folha no formato que ele leva.
//
// REDESENHO (08/10/2026, Papel & Musgo): o cartão é uma folha (tem campos para
// preencher); dentro dela, o que o app calcula mora no "saber" (sem campo, em
// razão rótulo → valor) e o que se digita fica em campos com rótulo em cima. A
// folha impressa (imprimir) é exatamente a mesma de antes.
import { useMemo } from "react";
import { FileText, Printer } from "lucide-react";
import { BlocoFolha, BlocoSaber, Botao } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { Campo, Razao, classeDoCampo, classeDoCampoNumero, tabela } from "./pecasBancoFechamento";
import { Numero, Rubrica, classeDoTexto } from "./pecasResultados";
import {
  moneyFin,
  monthKeyLabel,
  type FinCategory,
  type FinExpense,
  type FinInvoice, type FinProvisionRule,
  type FinSale,
} from "./financeiroData";
import {
  buildResumoFechamento,
  CATEGORIA_IMPOSTOS_PROVISAO,
  DIVISAO_LUCRO,
  type FechamentoEscrito,
} from "./resumoFechamento";

export function ResumoFechamentoCard({
  sales,
  expenses,
  categories,
  provisionRules,
  invoices = [],
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
  invoices?: FinInvoice[];
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
        invoices,
        monthKey,
        meta,
        escrito,
        categoriaImpostos: CATEGORIA_IMPOSTOS_PROVISAO,
      }),
    [sales, expenses, categories, provisionRules, invoices, monthKey, meta, escrito],
  );

  const anotacao = (chave: keyof FechamentoEscrito) => ({
    value: escrito[chave],
    onChange: (evento: React.ChangeEvent<HTMLTextAreaElement>) =>
      onEscritoChange({ ...escrito, [chave]: evento.target.value }),
    onBlur: () => (readOnly ? undefined : onSalvar?.()),
    disabled: readOnly,
    rows: 3,
    className: classeDoTexto,
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
      <table>
        <tr><td></td><td class="num"><strong>IMP MENSAL</strong></td><td class="num"><strong>IMP TRIMES</strong></td></tr>
        <tr><td>Consulta</td><td class="num">${moneyFin(resumo.impostosNotas.consulta.mensal)}</td><td class="num">${moneyFin(resumo.impostosNotas.consulta.trimestral)}</td></tr>
        <tr><td>Procedimento</td><td class="num">${moneyFin(resumo.impostosNotas.procedimento.mensal)}</td><td class="num">${moneyFin(resumo.impostosNotas.procedimento.trimestral)}</td></tr>
        <tr><td><strong>Soma</strong></td><td class="num"><strong>${moneyFin(resumo.impostosNotas.mensal)}</strong></td><td class="num"><strong>${moneyFin(resumo.impostosNotas.trimestral)}</strong></td></tr>
      </table>
      <div class="linha"><span>${resumo.impostosNotas.notas} nota(s) emitida(s) no mês · provisão lançada ${moneyFin(resumo.impostosLancados)}</span><strong>${moneyFin(resumo.impostosNotas.total)}</strong></div>
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

  const tomDe = (valor: number) => (valor >= 0 ? ("ok" as const) : ("erro" as const));

  return (
    <BlocoFolha as="section" aria-labelledby={`resumo-fechamento-${monthKey}`} className="grid gap-6 p-6 max-md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`resumo-fechamento-${monthKey}`} className="flex items-start gap-2 text-xl font-bold leading-7 text-tinta">
          <FileText className="mt-1 h-5 w-5 shrink-0 stroke-oliva" aria-hidden="true" />
          <span className="min-w-0">
            Resumo de fechamento — {monthKeyLabel(monthKey)}{" "}
            <InfoTip className="align-middle" title="O que é digitado e o que é calculado">
              O que sai dos lançamentos aparece pronto, sem campo: entrada, saída, meta, provisões e o lucro. Você só
              preenche o que o app não tem como saber — os saldos das contas no dia e as decisões da reunião. Este
              fechamento NÃO leva crediário, e o lucro é sempre dividido {Math.round(DIVISAO_LUCRO.andrya * 100)}% Andrya
              / {Math.round(DIVISAO_LUCRO.daniel * 100)}% Daniel.
            </InfoTip>
          </span>
        </h2>
        <Botao tamanho="pq" icone={<Printer className="h-4 w-4" aria-hidden="true" />} onClick={imprimir}>
          Imprimir a folha
        </Botao>
      </div>

      {/* ---- saldos: digitados (só quem olha o banco sabe) ---- */}
      <div className="grid gap-3">
        <Rubrica as="h3">Saldos no dia do fechamento</Rubrica>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Campo rotulo="Itaú">
            <input {...campo("saldoItau")} placeholder="18.614,54" inputMode="decimal" className={classeDoCampoNumero} />
          </Campo>
          <Campo rotulo="Safra">
            <input {...campo("saldoSafra")} placeholder="23.885,46" inputMode="decimal" className={classeDoCampoNumero} />
          </Campo>
          <Campo rotulo="Observação do Safra">
            <input {...campo("saldoSafraNota")} placeholder="Ex.: poupança de junho e julho" className={classeDoCampo} />
          </Campo>
          <Campo rotulo="Santander">
            <input {...campo("saldoSantander")} placeholder="conta inativa" className={classeDoCampo} />
          </Campo>
          <Campo rotulo="Dinheiro">
            <input {...campo("dinheiro")} placeholder="0,00" inputMode="decimal" className={classeDoCampoNumero} />
          </Campo>
          <div className="grid content-end">
            <p className="flex h-10 items-center justify-between gap-3 rounded-controle bg-saber px-3 text-sm font-medium text-tinta-2">
              Somando <strong className="font-bold tabular-nums text-tinta">{moneyFin(resumo.saldos.total)}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* ---- derivado: entrou × saiu × meta ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        <BlocoSaber className="grid content-start gap-3">
          <Rubrica as="h3">Entrou × saiu (dos lançamentos)</Rubrica>
          <Razao
            linhas={[
              { rotulo: "Entrada total + impostos prov.", valor: moneyFin(resumo.entradaTotalComImpostos) },
              { rotulo: "Saída total", valor: moneyFin(resumo.saidaTotal) },
              { rotulo: "Lucro do mês (sem crediário)", valor: moneyFin(resumo.lucroDoMes), tom: tomDe(resumo.lucroDoMes) },
            ]}
          />
        </BlocoSaber>
        <BlocoSaber className="grid content-start gap-3">
          <Rubrica as="h3">Meta da equipe</Rubrica>
          <Razao
            linhas={[
              { rotulo: "Entrada SEM impostos", valor: moneyFin(resumo.entradaSemImpostos) },
              { rotulo: "Meta do mês", valor: moneyFin(resumo.meta) },
              {
                rotulo: resumo.bateuMeta ? "Passou da meta em" : "Faltou",
                valor: moneyFin(Math.abs(resumo.faltaParaMeta)),
                tom: resumo.bateuMeta ? "ok" : "erro",
              },
            ]}
          />
        </BlocoSaber>
      </div>

      {/* ---- provisões: derivadas das regras ---- */}
      <BlocoSaber className="grid content-start gap-3">
        <Rubrica as="h3" className="flex items-center gap-1">
          Poupança — impostos e afins
          <InfoTip title="De onde vem">
            Os impostos saem das notas fiscais emitidas no mês (alíquotas da aba Impostos &amp; NFs: mensal = ISS +
            PIS + COFINS, trimestral = IRPJ + CSLL); sem nota registrada, vale a provisão lançada. As outras linhas vêm
            das regras de provisão cadastradas (13º, férias, rescisão, urgências, início de ano, confraternização).
          </InfoTip>
        </Rubrica>
        <Razao linhas={[{ rotulo: "IMPOSTOS", valor: moneyFin(resumo.impostosProvisionados) }]} />
        {/* IMP MENSAL / IMP TRIMES pelas notas do mês (05/10/2026): o papel pede
            consulta × procedimento, mensal × trimestral — sai sozinho das notas. */}
        <div className="overflow-x-auto">
          <table className={cn(tabela.tabela, "[&_td]:py-2 [&_th]:h-9")}>
            <thead>
              <tr>
                <th className={tabela.th}>Pelas notas do mês</th>
                <th className={tabela.thNum}>Imp. mensal</th>
                <th className={tabela.thNum}>Imp. trimestral</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tabela.td}>Consulta</td>
                <td className={tabela.tdNum}>{moneyFin(resumo.impostosNotas.consulta.mensal)}</td>
                <td className={tabela.tdNum}>{moneyFin(resumo.impostosNotas.consulta.trimestral)}</td>
              </tr>
              <tr>
                <td className={tabela.td}>Procedimento</td>
                <td className={tabela.tdNum}>{moneyFin(resumo.impostosNotas.procedimento.mensal)}</td>
                <td className={tabela.tdNum}>{moneyFin(resumo.impostosNotas.procedimento.trimestral)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className={tabela.pe}>Soma</td>
                <td className={tabela.peNum}>{moneyFin(resumo.impostosNotas.mensal)}</td>
                <td className={tabela.peNum}>{moneyFin(resumo.impostosNotas.trimestral)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className={cn("text-[13px] font-medium leading-5", Math.abs(resumo.impostosLancados - resumo.impostosProvisionados) >= 0.01 ? "font-bold text-atencao" : "text-tinta-2")}>
          {resumo.impostosNotas.notas} nota(s) emitida(s) no mês.
          {Math.abs(resumo.impostosLancados - resumo.impostosProvisionados) >= 0.01
            ? ` A provisão lançada em Contas a Pagar está em ${moneyFin(resumo.impostosLancados)}; ajuste-a para ${moneyFin(resumo.impostosProvisionados)}.`
            : " A provisão lançada bate com as notas."}
        </p>
        <Razao linhas={resumo.provisoesFixas.map((linha) => ({ rotulo: linha.nome, valor: moneyFin(linha.valor) }))} />
        <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-controle bg-folha px-4 py-3">
          <span className="text-sm font-bold leading-5 text-tinta">Total a provisionar</span>
          <Numero texto={moneyFin(resumo.totalProvisoes)} tamanho="pequeno" />
        </div>
      </BlocoSaber>

      {/* ---- decisões da reunião: digitadas ---- */}
      <div className="grid gap-4">
        <Rubrica as="h3">Decisões da reunião</Rubrica>
        <Campo rotulo="Adiantamentos">
          <input {...campo("adiantamentos")} placeholder="Ex.: 2.000,00 — adiantamento da Aline" className={classeDoCampo} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Campo rotulo="Ficou acordado o provisionamento apenas do:">
            <textarea {...anotacao("provisionamentoAcordado")} placeholder="Ex.: impostos do mês + 13º dos sócios" />
          </Campo>
          <Campo rotulo="Valor provisionado">
            <input {...campo("provisionamentoValor")} placeholder="0,00" inputMode="decimal" className={classeDoCampoNumero} />
          </Campo>
        </div>
        <Campo rotulo="Distribuição de lucro — pagamentos conta sócia">
          <textarea {...anotacao("pagamentosContaSocia")} placeholder="Ex.: cartão da CEO 4.200,00 · convênio 1.100,00" />
        </Campo>
      </div>

      {/* ---- a divisão, sempre 80/20 ---- */}
      <BlocoSaber className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Rubrica as="h3">Distribuição de lucro real</Rubrica>
          <Campo rotulo="Total distribuído (em branco = lucro do mês)" className="w-full sm:w-72">
            <input {...campo("lucroDistribuido")} placeholder={moneyFin(resumo.lucroDoMes)} inputMode="decimal" className={classeDoCampoNumero} />
          </Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { nome: "Andrya", pct: DIVISAO_LUCRO.andrya, valor: resumo.divisao.andrya },
            { nome: "Daniel", pct: DIVISAO_LUCRO.daniel, valor: resumo.divisao.daniel },
          ].map((socio) => (
            <div key={socio.nome} className="grid gap-3 rounded-controle bg-folha px-5 py-4">
              <Rubrica>
                {socio.nome} — {Math.round(socio.pct * 100)}%
              </Rubrica>
              <Numero texto={moneyFin(socio.valor)} tamanho="medio" />
            </div>
          ))}
        </div>
        <p className="text-[13px] font-medium leading-5 text-tinta-2">
          A divisão {Math.round(DIVISAO_LUCRO.andrya * 100)}/{Math.round(DIVISAO_LUCRO.daniel * 100)} é fixa por decisão
          societária — o app calcula, não deixa digitar errado.
        </p>
      </BlocoSaber>
    </BlocoFolha>
  );
}
