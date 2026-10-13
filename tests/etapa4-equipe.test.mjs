// REDESENHO ETAPA 4 · EQUIPE (08/10/2026).
//
// POPs & Fluxos, Mural, Almoço, Minhas Estalecas e Meu perfil ganharam a forma
// Papel & Musgo (guia aprovado: "Simples · Equipe", estado vazio que ensina,
// avatar no arco do brasão). A regra de ouro: o que cada tela FAZ não muda.
// Estes testes conferem as duas metades — a forma nova (um cabeçalho por tela,
// nada de vidro/degradê, letra mínima de 12 px, oliva e dourado nunca como
// texto) e o que as telas fazem (os mesmos dados, botões, travas e textos de
// regra), mais as frases derivadas (nada novo é gravado).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.join(repoRoot, arquivo), "utf8");
/** O código sem os comentários (a história do arquivo cita classes antigas de propósito). */
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const TELAS = {
  pops: { arquivo: "src/features/pops/PopsFluxosPage.tsx", rubrica: /sobrancelha="Equipe"/ },
  mural: { arquivo: "src/features/mural/MuralPage.tsx", rubrica: /sobrancelha="Equipe"/ },
  almoco: { arquivo: "src/features/almoco/AlmocoPage.tsx", rubrica: /sobrancelha="Equipe"/ },
  estalecas: { arquivo: "src/features/estalecas/EstalecasPage.tsx", rubrica: /sobrancelha="Equipe · Minha carteira"/ },
  perfil: { arquivo: "src/features/perfil/MeuPerfilPage.tsx", rubrica: /"Ajustes · Meu perfil"/ },
};
const TODOS_OS_ARQUIVOS = [...Object.values(TELAS).map((t) => t.arquivo), "src/features/pops/pecasDaEquipe.tsx"];

// ---------------------------------------------------------------- a forma

test("cada tela da Equipe tem UM cabeçalho da fundação, com a rubrica de onde mora e a frase do número", () => {
  for (const [nome, { arquivo, rubrica }] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.equal((src.match(/<Cabecalho\b/g) ?? []).length, 1, `${nome}: um Cabecalho só`);
    assert.ok(!/<h1\b/.test(src), `${nome}: o título é o do Cabecalho`);
    assert.match(src, /from "@\/components\/ui\/fundacao"/, `${nome}: usa a fundação`);
    assert.match(src, rubrica, `${nome}: a rubrica diz onde a tela mora`);
    assert.match(src, /frase=\{/, `${nome}: o cabeçalho tem a frase do número`);
  }
});

test("nada de vidro, blur, degradê, sombra pesada, animação de entrada nem as peças antigas nas telas da Equipe", () => {
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const src = semComentarios(ler(arquivo));
    assert.ok(!/liquid-glass|LiquidButton|backdrop-blur|bg-gradient-|shadow-(?:lg|xl|2xl|calm)\b|ios-pressable/.test(src), `${arquivo}: sem vidro, blur, degradê ou sombra pesada`);
    assert.ok(!/from "@\/components\/ui\/(?:button|card|input|badge|label|liquid-glass-button|avatar-badge)"/.test(src), `${arquivo}: sem as peças antigas`);
    assert.ok(!/from "framer-motion"/.test(src), `${arquivo}: sem animação de entrada`);
  }
});

test("as cores antigas com opacidade (que hoje não geram CSS) e as paletas genéricas saíram", () => {
  const antigas =
    /\b(?:bg|text|border|ring|from|to|via)-(?:brand-(?:oliva|creme|musgo|dourado|papel|tinta)|neutral-\d|slate-\d|gray-\d|zinc-\d|stone-\d|emerald-\d|green-\d|red-\d|rose-\d|amber-\d|yellow-\d|orange-\d|sky-\d|blue-\d|indigo-\d|violet-\d|purple-\d|teal-\d|lime-\d)|\bbg-white\b|\btext-white\b|\btext-black\b|text-muted-foreground|text-destructive|bg-muted\b/;
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const achado = semComentarios(ler(arquivo)).match(antigas);
    assert.equal(achado, null, `${arquivo}: classe antiga ${achado?.[0]}`);
  }
});

test("letra mínima de 12 px, números alinhados e oliva/dourado nunca como cor de texto", () => {
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const src = semComentarios(ler(arquivo));
    assert.ok(!/text-\[(?:[0-9]|1[01])px\]/.test(src), `${arquivo}: nada abaixo de 12 px`);
    assert.ok(!/text-(?:dourado|ouro-fio|oliva)\b/.test(src), `${arquivo}: oliva e dourado só em ícone (stroke-oliva), nunca em texto`);
  }
  for (const nome of ["mural", "almoco", "estalecas", "perfil"]) {
    assert.match(ler(TELAS[nome].arquivo), /tabular-nums/, `${nome}: hora, data e número com algarismos de mesma largura`);
  }
});

test("blocos: o que pede decisão mora numa folha, o que é para saber mora no saber; status com palavra e ícone", () => {
  for (const nome of ["mural", "estalecas", "perfil"]) {
    const src = ler(TELAS[nome].arquivo);
    assert.match(src, /<BlocoFolha\b/, `${nome}: tem uma folha (decidir)`);
    assert.match(src, /<(?:BlocoSaber|Indicadores)\b/, `${nome}: tem um bloco para saber`);
  }
  assert.match(ler(TELAS.pops.arquivo), /<BlocoFolha\b/, "POPs: os documentos numa folha por setor");
  assert.match(ler(TELAS.pops.arquivo), /<BlocoSaber\b/, "POPs: o setor escolhido no saber");
  assert.match(ler(TELAS.almoco.arquivo), /<BlocoSaber\b/, "Almoço: a escala é para saber");
  for (const nome of ["almoco", "estalecas", "perfil"]) {
    assert.match(ler(TELAS[nome].arquivo), /<Situacao\b/, `${nome}: a situação é escrita, com ícone`);
  }
  const pecas = ler("src/features/pops/pecasDaEquipe.tsx");
  assert.match(pecas, /export function AvatarEmArco\(/, "o avatar no arco do brasão é uma peça só");
  assert.match(pecas, /rounded-t-2xl rounded-b-controle/, "o arco de 32 é o mesmo do menu");
  assert.match(pecas, /export function EstadoVazio\(/, "o estado vazio que ensina é uma peça só");
  // O ouro só marca o agora: o "No almoço" de quem está em pausa.
  assert.match(pecas, /agora: "text-ouro"/);
  assert.doesNotMatch(semComentarios(ler(TELAS.estalecas.arquivo)), /ouro/, "Estalecas: o 1º lugar não ganha ouro (o ouro é do agora)");
});

// ---------------------------------------------------------------- o que as telas fazem (não mudou)

test("POPs: a mesma busca, o mesmo filtro por setor e o mesmo 'Abrir' em outra aba — o catálogo segue lendo public/fluxogramas", () => {
  const src = ler(TELAS.pops.arquivo);
  for (const texto of ["Abrir fluxograma", "Abrir POP", "PDF anexado", "PNG anexado", "Nenhum fluxograma encontrado.", "Ajuste a busca ou escolha outro setor.", "Buscar por setor, tarefa, documento ou palavra-chave", "Responsáveis", "Tarefas do setor"]) {
    assert.ok(src.includes(texto), `POPs continua com "${texto}"`);
  }
  assert.match(src, /filtrarDocumentos\(fluxogramas, query, selectedArea\)/);
  assert.match(src, /href=\{documento\.assetPath\}/, "o link abre o arquivo do catálogo");
  assert.match(ler("src/features/pops/popsData.ts"), /\$\{import\.meta\.env\.BASE_URL\}fluxogramas\//, "o caminho do arquivo continua em public/fluxogramas");
});

test("Mural: só a coordenação publica e arquiva; aviso de 8 a 420 letras; banco com login, aparelho na prévia", () => {
  const src = ler(TELAS.mural.arquivo);
  assert.match(src, /const canPublish = canPublishMural\(pessoa\?\.cargo\)/);
  assert.match(src, /z\.string\(\)\.min\(8, "Escreva um aviso um pouco mais completo\."\)\.max\(LIMITE_DO_AVISO, "Use até 420 caracteres\."\)/);
  assert.match(src, /const LIMITE_DO_AVISO = 420;/);
  assert.match(src, /prioridade: z\.enum\(\["info", "importante"\]\)/);
  assert.match(src, /const useRemote = Boolean\(pessoa && session && !isPreview\)/);
  for (const chamada of ["listRemoteAvisos", "publishRemoteAviso", "archiveRemoteAviso", "writeLocalValue(muralStorageKey, nextAvisos)"]) {
    assert.ok(src.includes(chamada), `Mural continua chamando ${chamada}`);
  }
  for (const texto of ["Publicar aviso", "Publicando...", "Arquivar", "Informativo", "Importante", "Você está em modo leitura. Novos avisos são publicados pela coordenação."]) {
    assert.ok(src.includes(texto), `Mural continua com "${texto}"`);
  }
  assert.match(src, /\{canPublish \? \(\s*<Botao[\s\S]*?Arquivar/, "Arquivar só aparece para quem publica");
});

test("Almoço: a escala e a situação pelo relógio (a cada 30 s), e o aviso de que NÃO é o ponto", () => {
  const src = ler(TELAS.almoco.arquivo);
  assert.match(src, /window\.setInterval\(\(\) => setNow\(new Date\(\)\), 30_000\)/);
  assert.match(src, /lunchSummary\(now\)/);
  assert.match(src, /statusLabel\(slot\.status, slot\)/);
  assert.match(src, /NÃO substitui o ponto eletrônico<\/strong> — o registro oficial de jornada continua no\s+sistema de ponto do DP\./);
});

test("Estalecas: as mesmas consultas, mutações, travas dos botões e mensagens", () => {
  const src = ler(TELAS.estalecas.arquivo);
  for (const chamada of [
    "getRemoteEstalecaConfig",
    "getRemoteGamificationProfile",
    "listRemoteEstalecaTransactions",
    "listRemoteCheckins",
    "listRemoteRewards",
    "listRemoteRankingProfiles",
    "performRemoteEstalecasCheckin",
    "saveRemoteGamificationProfile",
    "createRemoteEstalecaClaim",
    "listRemoteEstalecaClaims",
    "performLocalCheckin",
    "buildEstalecasSnapshot",
    "buildMonthlyGymRanking",
  ]) {
    assert.ok(src.includes(chamada), `Estalecas continua usando ${chamada}`);
  }
  // As travas dos botões são as de antes.
  assert.match(src, /disabled=\{!hasConsent \|\| checkinMutation\.isPending \|\| Boolean\(gymToday\) \|\| !gymCode\.trim\(\)\}/);
  assert.match(src, /disabled=\{!hasConsent \|\| checkinMutation\.isPending \|\| Boolean\(churchToday\)\}/);
  assert.match(src, /profileMutation\.mutate\(\{ acceptCheckins: true \}\)/);
  assert.match(src, /profileMutation\.mutate\(\{ displayName: displayNameDraft \}\)/);
  assert.match(src, /maxLength=\{32\}/);
  // O link ?checkin=gym&code=… continua preenchendo o código.
  assert.match(src, /if \(urlCheckinCode\) setGymCode\(urlCheckinCode\);/);
  for (const texto of [
    "Ativar check-ins",
    "Registrar treino de hoje",
    "Confirmar presença",
    "Enviar para aprovação",
    "Salvar nome",
    "Entre com seu login para enviar conquistas.",
    "Código não encontrado, vencido ou inativo para hoje. Peça o código atualizado à coordenação.",
    "Informe o código do dia/evento para confirmar este check-in.",
    "Conquista enviada! A coordenação vai revisar e aprovar.",
    "O ranking começa quando houver check-ins válidos de academia neste mês.",
    "Mais Disciplinado da Academia",
  ]) {
    assert.ok(src.includes(texto), `Estalecas continua com "${texto}"`);
  }
  assert.match(src, /ranking\.slice\(0, 6\)/, "o ranking mostra os 6 primeiros");
  assert.match(src, /snapshot\.transactions\.slice\(0, 12\)/, "o histórico mostra as 12 mais recentes");
});

test("Meu perfil: a foto vai para o aparelho e para a equipe; remover também despublica", () => {
  const src = ler(TELAS.perfil.arquivo);
  for (const chamada of ["saveAvatar(pessoaId, dataUrl)", "uploadRemoteAvatar(pessoaId, dataUrl)", "saveAvatar(pessoaId, null)", "deleteRemoteAvatar(pessoaId)", "bumpAvatarVersion(pessoaId)", "fileToAvatarDataUrl(file)"]) {
    assert.ok(src.includes(chamada), `Meu perfil continua chamando ${chamada}`);
  }
  for (const texto of ["Remover foto", "Trocar foto do perfil", "Adicionar foto do perfil", "Minhas permissões", "Liberado", "Bloqueado", "Alterações de cargo, e-mail ou senha inicial são feitas pela coordenação em Colaboradores."]) {
    assert.ok(src.includes(texto), `Meu perfil continua com "${texto}"`);
  }
  assert.match(src, /accessMatrix\.map/);
  assert.match(src, /export function avatarInitials\(/, "a função exportada continua existindo");
});

// ---------------------------------------------------------------- as frases (derivadas, nada novo é gravado)

function carregarPops() {
  const absoluto = path.join(repoRoot, "src/features/pops/popsData.ts");
  const saida = ts.transpileModule(fs.readFileSync(absoluto, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/import\.meta\.env\.BASE_URL/g, '"/"');
  const module = { exports: {} };
  vm.runInNewContext(saida, { module, exports: module.exports, require: () => ({}), console, Object, String, Number, Array, Math }, { filename: absoluto });
  return module.exports;
}

test("POPs: a busca ignora acento e caixa, conta por setor com a busca de agora e reconhece o PDF", () => {
  const pops = carregarPops();
  const todos = pops.filtrarDocumentos(pops.fluxogramas, "", "todos");
  assert.equal(todos.length, pops.fluxogramas.length);
  const comAcento = pops.filtrarDocumentos(pops.fluxogramas, "AGENDAMENTO", "todos").map((d) => d.id);
  const semAcento = pops.filtrarDocumentos(pops.fluxogramas, "agendamento", "todos").map((d) => d.id);
  assert.deepEqual(plain(comAcento), plain(semAcento));
  assert.ok(comAcento.length > 0);
  assert.deepEqual(
    plain(pops.filtrarDocumentos(pops.fluxogramas, "higienizacao", "todos").map((d) => d.id)),
    plain(pops.filtrarDocumentos(pops.fluxogramas, "higienização", "todos").map((d) => d.id)),
    "sem acento acha o com acento",
  );
  const contagem = pops.contarPorArea(pops.fluxogramas, "");
  assert.equal(contagem.todos, pops.fluxogramas.length);
  assert.equal(
    pops.popsAreas.reduce((soma, area) => soma + contagem[area.id], 0),
    pops.fluxogramas.length,
    "cada documento conta em uma área só",
  );
  assert.equal(pops.filtrarDocumentos(pops.fluxogramas, "", "medico").every((d) => d.areaId === "medico"), true);
  assert.equal(pops.ehPdf({ fileName: "POP X.PDF" }), true);
  assert.equal(pops.ehPdf({ fileName: "fluxo.png" }), false);
});

test("Mural: a frase conta os avisos no ar e os importantes; a data sai em palavras", () => {
  const mural = loadTs("src/features/mural/muralData.ts");
  const aviso = (id, prioridade, extra = {}) => ({ id, corpo: "Aviso de teste", prioridade, autor: "Aline", publicadoEm: "2026-10-08T12:00:00.000Z", ...extra });
  assert.deepEqual(plain(mural.fraseDoMural([])), { destaque: "", resto: "Nenhum aviso no mural agora." });
  assert.deepEqual(plain(mural.fraseDoMural([aviso("a", "info"), aviso("b", "info")])), { destaque: "2 avisos no mural", resto: ", todos informativos." });
  assert.deepEqual(plain(mural.fraseDoMural([aviso("a", "importante")])), { destaque: "1 aviso no mural", resto: ", e ele é importante." });
  assert.deepEqual(plain(mural.fraseDoMural([aviso("a", "importante"), aviso("b", "info"), aviso("c", "info")])), { destaque: "3 avisos no mural", resto: ", 1 deles importante." });
  assert.equal(mural.fraseDoMural([aviso("a", "importante", { deletedAt: "2026-10-08T13:00:00.000Z" })]).destaque, "", "arquivado não conta");

  const agora = new Date(2026, 9, 8, 15, 0);
  assert.equal(mural.quandoFoiPublicado(new Date(2026, 9, 8, 9, 12).toISOString(), agora), "hoje, 09:12");
  assert.equal(mural.quandoFoiPublicado(new Date(2026, 9, 7, 17, 40).toISOString(), agora), "ontem, 17:40");
  assert.equal(mural.quandoFoiPublicado(new Date(2026, 8, 28, 9, 0).toISOString(), agora), "28/09, 09:00");
  assert.equal(mural.quandoFoiPublicado(new Date(2025, 11, 30, 9, 0).toISOString(), agora), "30/12/2025, 09:00");
  assert.equal(mural.quandoFoiPublicado("nada", agora), "");
});

test("Almoço: a frase diz quem está fora e até quando, e a régua cobre a escala com meia hora de folga", () => {
  const almoco = loadTs("src/features/almoco/almocoData.ts");
  const em = (h, m) => new Date(2026, 9, 8, h, m);
  const frase = (h, m) => plain(almoco.fraseDoAlmoco(almoco.lunchSummary(em(h, m)).slotsWithStatus));
  assert.deepEqual(frase(11, 30), { destaque: "Ninguém está no almoço agora.", resto: " A próxima saída é a de Lilian, às 12:00." });
  assert.deepEqual(frase(12, 10), { destaque: "Lilian está no almoço", resto: " até 13:00. A próxima saída é a de Isabela, às 12:30." });
  assert.deepEqual(frase(12, 40), { destaque: "Lilian e Isabela estão no almoço", resto: " (Lilian até 13:00 e Isabela até 13:30). A próxima saída é a de Juliana, às 13:00." });
  assert.deepEqual(frase(14, 5), { destaque: "Todos já voltaram do almoço.", resto: "" });
  assert.deepEqual(plain(almoco.fraseDoAlmoco([])), { destaque: "", resto: "Ninguém na escala do almoço hoje." });

  const regua = plain(almoco.reguaDoAlmoco(almoco.lunchSlots));
  assert.equal(regua.inicio, 11 * 60 + 30);
  assert.equal(regua.fim, 14 * 60 + 30);
  assert.deepEqual(regua.marcas, ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30"]);
  assert.equal(almoco.posicaoNaRegua(regua, "11:30"), 0);
  assert.equal(almoco.posicaoNaRegua(regua, "14:30"), 100);
  assert.equal(almoco.posicaoNaRegua(regua, "13:00"), 50);
  assert.equal(almoco.posicaoNaRegua(regua, em(9, 0)), null, "fora da régua, o traço do agora não aparece");
});

test("Estalecas: a frase do saldo, o marco de 500 e o tom do recado", () => {
  const frases = loadTs("src/features/estalecas/carteiraFrases.ts");
  assert.deepEqual(plain(frases.fraseDaCarteira({ saldo: 1250, mes: 120, ano: 1250 })), {
    destaque: "Você tem 1.250 Estalecas para usar",
    resto: ". Neste mês entraram 120; no ano, 1.250.",
  });
  assert.equal(frases.fraseDaCarteira({ saldo: 1, mes: 0, ano: 1 }).destaque, "Você tem 1 Estaleca para usar");
  assert.equal(frases.fraseDaCarteira({ saldo: 0, mes: 0, ano: 0 }).resto, ". Faça um check-in ou envie uma conquista para começar.");
  assert.match(frases.fraseDaCarteira({ saldo: 10, mes: 10, ano: 10, pendente: 35 }).resto, /35 Estalecas esperam aprovação\.$/);
  assert.equal(frases.fraseDoMarco(497), "Você está a 497 checkpoints do marco de 500.");
  assert.equal(frases.fraseDoMarco(0), "Você alcançou 500 checkpoints. Disciplina reconhecida, recompensa desbloqueada.");
  assert.equal(frases.tomDoRecado("Código não encontrado, vencido ou inativo para hoje. Peça o código atualizado à coordenação."), "atencao");
  assert.equal(frases.tomDoRecado("Não foi possível registrar o check-in agora."), "atencao");
  assert.equal(frases.tomDoRecado("Treino registrado. Você ganhou Estalecas e avançou no ranking de disciplina."), "ok");
  assert.equal(frases.tomDoRecado("Conquista enviada! A coordenação vai revisar e aprovar."), "ok");
  assert.equal(frases.tomDoRecado("Link de academia recebido. Confirme o treino para concluir o check-in."), "neutro");
  assert.equal(frases.TOM_DA_TRANSACAO.rejected, "erro");
  assert.equal(frases.TOM_DA_CONQUISTA.APPROVED, "ok");
});
