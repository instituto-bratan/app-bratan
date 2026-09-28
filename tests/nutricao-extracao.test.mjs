// CONFERÊNCIA DA RESPOSTA DA IA CONTRA A TRANSCRIÇÃO (28/09/2026).
//
// Módulo de segurança: a IA não pode inventar dado. Todo valor que ela propõe
// precisa vir com um trecho literal da transcrição; o que não confere é
// descartado (e fica listado em `descartadas`) ou marcado como incerto, nunca
// aceito calado. A transcrição abaixo é fictícia (checkpoint de nutrição).
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const ex = loadTs("src/features/nutricao/dominio/extracao.ts");

const SEM_TRECHO = "sem trecho da transcrição que sustente";

const segmentos = [
  { i: 0, inicio: 0, fim: 6, texto: "Bom dia! Vamos começar pela bioimpedância: deu 71,2 quilos e a gordura visceral ficou em 9." },
  { i: 1, inicio: 6, fim: 12, texto: "Tô dormindo umas sete horas por noite, mas acordo duas vezes pra ir ao banheiro." },
  { i: 2, inicio: 12, fim: 19, texto: "Voltei pra musculação, vou três vezes na semana, sempre de manhã cedo." },
  { i: 3, inicio: 19, fim: 25, texto: "Água eu tô bebendo uns dois litros por dia, às vezes menos no fim de semana." },
  { i: 4, inicio: 25, fim: 31, texto: "Café são três xícaras, a última às 17h, com adoçante." },
  { i: 5, inicio: 31, fim: 38, texto: "A B12 eu tô tomando todo dia depois do almoço. O magnésio eu parei faz uma semana." },
  { i: 6, inicio: 38, fim: 45, texto: "Então vamos combinar de trocar a manteiga por ovo no café da manhã," },
  { i: 7, inicio: 45, fim: 52, texto: "pode ser mexido ou cozido, do jeito que você preferir. Ah, e meu joelho tá doendo quando eu subo escada." },
];

const ev = (segmento, trecho, quem = "pessoa") => ({ segmento, trecho, quem });

function novoContexto() {
  let n = 0;
  return {
    itensRegistrados: [
      { id: "item-b12", nome: "Vitamina B12" },
      { id: "item-mag", nome: "Magnésio" },
    ],
    geradaEm: "2026-09-28T12:00:00.000Z",
    modelo: "modelo-teste",
    novoId: () => `id-${++n}`,
  };
}

function campo(nome, texto, evidencias, extra = {}) {
  return { campo: nome, texto, evidencias, incerto: false, motivoIncerteza: "", ...extra };
}

function respostaVazia() {
  return {
    campos: [],
    bio: { pesoKg: null, pgc: null, visceral: null, evidencias: [] },
    suplementos: [],
    conduta: null,
    acordosPlano: [],
    naoClassificados: [],
  };
}

function respostaDaIA() {
  return {
    campos: [
      campo("cafe", "3 xícaras por dia, a última às 17h, com adoçante", [ev(4, "Café são três xícaras, a última às 17h, com adoçante")]),
      campo("sono", "umas 7 horas por noite, acorda 2 vezes para ir ao banheiro", [ev(1, "tô dormindo umas sete horas por noite, mas acordo duas vezes pra ir ao banheiro")]),
      campo("treino", "musculação 3x/semana & sempre de manhã cedo", [ev(2, "Voltei pra musculação, vou três vezes na semana, sempre de manhã cedo")]),
      // trecho que não existe na transcrição
      campo("alcool", "2 taças de vinho no sábado", [ev(3, "tomo duas taças de vinho no sábado")]),
      // tema repetido (o primeiro "sono" já é válido)
      campo("sono", "dorme mal", [ev(1, "acordo duas vezes")]),
      campo(
        "hidratacao",
        "cerca de 2 L de água por dia, menos no fim de semana",
        [ev(3, "Água eu tô bebendo uns dois litros por dia"), ev(3, "bebo três litros no domingo")],
        { incerto: true },
      ),
      campo("intestino", "   ", [ev(1, "ir ao banheiro")]),
      // bio vem de resposta.bio, não de campos
      campo("bio", "peso 71,2", [ev(0, "71,2 quilos")]),
    ],
    bio: { pesoKg: 71.2, pgc: 31.5, visceral: 9, evidencias: [ev(0, "deu 71,2 quilos e a gordura visceral ficou em 9", "profissional")] },
    suplementos: [
      { nome: "Vitamina B12", itemId: "item-b12", usoRelatado: "todo dia depois do almoço", adesao: "ok", orientacao: "", evidencias: [ev(5, "A B12 eu tô tomando todo dia depois do almoço")], incerto: false },
      { nome: "MAGNESIO", itemId: "id-inventado", usoRelatado: "parou faz uma semana", adesao: "nao_usa", orientacao: "", evidencias: [ev(5, "O magnésio eu parei faz uma semana")], incerto: false },
      { nome: "Ômega 3", itemId: null, usoRelatado: "2 cápsulas por dia", adesao: "ok", orientacao: "", evidencias: [ev(42, "ômega 3 duas cápsulas")], incerto: false },
    ],
    conduta: { texto: "Trocar a manteiga por ovo no café da manhã & manter a B12", evidencias: [ev(6, "vamos combinar de trocar a manteiga por ovo no café da manhã", "profissional")] },
    acordosPlano: [
      // trecho que atravessa os segmentos 6 e 7
      { refeicao: "Café da manhã", acordo: "trocar a manteiga por ovo (mexido ou cozido)", evidencias: [ev(6, "trocar a manteiga por ovo no café da manhã, pode ser mexido ou cozido", "profissional")] },
      { refeicao: "Jantar", acordo: "sopa de legumes 3x na semana", evidencias: [ev(6, "sopa de legumes no jantar")] },
    ],
    naoClassificados: [{ texto: "dor no joelho ao subir escada", evidencias: [ev(7, "meu joelho tá doendo quando eu subo escada")] }],
  };
}

// ---------------------------------------------------------------- normalizarParaBusca

test("normalizarParaBusca: minúsculas, sem acento, pontuação vira espaço", () => {
  assert.equal(ex.normalizarParaBusca("Café,  com AÇÚCAR & adoçante!"), "cafe com acucar adocante");
  assert.equal(ex.normalizarParaBusca("  Tô   dormindo... "), "to dormindo");
  assert.equal(ex.normalizarParaBusca("71,2 kg"), "71 2 kg");
  assert.equal(ex.normalizarParaBusca("bem-estar"), "bem estar");
  assert.equal(ex.normalizarParaBusca("  ...  "), "");
  assert.equal(ex.normalizarParaBusca(""), "");
});

// ---------------------------------------------------------------- trechoConfere

test("trechoConfere: trecho literal do segmento, sem ligar para caixa, acento e pontuação", () => {
  assert.equal(ex.trechoConfere(ev(1, "TO DORMINDO UMAS SETE HORAS"), segmentos), true);
  assert.equal(ex.trechoConfere(ev(4, "a última às 17h, com adoçante."), segmentos), true);
});

test("trechoConfere: trecho vazio ou só pontuação não confere", () => {
  assert.equal(ex.trechoConfere(ev(1, ""), segmentos), false);
  assert.equal(ex.trechoConfere(ev(1, "   "), segmentos), false);
  assert.equal(ex.trechoConfere(ev(1, "..."), segmentos), false);
});

test("trechoConfere: segmento errado ou inexistente não confere", () => {
  assert.equal(ex.trechoConfere(ev(2, "tô dormindo umas sete horas"), segmentos), false);
  assert.equal(ex.trechoConfere(ev(42, "tô dormindo umas sete horas"), segmentos), false);
  assert.equal(ex.trechoConfere(ev(-1, "tô dormindo umas sete horas"), segmentos), false);
  assert.equal(ex.trechoConfere(ev(1, "tomo duas taças de vinho"), segmentos), false);
});

test("trechoConfere: pode atravessar para o segmento seguinte, nunca para o anterior nem pular um", () => {
  assert.equal(ex.trechoConfere(ev(6, "no café da manhã, pode ser mexido ou cozido"), segmentos), true);
  assert.equal(ex.trechoConfere(ev(7, "no café da manhã, pode ser mexido ou cozido"), segmentos), false);
  assert.equal(ex.trechoConfere(ev(5, "faz uma semana. Então vamos combinar de trocar a manteiga por ovo no café da manhã, pode ser"), segmentos), false);
});

test("trechoConfere: pedaço de palavra não conta como trecho", () => {
  assert.equal(ex.trechoConfere(ev(1, "ormindo umas sete"), segmentos), false);
  assert.equal(ex.trechoConfere(ev(1, "dormindo umas sete"), segmentos), true);
});

// ---------------------------------------------------------------- evidenciasConferidas

test("evidenciasConferidas: fica só com o que confere, no formato Evidencia", () => {
  const conferidas = plain(
    ex.evidenciasConferidas(
      [ev(3, "Água eu tô bebendo uns dois litros por dia"), ev(3, "bebo três litros no domingo"), ev(9, "qualquer coisa"), ev(4, "com adoçante", "profissional")],
      segmentos,
    ),
  );
  assert.deepEqual(conferidas, [
    { segmento: 3, trecho: "Água eu tô bebendo uns dois litros por dia", quem: "pessoa" },
    { segmento: 4, trecho: "com adoçante", quem: "profissional" },
  ]);
  assert.deepEqual(plain(ex.evidenciasConferidas([], segmentos)), []);
});

// ---------------------------------------------------------------- numeroApareceNaFala

test("numeroApareceNaFala: decimal com vírgula ou ponto", () => {
  const segs = [
    { i: 0, inicio: 0, fim: 1, texto: "Peso de hoje: 71,2 quilos." },
    { i: 1, inicio: 1, fim: 2, texto: "A balança mostrou 71.2 e o PGC 31,50 por cento." },
  ];
  assert.equal(ex.numeroApareceNaFala(71.2, [ev(0, "71,2 quilos")], segs), true);
  assert.equal(ex.numeroApareceNaFala(71.2, [ev(1, "A balança mostrou")], segs), true);
  assert.equal(ex.numeroApareceNaFala(31.5, [ev(1, "o PGC")], segs), true);
  assert.equal(ex.numeroApareceNaFala(71.25, [ev(0, "71,2 quilos")], segs), false);
  assert.equal(ex.numeroApareceNaFala(1.2, [ev(0, "71,2 quilos")], segs), false);
});

test("numeroApareceNaFala: inteiro só como número inteiro ('7' não casa com 17, 71 nem 7,5)", () => {
  const segs = [
    { i: 0, inicio: 0, fim: 1, texto: "O último café é às 17h e o peso deu 71,2; a nota foi 7,5." },
    { i: 1, inicio: 1, fim: 2, texto: "Visceral ficou em 9." },
    { i: 2, inicio: 2, fim: 3, texto: "Dormi 7 horas, visceral 9,0." },
  ];
  assert.equal(ex.numeroApareceNaFala(7, [ev(0, "O último café")], segs), false);
  assert.equal(ex.numeroApareceNaFala(7, [ev(2, "Dormi 7 horas")], segs), true);
  assert.equal(ex.numeroApareceNaFala(9, [ev(1, "Visceral ficou em 9")], segs), true);
  assert.equal(ex.numeroApareceNaFala(9, [ev(2, "visceral 9,0")], segs), true);
});

test("numeroApareceNaFala: só olha os segmentos das evidências", () => {
  // 71,2 está no segmento 0, mas a evidência aponta para o 1
  assert.equal(ex.numeroApareceNaFala(71.2, [ev(1, "sete horas")], segmentos), false);
  assert.equal(ex.numeroApareceNaFala(71.2, [], segmentos), false);
  // número por extenso não é conferido: fica para ela revisar
  assert.equal(ex.numeroApareceNaFala(7, [ev(1, "sete horas")], segmentos), false);
});

// ---------------------------------------------------------------- conferirOrganizacao

test("conferirOrganizacao: data e modelo vêm do contexto", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  assert.equal(org.geradaEm, "2026-09-28T12:00:00.000Z");
  assert.equal(org.modelo, "modelo-teste");
});

test("conferirOrganizacao: campos válidos ficam pendentes, com texto normalizado e na ordem do roteiro", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  assert.deepEqual(
    org.campos.map((c) => c.campo),
    ["bio", "treino", "sono", "hidratacao", "cafe"],
  );
  const treino = org.campos.find((c) => c.campo === "treino");
  assert.deepEqual(treino, {
    campo: "treino",
    texto: "musculação 3x/semana e sempre de manhã cedo",
    bio: null,
    evidencias: [{ segmento: 2, trecho: "Voltei pra musculação, vou três vezes na semana, sempre de manhã cedo", quem: "pessoa" }],
    incerto: false,
    motivo: null,
    estado: "pendente",
  });
  const sono = org.campos.find((c) => c.campo === "sono");
  assert.equal(sono.texto, "umas 7 horas por noite, acorda 2 vezes para ir ao banheiro");
  for (const c of org.campos) assert.equal(c.estado, "pendente");
});

test("conferirOrganizacao: evidência que não confere sai; incerto sem motivo ganha motivo padrão", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  const hidratacao = org.campos.find((c) => c.campo === "hidratacao");
  assert.deepEqual(hidratacao.evidencias, [{ segmento: 3, trecho: "Água eu tô bebendo uns dois litros por dia", quem: "pessoa" }]);
  assert.equal(hidratacao.incerto, true);
  assert.equal(hidratacao.motivo, "a IA marcou como incerto");

  const r = respostaVazia();
  r.campos.push(campo("cafe", "3 xícaras", [ev(4, "Café são três xícaras")], { incerto: true, motivoIncerteza: "não ficou claro se é  com adoçante & leite" }));
  const cafe = plain(ex.conferirOrganizacao(r, segmentos, novoContexto())).campos[0];
  assert.equal(cafe.motivo, "não ficou claro se é com adoçante e leite");
});

test("conferirOrganizacao: descarta trecho inventado, tema repetido e texto vazio, dizendo o motivo", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  assert.deepEqual(org.descartadas, [
    { onde: "Bebida alcoólica", texto: "2 taças de vinho no sábado", motivo: SEM_TRECHO },
    { onde: "Sono", texto: "dorme mal", motivo: "tema repetido" },
    { onde: "Intestino", texto: "", motivo: "texto vazio" },
    { onde: "Ômega 3", texto: "2 cápsulas por dia", motivo: SEM_TRECHO },
    { onde: "Acordo do plano", texto: "Jantar: sopa de legumes 3x na semana", motivo: SEM_TRECHO },
  ]);
  assert.equal(org.campos.some((c) => c.campo === "alcool"), false);
  assert.equal(org.campos.filter((c) => c.campo === "sono").length, 1);
});

test("conferirOrganizacao: tema repetido fica com o primeiro que confere, não com o primeiro que aparece", () => {
  const r = respostaVazia();
  r.campos.push(campo("sono", "dorme 9 horas", [ev(1, "durmo nove horas")]));
  r.campos.push(campo("sono", "umas sete horas por noite", [ev(1, "umas sete horas por noite")]));
  r.campos.push(campo("sono", "acorda duas vezes", [ev(1, "acordo duas vezes")]));
  const org = plain(ex.conferirOrganizacao(r, segmentos, novoContexto()));
  assert.deepEqual(org.campos.map((c) => c.texto), ["umas sete horas por noite"]);
  assert.deepEqual(org.descartadas, [
    { onde: "Sono", texto: "dorme 9 horas", motivo: SEM_TRECHO },
    { onde: "Sono", texto: "acorda duas vezes", motivo: "tema repetido" },
  ]);
});

test("conferirOrganizacao: bio com um número que não foi dito fica incerta, nunca aceita calada", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  const bio = org.campos.find((c) => c.campo === "bio");
  assert.deepEqual(bio, {
    campo: "bio",
    texto: "",
    bio: { pesoKg: 71.2, pgc: 31.5, visceral: 9, fonte: null },
    evidencias: [{ segmento: 0, trecho: "deu 71,2 quilos e a gordura visceral ficou em 9", quem: "profissional" }],
    incerto: true,
    motivo: "número não encontrado na fala: 31,5",
    estado: "pendente",
  });
});

test("conferirOrganizacao: bio com os números ditos ('71,2') passa sem incerteza", () => {
  const r = respostaVazia();
  r.bio = { pesoKg: 71.2, pgc: null, visceral: 9, evidencias: [ev(0, "deu 71,2 quilos e a gordura visceral ficou em 9")] };
  const org = plain(ex.conferirOrganizacao(r, segmentos, novoContexto()));
  assert.equal(org.campos.length, 1);
  const bio = org.campos[0];
  assert.equal(bio.campo, "bio");
  assert.deepEqual(bio.bio, { pesoKg: 71.2, pgc: null, visceral: 9, fonte: null });
  assert.equal(bio.incerto, false);
  assert.equal(bio.motivo, null);
  assert.equal(org.naoMencionados.includes("bio"), false);
});

test("conferirOrganizacao: vários números não ditos aparecem todos no motivo", () => {
  const r = respostaVazia();
  r.bio = { pesoKg: 70.8, pgc: 31.5, visceral: 9, evidencias: [ev(0, "a gordura visceral ficou em 9")] };
  const bio = plain(ex.conferirOrganizacao(r, segmentos, novoContexto())).campos[0];
  assert.equal(bio.incerto, true);
  assert.equal(bio.motivo, "números não encontrados na fala: 70,8, 31,5");
});

test("conferirOrganizacao: números da bio sem trecho que confira são descartados", () => {
  const r = respostaVazia();
  r.bio = { pesoKg: 71.2, pgc: 31.5, visceral: 9, evidencias: [ev(0, "a balança deu 71,2 e o PGC 31,5")] };
  const org = plain(ex.conferirOrganizacao(r, segmentos, novoContexto()));
  assert.deepEqual(org.campos, []);
  assert.deepEqual(org.descartadas, [
    { onde: "Bio", texto: "peso 71,2 kg, PGC 31,5%, visceral 9", motivo: "números da bioimpedância sem trecho da transcrição" },
  ]);
  assert.equal(org.naoMencionados[0], "bio");
});

test("conferirOrganizacao: bio sem nenhum número não vira sugestão nem descarte", () => {
  const r = respostaVazia();
  r.bio = { pesoKg: null, pgc: null, visceral: null, evidencias: [ev(0, "vamos começar pela bioimpedância")] };
  const org = plain(ex.conferirOrganizacao(r, segmentos, novoContexto()));
  assert.deepEqual(org.campos, []);
  assert.deepEqual(org.descartadas, []);
  assert.equal(org.naoMencionados.includes("bio"), true);
});

test("conferirOrganizacao: suplementos conferidos, itemId só da lista registrada", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  assert.deepEqual(org.suplementos, [
    {
      nome: "Vitamina B12",
      itemId: "item-b12",
      usoRelatado: "todo dia depois do almoço",
      adesao: "ok",
      orientacao: "",
      evidencias: [{ segmento: 5, trecho: "A B12 eu tô tomando todo dia depois do almoço", quem: "pessoa" }],
      incerto: false,
      estado: "pendente",
    },
    {
      // itemId inventado pela IA; o nome bate com "Magnésio" sem ligar para caixa e acento
      nome: "MAGNESIO",
      itemId: "item-mag",
      usoRelatado: "parou faz uma semana",
      adesao: "nao_usa",
      orientacao: "",
      evidencias: [{ segmento: 5, trecho: "O magnésio eu parei faz uma semana", quem: "pessoa" }],
      incerto: false,
      estado: "pendente",
    },
  ]);
  for (const s of org.suplementos) assert.equal("prescricao" in s, false);
});

test("conferirOrganizacao: suplemento fora da lista fica sem itemId; texto com & é normalizado", () => {
  const r = respostaVazia();
  r.suplementos.push({
    nome: "Creatina",
    itemId: "item-inventado",
    usoRelatado: "depois do almoço & todo dia",
    adesao: "ok",
    orientacao: "",
    evidencias: [ev(5, "todo dia depois do almoço")],
    incerto: true,
  });
  const s = plain(ex.conferirOrganizacao(r, segmentos, novoContexto())).suplementos[0];
  assert.equal(s.itemId, null);
  assert.equal(s.usoRelatado, "depois do almoço e todo dia");
  assert.equal(s.incerto, true);
});

test("conferirOrganizacao: conduta conferida, com texto normalizado", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  assert.deepEqual(org.conduta, {
    texto: "Trocar a manteiga por ovo no café da manhã e manter a B12",
    evidencias: [{ segmento: 6, trecho: "vamos combinar de trocar a manteiga por ovo no café da manhã", quem: "profissional" }],
    estado: "pendente",
  });
});

test("conferirOrganizacao: conduta sem trecho vira null e fica nos descartes", () => {
  const r = respostaVazia();
  r.conduta = { texto: "Suspender o café depois das 14h", evidencias: [ev(4, "sem café depois das 14h")] };
  const org = plain(ex.conferirOrganizacao(r, segmentos, novoContexto()));
  assert.equal(org.conduta, null);
  assert.deepEqual(org.descartadas, [{ onde: "Conduta", texto: "Suspender o café depois das 14h", motivo: SEM_TRECHO }]);

  const vazia = respostaVazia();
  vazia.conduta = { texto: "  ", evidencias: [] };
  const semTexto = plain(ex.conferirOrganizacao(vazia, segmentos, novoContexto()));
  assert.equal(semTexto.conduta, null);
  assert.deepEqual(semTexto.descartadas, []);

  assert.equal(plain(ex.conferirOrganizacao(respostaVazia(), segmentos, novoContexto())).conduta, null);
});

test("conferirOrganizacao: acordo do plano com trecho que atravessa dois segmentos fica", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  assert.deepEqual(org.acordos, [
    {
      id: "id-1",
      refeicao: "Café da manhã",
      acordo: "trocar a manteiga por ovo (mexido ou cozido)",
      evidencias: [{ segmento: 6, trecho: "trocar a manteiga por ovo no café da manhã, pode ser mexido ou cozido", quem: "profissional" }],
      estado: "pendente",
    },
  ]);
});

test("conferirOrganizacao: não classificados conferidos ganham id e ficam pendentes", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  assert.deepEqual(org.naoClassificados, [
    {
      id: "id-2",
      texto: "dor no joelho ao subir escada",
      evidencias: [{ segmento: 7, trecho: "meu joelho tá doendo quando eu subo escada", quem: "pessoa" }],
      estado: "pendente",
    },
  ]);

  const r = respostaVazia();
  r.naoClassificados.push({ texto: "dor nas costas", evidencias: [ev(7, "minhas costas doem")] });
  const semTrecho = plain(ex.conferirOrganizacao(r, segmentos, novoContexto()));
  assert.deepEqual(semTrecho.naoClassificados, []);
  assert.deepEqual(semTrecho.descartadas, [{ onde: "Não classificado", texto: "dor nas costas", motivo: SEM_TRECHO }]);
});

test("conferirOrganizacao: não mencionados seguem a ordem do roteiro", () => {
  const org = plain(ex.conferirOrganizacao(respostaDaIA(), segmentos, novoContexto()));
  assert.deepEqual(org.naoMencionados, [
    "intestino",
    "alcool",
    "refrigerante",
    "suco",
    "disposicao",
    "ansiedade",
    "melhorou",
    "dificuldade",
    "finsDeSemana",
  ]);

  const nada = plain(ex.conferirOrganizacao(respostaVazia(), segmentos, novoContexto()));
  assert.deepEqual(nada.naoMencionados, [
    "bio",
    "treino",
    "sono",
    "intestino",
    "hidratacao",
    "cafe",
    "alcool",
    "refrigerante",
    "suco",
    "disposicao",
    "ansiedade",
    "melhorou",
    "dificuldade",
    "finsDeSemana",
  ]);
});
