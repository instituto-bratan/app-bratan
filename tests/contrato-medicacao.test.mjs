// CONTRATO DE MEDICAÇÃO AUTOMÁTICO (14/10/2026). O TTO do doutor (iClinicRx)
// vira o contrato que ia à mão para o SuperSign. Dados FICTÍCIOS, mesmo layout.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const ext = loadTs("src/features/contratos/extenso.ts");
const tto = loadTs("src/features/contratos/lerTto.ts");
const mont = loadTs("src/features/contratos/montarContrato.ts");
const xml = loadTs("src/features/contratos/preencherXml.ts");

const TTO = [
  "Nome do Paciente: MARIA DE TESTE FICTICIA",
  "CPF: 111.222.333-44",
  "Endereço: Rua das Flores, 100. Mooca. São Paulo - SP. 03100-000",
  "1 PROTOCOLO REPOSIÇÃO HORMONAL FEMININA - LONGA DURAÇÃO ........",
  "UNDECILATO DE TESTOSTERONA 1.000MG.",
  "APLICAR VIA INTRAMUSCULAR ( 0,5ML )- 1X/MÊS - 02 MESES.",
  "02 SESSÕES.",
  "CID1O: F52.0",
  "2 PROTOCOLO DE REPOSIÇÃO DE FERRO",
  "NORIPURUM 100MG/5ML ----------------------",
  "DILUIR 1 AMPOLA EM 250ML DE SF0,9% - CORRER EM 45MINUTOS - DOSE ÚNICA.",
  "CID10: D50.",
  "Médico(a): Doutor Teste CRM: 0 UF: SP Endereço: Rua Fictícia, 1",
  "Prescrição Digital Emitida em iClinicRx ID da Receita: ABC",
  "Emissão: 13/10/2026 - 11:13 Código do Paciente: 1",
].join("\n");

test("valores e quantidades por extenso, como o contrato escreve", () => {
  assert.equal(ext.valorPorExtenso(6102), "SEIS MIL CENTO E DOIS REAIS");
  assert.equal(ext.valorPorExtenso(800.33), "OITOCENTOS REAIS E TRINTA E TRÊS CENTAVOS");
  assert.equal(ext.valorPorExtenso(1300), "MIL E TREZENTOS REAIS");
  assert.equal(ext.valorPorExtenso(1050), "MIL E CINQUENTA REAIS");
  assert.equal(ext.valorPorExtenso(100), "CEM REAIS");
  assert.equal(ext.valorPorExtenso(1), "UM REAL");
  assert.equal(ext.valorPorExtenso(21000), "VINTE E UM MIL REAIS");
  assert.equal(ext.valorPorExtenso(1_000_000), "UM MILHÃO DE REAIS");
  assert.equal(ext.moedaDoContrato(6102), "R$ 6.102,00");
  assert.equal(ext.quantidadeComExtenso(2, "f"), "02 (DUAS)");
  assert.equal(ext.quantidadeComExtenso(1, "f"), "01 (UMA)");
  assert.equal(ext.quantidadeComExtenso(200, "f"), "200 (DUZENTAS)");
  assert.equal(ext.dataPorExtenso("2026-09-02"), "02 de SETEMBRO de 2026");
});

test("o pdf.js entrega o rodapé do iClinicRx ANTES do corpo: os protocolos continuam lidos", () => {
  const linhas = TTO.split("\n");
  const rodape = linhas.slice(-3);
  const invertido = [...linhas.slice(0, 3), ...rodape, ...linhas.slice(3, -3)].join("\n");
  const lido = tto.lerTto(invertido);
  assert.equal(lido.protocolos.length, 2);
  assert.equal(lido.emitidoEm, "2026-10-13");
  assert.equal(lido.protocolos[1].itens.length, 1);
});

test("o TTO do iClinicRx vira protocolos, CID, sessões e endereço", () => {
  const lido = tto.lerTto(TTO);
  assert.equal(lido.paciente, "MARIA DE TESTE FICTICIA");
  assert.equal(lido.cpf, "11122233344");
  assert.equal(lido.emitidoEm, "2026-10-13");
  assert.deepEqual({ ...lido.endereco }, { logradouro: "Rua das Flores", numero: "100", bairro: "Mooca", municipio: "São Paulo", uf: "SP", cep: "03100-000" });
  assert.equal(lido.protocolos.length, 2);
  const [h, f] = lido.protocolos;
  assert.equal(h.titulo, "PROTOCOLO REPOSIÇÃO HORMONAL FEMININA - LONGA DURAÇÃO");
  assert.equal(h.via, "INTRAMUSCULAR");
  assert.equal(h.sessoes, 2);
  assert.equal(h.meses, 2);
  assert.deepEqual([...h.cids], ["F52.0"]);
  assert.deepEqual([...h.itens.map((i) => ({ ...i }))], [{ nome: "UNDECILATO DE TESTOSTERONA", dose: "1.000MG" }]);
  assert.equal(f.via, "ENDOVENOSO");
  assert.equal(f.sessoes, 1);
  assert.deepEqual([...f.itens.map((i) => ({ ...i }))], [{ nome: "NORIPURUM", dose: "100MG/5ML" }]);
  assert.deepEqual([...f.cids], ["D50"]);
});

test("do TTO ao texto de cada campo do contrato", () => {
  const base = mont.dadosVazios("2026-10-14");
  const d = { ...mont.dadosDoTto(base, tto.lerTto(TTO)), numero: 2451, valorTotal: 6102, pagamentos: [
    { valor: 1300, meio: "PIX", parcelas: 1, data: "2026-10-14" },
    { valor: 4802, meio: "LINK DE PAGAMENTO", parcelas: 6, data: "2026-10-15" },
  ] };
  assert.deepEqual({ ...d.tipo }, { imediato: true, curto: false, medio: true });
  assert.match(d.prazo, /DURAÇÃO PREVISTA DE 02 \(DOIS\) MESES/);
  const c = mont.camposDoContrato(d);
  assert.equal(c.NUMERO, "2451/2026");
  assert.equal(c.NUMERO_CAB, "2451-2026");
  assert.equal(c.CPF, "111.222.333-44");
  assert.equal(c.ENDERECO, "RUA DAS FLORES");
  assert.equal(c.CID, "CID10: F52.0; CID10: D50");
  assert.equal(c.RESP_NOME.startsWith("----"), true);
  assert.equal(c.VALOR_TOTAL, "R$ 6.102,00 (SEIS MIL CENTO E DOIS REAIS)");
  const cont = [...mont.linhasContempla(d).map((l) => l.texto.trim()).filter(Boolean)];
  assert.deepEqual(cont, [
    "01 (UMA) CONSULTA COM O DR. DANIEL BRATAN, SENDO REALIZADA EM 13/10/2026;",
    "PROTOCOLO REPOSIÇÃO HORMONAL FEMININA - LONGA DURAÇÃO",
    "TRATAMENTO INTRAMUSCULAR, COMPREENDENDO 02 (DUAS) SESSÕES;",
    "APLICAR VIA INTRAMUSCULAR ( 0,5ML )- 1X/MÊS - 02 MESES.",
    "PROTOCOLO DE REPOSIÇÃO DE FERRO",
    "TRATAMENTO ENDOVENOSO, COMPREENDENDO 01 (UMA) SESSÃO;",
    "DILUIR 1 AMPOLA EM 250ML DE SF0,9% - CORRER EM 45MINUTOS - DOSE ÚNICA.",
  ]);
  assert.deepEqual([...mont.gruposDeMedicamentos(d).map((g) => g.titulo)], ["TRATAMENTO INTRAMUSCULAR", "TRATAMENTO ENDOVENOSO"]);
  const pag = mont.linhasPagamento(d).map((l) => l.texto.trim());
  assert.equal(pag[0], "VALOR DE R$ 1.300,00 (MIL E TREZENTOS REAIS) VIA PIX, DIA 14/10/2026.");
  assert.equal(pag[1], "RESTANTE DO VALOR, R$ 4.802,00 (QUATRO MIL OITOCENTOS E DOIS REAIS) VIA LINK DE PAGAMENTO, PARCELADO EM 6X DE R$ 800,33 (OITOCENTOS REAIS E TRINTA E TRÊS CENTAVOS), DIA 15/10/2026.");
  assert.equal(mont.pendenciasDoContrato(d).length, 0);
});

test("trava: pagamento que não soma o total, sem número e sem CPF", () => {
  const d = { ...mont.dadosVazios("2026-10-14"), valorTotal: 1000, pagamentos: [{ valor: 900, meio: "PIX", parcelas: 1, data: "" }] };
  const falta = mont.pendenciasDoContrato(d).join(" | ");
  assert.match(falta, /número do contrato/);
  assert.match(falta, /CPF/);
  assert.match(falta, /somar o valor total/);
});

test("o XML do modelo: lista repete o parágrafo, tabela repete as linhas, campo que sobra é erro", () => {
  const p = (t, b = true) => `<w:p><w:r><w:rPr>${b ? '<w:b w:val="1" /><w:bCs w:val="1" />' : ""}</w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const tr = (a, b) => `<w:tr><w:tc>${p(a)}</w:tc><w:tc>${p(b)}</w:tc></w:tr>`;
  const modelo = `<w:body>${p("{{NOME}}")}${p("{{CONTEMPLA}}")}<w:tbl>${tr("MEDICAMENTO", "DOSAGEM")}${tr("{{GRUPO}}", "{{GRUPO_TRACO}}")}${tr("{{MED}}", "{{DOSE}}")}</w:tbl></w:body>`;
  const saida = xml.preencherXml(modelo, {
    campos: { NOME: "A & B" },
    listas: { CONTEMPLA: [{ texto: "TÍTULO", destaque: true }, { texto: "DOSE ÚNICA.", destaque: false }] },
    grupos: [{ titulo: "TRATAMENTO ENDOVENOSO", itens: [{ nome: "NORIPURUM", dose: "100MG/5ML" }, { nome: "VITAMINA C", dose: "" }] }],
  }, { comCorpo: true });
  assert.match(saida, /A &amp; B/);
  assert.equal((saida.match(/<w:p>/g) ?? []).length, 3 + 2 * 4);
  assert.match(saida, /<w:rPr><\/w:rPr><w:t xml:space="preserve">DOSE ÚNICA\.<\/w:t>/);
  assert.match(saida, /NORIPURUM.*100MG\/5ML.*VITAMINA C.*—/s);
  assert.doesNotMatch(saida, /\{\{/);
  assert.throws(() => xml.preencherXml(`${modelo}${p("{{NOVO}}")}`, { campos: { NOME: "X" }, listas: { CONTEMPLA: [] }, grupos: [] }, { comCorpo: true }), /\{\{NOVO\}\}/);
});
