// A PLANILHA DE PRECIFICAÇÃO DENTRO DO APP (15/09/2026).
//
// "BRATAN - PRECIFICACAO E LUCRO - TAXA HORA SALA OFICIAL (1).numbers", versão que o
// Lucas mandou em 15/09/2026. Três mudanças em relação à de 14/09:
//  · IMPOSTO DE NF: consulta 13,33% → 26% e procedimento 7,93% → 11,48% (células
//    G1 e I1 da aba Precificação). A planilha trocou a taxa de cartão para 2,39%
//    (K1) — MAS o Lucas confirmou em 15/09 que a taxa real continua 3,84%, que é
//    a que vale aqui; a célula K1 da planilha precisa ser corrigida. Entra só nas
//    linhas em débito/parcelado;
//  · CUSTO HORA-SALA: despesas mensais 141.437,44 → 157.697,18. A hora de sala
//    produtiva passou de R$ 102,05 para R$ 113,78 (R$ 1,89631/min) e a poltrona de
//    aplicação de R$ 0,425197 para R$ 0,474078/min (R$ 28,44/hora);
//  · a nutricionista ganhou a linha em débito/3x (R$ 650), como os outros itens.
// Efeito no que o médico recebe: o Plano de R$ 6.997 tinha lucro bruto 4.398,46
// (50% = 2.199,23) e agora tem 3.476,74 (50% = 1.738,37) — o imposto maior da
// consulta é quase toda a diferença. As consultas caíram na mesma proporção.
// ATENÇÃO: o texto de ajuda dentro da planilha (linhas 59 e 62 da aba) ainda fala
// em 13,33% / 7,93% / 3,84% e em comissão de 1%; quem manda são as células do topo
// e as colunas, que é o que este catálogo copia.
//
// COMISSÃO 13% (15/10/2026, Lucas: "na comissão pode mudar o do Daniel para 13%
// também" — a mesma dos procedimentos do Dr. Moisés). Tudo que estava em 10%
// passou para 13%; as tirzepatidas de 1% (frasco, até 30 un, 31 a 49 un) ficam
// como estavam. Vale para as comandas a partir de 01/10/2026 (MUDANCA_DE_COMISSAO):
// setembro já foi fechado e mandado à contabilidade, então o salário do Dr. Daniel
// daquele mês não muda sozinho. Plano de R$ 6.997: lucro bruto 3.476,74 → 3.266,83
// (50% = 1.738,37 → 1.633,42). A planilha "… impostos 15-09 e comissao 13 (15-10)
// .xlsx" está igual a este catálogo (39 produtos conferidos; o sinal de R$ 200 só
// existe aqui).
//
// DR. MOISÉS (15/10/2026): os procedimentos do biomédico Dr. Moisés entram
// no mesmo catálogo, vindos da aba "Precificação Dr. Moisés" da planilha "… (com
// Dr. Moises) AT - dossies 08 a 10 (3).xlsx" que o Lucas mandou em 15/10. Mesmas
// colunas e mesma fórmula; o que muda é de quem é o produto (`profissional`) e a
// parte dele: 20% da coluna P (coluna Q da aba dele), não 50%. Ver profissionais.ts.
//
// A planilha tem todos os procedimentos com preço oficial (coluna F) e o LUCRO BRUTO DO
// PRODUTO (coluna P = preço − imposto/cartão − comissão comercial − consumíveis
// − repasse nutri/psi − custo hora-sala). A coluna R, "Valor Médico", é 50% desse
// lucro bruto — o que o Dr. Daniel recebe por produto (conferido linha a linha).
//
// Este catálogo é a fonte única para dois lugares:
//  · o FECHAMENTO no Kanban e o LANÇAR DIA, onde quem registra escolhe o produto
//    da tabela (Programa + HCG + testosterona + vitamina D…) e a comanda nasce
//    itemizada com o nome e o preço oficiais (Lucas, 02/09: "pra quando chegar
//    no Lucro Inteligente já batesse tudo certinho, pra que não houvesse erros");
//  · o LUCRO INTELIGENTE, que reconhece o item pelo nome exato, por palavra-chave
//    na descrição ou pelo preço, e aplica a metade do médico.
import type { FinSaleItem, FinSaleItemType } from "./financeiroData";
import { ehProfissional, type ProfissionalId } from "./profissionais";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

/** O que o item é para o ticket médio e o PDCA. Mora aqui para `naturezaItem.ts` poder importar sem ciclo. */
export type NaturezaItem = "PLANO" | "CONSULTA" | "TRATAMENTO" | "MEDICACAO" | "SINAL" | "EXAME" | "OUTRO_PROFISSIONAL" | "OUTRO";

export type ProdutoPrecificado = {
  nome: string;
  /** Agrupamento da tabela, para o seletor. */
  secao: string;
  preco: number;
  /** Coluna P da planilha, "Lucro Bruto Produto" (= 2 × a coluna do médico). */
  lucroBruto: number;
  /** Coluna G da planilha, como fração do preço: NF (26% consulta · 11,48% procedimento) + cartão 3,84% nas linhas em débito/parcelado (taxa real confirmada pelo Lucas em 15/09; acordo Rede Q-7621480). */
  imposto: number;
  /** Coluna H: comissão comercial (10%; 1% nas tirzepatidas até 49 un). */
  comissao: number;
  /** Coluna L: repasse nutri/psi da linha — na planilha é um valor da LINHA, não multiplica pela quantidade. */
  repasse?: number;
  /**
   * O que este produto É para o ticket médio e o PDCA — quando isso não pode
   * ser deduzido do `tipos`.
   *
   * 21/09/2026: o Lucas pediu que Plano, sinal, mapeamento e teste genético
   * passassem a LANÇAR como consulta na comanda. Só que a natureza era lida de
   * `tipos[0]`, então a troca faria o sinal e o mapeamento entrarem no ticket —
   * o contrário da regra dele de 08/09 ("no ticket e no PDCA não entram sinal
   * nem medicamentos separados"). Os dois conceitos andavam grudados por
   * acidente; agora o tipo diz como se lança e a natureza diz o que conta.
   */
  natureza?: NaturezaItem;
  /** Colunas K + O por unidade (consumível × sessões + minutos de sala × R$/min), tirado direto da planilha, sem arredondar. */
  custoFixo: number;
  /**
   * Minutos de sala por UNIDADE vendida (coluna E da planilha = sessões × tempo):
   * Plano 3 × 60 = 180; dose 15; consulta 60; mapeamento 10; psicóloga 4 × 60 = 240.
   * Pellet = 0: a sala do implante já está nos honorários (a planilha também
   * zera a coluna O dos pellets). É a base do KPI de ocupação de sala (14/09/2026).
   */
  minutosSala: number;
  /**
   * Os tipos de item da comanda em que este produto aparece.
   *
   * O PRIMEIRO é o que a comanda grava hoje. Os seguintes são os tipos com que
   * ele JÁ FOI gravado: sem eles, a troca de 21/09 (Plano, sinal, mapeamento e
   * teste genético passaram a lançar como consulta) faria o app deixar de
   * reconhecer as comandas de julho a setembro, e o Lucro Inteligente perderia
   * meses inteiros em silêncio.
   */
  tipos: FinSaleItemType[];
  padrao?: RegExp;
  /**
   * Quem executa o produto (15/10/2026). Sem o campo = Dr. Daniel. É o que a
   * comanda grava no item quando o produto é escolhido na lista, e é por ele
   * que o Lucro Inteligente sabe se a parte é de 50% (Dr. Daniel) ou 20% (Dr. Moisés).
   */
  profissional?: ProfissionalId;
};

export const CATALOGO_PRECIFICACAO: ProdutoPrecificado[] = [
  // APP DO DR. DANIEL — itens do plano
  // Só o Plano custa R$ 6.997 (Lucas, 02/09: "o clube virou Consulta Black" — a
  // R$ 1.500, com 5% de desconto em tratamentos; está na esteira de consultas).
  { nome: "Plano de Acompanhamento · 6 meses", secao: "Plano de Acompanhamento", preco: 6997, lucroBruto: 3266.83, imposto: 0.26, comissao: 0.13, repasse: 660, custoFixo: 341.335887, minutosSala: 180, tipos: ["CONSULTA", "TRATAMENTO"], natureza: "PLANO", padrao: /programa|acompanhamento|plano/i },
  { nome: "Testosterona base / cipionato / enantato", secao: "Hormonais (por dose)", preco: 490, lucroBruto: 309.61, imposto: 0.1148, comissao: 0.13, custoFixo: 60.441164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /cipionato|enantato|testosterona base|testo base/i },
  { nome: "Testosterona blend", secao: "Hormonais (por dose)", preco: 590, lucroBruto: 331.8, imposto: 0.1148, comissao: 0.13, custoFixo: 113.771164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /blend/i },
  { nome: "Testosterona + HCG", secao: "Hormonais (por dose)", preco: 790, lucroBruto: 369.03, imposto: 0.1148, comissao: 0.13, custoFixo: 227.581552, minutosSala: 20, tipos: ["TRATAMENTO"], padrao: /testo\w*.*hcg|hcg.*testo/i },
  { nome: "Undecilato de testosterona", secao: "Hormonais (por dose)", preco: 590, lucroBruto: 386.96, imposto: 0.1148, comissao: 0.13, custoFixo: 58.611164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /undecilato|nebido/i },
  { nome: "Nandrolona", secao: "Hormonais (por dose)", preco: 590, lucroBruto: 401.96, imposto: 0.1148, comissao: 0.13, custoFixo: 43.611164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /nandrolona|deca/i },
  { nome: "HCG (frasco)", secao: "Hormonais (por dose)", preco: 590, lucroBruto: 243.46, imposto: 0.1148, comissao: 0.13, custoFixo: 202.111164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /hcg/i },
  { nome: "Vitamina D 600.000 UI", secao: "Vitaminas IM (por dose)", preco: 590, lucroBruto: 417.96, imposto: 0.1148, comissao: 0.13, custoFixo: 27.611164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /vitamina d\b|vit\.? ?d\b|colecalciferol/i },
  { nome: "Metilcobalamina · B12", secao: "Vitaminas IM (por dose)", preco: 590, lucroBruto: 421.36, imposto: 0.1148, comissao: 0.13, custoFixo: 24.211164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /b12|cobalamina/i },
  { nome: "Metilfolato · B9", secao: "Vitaminas IM (por dose)", preco: 590, lucroBruto: 421.56, imposto: 0.1148, comissao: 0.13, custoFixo: 24.011164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /\bb9\b|folato/i },
  { nome: "Piridoxina · B6", secao: "Vitaminas IM (por dose)", preco: 590, lucroBruto: 433.66, imposto: 0.1148, comissao: 0.13, custoFixo: 11.911164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /\bb6\b|piridoxina/i },
  { nome: "NADH", secao: "Vitalidade e performance", preco: 590, lucroBruto: 379.26, imposto: 0.1148, comissao: 0.13, custoFixo: 66.311164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /nadh/i },
  { nome: "Coenzima Q10", secao: "Vitalidade e performance", preco: 590, lucroBruto: 412.96, imposto: 0.1148, comissao: 0.13, custoFixo: 32.611164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /q10|coenzima/i },
  { nome: "Ferinject", secao: "Vitalidade e performance", preco: 1990, lucroBruto: 993.88, imposto: 0.1148, comissao: 0.13, custoFixo: 508.963105, minutosSala: 40, tipos: ["TRATAMENTO"], padrao: /ferinject|carboximaltose/i },
  { nome: "Tirzepatida · frasco", secao: "Composição corporal e peso", preco: 3170, lucroBruto: 1662.27, imposto: 0.1148, comissao: 0.01, custoFixo: 1112.111164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /(tirze|mounjaro|zepbound).*frasco|frasco.*(tirze|mounjaro)/i },
  { nome: "Tirzepatida · até 30 un", secao: "Composição corporal e peso", preco: 390, lucroBruto: 196.09, imposto: 0.1148, comissao: 0.01, custoFixo: 145.241164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /tirze|mounjaro|zepbound/i },
  { nome: "Tirzepatida · 31 a 49 un", secao: "Composição corporal e peso", preco: 590, lucroBruto: 279.05, imposto: 0.1148, comissao: 0.01, custoFixo: 237.321164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /tirze|mounjaro|zepbound/i },
  { nome: "Tirzepatida · acima de 50 un", secao: "Composição corporal e peso", preco: 790, lucroBruto: 313.25, imposto: 0.1148, comissao: 0.13, custoFixo: 283.361164, minutosSala: 15, tipos: ["TRATAMENTO"], padrao: /tirze|mounjaro|zepbound/i },
  { nome: "Honorários de implante (sem pellet)", secao: "Implante hormonal", preco: 5700, lucroBruto: 3995.66, imposto: 0.1148, comissao: 0.13, repasse: 100, custoFixo: 208.978629, minutosSala: 60, tipos: ["TRATAMENTO"], padrao: /implante|honor/i },
  { nome: "Pellet testosterona 50mg", secao: "Implante hormonal", preco: 123, lucroBruto: -5.51, imposto: 0.1148, comissao: 0.13, custoFixo: 98.4, minutosSala: 0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet testosterona 100mg", secao: "Implante hormonal", preco: 190, lucroBruto: -8.51, imposto: 0.1148, comissao: 0.13, custoFixo: 152, minutosSala: 0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet testosterona 125mg", secao: "Implante hormonal", preco: 224, lucroBruto: -10.04, imposto: 0.1148, comissao: 0.13, custoFixo: 179.2, minutosSala: 0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet testosterona 150mg", secao: "Implante hormonal", preco: 280, lucroBruto: -12.54, imposto: 0.1148, comissao: 0.13, custoFixo: 224, minutosSala: 0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet testosterona 200mg", secao: "Implante hormonal", preco: 336, lucroBruto: -15.05, imposto: 0.1148, comissao: 0.13, custoFixo: 268.8, minutosSala: 0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet estradiol 25mg", secao: "Implante hormonal", preco: 213, lucroBruto: -9.54, imposto: 0.1148, comissao: 0.13, custoFixo: 170.4, minutosSala: 0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet gestrinona 35mg", secao: "Implante hormonal", preco: 381, lucroBruto: -17.07, imposto: 0.1148, comissao: 0.13, custoFixo: 304.8, minutosSala: 0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  { nome: "Pellet gestrinona 50mg", secao: "Implante hormonal", preco: 538, lucroBruto: -24.1, imposto: 0.1148, comissao: 0.13, custoFixo: 430.4, minutosSala: 0, tipos: ["TRATAMENTO"], padrao: /pellet/i },
  // APP DO CLOSER — esteira de consultas (Lucas, 02/09/2026). Lucro bruto pela
  // mesma conta da planilha: preço − NF 13,33% (consulta) − comissão comercial
  // de 10% − custo de sala (60 min = R$ 113,78; 20 min = R$ 37,93).
  // SINAL DE R$ 200 (10/09/2026, áudio da CEO): "se eu coloco sinal de 500, eu
  // não consigo lançar um comprovante de 200... preciso ficar justificando esses
  // 200 reais". Os dois valores praticados viram opção própria; o lucro bruto
  // segue a mesma FÓRMULA da planilha: 200 − NF 26% − comissão 13% − poltrona = 93,56
  // (99,56 com a comissão de 10% de antes de 01/10/2026).
  { nome: "Sinal de consulta", secao: "Comercial e consultas", preco: 500, lucroBruto: 276.56, imposto: 0.26, comissao: 0.13, custoFixo: 28.444657, minutosSala: 15, tipos: ["CONSULTA", "SINAL"], natureza: "SINAL" },
  { nome: "Sinal de consulta (R$ 200)", secao: "Comercial e consultas", preco: 200, lucroBruto: 93.56, imposto: 0.26, comissao: 0.13, custoFixo: 28.444657, minutosSala: 15, tipos: ["CONSULTA", "SINAL"], natureza: "SINAL" },
  { nome: "Consulta avulsa + bioimpedância — Pix", secao: "Comercial e consultas", preco: 2500, lucroBruto: 1411.22, imposto: 0.26, comissao: 0.13, custoFixo: 113.778629, minutosSala: 60, tipos: ["CONSULTA"] },
  { nome: "Consulta avulsa + bioimpedância — débito/2x", secao: "Comercial e consultas", preco: 2750, lucroBruto: 1458.12, imposto: 0.2984, comissao: 0.13, custoFixo: 113.778629, minutosSala: 60, tipos: ["CONSULTA"] },
  { nome: "Consulta Black (5% de desconto em tratamentos) — Pix", secao: "Comercial e consultas", preco: 1500, lucroBruto: 801.22, imposto: 0.26, comissao: 0.13, custoFixo: 113.778629, minutosSala: 60, tipos: ["CONSULTA"], padrao: /black|club|clube/i },
  { nome: "Consulta Black (5% de desconto em tratamentos) — débito/2x", secao: "Comercial e consultas", preco: 1650, lucroBruto: 829.36, imposto: 0.2984, comissao: 0.13, custoFixo: 113.778629, minutosSala: 60, tipos: ["CONSULTA"], padrao: /black|club|clube/i },
  { nome: "Consulta Diamond — Pix", secao: "Comercial e consultas", preco: 1100, lucroBruto: 557.22, imposto: 0.26, comissao: 0.13, custoFixo: 113.778629, minutosSala: 60, tipos: ["CONSULTA"], padrao: /diamond/i },
  { nome: "Mapeamento corporal — Pix", secao: "Comercial e consultas", preco: 200, lucroBruto: 132.08, imposto: 0.1148, comissao: 0.13, custoFixo: 18.963105, minutosSala: 10, tipos: ["CONSULTA", "BIOIMPEDANCIA"], natureza: "EXAME" },
  { nome: "Mapeamento corporal — débito/2x", secao: "Comercial e consultas", preco: 250, lucroBruto: 160.24, imposto: 0.1532, comissao: 0.13, custoFixo: 18.963105, minutosSala: 10, tipos: ["CONSULTA", "BIOIMPEDANCIA"], natureza: "EXAME" },
  // Teste genético: o kit/laboratório ainda não tem custo comprovado (aba "Custos a
  // confirmar") — o lucro bruto aqui é SEM o kit e vai cair quando o custo entrar.
  { nome: "Teste Genético (inclui consulta de 20 min para leitura)", secao: "Comercial e consultas", preco: 3900, lucroBruto: 2341.07, imposto: 0.26, comissao: 0.13, custoFixo: 37.92621, minutosSala: 20, tipos: ["CONSULTA", "TRATAMENTO"], natureza: "TRATAMENTO", padrao: /gen[eé]tic/i },
  // Nutri e psi: preço de tabela para o seletor; não são do médico executor.
  { nome: "Dra. Géssica (nutricionista) — Pix", secao: "Nutrição e psicologia", preco: 600, lucroBruto: 102.22, imposto: 0.26, comissao: 0.13, repasse: 150, custoFixo: 113.778629, minutosSala: 60, tipos: ["NUTRICIONISTA"], padrao: /g[eé]ssica|nutri/i },
  { nome: "Dra. Géssica (nutricionista) — débito/3x", secao: "Nutrição e psicologia", preco: 650, lucroBruto: 107.76, imposto: 0.2984, comissao: 0.13, repasse: 150, custoFixo: 113.778629, minutosSala: 60, tipos: ["NUTRICIONISTA"] },
  { nome: "Dra. Bárbara (psicóloga) — 4 sessões", secao: "Nutrição e psicologia", preco: 790, lucroBruto: 26.79, imposto: 0.26, comissao: 0.13, custoFixo: 455.114517, minutosSala: 240, tipos: ["PSICOLOGA"], padrao: /b[aá]rbara|psic/i },
  // ---- DR. MOISÉS (biomédico) — 15/10/2026 ---------------------------------------
  // Copiado da aba "Precificação Dr. Moisés" (26 linhas, conferidas uma a uma: o
  // preço cheio reproduz a coluna P e 20% dela é a coluna Q, no comentário de cada
  // linha). Como a planilha calcula: avaliação com o imposto de CONSULTA (13,33%,
  // célula G1) e procedimento com o de PROCEDIMENTO (7,93%, I1); comissão comercial
  // 13%; consumíveis do dossiê (+ aluguel do laser no Lavieen e na depilação) e sala
  // produtiva a R$ 1,896310/min = R$ 113,78/h. Tudo igual ao Dr. Daniel desde
  // 15/10/2026, a pedido do Lucas: hora de sala de 15/09 ("o custo hora sala está
  // desatualizado, use o atualizado"), NF de 15/09 — 26% na avaliação (consulta) e
  // 11,48% no procedimento ("pode usar os impostos de 15/09 na aba do Moisés
  // também") — e comissão de 13% para os dois.
  // Palavra-chave: só serve para item do Dr. Moisés digitado à mão; produto dele
  // nunca é reconhecido num item do Dr. Daniel (ver produtoDoItem).
  { nome: "Avaliação capilar (com tricoscopia)", secao: "Dr. Moisés · Avaliações", preco: 550, lucroBruto: 221.72, imposto: 0.26, comissao: 0.13, custoFixo: 113.778629, minutosSala: 60, tipos: ["CONSULTA"], natureza: "CONSULTA", profissional: "moises", padrao: /capilar|tricosc/i },  // linha 6 · Q 44.34
  { nome: "Avaliação facial", secao: "Dr. Moisés · Avaliações", preco: 550, lucroBruto: 221.72, imposto: 0.26, comissao: 0.13, custoFixo: 113.778629, minutosSala: 60, tipos: ["CONSULTA"], natureza: "CONSULTA", profissional: "moises", padrao: /facial/i },  // linha 7 · Q 44.34
  { nome: "Toxina botulínica facial — Botox 100U", secao: "Dr. Moisés · Toxina botulínica (1 frasco por paciente)", preco: 2500, lucroBruto: 945.15, imposto: 0.1148, comissao: 0.13, custoFixo: 942.847944, minutosSala: 90, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /botox/i },  // linha 10 · Q 189.03
  { nome: "Toxina botulínica facial — Dysport 300U", secao: "Dr. Moisés · Toxina botulínica (1 frasco por paciente)", preco: 2500, lucroBruto: 808.15, imposto: 0.1148, comissao: 0.13, custoFixo: 1079.847944, minutosSala: 90, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /dysport/i },  // linha 11 · Q 161.63
  { nome: "Preenchimento ácido hialurônico — Juvéderm Volux (1 mL)", secao: "Dr. Moisés · Preenchimento com ácido hialurônico (por mL)", preco: 2000, lucroBruto: 897.32, imposto: 0.1148, comissao: 0.13, custoFixo: 613.078629, minutosSala: 60, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /volux|juv[eé]derm/i },  // linha 14 · Q 179.46
  { nome: "Preenchimento ácido hialurônico — Restylane Defyne (1 mL)", secao: "Dr. Moisés · Preenchimento com ácido hialurônico (por mL)", preco: 2000, lucroBruto: 747.26, imposto: 0.1148, comissao: 0.13, custoFixo: 763.138629, minutosSala: 60, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /restylane|defyne/i },  // linha 15 · Q 149.45
  { nome: "Preenchimento ácido hialurônico — Belotero Intense Lido (1 mL)", secao: "Dr. Moisés · Preenchimento com ácido hialurônico (por mL)", preco: 2000, lucroBruto: 1047.82, imposto: 0.1148, comissao: 0.13, custoFixo: 462.578629, minutosSala: 60, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /belotero/i },  // linha 16 · Q 209.56
  { nome: "Microagulhamento facial (sessão)", secao: "Dr. Moisés · Microagulhamento e intradermoterapia (por sessão)", preco: 900, lucroBruto: 483.34, imposto: 0.1148, comissao: 0.13, custoFixo: 196.340867, minutosSala: 35, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /microagulhamento.*facial|facial.*microagulhamento/i },  // linha 19 · Q 96.67
  { nome: "Microagulhamento capilar (sessão)", secao: "Dr. Moisés · Microagulhamento e intradermoterapia (por sessão)", preco: 600, lucroBruto: 271.24, imposto: 0.1148, comissao: 0.13, custoFixo: 181.880867, minutosSala: 35, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /microagulhamento.*capilar|capilar.*microagulhamento/i },  // linha 20 · Q 54.25
  { nome: "Intradermoterapia capilar (sessão)", secao: "Dr. Moisés · Microagulhamento e intradermoterapia (por sessão)", preco: 800, lucroBruto: 435.15, imposto: 0.1148, comissao: 0.13, custoFixo: 169.012419, minutosSala: 40, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /intradermo|mesoterapia/i },  // linha 21 · Q 87.03
  { nome: "Lavieen facial (sessão)", secao: "Dr. Moisés · Lavieen e peeling (por sessão)", preco: 1500, lucroBruto: 750.16, imposto: 0.1148, comissao: 0.13, custoFixo: 382.637944, minutosSala: 90, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /lavieen/i },  // linha 24 · Q 150.03
  { nome: "Lavieen + ativo premium (sessão)", secao: "Dr. Moisés · Lavieen e peeling (por sessão)", preco: 1800, lucroBruto: 916.72, imposto: 0.1148, comissao: 0.13, custoFixo: 442.637944, minutosSala: 90, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /lavieen.*(ativo|premium)/i },  // linha 25 · Q 183.34
  { nome: "Jornada Lavieen + peeling (2 encontros)", secao: "Dr. Moisés · Lavieen e peeling (por sessão)", preco: 2350, lucroBruto: 1292.08, imposto: 0.1148, comissao: 0.13, custoFixo: 482.637944, minutosSala: 90, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /peeling|jornada/i },  // linha 26 · Q 258.42
  { nome: "Depilação a laser — full face", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 290, lucroBruto: 105.87, imposto: 0.1148, comissao: 0.13, custoFixo: 113.140867, minutosSala: 35, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /full ?face|rosto/i },  // linha 29 · Q 21.17
  { nome: "Depilação a laser — axilas", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 220, lucroBruto: 75.85, imposto: 0.1148, comissao: 0.13, custoFixo: 90.29621, minutosSala: 20, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /axila/i },  // linha 30 · Q 15.17
  { nome: "Depilação a laser — virilha completa", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 390, lucroBruto: 145.62, imposto: 0.1148, comissao: 0.13, custoFixo: 148.903972, minutosSala: 45, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /virilha/i },  // linha 31 · Q 29.12
  { nome: "Depilação a laser — barba + pescoço", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 290, lucroBruto: 98.55, imposto: 0.1148, comissao: 0.13, custoFixo: 120.459315, minutosSala: 30, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /barba|pesco[cç]o/i },  // linha 32 · Q 19.71
  { nome: "Depilação a laser — braços completos", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 350, lucroBruto: 127.06, imposto: 0.1148, comissao: 0.13, custoFixo: 137.259315, minutosSala: 30, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /bra[cç]o/i },  // linha 33 · Q 25.41
  { nome: "Depilação a laser — peitoral", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 350, lucroBruto: 127.06, imposto: 0.1148, comissao: 0.13, custoFixo: 137.259315, minutosSala: 30, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /peitoral/i },  // linha 34 · Q 25.41
  { nome: "Depilação a laser — abdômen", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 350, lucroBruto: 127.06, imposto: 0.1148, comissao: 0.13, custoFixo: 137.259315, minutosSala: 30, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /abd[oô]men/i },  // linha 35 · Q 25.41
  { nome: "Depilação a laser — peitoral + abdômen", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 450, lucroBruto: 157.34, imposto: 0.1148, comissao: 0.13, custoFixo: 182.503972, minutosSala: 45, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /peitoral.*abd[oô]men|abd[oô]men.*peitoral/i },  // linha 36 · Q 31.47
  { nome: "Depilação a laser — costas completas", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 450, lucroBruto: 157.34, imposto: 0.1148, comissao: 0.13, custoFixo: 182.503972, minutosSala: 45, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /costas/i },  // linha 37 · Q 31.47
  { nome: "Depilação a laser — pernas completas", secao: "Dr. Moisés · Depilação a laser (sessão avulsa)", preco: 450, lucroBruto: 168.98, imposto: 0.1148, comissao: 0.13, custoFixo: 170.859315, minutosSala: 30, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /perna/i },  // linha 38 · Q 33.8
  { nome: "Avaliação corporal (Abdominal Sculpt)", secao: "Dr. Moisés · Abdominal Sculpt", preco: 550, lucroBruto: 221.72, imposto: 0.26, comissao: 0.13, custoFixo: 113.778629, minutosSala: 60, tipos: ["CONSULTA"], natureza: "CONSULTA", profissional: "moises", padrao: /corporal/i },  // linha 41 · Q 44.34
  { nome: "Abdominal Sculpt — sessão Base", secao: "Dr. Moisés · Abdominal Sculpt", preco: 1290, lucroBruto: 778.46, imposto: 0.1148, comissao: 0.13, custoFixo: 195.748629, minutosSala: 60, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /sculpt.*base|base.*sculpt/i },  // linha 42 · Q 155.69
  { nome: "Abdominal Sculpt — sessão Intensive", secao: "Dr. Moisés · Abdominal Sculpt", preco: 1290, lucroBruto: 778.46, imposto: 0.1148, comissao: 0.13, custoFixo: 195.748629, minutosSala: 60, tipos: ["TRATAMENTO"], natureza: "TRATAMENTO", profissional: "moises", padrao: /intensive/i },  // linha 43 · Q 155.69
];

/** De quem é o produto (sem o campo = Dr. Daniel). */
export function profissionalDoProduto(produto: ProdutoPrecificado): ProfissionalId {
  return produto.profissional ?? "daniel";
}

/**
 * As seções na ordem da planilha, cada uma com os seus produtos — para montar o
 * seletor. Com `profissional`, só as seções dele (o Kanban mostra uma aba por
 * profissional para a lista não virar um paredão de botões).
 */
export function secoesDoCatalogo(profissional?: ProfissionalId) {
  const ordem: string[] = [];
  const porSecao = new Map<string, ProdutoPrecificado[]>();
  for (const produto of CATALOGO_PRECIFICACAO) {
    if (profissional && profissionalDoProduto(produto) !== profissional) continue;
    if (!porSecao.has(produto.secao)) {
      porSecao.set(produto.secao, []);
      ordem.push(produto.secao);
    }
    porSecao.get(produto.secao)!.push(produto);
  }
  return ordem.map((secao) => ({ secao, produtos: porSecao.get(secao)! }));
}

export function produtoPorNome(nome: string) {
  return CATALOGO_PRECIFICACAO.find((produto) => produto.nome === nome) ?? null;
}

/**
 * Quando o produto não é reconhecido, a fração do preço que vira lucro bruto,
 * por tipo de item — o valor da planilha para o produto de referência do tipo
 * (Plano 49,7% · consulta 59,4% · sinal 58,3% · mapeamento 69%). Nutri, psi,
 * retorno e "outro" não são do médico executor.
 */
export const LUCRO_BRUTO_PADRAO_POR_TIPO: Partial<Record<FinSaleItemType, number>> = {
  TRATAMENTO: 3266.83 / 6997,
  DESTRAVAR: 3266.83 / 6997,
  CONSULTA: 1411.22 / 2500,
  SINAL: 276.56 / 500,
  BIOIMPEDANCIA: 132.08 / 200,
};

/**
 * A COMISSÃO DE 13% TEM DATA (15/10/2026). O catálogo guarda a comissão de hoje;
 * as comandas antes de 01/10/2026 continuam com a de antes (10%), porque setembro
 * já foi fechado e mandado à contabilidade. Só muda quem estava em 10% — as
 * tirzepatidas de 1% e os procedimentos do Dr. Moisés (13% desde o começo) não.
 */
export const MUDANCA_DE_COMISSAO = { desde: "2026-10-01", antes: 0.1, depois: 0.13 } as const;

/** A comissão do produto numa data (sem data = a de hoje). */
export function comissaoNoDia(produto: ProdutoPrecificado, dia?: string | null) {
  if (dia && dia < MUDANCA_DE_COMISSAO.desde && profissionalDoProduto(produto) === "daniel" && Math.abs(produto.comissao - MUDANCA_DE_COMISSAO.depois) < 1e-9) {
    return MUDANCA_DE_COMISSAO.antes;
  }
  return produto.comissao;
}

/** A coluna P do produto pelo preço de tabela, com a comissão daquela data. */
export function lucroBrutoDaTabela(produto: ProdutoPrecificado, dia?: string | null) {
  const comissao = comissaoNoDia(produto, dia);
  if (comissao === produto.comissao) return produto.lucroBruto;
  return round2(produto.preco * (1 - produto.imposto - comissao) - custoFixoDoProduto(produto) - (produto.repasse ?? 0));
}

/**
 * O mesmo para o item do DR. MOISÉS que não é produto da tabela (digitado à
 * mão): a média da coluna P ÷ preço dos procedimentos dele (23 linhas, 43,2%)
 * e das três avaliações (40,3%), com a NF e a comissão de 15/10/2026. Os tipos
 * que ele não usa ficam de fora.
 */
export const LUCRO_BRUTO_PADRAO_MOISES: Partial<Record<FinSaleItemType, number>> = {
  TRATAMENTO: 0.431896,
  CONSULTA: 0.40313,
};

type ItemParaReconhecer = { itemType: FinSaleItemType; amount: number; description?: string; profissional?: ProfissionalId | null };

/**
 * QUEM EXECUTOU O ITEM (15/10/2026). A marca gravada no item vale; sem ela, o
 * produto da tabela com o MESMO nome diz (é como o Fechamento e o Lançar Dia
 * gravam); sem isso, é do Dr. Daniel — todo item antigo é dele.
 */
export function profissionalDoItem(item: { description?: string; profissional?: ProfissionalId | null }): ProfissionalId {
  if (ehProfissional(item.profissional)) return item.profissional;
  const descricao = (item.description ?? "").trim();
  const exato = descricao ? CATALOGO_PRECIFICACAO.find((produto) => produto.nome === descricao) : null;
  return exato ? profissionalDoProduto(exato) : "daniel";
}

export function produtoDoItem(item: ItemParaReconhecer): ProdutoPrecificado | null {
  const descricao = (item.description ?? "").trim();
  // 1. Nome exato — é assim que o Fechamento e o Lançar Dia gravam quando o
  //    produto é escolhido na lista. Zero chute.
  const exato = descricao ? CATALOGO_PRECIFICACAO.find((produto) => produto.nome === descricao) : null;
  if (exato) return exato;
  // Daqui para baixo é palpite (palavra-chave e preço) — e o palpite fica SEMPRE
  // dentro da tabela de quem executou (15/10/2026). Sem isso, um item antigo do
  // Dr. Daniel digitado à mão a R$ 900 viraria "microagulhamento facial" do Dr.
  // Moisés só pelo preço, e o salário de um iria para o outro.
  const quem = profissionalDoItem(item);
  // 2 e 3 rodam primeiro entre os produtos DO TIPO do item e, só se aí não sair
  // nada, no catálogo inteiro.
  //
  // O SEGUNDO PASSE EXISTE POR CAUSA DO HISTÓRICO (21/09/2026). Plano, sinal,
  // mapeamento e teste genético passaram a lançar como CONSULTA — mas as
  // comandas de julho a setembro já estão gravadas como TRATAMENTO, SINAL e
  // BIOIMPEDANCIA. Sem este passe, um Plano de R$ 6.997 lançado em agosto
  // deixaria de ser encontrado, e o Lucro Inteligente perderia a coluna P de
  // meses inteiros — em silêncio, que é como esse tipo de erro sempre aparece.
  const candidatos = CATALOGO_PRECIFICACAO.filter((produto) => profissionalDoProduto(produto) === quem && produto.tipos.includes(item.itemType));
  if (!candidatos.length) return null;
  // 2. Palavra-chave na descrição; entre os que batem (as quatro tirzepatidas), o preço mais próximo decide.
  const porPalavra = candidatos.filter((produto) => produto.padrao && produto.padrao.test(descricao));
  if (porPalavra.length) {
    return [...porPalavra].sort((a, b) => Math.abs(a.preco - item.amount) - Math.abs(b.preco - item.amount))[0];
  }
  // 3. Preço exato, quando só um produto do tipo tem esse preço.
  const porPreco = candidatos.filter((produto) => Math.abs(produto.preco - item.amount) < 0.005);
  if (porPreco.length === 1) return porPreco[0];
  return null;
}

/** Coluna P da planilha para um item da comanda (proporcional ao valor lançado). Zero para o que não é do médico executor. */
/**
 * Quantas unidades do produto o item representa. A comanda só guarda o valor da
 * linha; o Kanban rateia esse valor quando o paciente paga menos (parcial,
 * desconto), então "cobrado ÷ preço" arredondado é a melhor leitura: 4.846 num
 * Plano de 6.997 = 1 Plano; 1.055 em pellets de 336 = 3 pellets. Nunca menos de 1.
 */
export function quantidadeDoItem(amount: number, preco: number) {
  if (preco <= 0 || amount <= 0) return 1;
  return Math.max(1, Math.round(amount / preco));
}

/**
 * Custos POR UNIDADE que não acompanham o preço (colunas K consumíveis + O sala):
 * preço × (1 − imposto − comissão) − repasse − coluna P. Sem arredondar aqui — a
 * planilha só arredonda no fim, e arredondar antes desencontrava 1–2 centavos
 * quando há mais de uma unidade.
 */
export function custoFixoDoProduto(produto: ProdutoPrecificado) {
  return produto.custoFixo;
}

/**
 * A PLANILHA COM O VALOR PAGO NO LUGAR DO PREÇO (Lucas, 10/09/2026: "se o paciente
 * pagou 4.846 no Plano de 6.997, você coloca 4.846 no lugar do 6.997 e o valor já
 * sai na coluna S"). É a fórmula da aba Precificação com F = cobrado e B = quantidade:
 * imposto/cartão (G) e comissão (H) são % de F; consumíveis (K) e sala (O) são
 * por unidade (× B); o repasse nutri/psi (L) é um valor da linha. Preço cheio com
 * B = 1 reproduz a coluna P da tabela exatamente. Item sem produto na tabela usa
 * a fração padrão do tipo sobre o valor cobrado.
 */
export function lucroBrutoDoItem(item: ItemParaReconhecer, dia?: string | null) {
  const amount = item.amount || 0;
  if (amount <= 0 || !itemEhDoMedico(item.itemType)) return 0;
  const produto = produtoDoItem(item);
  if (produto) {
    const quantidade = quantidadeDoItem(amount, produto.preco);
    return round2(amount * (1 - produto.imposto - comissaoNoDia(produto, dia)) - custoFixoDoProduto(produto) * quantidade - (produto.repasse ?? 0));
  }
  const fracao = fracaoPadraoDoItem(item, dia);
  return fracao ? round2(fracao * amount) : 0;
}

/**
 * A fração do preço que vira lucro bruto quando o item não é produto da tabela —
 * a de quem executou. Para o Dr. Daniel antes de 01/10/2026, a comissão era 10%:
 * a fração do produto de referência era 3 pontos maior.
 */
export function fracaoPadraoDoItem(item: ItemParaReconhecer, dia?: string | null): number | undefined {
  if (profissionalDoItem(item) === "moises") return LUCRO_BRUTO_PADRAO_MOISES[item.itemType];
  const fracao = LUCRO_BRUTO_PADRAO_POR_TIPO[item.itemType];
  if (fracao === undefined) return undefined;
  return dia && dia < MUDANCA_DE_COMISSAO.desde ? fracao + (MUDANCA_DE_COMISSAO.depois - MUDANCA_DE_COMISSAO.antes) : fracao;
}

/** Itens que têm parte do médico executor (os mesmos tipos do catálogo/padrão). */
export function itemEhDoMedico(itemType: FinSaleItemType) {
  return LUCRO_BRUTO_PADRAO_POR_TIPO[itemType] !== undefined;
}

// ---- O que o paciente fechou, escolhido da tabela --------------------------------
// Uma linha por produto: "Programa" + "HCG" + "Testosterona" + "Vitamina D".
// O valor nasce com o preço de tabela × quantidade e pode ser ajustado (desconto,
// acréscimo de cartão). "Outro" é o item livre, para o que não está na tabela.
export type ItemFechado = {
  /** Nome do produto do catálogo, ou null para item livre. */
  produtoNome: string | null;
  itemType: FinSaleItemType;
  descricao: string;
  quantidade: number;
  /** Valor total da linha (já × quantidade), como digitado. */
  valorTexto: string;
  /** Quem executa (15/10/2026): vem do produto; no item livre, quem fecha escolhe. */
  profissional: ProfissionalId;
};

export function itemFechadoDoProduto(produto: ProdutoPrecificado, quantidade = 1): ItemFechado {
  return {
    produtoNome: produto.nome,
    itemType: produto.tipos[0],
    descricao: produto.nome,
    quantidade,
    valorTexto: formataValor(produto.preco * quantidade),
    profissional: profissionalDoProduto(produto),
  };
}

export function itemFechadoLivre(itemType: FinSaleItemType = "TRATAMENTO", profissional: ProfissionalId = "daniel"): ItemFechado {
  return { produtoNome: null, itemType, descricao: "", quantidade: 1, valorTexto: "", profissional };
}

/**
 * Muda a quantidade PRESERVANDO o preço unitário que a pessoa digitou (Lucas,
 * 08/09: "o sinal está travado em 500, mas às vezes é 200"). O preço da tabela
 * é só o ponto de partida: se a linha já foi ajustada, R$ 200 × 2 = R$ 400 — não
 * volta para R$ 1.000. Sem valor digitado, segue a tabela.
 */
export function itemComQuantidade(item: ItemFechado, quantidade: number, parse: (texto: string) => number): ItemFechado {
  const qtd = Math.max(1, Math.floor(quantidade) || 1);
  const atual = parse(item.valorTexto) || 0;
  const produto = item.produtoNome ? produtoPorNome(item.produtoNome) : null;
  const unitario = atual > 0 ? atual / Math.max(1, item.quantidade) : produto?.preco ?? 0;
  return { ...item, quantidade: qtd, valorTexto: unitario > 0 ? formataValor(unitario * qtd) : item.valorTexto };
}

export function formataValor(valor: number) {
  return round2(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function totalDosItensFechados(itens: ItemFechado[], parse: (texto: string) => number) {
  return round2(itens.reduce((soma, item) => soma + (parse(item.valorTexto) || 0), 0));
}

/**
 * Reparte `alvo` entre `valores` na mesma proporção, com os centavos de
 * arredondamento no último. Serve para o fechamento do Kanban E para o botão
 * "Ajustar itens ao que foi pago" do Lançar Dia (10/09/2026: "o paciente às
 * vezes paga um valor que não está na grade, e o app recusava"). Valores zero
 * ou negativos ficam zero; se a soma é zero, nada muda.
 */
export function ratearValores(valores: number[], alvo: number): number[] {
  const base = valores.map((valor) => (valor > 0 ? round2(valor) : 0));
  const total = round2(base.reduce((soma, valor) => soma + valor, 0));
  if (total <= 0 || alvo <= 0) return base;
  if (Math.abs(total - alvo) < 0.005) return base;
  const fator = alvo / total;
  const resultado = base.map((valor) => round2(valor * fator));
  const somaAjustada = round2(resultado.reduce((soma, valor) => soma + valor, 0));
  const diferenca = round2(alvo - somaAjustada);
  if (Math.abs(diferenca) >= 0.005) {
    // O último item COM valor absorve os centavos (um item zerado não pode virar 0,01).
    let ultimo = resultado.length - 1;
    while (ultimo > 0 && resultado[ultimo] <= 0) ultimo -= 1;
    resultado[ultimo] = round2(resultado[ultimo] + diferenca);
  }
  return resultado;
}

/**
 * Transforma o que foi escolhido nos itens da comanda, fechando EXATAMENTE em
 * `valorComanda` (o que o banco vai conferir). Se a soma das linhas difere —
 * parcial, parte em dinheiro que foi para o caixa, desconto na hora — cada item
 * é reduzido na mesma proporção e a diferença de centavos cai no último, para a
 * comanda nunca desencontrar dos pagamentos. O nome do produto fica intacto: é
 * ele que o Lucro Inteligente lê.
 */
export function itensDaComanda(
  itens: ItemFechado[],
  valorComanda: number,
  parse: (texto: string) => number,
  criarId: () => string,
): FinSaleItem[] {
  const validos = itens
    .map((item) => ({ ...item, valor: round2(parse(item.valorTexto) || 0) }))
    .filter((item) => item.valor > 0);
  if (!validos.length || valorComanda <= 0) return [];
  const valores = ratearValores(validos.map((item) => item.valor), valorComanda);
  return validos.map((item, index) => ({
    id: criarId(),
    itemType: item.itemType,
    amount: valores[index],
    description: item.descricao.trim() || item.produtoNome || "",
    // A marca de quem executou viaja com o item: é dela que sai o salário de cada um.
    profissional: item.profissional ?? "daniel",
  }));
}
