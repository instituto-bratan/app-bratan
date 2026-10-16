// PLANO EM MINUTOS (16/10/2026): linha rápida, memória das medidas, ajuste às
// metas, substituições automáticas, modelos e as respostas da Dra. Géssica que
// faltavam (legumes livres = 100 g de abóbora; tabela no documento).
//
// Os alimentos "-teste" são FIXTURES com números inventados. Os testes que
// citam a TACO leem o arquivo real do app.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const q = loadTs("src/features/nutricao/dominio/quantidade.ts");
const memoria = loadTs("src/features/nutricao/dominio/memoria.ts");
const ajuste = loadTs("src/features/nutricao/dominio/ajuste.ts");
const equivalentes = loadTs("src/features/nutricao/dominio/equivalentes.ts");
const modelos = loadTs("src/features/nutricao/dominio/modelos.ts");
const calculo = loadTs("src/features/nutricao/dominio/calculo.ts");
const revisao = loadTs("src/features/nutricao/dominio/revisao.ts");
const plano = loadTs("src/features/nutricao/dominio/plano.ts");

const TACO = JSON.parse(fs.readFileSync(new URL("../src/features/nutricao/dados/taco-4ed.json", import.meta.url), "utf8")).alimentos;
const TACO_POR_ID = Object.fromEntries(TACO.map((a) => [a.id, a]));

function alimento(id, grupo, por100g) {
  return { id, nome: `${id} (fixture)`, grupo, por100g: { fibra: 0, ...por100g }, tracos: [], fonte: { tabela: "Própria", referencia: "fixture" } };
}
const A = {
  "arroz-teste": alimento("arroz-teste", "Cereais e derivados", { kcal: 128, cho: 28, ptn: 2.5, lip: 0.2 }),
  "batata-teste": alimento("batata-teste", "Verduras, hortaliças e derivados", { kcal: 52, cho: 12, ptn: 1.2, lip: 0 }),
  "frango-teste": alimento("frango-teste", "Carnes e derivados", { kcal: 159, cho: 0, ptn: 32, lip: 2.5 }),
  "carne-teste": alimento("carne-teste", "Carnes e derivados", { kcal: 220, cho: 0, ptn: 32, lip: 10 }),
  "ovo-teste": alimento("ovo-teste", "Ovos e derivados", { kcal: 146, cho: 0.6, ptn: 13.3, lip: 9.5 }),
  "pao-teste": alimento("pao-teste", "Cereais e derivados", { kcal: 300, cho: 58, ptn: 8, lip: 3 }),
  "fruta-teste": alimento("fruta-teste", "Frutas e derivados", { kcal: 90, cho: 22, ptn: 1, lip: 0 }),
  "azeite-teste": alimento("azeite-teste", "Óleos e gorduras", { kcal: 884, cho: 0, ptn: 0, lip: 100 }),
  "abobora-teste": alimento("abobora-teste", "Verduras, hortaliças e derivados", { kcal: 48, cho: 10.8, ptn: 1.4, lip: 0.7 }),
};

let seq = 0;
const novoId = () => `id-${++seq}`;
const item = (alimentoId, gramas, extra = {}) => ({ id: novoId(), descricao: alimentoId ?? "item", quantidade: "", gramas, alimentoId, alternativas: [], observacao: "", legumes: false, origem: null, ...extra });
const refeicao = (id, tipo, itens) => ({ id, nome: id, tipo, horario: "", opcional: false, emoji: "", itens, observacao: "", azeitePreparo: null });
const opcoes = (extra = {}) => ({ azeiteGramas: 5, azeite: A["azeite-teste"], pesoKg: 70, caloriasPor: "macros", ...extra });

// ---------------------------------------------------------------- quantidade

test("lê a medida como ela escreve", () => {
  assert.deepEqual(plain(q.lerQuantidade("4 colheres de sopa")), { numero: 4, unidade: "colheres de sopa", tipo: "caseira" });
  assert.deepEqual(plain(q.lerQuantidade("1 e ½ unidade")), { numero: 1.5, unidade: "unidade", tipo: "caseira" });
  assert.deepEqual(plain(q.lerQuantidade("meia xícara de chá")), { numero: 0.5, unidade: "xícara de chá", tipo: "caseira" });
  assert.deepEqual(plain(q.lerQuantidade("uma fatia")), { numero: 1, unidade: "fatia", tipo: "caseira" });
  assert.deepEqual(plain(q.lerQuantidade("100g")), { numero: 100, unidade: "g", tipo: "gramas" });
  assert.deepEqual(plain(q.lerQuantidade("1/2 unidade (60g)")), { numero: 0.5, unidade: "unidade", tipo: "caseira" });
  assert.equal(q.lerQuantidade("a gosto"), null);
  assert.equal(q.lerQuantidade("umbu"), null);
});

test("escreve de volta com singular e plural certos", () => {
  assert.equal(q.escreverQuantidade(1, "colheres de sopa"), "1 colher de sopa");
  assert.equal(q.escreverQuantidade(3, "colher de sopa"), "3 colheres de sopa");
  assert.equal(q.escreverQuantidade(0.5, "unidades médias"), "½ unidade média");
  assert.equal(q.escreverQuantidade(1.5, "fatia"), "1 e ½ fatias");
  assert.equal(q.escreverQuantidade(2, "porção"), "2 porções");
  assert.equal(q.escreverQuantidade(120, "g"), "120 g");
});

test("trocar '4 colheres' por '5 colheres' leva os gramas junto", () => {
  assert.equal(q.gramasAoTrocarMedida({ quantidade: "4 colheres de sopa", gramas: 100 }, "5 colheres de sopa"), 125);
  assert.equal(q.gramasAoTrocarMedida({ quantidade: "4 colheres de sopa", gramas: 100 }, "1 colher de sopa"), 25);
  assert.equal(q.gramasAoTrocarMedida({ quantidade: "4 colheres de sopa", gramas: 100 }, "2 conchas"), null, "unidade diferente: ela decide");
  assert.equal(q.gramasAoTrocarMedida({ quantidade: "", gramas: 100 }, "2 colheres"), null);
});

// ---------------------------------------------------------------- memória e linha rápida

const planoComArroz = {
  refeicoes: [refeicao("almoco", "almoco", [item("arroz-teste", 100, { descricao: "Arroz", quantidade: "4 colheres de sopa" }), item("ovo-teste", 100, { descricao: "Ovo", quantidade: "2 unidades" })])],
};

test("aprende o alimento e os gramas de cada medida com os planos dela", () => {
  const m = memoria.aprender([planoComArroz], []);
  assert.equal(m.alimentoPorNome.get("arroz").alimentoId, "arroz-teste");
  assert.equal(memoria.medidaConhecida(m, "arroz-teste", "colheres de sopa").gramasPorUnidade, 25);
  assert.equal(memoria.medidaConhecida(m, "ovo-teste", "unidade").gramasPorUnidade, 50);
});

test("a medida da Biblioteca vale mais que a aprendida", () => {
  const m = memoria.aprender([planoComArroz], [{ id: "m1", alimentoId: "arroz-teste", texto: "1 colher de sopa", gramas: 20, validadaEm: "2026-10-01" }]);
  const medida = memoria.medidaConhecida(m, "arroz-teste", "colher de sopa");
  assert.equal(medida.gramasPorUnidade, 20);
  assert.equal(medida.fonte, "biblioteca");
});

test("linha rápida: '5 colheres de sopa de arroz' sai com alimento, medida e gramas", () => {
  const m = memoria.aprender([planoComArroz], []);
  const r = memoria.completarLinha("5 colheres de sopa de arroz", Object.values(A), m);
  assert.deepEqual(plain(r.item), { descricao: "Arroz", quantidade: "5 colheres de sopa", gramas: 125, alimentoId: "arroz-teste" });
  assert.equal(r.semGramas, false);
});

test("linha rápida: '1 ovo', '150 g de frango' e alimento primeiro", () => {
  const m = memoria.aprender([planoComArroz], []);
  const ovo = memoria.completarLinha("1 ovo", Object.values(A), m);
  assert.equal(ovo.item.quantidade, "1 unidade");
  assert.equal(ovo.item.gramas, 50);
  const frango = memoria.completarLinha("150 g de frango", Object.values(A), m);
  assert.equal(frango.item.gramas, 150);
  assert.equal(frango.item.alimentoId, "frango-teste");
  const invertido = memoria.completarLinha("arroz 2 colheres de sopa", Object.values(A), m);
  assert.equal(invertido.item.descricao, "Arroz");
  assert.equal(invertido.item.gramas, 50);
});

test("linha rápida sem medida conhecida não inventa gramas", () => {
  const m = memoria.aprender([], []);
  const r = memoria.completarLinha("2 fatias de pão", Object.values(A), m);
  assert.equal(r.item.gramas, null);
  assert.equal(r.semGramas, true);
  assert.equal(r.item.quantidade, "2 fatias");
});

test("nome comum aponta para o alimento preparado da TACO, não o cru", () => {
  const m = memoria.aprender([], []);
  assert.equal(memoria.alimentoParaNome("arroz", TACO, m).id, "taco-3");
  assert.equal(memoria.alimentoParaNome("frango", TACO, m).id, "taco-410");
  assert.equal(memoria.alimentoParaNome("feijão", TACO, m).id, "taco-561");
  // Sem nome comum: prefere o preparado ao cru.
  assert.match(memoria.alimentoParaNome("lombo", TACO, m).nome, /assado/);
});

test("todo id dos nomes comuns e dos grupos de substituição existe na TACO", () => {
  for (const id of Object.values(memoria.ALIMENTO_COMUM)) assert.ok(TACO_POR_ID[id], id);
  for (const g of equivalentes.GRUPOS_INICIAIS) for (const a of g.alimentos) assert.ok(TACO_POR_ID[a.alimentoId], `${g.id}: ${a.alimentoId}`);
});

// ---------------------------------------------------------------- ajuste às metas

function diaDeTeste() {
  return [
    refeicao("cafe", "cafe", [item("pao-teste", 50, { quantidade: "1 unidade" }), item("ovo-teste", 100, { quantidade: "2 unidades" }), item("fruta-teste", 100, { quantidade: "1 unidade" })]),
    refeicao("almoco", "almoco", [item("arroz-teste", 100, { quantidade: "4 colheres de sopa" }), item("frango-teste", 100, { quantidade: "100 g" }), item(null, null, { descricao: "Legumes", legumes: true })]),
    refeicao("jantar", "jantar", [item("arroz-teste", 100, { quantidade: "4 colheres de sopa" }), item("frango-teste", 100, { quantidade: "100 g" })]),
  ];
}

test("metas em gramas: proteína pelo peso, o resto pelos percentuais dela", () => {
  const alvo = ajuste.metasEmGramas({ kcal: 1800, ptnGkg: 1.6, choPct: 45, lipPct: 30 }, 70, { kcal: 0, cho: 100, ptn: 100, lip: 30, fibra: 0 });
  assert.equal(Math.round(alvo.ptn), 112);
  // 1800 − 448 = 1352 kcal divididas 45:30 entre carboidrato e gordura.
  assert.equal(Math.round(alvo.cho), Math.round((1352 * 0.6) / 4));
  assert.equal(Math.round(alvo.lip), Math.round((1352 * 0.4) / 9));
});

test("metas impossíveis viram mensagem, não número", () => {
  assert.match(ajuste.metasEmGramas({ kcal: null, ptnGkg: 1.6, choPct: null, lipPct: null }, 70, { cho: 1, ptn: 1, lip: 1 }).erro, /calorias/);
  assert.match(ajuste.metasEmGramas({ kcal: 1500, ptnGkg: 1.6, choPct: null, lipPct: null }, null, { cho: 1, ptn: 1, lip: 1 }).erro, /peso/);
  assert.match(ajuste.metasEmGramas({ kcal: 300, ptnGkg: 2, choPct: null, lipPct: null }, 80, { cho: 1, ptn: 1, lip: 1 }).erro, /não fecham/);
});

test("ajustar às metas chega perto das metas e escreve no jeito dela", () => {
  const metas = { kcal: 1800, ptnGkg: 1.6, choPct: 45, lipPct: 30 };
  const r = ajuste.ajustarAsMetas(diaDeTeste(), A, opcoes(), metas);
  assert.ok(!r.erro, r.erro);
  assert.ok(Math.abs(r.depois.kcal - 1800) <= 90, `kcal ${r.depois.kcal}`);
  assert.ok(Math.abs(r.depois.ptn - 112) <= 10, `ptn ${r.depois.ptn}`);
  for (const m of r.mudancas) {
    if (/colher/.test(m.depois.quantidade)) {
      // Quantidade em meia colher e gramas = colheres × 25 g.
      const n = q.lerQuantidade(m.depois.quantidade).numero;
      assert.equal((n * 2) % 1, 0);
      assert.equal(m.depois.gramas, Math.round(n * 25));
    }
    if (/ g$/.test(m.depois.quantidade)) assert.equal(m.depois.gramas % 5, 0);
  }
});

test("ajuste não mexe em fruta, legumes nem no que ela travou", () => {
  const dia = diaDeTeste();
  dia[0].itens[1].travado = true; // ovos
  const r = ajuste.ajustarAsMetas(dia, A, opcoes(), { kcal: 2200, ptnGkg: 1.8, choPct: 50, lipPct: 25 });
  const mexidos = new Set(r.mudancas.map((m) => m.itemId));
  assert.ok(!mexidos.has(dia[0].itens[1].id), "ovo travado");
  assert.ok(!mexidos.has(dia[0].itens[2].id), "fruta");
  const motivos = r.mantidos.map((x) => x.motivo).join(" | ");
  assert.match(motivos, /travou/);
  assert.match(motivos, /fruta/);
  assert.match(motivos, /legumes/);
});

test("ajuste avisa quando falta um alimento de gordura para mudar", () => {
  const dia = [refeicao("almoco", "almoco", [item("arroz-teste", 100, { quantidade: "4 colheres de sopa" }), item("frango-teste", 100, { quantidade: "100 g" })])];
  const r = ajuste.ajustarAsMetas(dia, A, opcoes({ azeiteGramas: 0 }), { kcal: 900, ptnGkg: 1.0, choPct: 40, lipPct: 35 });
  assert.ok(r.avisos.some((a) => /gordura/.test(a) && /Acrescente/.test(a)), r.avisos.join(" | "));
});

test("ajuste não muda o plano original (devolve uma proposta)", () => {
  const dia = diaDeTeste();
  const antes = JSON.stringify(dia);
  ajuste.ajustarAsMetas(dia, A, opcoes(), { kcal: 1500, ptnGkg: 1.4, choPct: 40, lipPct: 30 });
  assert.equal(JSON.stringify(dia), antes);
});

// ---------------------------------------------------------------- substituições

test("substituições pelo carboidrato: 100 g de arroz viram a porção de batata com o mesmo carboidrato", () => {
  const grupo = { id: "g", titulo: "Carbo", base: "cho", alimentos: [{ alimentoId: "arroz-teste", nome: "Arroz" }, { alimentoId: "batata-teste", nome: "Batata cozida" }], versao: 1, atualizadoEm: "" };
  const arroz = item("arroz-teste", 100);
  const r = equivalentes.gerarSubstituicoes(arroz, grupo, A, memoria.aprender([], []), novoId);
  assert.equal(r.alternativas.length, 1);
  // 28 g de carboidrato ÷ 0,12 g/g = 233 g → 230 g (de 10 em 10 acima de 200).
  assert.equal(r.alternativas[0].gramas, 230);
  assert.equal(r.alternativas[0].auto, true);
  assert.equal(r.alternativas[0].descricao, "Batata cozida");
});

test("gerar de novo troca só as automáticas e mantém as que ela escreveu", () => {
  const grupo = { id: "g", titulo: "Carbo", base: "cho", alimentos: [{ alimentoId: "arroz-teste", nome: "Arroz" }, { alimentoId: "batata-teste", nome: "Batata" }, { alimentoId: "pao-teste", nome: "Pão" }], versao: 1, atualizadoEm: "" };
  const arroz = item("arroz-teste", 100, { alternativas: [{ id: "dela", descricao: "Batata", quantidade: "2 unidades", gramas: 200, alimentoId: "batata-teste" }, { id: "velha", descricao: "Pão", quantidade: "", gramas: 10, alimentoId: "pao-teste", auto: true }] });
  const r = equivalentes.gerarSubstituicoes(arroz, grupo, A, memoria.aprender([], []), novoId);
  assert.deepEqual(plain(r.alternativas.map((a) => (a.id === "dela" ? "dela" : a.descricao))), ["dela", "Pão"]);
  assert.notEqual(r.alternativas[1].id, "velha");
});

test("substituição usa a medida caseira que ela já usa para aquele alimento", () => {
  const grupo = { id: "g", titulo: "Proteínas", base: "ptn", alimentos: [{ alimentoId: "carne-teste", nome: "Carne" }, { alimentoId: "ovo-teste", nome: "Ovo" }], versao: 1, atualizadoEm: "" };
  const m = memoria.aprender([planoComArroz], []); // ovo: 50 g por unidade
  const r = equivalentes.gerarSubstituicoes(item("carne-teste", 100), grupo, A, m, novoId);
  // 32 g de proteína ÷ 0,133 = 240 g de ovo = 4,8 unidades → 5 unidades (250 g).
  assert.equal(r.alternativas[0].quantidade, "5 unidades");
  assert.equal(r.alternativas[0].gramas, 250);
});

// ---------------------------------------------------------------- modelos

test("substituição com o dobro das calorias não vira sugestão (6 ovos no lugar do frango)", () => {
  const grupo = { id: "g", titulo: "Proteínas", base: "ptn", alimentos: [{ alimentoId: "frango-teste", nome: "Frango" }, { alimentoId: "ovo-teste", nome: "Ovo" }], versao: 1, atualizadoEm: "" };
  const r = equivalentes.gerarSubstituicoes(item("frango-teste", 120), grupo, A, memoria.aprender([], []), novoId);
  assert.equal(r.alternativas.length, 0);
  assert.match(r.puladas[0], /Ovo: .* kcal contra/);
});

test("modelo guarda o plano sem a pessoa e volta com ids novos", () => {
  const p = plano.novoPlano({ pessoa: { id: "p1", nome: "Fulana", nomeDocumento: "Fulana" }, mesRef: "2026-10", numero: 1, atendimentoId: "at1", novoId, agora: "2026-10-16T10:00:00.000Z", blocos: [] });
  p.refeicoes[0].itens.push(item("pao-teste", 50, { quantidade: "1 unidade" }));
  p.metas = { kcal: 1600, ptnGkg: 1.6, choPct: 45, lipPct: 30 };
  p.pesoReferencia = { kg: 70, origem: "InBody" };
  const m = modelos.modeloDoPlano(p, { nome: "Emagrecimento 1600", descricao: "" }, novoId, "2026-10-16T10:00:00.000Z");
  assert.equal(m.metas.kcal, 1600);
  assert.equal("pesoReferencia" in m, false);
  const novo = modelos.planoDoModelo({ modelo: m, pessoa: { id: "p2", nome: "Beltrana", nomeDocumento: "Beltrana" }, mesRef: "2026-11", numero: 1, atendimentoId: null, pesoReferencia: { kg: 62, origem: "InBody" }, novoId, agora: "2026-11-01T10:00:00.000Z" });
  assert.equal(novo.pessoaId, "p2");
  assert.equal(novo.origem.tipo, "modelo");
  assert.equal(novo.pesoReferencia.kg, 62);
  assert.equal(novo.refeicoes[0].itens[0].alimentoId, "pao-teste");
  assert.notEqual(novo.refeicoes[0].itens[0].id, m.refeicoes[0].itens[0].id);
  assert.equal(modelos.resumoDoModelo(m), "1 refeição · 1600 kcal · proteína 1,6 g/kg");
});

// ---------------------------------------------------------------- respostas da Géssica

test("legumes livres entram como 100 g de abóbora quando a regra está ligada", () => {
  const livres = item(null, null, { descricao: "Legumes e verduras à vontade", legumes: true });
  const dia = [refeicao("almoco", "almoco", [livres])];
  const sem = calculo.calcularPlano(dia, A, opcoes({ azeiteGramas: 0 }));
  assert.equal(sem.kcal, 0);
  const com = calculo.calcularPlano(dia, A, opcoes({ azeiteGramas: 0, legumesLivres: { gramas: 100, alimento: A["abobora-teste"] } }));
  assert.equal(Math.round(com.total.cho * 10) / 10, 10.8);
  assert.equal(com.livres[0].gramas, 100);
  assert.equal(com.avisos.filter((a) => a.tipo !== "sem_peso").length, 0);
});

test("finalizar liga a tabela de nutrientes no documento e congela a abóbora", () => {
  const p = plano.novoPlano({ pessoa: { id: "p1", nome: "Fulana", nomeDocumento: "Fulana" }, mesRef: "2026-10", numero: 1, atendimentoId: null, novoId, agora: "2026-10-16T10:00:00.000Z", blocos: [] });
  const regras = { azeiteGramas: 5, azeiteAlimentoId: "taco-260", caloriasPor: "macros", legumesLivresGramas: 100, legumesLivresAlimentoId: "taco-64" };
  const final = plano.finalizarPlano(p, TACO, "2026-10-16T11:00:00.000Z", { identificacao: { linhas: ["a", "b", "c", "d", "e"], versao: 1 }, regras });
  assert.equal(final.tabelaNoDocumento, true);
  const retrato = JSON.parse(final.retrato.conteudo);
  assert.ok(retrato.alimentos.some((a) => a.id === "taco-64"));
  assert.ok(retrato.alimentos.some((a) => a.id === "taco-260"));
  // Ela tirou a tabela no rascunho: continua sem.
  const semTabela = plano.finalizarPlano({ ...p, tabelaNoDocumento: false }, TACO, "2026-10-16T11:00:00.000Z");
  assert.equal(semTabela.tabelaNoDocumento, false);
});

test("orientação sugerida não revisada trava a finalização", () => {
  const p = plano.novoPlano({ pessoa: { id: "p1", nome: "Fulana", nomeDocumento: "Fulana" }, mesRef: "2026-10", numero: 1, atendimentoId: null, novoId, agora: "2026-10-16T10:00:00.000Z", blocos: [] });
  p.refeicoes[0].itens.push(item("pao-teste", 50, { descricao: "Pão", quantidade: "1 unidade" }));
  const bloco = plano.blocoDaBiblioteca({ id: "orient-x", titulo: "Orientações para refluxo", itens: ["Faça refeições menores."], texto: "", versao: 1, fonte: "", atualizadoEm: "", rascunho: true }, novoId);
  assert.equal(bloco.rascunho, true);
  const ident = { linhas: ["a", "b", "c", "d", "e"], versao: 1 };
  const r1 = revisao.revisarPlano({ ...p, blocos: [bloco] }, ident, { avisos: [] }, null);
  assert.equal(r1.podeFinalizar, false);
  assert.ok(r1.itens.some((i) => i.id === "orientacoes-rascunho" && i.bloqueia));
  const r2 = revisao.revisarPlano({ ...p, blocos: [{ ...bloco, rascunho: false }] }, ident, { avisos: [] }, null);
  assert.equal(r2.podeFinalizar, true);
});
