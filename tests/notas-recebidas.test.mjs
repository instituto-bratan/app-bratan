// NOTAS EMITIDAS CONTRA O INSTITUTO (22/09/2026).
//
// O que se protege: ler número e série da chave da NF-e; casar pela conta
// certa e NUNCA casar sozinho em dúvida; conta que já tem nota fica fora.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("supabase/functions/_shared/notasRecebidas.ts");

const CHAVE = "35260938115624000127550010000123451000012345"; // SP · set/2026 · CNPJ da Stin · modelo 55 · série 1 · nº 12345

test("a chave da NF-e conta número, série, modelo e CNPJ do emitente", () => {
  const d = mod.dadosDaChaveNfe(CHAVE);
  assert.equal(d.cnpjEmitente, "38115624000127");
  assert.equal(d.modelo, "55");
  assert.equal(d.serie, "1");
  assert.equal(d.numero, "12345");
  assert.equal(d.anoMes, "2026-09");
  assert.equal(mod.dadosDaChaveNfe("123"), null, "chave torta não vira número inventado");
});

const nota = { chave: CHAVE, tipo: "NFE", emitenteDocumento: "38115624000127", emitenteNome: "STIN PHARMA LTDA", valor: 2291.7, emitidaEm: "2026-09-09T10:00:00-03:00" };
const conta = (id, description, supplier, amount, paidAt, notaStatus = "PENDENTE") => ({ id, description, supplier, amount, paidAt, dueDate: paidAt, notaStatus });

test("casa sozinha quando valor, data e fornecedor apontam para a mesma conta", () => {
  const contas = [
    conta("a", "STIN PHARMA — boleto de 10/09", "STIN PHARMA", 2291.7, "2026-09-10"),
    conta("b", "ENEL (503)", "", 586.51, "2026-09-16"),
    conta("c", "BIOS TESTO", "BIOS", 1278.93, "2026-09-03"),
  ];
  const c = mod.candidatosDaNota(nota, contas);
  assert.equal(c.length, 1);
  assert.equal(c[0].conta.id, "a");
  assert.ok(c[0].pontos >= 85, `pontos ${c[0].pontos}`);
  assert.equal(mod.vinculoAutomatico(c).conta.id, "a");
});

test("dois candidatos com o mesmo valor = ninguém casa sozinho", () => {
  const contas = [
    conta("a", "Mercado Pago — compra 1", "MERCADO PAGO", 500, "2026-09-10"),
    conta("b", "Claudio — quadros", "CLAUDIO RODRIGUES LOPES", 500, "2026-09-10"),
  ];
  const n = { ...nota, emitenteNome: "LOJA X", emitenteDocumento: "1", valor: 500 };
  const c = mod.candidatosDaNota(n, contas);
  assert.equal(c.length, 2);
  assert.equal(mod.vinculoAutomatico(c), null, "empate vai para o Lucas decidir");
});

test("valor diferente não entra; conta que já tem nota também não", () => {
  const contas = [
    conta("a", "STIN PHARMA", "STIN PHARMA", 2291.7, "2026-09-10", "ANEXADA"),
    conta("b", "STIN PHARMA — outro boleto", "STIN PHARMA", 838.69, "2026-09-14"),
  ];
  assert.equal(mod.candidatosDaNota(nota, contas).length, 0);
});

test("valor exato mas 50 dias longe e sem nome: fica como candidato fraco, não casa sozinho", () => {
  const contas = [conta("a", "Compra qualquer", "", 2291.7, "2026-07-21")];
  const c = mod.candidatosDaNota(nota, contas);
  assert.equal(c.length, 1);
  assert.ok(c[0].pontos < 70);
  assert.equal(mod.vinculoAutomatico(c), null);
});

test("nome do arquivo leva a conta na frente e o número da nota", () => {
  assert.equal(mod.nomeDoArquivoNaPasta("STIN PHARMA — boleto de 10/09", nota), "STIN PHARMA — boleto de 10/09 - NF 12345 STIN PHARMA LTDA.pdf");
  assert.equal(mod.pastaDoMes(nota.emitidaEm), "2026-09");
  assert.equal(mod.pastaDoMes(""), "sem-data");
});

test("o resumo diz o que aconteceu, inclusive quando a Focus reclamou", () => {
  assert.equal(mod.resumoDaSincronizacao({ novas: 0, vinculadas: 0, pendentes: 0, erros: [] }), "Nenhuma nota nova contra o Instituto.");
  assert.equal(mod.resumoDaSincronizacao({ novas: 3, vinculadas: 2, pendentes: 1, erros: [] }), "3 notas novas · 2 casadas com a conta sozinhas · 1 esperando você escolher a conta");
  assert.match(mod.resumoDaSincronizacao({ novas: 0, vinculadas: 0, pendentes: 0, erros: ["NF-e: a Focus respondeu 403"] }), /Atenção: NF-e: a Focus respondeu 403/);
});

// ---- NFS-e tomadas em SP: o CSV da prefeitura (22/09/2026) ----
const CAB = ["Tipo de Registro", "Nº NF-e", "Data Hora NFE", "Código de Verificação da NF-e", "Tipo de RPS", "Série do RPS", "Número do RPS", "Data de Emissão do RPS", "Inscrição Municipal do Prestador", "Indicador de CPF/CNPJ do Prestador", "CPF ou CNPJ do Prestador", "Razão Social do Prestador", "Situação da Nota Fiscal", "Valor dos Serviços", "Valor do ISS", "Código do Serviço Prestado na Nota Fiscal", "Discriminação dos Serviços"];
const linha = (n, razao, valor, sit = "T") => ["2", n, "16/09/2026 12:13:00", "ABCD1234", "RPS", "", "", "", "1.234.567-8", "2", "34.675.631/0001-22", razao, sit, valor, "66,00", "17019", "HONORARIOS ADVOCATICIOS|SETEMBRO"];

test("o CSV da prefeitura vira notas: número, prestador, valor em vírgula, data BR, link do portal", () => {
  const r = mod.lerExportacaoPrefeituraSP([CAB, linha("00000123", "PALOVA AMISSES E ADVOGADOS ASSOCIADOS", "3.300,00"), ["9", "1", "", "", "", "", "", "", "", "", "", "", "", "3.300,00", "66,00", "", ""]]);
  assert.equal(r.erro, "");
  assert.equal(r.notas.length, 1, "o totalizador do fim é descartado");
  assert.equal(r.ignoradas, 1);
  const n = r.notas[0];
  assert.equal(n.numero, "123");
  assert.equal(n.cnpjPrestador, "34675631000122");
  assert.equal(n.valorServicos, 3300);
  assert.equal(n.valorIss, 66);
  assert.equal(n.emitidaEm, "2026-09-16T12:13:00-03:00");
  assert.equal(n.situacao, "autorizada");
  assert.equal(n.discriminacao, "HONORARIOS ADVOCATICIOS\nSETEMBRO");
  assert.equal(n.chave, "SP-34675631000122-123");
  assert.equal(n.urlExterna, "https://nfe.prefeitura.sp.gov.br/nfe.aspx?ccm=12345678&nf=123&cod=ABCD1234");
});

test("nota cancelada no CSV vem como cancelada; cabeçalho estranho dá erro claro", () => {
  const r = mod.lerExportacaoPrefeituraSP([CAB, linha("7", "X LTDA", "100,00", "C")]);
  assert.equal(r.notas[0].situacao, "cancelada");
  const e = mod.lerExportacaoPrefeituraSP([["a", "b"], ["1", "2"]]);
  assert.match(e.erro, /Não reconheci o cabeçalho/);
});

test("nome do arquivo na pasta do mês: número, emitente e valor", () => {
  const n = { chave: "35260938115624000127550010000123451000012345", tipo: "NFE", emitenteDocumento: "38115624000127", emitenteNome: "STIN PHARMA LTDA", valor: 2291.7, emitidaEm: "2026-09-09" };
  assert.equal(mod.nomeDoArquivoRecebido(n, "pdf"), "NF 12345 - STIN PHARMA LTDA - R$ 2.291,70.pdf");
});
