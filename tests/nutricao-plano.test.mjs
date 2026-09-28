// PLANO ALIMENTAR: TÍTULO, VERSÕES E BIBLIOTECA (28/09/2026).
//
// O que estes testes protegem:
// - título "Plano alimentar — [mês e ano]" e o nome sem "paciente";
// - duplicar cria uma versão nova e deixa a anterior intacta;
// - finalizar guarda um retrato que não muda quando a biblioteca muda;
// - a diferença entre versões lista o que mudou;
// - a biblioteca inicial é exatamente o texto que a Dra. Géssica enviou;
// - bloco inserido no plano é cópia: editar a cópia não mexe no modelo.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const plano = loadTs("src/features/nutricao/dominio/plano.ts");
const biblioteca = loadTs("src/features/nutricao/dominio/biblioteca.ts");

const AGORA = "2026-09-28T13:30:00.000Z";
let contador = 0;
const novoId = () => `id-${++contador}`;

const pessoa = { id: "p1", nome: "Marina Teixeira", nomeDocumento: "Paciente Marina Teixeira" };

function planoDeAgosto() {
  const p = plano.novoPlano({ pessoa, mesRef: "2026-08", numero: 1, atendimentoId: "a0", novoId, agora: "2026-08-26T13:00:00.000Z", blocos: [] });
  const cafe = p.refeicoes[0];
  cafe.itens = [
    { id: novoId(), descricao: "Pão francês", quantidade: "1 unidade", gramas: 50, alimentoId: "taco-x", alternativas: [], observacao: "", legumes: false, origem: null },
    { id: novoId(), descricao: "Manteiga", quantidade: "1 ponta de faca", gramas: 5, alimentoId: "taco-y", alternativas: [], observacao: "", legumes: false, origem: null },
  ];
  return p;
}

test("título com o mês por extenso", () => {
  assert.equal(plano.tituloDoPlano("2026-09"), "Plano alimentar — setembro de 2026");
});

test("plano novo: nome sem 'paciente', rascunho, refeições do dia", () => {
  const p = plano.novoPlano({ pessoa, mesRef: "2026-09", numero: 1, atendimentoId: null, novoId, agora: AGORA, blocos: [] });
  assert.equal(p.nomeDocumento, "Marina Teixeira");
  assert.equal(p.estado, "rascunho");
  assert.equal(p.origem.tipo, "branco");
  const nomes = p.refeicoes.map((r) => r.nome);
  assert.deepEqual(plain(nomes), ["Café da manhã", "Lanche da manhã", "Almoço", "Lanche da tarde", "Jantar"]);
  assert.equal(p.refeicoes.find((r) => r.nome === "Almoço").tipo, "almoco");
  assert.equal(p.refeicoes.find((r) => r.nome === "Jantar").tipo, "jantar");
});

test("duplicar cria versão nova com ids novos e não altera a anterior", () => {
  const agosto = planoDeAgosto();
  const antes = JSON.stringify(agosto);
  const setembro = plano.duplicarPlano(agosto, { mesRef: "2026-09", novoId, agora: AGORA, atendimentoId: "a1" });
  assert.equal(JSON.stringify(agosto), antes);
  assert.equal(setembro.numero, 2);
  assert.equal(setembro.estado, "rascunho");
  assert.equal(setembro.origem.tipo, "duplicado");
  assert.equal(setembro.origem.deId, agosto.id);
  assert.equal(setembro.mesRef, "2026-09");
  assert.equal(setembro.atendimentoId, "a1");
  assert.notEqual(setembro.id, agosto.id);
  assert.notEqual(setembro.refeicoes[0].id, agosto.refeicoes[0].id);
  assert.notEqual(setembro.refeicoes[0].itens[0].id, agosto.refeicoes[0].itens[0].id);
  assert.equal(setembro.refeicoes[0].itens[0].descricao, "Pão francês");
  assert.equal(setembro.retrato, null);
  assert.equal(setembro.pdf, null);
  assert.equal(setembro.entrega.length, 0);
  // mexer na cópia não mexe no original
  setembro.refeicoes[0].itens[0].quantidade = "2 unidades";
  assert.equal(agosto.refeicoes[0].itens[0].quantidade, "1 unidade");
});

test("finalizar congela o conteúdo num retrato com os alimentos usados", () => {
  const p = planoDeAgosto();
  const alimentos = [{ id: "taco-x", nome: "Pão, trigo, francês", grupo: "Cereais", por100g: { kcal: 300, cho: 58, ptn: 8, lip: 3, fibra: 2 }, tracos: [], fonte: { tabela: "TACO 4ª ed.", referencia: "teste" } }];
  const final = plano.finalizarPlano(p, alimentos, AGORA);
  assert.equal(final.estado, "finalizado");
  assert.equal(final.finalizadoEm, AGORA);
  const retrato = JSON.parse(final.retrato.conteudo);
  assert.equal(retrato.plano.refeicoes[0].itens[0].descricao, "Pão francês");
  assert.equal(retrato.alimentos[0].por100g.kcal, 300);
  // o retrato não acompanha mudanças posteriores na tabela
  alimentos[0].por100g.kcal = 999;
  assert.equal(JSON.parse(final.retrato.conteudo).alimentos[0].por100g.kcal, 300);
});

test("plano finalizado não pode ser finalizado de novo", () => {
  const final = plano.finalizarPlano(planoDeAgosto(), [], AGORA);
  assert.throws(() => plano.finalizarPlano(final, [], AGORA), /rascunho/);
});

test("o retrato é canônico: mesma entrada, mesmo texto", () => {
  const p = planoDeAgosto();
  assert.equal(plano.conteudoCanonico(p, []), plano.conteudoCanonico(JSON.parse(JSON.stringify(p)), []));
});

test("substituir marca a versão antiga com a data", () => {
  const final = plano.finalizarPlano(planoDeAgosto(), [], AGORA);
  const substituido = plano.marcarSubstituido(final, "2026-09-28T14:00:00.000Z");
  assert.equal(substituido.estado, "substituido");
  assert.equal(substituido.substituidoEm, "2026-09-28T14:00:00.000Z");
  assert.equal(substituido.retrato.conteudo, final.retrato.conteudo);
});

test("diferença entre versões: item novo, item removido, quantidade mudada, refeição nova", () => {
  const agosto = planoDeAgosto();
  const setembro = plano.duplicarPlano(agosto, { mesRef: "2026-09", novoId, agora: AGORA, atendimentoId: null });
  const cafe = setembro.refeicoes[0];
  cafe.itens = cafe.itens.filter((i) => i.descricao !== "Manteiga");
  cafe.itens.push({ id: novoId(), descricao: "Ovo mexido", quantidade: "2 unidades", gramas: 100, alimentoId: null, alternativas: [], observacao: "", legumes: false, origem: "acordo" });
  cafe.itens[0].quantidade = "2 unidades";
  setembro.refeicoes.push({ id: novoId(), nome: "Ceia", tipo: "ceia", horario: "22h", opcional: true, emoji: "", itens: [], observacao: "", azeitePreparo: null });
  const difs = plain(plano.diferencas(agosto, setembro)).map((d) => `${d.tipo}: ${d.descricao}`);
  assert.deepEqual(difs.sort(), [
    "item_alterado: Café da manhã · Pão francês: 1 unidade → 2 unidades",
    "item_novo: Café da manhã · Ovo mexido",
    "item_removido: Café da manhã · Manteiga",
    "refeicao_nova: Ceia",
  ]);
});

test("diferença vê substituições e horário mudados", () => {
  const agosto = planoDeAgosto();
  const setembro = plano.duplicarPlano(agosto, { mesRef: "2026-09", novoId, agora: AGORA, atendimentoId: null });
  setembro.refeicoes[0].horario = "7h30";
  setembro.refeicoes[0].itens[0].alternativas.push({ id: novoId(), descricao: "Tapioca", quantidade: "2 colheres de sopa", gramas: null, alimentoId: null });
  const difs = plain(plano.diferencas(agosto, setembro)).map((d) => `${d.tipo}: ${d.descricao}`);
  assert.ok(difs.includes("refeicao_alterada: Café da manhã: horário → 7h30"));
  assert.ok(difs.includes("item_alterado: Café da manhã · Pão francês: substituições mudaram"));
});

test("entrega: PDF gerado não é compartilhado nem recebido", () => {
  let p = plano.finalizarPlano(planoDeAgosto(), [], AGORA);
  p = plano.registrarEntrega(p, { tipo: "pdf_gerado", em: AGORA, canal: null });
  let estado = plain(plano.estadoDaEntrega(p));
  assert.equal(estado.pdfGerado, true);
  assert.equal(estado.compartilhadoEm, null);
  assert.equal(estado.recebidoEm, null);
  assert.equal(estado.etapa, "pdf_gerado");
  p = plano.registrarEntrega(p, { tipo: "compartilhado", em: "2026-09-28T14:07:00.000Z", canal: "WhatsApp" });
  estado = plain(plano.estadoDaEntrega(p));
  assert.equal(estado.compartilhadoEm, "2026-09-28T14:07:00.000Z");
  assert.equal(estado.canal, "WhatsApp");
  assert.equal(estado.etapa, "compartilhado");
  p = plano.registrarEntrega(p, { tipo: "recebimento_confirmado", em: "2026-09-28T16:00:00.000Z", canal: null });
  assert.equal(plain(plano.estadoDaEntrega(p)).etapa, "recebido");
});

test("entrega só é registrada em plano finalizado", () => {
  assert.throws(() => plano.registrarEntrega(planoDeAgosto(), { tipo: "compartilhado", em: AGORA, canal: "WhatsApp" }), /finalizado/);
});

// ------------------------------------------------------------ biblioteca

test("frutas: exatamente o texto enviado por ela", () => {
  const frutas = biblioteca.BLOCOS_INICIAIS.find((b) => b.id === "bib-frutas");
  assert.equal(frutas.titulo, "Frutas (Lista de Possibilidades)");
  assert.deepEqual(plain(frutas.itens), [
    "Maçã, kiwi, pera, laranja, mexerica, pêssego: 1 unidade.",
    "Mamão: Formosa (1 fatia grande (120g)) ou Papaia (½ unidade (120g)).",
    "Banana: 1 unidade pequena a média (80g).",
    "Manga, pitaya, caqui: 1 unidade pequena ou ½ grande (120g).",
    "Abacaxi: 1 rodela (100g).",
    "Uva: Cerca de 20 unidades (100g).",
    "Melancia: 1 pedaço grande (160g).",
    "Melão: 1 pedaço grande (160g).",
    "Frutas secas pequenas (ex.: uva passa): 1 colher de sopa (20g).",
    "Frutas secas maiores (ex.: tâmaras): 4 unidades (20g).",
    "Abacate: 2 colheres de sopa (80g).",
    "Morango: Pode ser consumido adicionalmente (a gosto).",
  ]);
});

test("legumes e verduras: exatamente o texto enviado por ela", () => {
  const legumes = biblioteca.BLOCOS_INICIAIS.find((b) => b.id === "bib-legumes");
  assert.equal(legumes.titulo, "Legumes e Verduras de Consumo Livre");
  assert.deepEqual(plain(legumes.itens), [
    "Verdes: Abobrinha, brócolis, folhas, pepino, pimentão, quiabo, jiló.",
    "Vermelhos e Roxos: Tomate, molho de tomate, pimentão, repolho roxo, beterraba.",
    "Brancos e Neutros: Couve-flor, palmito, cogumelos, rabanete, yakon.",
    "Amarelos e Alaranjados: Abóbora, cenoura, pimentão amarelo.",
    "Não fazem parte dessa lista: Batatas, mandioca, inhame, mandioquinha.",
    "Diferencial: Vegetais orgânicos (recomendado, mas não obrigatório).",
    "Se crus: Sanitizar com hipoclorito ou água sanitária, conforme rótulos.",
  ]);
});

test("identificação profissional: as cinco linhas exatas", () => {
  assert.deepEqual(plain(biblioteca.IDENTIFICACAO_PADRAO.linhas), [
    "Dra. Géssica Barbara",
    "Nutricionista e Assistente do Dr. Daniel Bratan",
    "CRN3 63653",
    "@gessicabarbara.nutri",
    "(11) 2092-6388 (WhatsApp)",
  ]);
});

test("bloco inserido no plano é cópia: editar a cópia não mexe no modelo", () => {
  const frutas = biblioteca.BLOCOS_INICIAIS.find((b) => b.id === "bib-frutas");
  const copia = plano.blocoDaBiblioteca(frutas, novoId);
  assert.equal(copia.origem.blocoId, "bib-frutas");
  assert.equal(copia.origem.versao, frutas.versao);
  assert.equal(copia.itens.length, 12);
  assert.ok(copia.itens.every((i) => i.incluido));
  copia.itens[0].texto = "Maçã: 2 unidades.";
  copia.itens[1].incluido = false;
  assert.equal(frutas.itens[0], "Maçã, kiwi, pera, laranja, mexerica, pêssego: 1 unidade.");
});

test("novo plano já pode nascer com os blocos dela, como cópia", () => {
  const blocos = biblioteca.BLOCOS_INICIAIS.map((b) => plano.blocoDaBiblioteca(b, novoId));
  const p = plano.novoPlano({ pessoa, mesRef: "2026-09", numero: 1, atendimentoId: null, novoId, agora: AGORA, blocos });
  assert.deepEqual(plain(p.blocos.map((b) => b.titulo)), ["Frutas (Lista de Possibilidades)", "Legumes e Verduras de Consumo Livre"]);
});

// ------------------------------------------------------------ achados da revisão (28/09/2026)

test("o cabeçalho do documento nunca leva 'paciente' antes do nome", () => {
  const p = plano.novoPlano({ pessoa, mesRef: "2026-09", numero: 1, atendimentoId: null, novoId, agora: AGORA, blocos: [] });
  p.nomeDocumento = "Paciente Marina Teixeira";
  assert.deepEqual(plain(plano.cabecalhoDoDocumento(p)), { titulo: "Plano alimentar — setembro de 2026", nome: "Marina Teixeira" });
});

test("finalizar congela a identificação e as regras do cálculo usadas", () => {
  const identificacao = { linhas: ["Dra. Géssica Barbara", "Nutricionista e Assistente do Dr. Daniel Bratan", "CRN3 63653", "@gessicabarbara.nutri", "(11) 2092-6388 (WhatsApp)"], versao: 1 };
  const regras = { azeiteGramas: 5, azeiteAlimentoId: "taco-260", caloriasPor: "macros" };
  const final = plano.finalizarPlano(planoDeAgosto(), [], AGORA, { identificacao, regras });
  identificacao.linhas[2] = "CRN3 99999";
  regras.azeiteGramas = 10;
  assert.equal(final.identificacaoUsada.linhas[2], "CRN3 63653");
  assert.equal(final.regrasDoCalculo.azeiteGramas, 5);
  assert.equal(JSON.parse(final.retrato.conteudo).identificacao.linhas[2], "CRN3 63653");
});

test("alimentos congelados vêm do retrato do plano finalizado", () => {
  const alimentos = [{ id: "taco-x", nome: "Pão", grupo: "Cereais", por100g: { kcal: 300, cho: 58, ptn: 8, lip: 3, fibra: 2 }, tracos: [], fonte: { tabela: "TACO 4ª ed.", referencia: "teste" } }];
  const final = plano.finalizarPlano(planoDeAgosto(), alimentos, AGORA);
  alimentos[0].por100g.kcal = 999;
  assert.equal(plain(plano.alimentosDoRetrato(final))[0].por100g.kcal, 300);
  assert.deepEqual(plain(plano.alimentosDoRetrato(planoDeAgosto())), []);
});

// Resposta dela (28/09/2026): "quanto menos emojis, melhor". Refeição nova nasce sem emoji.
test("refeição nova nasce sem emoji", () => {
  const r = plano.novaRefeicao({ nome: "Almoço", tipo: "almoco", emoji: "🍽️" }, () => "r1");
  assert.equal(r.emoji, "");
  assert.equal(r.tipo, "almoco");
});
