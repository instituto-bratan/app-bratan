# Sistema Financeiro 360 — Especificação

> Objetivo: substituir 8 planilhas interligadas por um fluxo onde **cada fato é digitado UMA vez** e
> todos os relatórios (Entradas, P12, Impostos, Repasses, Poupança, PDCA) são **derivados automaticamente**.
> Princípio do Plano de Virada: acabar com "três planilhas contando três histórias" — verdade única dos números.

## Diagnóstico das planilhas atuais

| Planilha | O que é hoje | Retrabalho identificado |
| --- | --- | --- |
| ENTRADA | Grade diária: total, dinheiro/pix/cartão, medicação (trat.), consulta, nutri/psi; bloco de taxas Itaú/Safra; bloco poupança; distribuição de lucro | Cada venda é digitada aqui E gera NF na planilha de impostos E aparece no PDCA E no fechamento das doutoras |
| P12 | DRE anual: categoria × mês (custo fixo, mão de obra, variáveis, poupanças) | Cada conta paga é somada manualmente na categoria; faturamento re-digitado da ENTRADA |
| CONTAS A PAGAR | Ledger de saídas (vencimento, pagamento, descrição, valor, forma, categoria P12, NF anexa) + retiradas de cofre | A coluna F (categoria) é o vínculo manual com a P12; impostos do mês entram aqui de novo |
| COMPRAS | Compras cartão de crédito + pix/boleto, com NF e previsão de entrega; abas de fatura | Boletos aparecem AQUI e em Contas a Pagar; fatura total re-digitada na P12 |
| IMPOSTOS | 1 linha por NF emitida (consulta 13,33%: ISS 2/PIS 0,65/COFINS 3/IRPJ 4,8/CSLL 2,88; tratamento: ISS 2/PIS 0,65/COFINS 3/IRPJ 1,2/CSLL 1,08) | Totais mensais/trimestrais re-digitados em Contas a Pagar e P12 |
| POUPANÇA | Provisões mensais (13º sócios 7.272, 13º colab 2.063, férias 2.743, urgências, festa, início de ano) | Saldo acumulado calculado à mão; entradas re-digitadas da ENTRADA |
| FECHAMENTO NUTRI/PSI | 1 linha por atendimento: plano (R$110 Instituto→Dra) vs avulso (R$150 Dra→Instituto) vs retorno (sem repasse) | Consultas já digitadas na ENTRADA (colunas J/K) |
| PDCA | 1 linha por consulta do Dr Daniel: compareceu, retorno/indicação/lead, aderiu/não aderiu + motivo + valor | Valores têm que bater com F23 (tratamentos) da ENTRADA |

**Insight central**: tudo deriva de apenas **4 fatos**:

1. **VENDA/COMANDA** (paciente, data, itens: consulta/bio/tratamento/sinal, valores, forma pgto, profissional)
   → gera: linha do dia na ENTRADA, base da NF (impostos), linha do PDCA, linha do repasse nutri/psi, recebível
2. **DESPESA** (descrição, valor, vencimento/pagamento, forma, categoria P12, NF, parcela)
   → gera: contas a pagar, compras, fatura cartão, linha da categoria na P12
3. **NOTA FISCAL** (vinculada à comanda, tipo consulta/tratamento) → impostos calculados por alíquota, guias mensais/trimestrais que viram DESPESA automaticamente
4. **MOVIMENTO DE POUPANÇA/PROVISÃO** (regra mensal automática + movimentos manuais) → saldo acumulado

O que sobra é **conciliação** (bater com extrato Itaú/comprovantes) e **visões** (P12, fechamentos) — 100% derivadas.

## Modelo de dados (Supabase)

- `fin_categories` — árvore da P12 (grupo: CUSTO_FIXO, MAO_DE_OBRA, CUSTO_VARIAVEL, POUPANCA; item: ex. "Aluguel / IPTU / Água"), com seed vindo da planilha real.
- `fin_sales` (comanda) — data, paciente_ref (liga CRM!), profissional (DR_DANIEL/NUTRI/PSICOLOGA), status.
- `fin_sale_items` — tipo (CONSULTA, BIOIMPEDANCIA, TRATAMENTO, SINAL, RETORNO, DESTRAVAR), valor, adesão PDCA (COMPLETO/PARCIAL/NAO_ADERIU + motivo/objeção, era_paciente).
- `fin_payments` — venda × forma (PIX, CARTAO_CREDITO/DEBITO com bandeira/maquininha/parcelas, DINHEIRO), valor, taxa estimada, conciliado_em.
- `fin_expenses` — descrição, categoria_id (P12), valor, vencimento, pagamento, forma, fornecedor, parcela n/N, NF (comprovante_id → módulo Comprovantes já existente!), recorrente, origem (MANUAL, CARTAO_FATURA, IMPOSTO_GUIA, REPASSE).
- `fin_invoices` (NF) — sale_id, tipo (CONSULTA/TRATAMENTO), nº nota, data emissão, valor; alíquotas em `fin_tax_rates` versionadas; impostos calculados por trigger/derivação.
- `fin_provisions` — regras mensais (valores da aba Provisionamentos) usadas como **sugestão**: no fechamento do mês a coordenação revisa, edita ou zera cada linha e confirma manualmente (decisão do Lucas: nem sempre todos os valores são provisionados). + `fin_savings_moves` (entrada/saída poupança com motivo) → saldo derivado.
- `fin_reconciliations` — dia × conta (Itaú/Safra/Santander): esperado (derivado) vs extrato (informado/CSV), status.
- `fin_partner_rules` — regras de repasse (plano R$110 Instituto→Dra; avulso R$150 Dra→Instituto; retorno 0) versionadas.

## Telas (Financeiro 360)

1. **Lançar dia** (recepção/financeiro): a versão digital do cartão verde diário — uma linha por paciente (autocomplete do CRM), itens (consulta/tratamento/sinal/psi/nutri), forma de pagamento. O app calcula o cartão inteiro (totais por forma e por tipo, total diário) e alimenta ENTRADA, PDCA, NFs e repasses. Se veio de deal do Kanban fechado, já sugere valores. Notas livres por lançamento (ex.: "NF unificada", "+11% imposto").
2. **Contas a pagar**: fila por vencimento com categoria P12 obrigatória, anexo de NF via módulo Comprovantes, recorrências.
3. **Fechamento do dia** (o "bate"): esperado × Itaú por forma de pagamento, checklist de conciliação, divergências em vermelho.
4. **P12 ao vivo**: a matriz categoria × mês idêntica à planilha, mas 100% derivada — clicou na célula, vê os lançamentos que a compõem (prova viva automática).
5. **Impostos**: NFs pendentes de emissão (comanda sem NF), calculadas por alíquota; no fim do mês gera as guias como despesas automaticamente.
6. **Repasses**: fechamento nutri/psi gerado das comandas do mês, com aprovação e geração da despesa/receita.
7. **Poupança**: saldo acumulado com provisões automáticas do mês + movimentos.
8. **PDCA do Dr Daniel**: taxa de adesão derivada dos sale_items de tratamento (bate com ENTRADA por construção).

## Regras de ouro

- Banco é fonte da verdade; planilhas viram **exportação** (botão exportar Excel/Obsidian por mês para auditoria/contador).
- Nada digitado duas vezes: NF nasce da comanda; guia de imposto nasce das NFs; fatura de cartão nasce das compras; repasse nasce das comandas; P12 nasce de tudo.
- Obra/capex separado do operacional (flag `is_capex`) — recomendação central do Plano de Virada.
- RLS: financeiro completo só coordenação (`gestor_financeiro`, `dr_daniel`, `ceo`, `gestor`); recepção lança comanda e vê o próprio dia.
- Toda divergência de conciliação tem dono, prazo e status (padrão do app).

## Sprints

1. **Núcleo**: migrations + categorias P12 seed + Lançar dia + Contas a pagar (com categoria) + P12 ao vivo (leitura).
2. **Bater o caixa**: taxas de cartão, conciliação diária, fechamento do dia, poupança/provisões.
3. **Impostos e repasses**: NFs, alíquotas, guias automáticas, fechamento nutri/psi.
4. **PDCA + integração CRM**: adesão derivada, deal fechado → comanda sugerida, importador dos meses históricos das planilhas.
