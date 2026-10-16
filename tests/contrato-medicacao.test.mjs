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

// 15/10/2026: "se for para escrever tudo, a gente já faz isso". Pagamento da
// comanda + lembretes e a ficha guardada preenchem o contrato. Dados fictícios.
test("a cláusula 4 sai da comanda do fechamento e dos lembretes em aberto", () => {
  const comanda = {
    ref: "venda-1",
    dia: "2026-10-13",
    pagamentos: [
      { metodo: "PIX", valor: 1000, parcelas: 1 },
      { metodo: "CARTAO_CREDITO", valor: 3102, parcelas: 6 },
      { metodo: "DINHEIRO", valor: 0, parcelas: 1 },
    ],
  };
  const lembretes = [
    { valor: 1500, dataPrevista: "2026-11-20", observacao: "resto no boleto" },
    { valor: 500, dataPrevista: "2026-10-30", observacao: "3x no link" },
    { valor: 300, dataPrevista: "2026-12-01", observacao: "combinado com a paciente" },
  ];
  const r = mont.pagamentoSugerido(comanda, lembretes);
  assert.equal(r.valorTotal, 6402);
  assert.deepEqual(
    [...r.pagamentos].map((p) => [p.valor, p.meio, p.parcelas, p.data]),
    [
      [1000, "PIX", 1, "2026-10-13"],
      [3102, "CARTÃO DE CRÉDITO", 6, "2026-10-13"],
      [500, "LINK DE PAGAMENTO", 3, "2026-10-30"],
      [1500, "BOLETO", 1, "2026-11-20"],
      [300, "PIX", 1, "2026-12-01"],
    ],
  );
  // O lembrete sem forma escrita entra como PIX, mas avisa para conferir.
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /01\/12\/2026/);
  // Só lembretes (sem comanda) também monta; nada = nada.
  assert.equal(mont.pagamentoSugerido(null, [lembretes[0]]).valorTotal, 1500);
  assert.equal(mont.pagamentoSugerido(null, []).pagamentos.length, 0);
});

test("a forma de pagamento do lembrete sai do que a recepção escreveu", () => {
  const meio = (t) => ({ ...mont.meioDoLembrete(t) });
  assert.deepEqual(meio("6x no cartão"), { meio: "CARTÃO DE CRÉDITO", parcelas: 6 });
  assert.deepEqual(meio("Pix dia 20"), { meio: "PIX", parcelas: 1 });
  assert.deepEqual(meio("link 10 x"), { meio: "LINK DE PAGAMENTO", parcelas: 10 });
  assert.deepEqual(meio(""), { meio: null, parcelas: 1 });
});

test("a ficha guardada completa o contratante sem apagar o que já foi digitado", () => {
  const base = mont.dadosVazios("2026-10-15");
  base.paciente.nome = "MARIA DE TESTE FICTICIA";
  base.paciente.rg = "11.111.111-1";
  const ficha = {
    rg: "22.222.222-2",
    profissao: "professora",
    estadoCivil: "casada",
    nascimento: "1980-05-04",
    municipio: "Santo André",
    uf: "sp",
    email: "Maria@Exemplo.com",
    cep: "09000-000",
  };
  const p = mont.completarComFicha(base, ficha).paciente;
  assert.equal(p.rg, "11.111.111-1", "o que já foi digitado vence");
  assert.equal(p.profissao, "PROFESSORA");
  assert.equal(p.estadoCivil, "CASADA");
  assert.equal(p.nascimento, "1980-05-04");
  assert.equal(p.municipio, "SANTO ANDRÉ", "o padrão da tela (São Paulo) cede para a ficha");
  assert.equal(p.uf, "SP");
  assert.equal(p.email, "Maria@Exemplo.com", "e-mail não vira maiúscula");
  assert.equal(p.cep, "09000-000");
  assert.equal(p.nome, "MARIA DE TESTE FICTICIA");
});

// ---------------------------------------------------------------- cláusulas de política (16/10/2026)
// "MENSAGENS CONTRATOS" + áudio de 15/10: 1 só com tirzepatida, 2 e 4 em todos,
// 3 para quem fechou o Plano de Acompanhamento. Entram depois da 3.3.

const puro = (v) => JSON.parse(JSON.stringify(v));
const protocolo = (titulo, itens = []) => ({ titulo, via: "SUBCUTÂNEO", sessoes: 4, posologia: "", meses: 1, itens });

test("tirzepatida é achada no protocolo ou no medicamento, com ou sem acento e pelo nome comercial", () => {
  assert.equal(mont.temTirzepatida([protocolo("PROTOCOLO EMAGRECIMENTO", [{ nome: "TIRZEPATIDA 60MG/2,4ML", dose: "2,5MG" }])]), true);
  assert.equal(mont.temTirzepatida([protocolo("Mounjaro")]), true);
  assert.equal(mont.temTirzepatida([protocolo("SORO", [{ nome: "VITAMINA C", dose: "1G" }])]), false);
});

test("contrato novo: prazo de 6 meses e faltas do tratamento sempre; tirzepatida e programa só quando valem", () => {
  const base = { ...mont.dadosVazios("2026-10-16") };
  const linhas = mont.linhasCondicoes(base);
  assert.deepEqual(
    puro(linhas.filter((l) => l.destaque).map((l) => l.texto)),
    ["3.4. PRAZO DE TRATAMENTO E CONSULTAS.", "3.5. POLÍTICA DE FALTAS E REMARCAÇÕES — TRATAMENTOS."],
  );
  const completo = { ...base, condicoes: { tirzepatida: true, prazoSeisMeses: true, programa: true, faltasTratamento: true } };
  assert.deepEqual(
    puro(mont.linhasCondicoes(completo).filter((l) => l.destaque).map((l) => l.texto.split(" ")[0])),
    ["3.4.", "3.5.", "3.6.", "3.7."],
  );
  // O texto vai como a clínica mandou (sem caixa alta e sem negrito).
  const texto = mont.linhasCondicoes(completo)[1];
  assert.equal(texto.destaque, false);
  assert.match(texto.texto, /^Esclarecemos que o pagamento realizado refere-se exclusivamente à aquisição de 01 ampola de TIRZEPATIDA 60 mg/);
});

test("o TTO com tirzepatida liga a cláusula da ampola sozinho", () => {
  const lido = { paciente: "", cpf: "", endereco: null, emitidoEm: null, protocolos: [{ titulo: "PROTOCOLO", via: "SUBCUTÂNEO", sessoes: 4, posologia: "", meses: 1, cids: ["E66"], itens: [{ nome: "TIRZEPATIDA", dose: "5MG" }] }] };
  const d = mont.dadosDoTto(mont.dadosVazios("2026-10-16"), lido);
  assert.equal(d.condicoes.tirzepatida, true);
  assert.equal(d.condicoes.prazoSeisMeses, true);
});

test("contrato antigo (sem o campo) baixa de novo sem as cláusulas, como foi assinado", () => {
  const antigo = { ...mont.dadosVazios("2026-10-01") };
  delete antigo.condicoes;
  assert.deepEqual(puro(mont.linhasCondicoes(antigo)), []);
  const modelo = `<w:body><w:p><w:r><w:t>3.3. política</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{{CONDICOES}}</w:t></w:r></w:p><w:p><w:r><w:t>CLÁUSULA 4.0</w:t></w:r></w:p></w:body>`;
  const vazio = xml.expandirLista(modelo, "CONDICOES", []);
  assert.equal(vazio.includes("{{CONDICOES}}"), false);
  assert.equal(vazio.includes("CLÁUSULA 4.0"), true);
  const cheio = xml.expandirLista(modelo, "CONDICOES", mont.linhasCondicoes(mont.dadosVazios("2026-10-16")));
  assert.equal((cheio.match(/<w:b\/>/g) ?? []).length, 2, "só os títulos em negrito");
  assert.match(cheio, /3\.4\. PRAZO DE TRATAMENTO E CONSULTAS\./);
});

// ---------------------------------------------------------------- quantidade e apresentação da tirzepatida pelo TTO (16/10/2026)

const ORIGINAL_TIRZEPATIDA =
  "Esclarecemos que o pagamento realizado refere-se exclusivamente à aquisição de 01 ampola de TIRZEPATIDA 60 mg / 2,4 mL, conforme previsto em contrato. Ressaltamos que o valor pago não contempla uma nova ampola nem os custos de continuidade do tratamento, caso sejam necessários. Havendo indicação para dar continuidade ao protocolo, os valores correspondentes serão informados oportunamente e cobrados separadamente, mediante orientação médica.";

test("1 ampola de 60 mg / 2,4 mL sai idêntica ao texto que a clínica mandou; mais ampolas, no plural", () => {
  assert.equal(mont.textoDaTirzepatida(), ORIGINAL_TIRZEPATIDA);
  assert.equal(mont.textoDaTirzepatida(1, "60 mg / 2,4 mL"), ORIGINAL_TIRZEPATIDA);
  const duas = mont.textoDaTirzepatida(2, "40 mg / 1,6 mL");
  assert.match(duas, /aquisição de 02 ampolas de TIRZEPATIDA 40 mg \/ 1,6 mL/);
  assert.match(duas, /não contempla novas ampolas nem/);
});

test("quantidade escrita no TTO vence a conta", () => {
  const lido = mont.tirzepatidaDoTto([protocolo("PROTOCOLO EMAGRECIMENTO", [{ nome: "TIRZEPATIDA 60MG/2,4ML - 02 AMPOLAS", dose: "" }])]);
  assert.equal(lido.ampolas, 2);
  assert.equal(lido.apresentacao, "60 mg / 2,4 mL");
  assert.equal(lido.conferir, false);
});

test("sem quantidade escrita: dose × aplicações ÷ mg da ampola, para cima", () => {
  const p = { ...protocolo("PROTOCOLO EMAGRECIMENTO", [{ nome: "TIRZEPATIDA", dose: "40MG/1,6ML" }]), posologia: "APLICAR 7,5MG VIA SUBCUTÂNEA 1X/SEMANA - 08 SEMANAS.", sessoes: 8 };
  const lido = mont.tirzepatidaDoTto([p]);
  // 7,5 × 8 = 60 mg em ampolas de 40 mg → 2 ampolas.
  assert.equal(lido.ampolas, 2);
  assert.equal(lido.apresentacao, "40 mg / 1,6 mL");
  assert.match(lido.explicacao, /7,5 mg × 8 aplicações = 60 mg → 2 ampolas de 40 mg/);
});

test("dose que sobe ou apresentação ausente pedem conferência", () => {
  const sobe = { ...protocolo("TIRZEPATIDA", []), posologia: "APLICAR 2,5MG 1X/SEMANA POR 4 SEMANAS E DEPOIS 5MG 1X/SEMANA.", sessoes: 8 };
  const lido = mont.tirzepatidaDoTto([sobe]);
  assert.equal(lido.conferir, true);
  assert.equal(lido.apresentacao, "60 mg / 2,4 mL");
  assert.match(lido.explicacao, /doses diferentes/);
  assert.equal(mont.tirzepatidaDoTto([protocolo("SORO", [{ nome: "VITAMINA C", dose: "1G" }])]), null);
});

test("o TTO semanal conta as aplicações e o contrato sai com a quantidade lida", () => {
  const texto = [
    "Nome do Paciente: MARIA DE TESTE FICTICIA",
    "1 PROTOCOLO DE EMAGRECIMENTO",
    "TIRZEPATIDA 60MG/2,4ML",
    "APLICAR 10MG VIA SUBCUTÂNEA 1X/SEMANA - 08 SEMANAS.",
    "CID10: E66.",
  ].join("\n");
  const lido = tto.lerTto(texto);
  assert.equal(lido.protocolos[0].sessoes, 8);
  const d = mont.dadosDoTto(mont.dadosVazios("2026-10-16"), lido);
  assert.equal(d.condicoes.tirzepatida, true);
  // 10 × 8 = 80 mg → 2 ampolas de 60 mg.
  assert.equal(d.condicoes.tirzepatidaAmpolas, 2);
  const linhas = mont.linhasCondicoes(d);
  assert.match(linhas[1].texto, /02 ampolas de TIRZEPATIDA 60 mg \/ 2,4 mL/);
});
