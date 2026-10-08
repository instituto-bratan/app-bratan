// REDESENHO ETAPA 3 · COMERCIAL (08/10/2026).
//
// Kanban (e o fechamento), Cadências + Planilha, Minhas tarefas, Indicações,
// Gestão de vendas, Check-in, Marketing e a ficha do paciente ganharam a forma
// Papel & Musgo da imagem 04. A regra de ouro: o que cada tela FAZ não muda.
// Estes testes conferem as duas metades — a forma nova (um cabeçalho por tela,
// nada de vidro/degradê, letra mínima de 12 px, oliva e dourado nunca como texto)
// e as frases/seletor do Kanban, que são derivados (nada novo é gravado).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.join(repoRoot, arquivo), "utf8");
/** O código sem os comentários (a história do arquivo cita classes antigas de propósito). */
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const TELAS = {
  kanban: { arquivo: "src/features/crm/CrmKanbanPage.tsx", rubrica: /sobrancelha="Comercial"/ },
  cadencias: { arquivo: "src/features/crm/CrmCadencesPage.tsx", rubrica: /sobrancelha="Comercial"/ },
  planilha: { arquivo: "src/features/crm/CrmPlanilhaCadenciasPage.tsx", rubrica: /sobrancelha="Comercial · Cadências"/ },
  tarefas: { arquivo: "src/features/crm/CrmTasksPage.tsx", rubrica: /sobrancelha="Comercial"/ },
  indicacoes: { arquivo: "src/features/crm/CrmCanaisPage.tsx", rubrica: /sobrancelha="Comercial"/ },
  coordenador: { arquivo: "src/features/crm/CrmCoordenadorPage.tsx", rubrica: /sobrancelha="Comercial · Coordenação"/ },
  checkin: { arquivo: "src/features/crm/CrmCheckinSemanalPage.tsx", rubrica: /sobrancelha="Comercial · Coordenação"/ },
  marketing: { arquivo: "src/features/marketing/MarketingPage.tsx", rubrica: /sobrancelha="Comercial · Marketing"/ },
  ficha: { arquivo: "src/features/crm/CrmContactProfilePage.tsx", rubrica: /sobrancelha="Pacientes · Perfil 360"/ },
};

const TODOS_OS_ARQUIVOS = [
  ...fs.readdirSync(path.join(repoRoot, "src/features/crm")).filter((nome) => nome.endsWith(".tsx")).map((nome) => `src/features/crm/${nome}`),
  "src/features/marketing/MarketingPage.tsx",
];

// ---------------------------------------------------------------- a forma

test("cada tela do Comercial tem UM cabeçalho da fundação, com a rubrica de onde mora, e nenhum h1 solto", () => {
  for (const [nome, { arquivo, rubrica }] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.equal((src.match(/<Cabecalho\b/g) ?? []).length, 1, `${nome}: um Cabecalho só`);
    assert.ok(!/<h1\b/.test(src), `${nome}: o título é o do Cabecalho`);
    assert.match(src, /from "@\/components\/ui\/fundacao"/, `${nome}: usa a fundação`);
    assert.match(src, rubrica, `${nome}: a rubrica diz onde a tela mora`);
    // O número vem explicado numa frase (o Lucas rejeita número solto).
    assert.match(src, /frase=\{/, `${nome}: o cabeçalho tem a frase do número`);
  }
});

test("nada de vidro, blur, degradê, sombra pesada nem as peças antigas (Button/Card/Input do ui) nas telas do Comercial", () => {
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const src = semComentarios(ler(arquivo));
    assert.ok(!/liquid-glass|LiquidButton|backdrop-blur|bg-gradient-|shadow-(?:lg|xl|2xl|calm)\b/.test(src), `${arquivo}: sem vidro, blur, degradê ou sombra pesada`);
    assert.ok(!/from "@\/components\/ui\/(?:button|card|input|badge|label|liquid-glass-button)"/.test(src), `${arquivo}: sem as peças antigas`);
  }
  // As telas redesenhadas por inteiro aparecem prontas (sem a animação de entrada do hero antigo).
  for (const nome of ["tarefas", "indicacoes", "checkin", "marketing", "ficha", "coordenador"]) {
    assert.ok(!/from "framer-motion"/.test(semComentarios(ler(TELAS[nome].arquivo))), `${nome}: sem animação de entrada`);
  }
});

test("as cores antigas com opacidade (que hoje não geram CSS) e as paletas genéricas saíram", () => {
  const antigas =
    /\b(?:bg|text|border|ring|from|to|via)-(?:brand-(?:oliva|creme|musgo|dourado|papel|tinta|grave)|neutral-\d|slate-\d|gray-\d|zinc-\d|stone-\d|emerald-\d|green-\d|red-\d|rose-\d|amber-\d|yellow-\d|orange-\d|sky-\d|blue-\d|indigo-\d|violet-\d|purple-\d|teal-\d|lime-\d)|\bbg-white\b|\btext-black\b|text-muted-foreground|text-destructive/;
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const src = semComentarios(ler(arquivo));
    const achado = src.match(antigas);
    assert.equal(achado, null, `${arquivo}: classe antiga ${achado?.[0]}`);
  }
});

test("letra mínima de 12 px, e oliva/dourado nunca como cor de texto", () => {
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const src = semComentarios(ler(arquivo));
    assert.ok(!/text-\[(?:[0-9]|1[01])px\]/.test(src), `${arquivo}: nada abaixo de 12 px`);
    assert.ok(!/text-(?:dourado|ouro-fio)\b/.test(src), `${arquivo}: dourado não é cor de texto`);
    // text-oliva só em ícone (svg do lucide ou o invólucro de ícone).
    for (const linha of src.split("\n").filter((l) => /\btext-oliva\b/.test(l))) {
      assert.match(linha, /<[A-Z][A-Za-z0-9]*\s+className="[^"]*text-oliva|\[&>svg\]|<span className="text-oliva/, `${arquivo}: oliva só em ícone — ${linha.trim().slice(0, 90)}`);
    }
  }
});

test("blocos: o que pede decisão mora numa folha, o que é para saber mora no saber", () => {
  for (const nome of ["tarefas", "indicacoes", "checkin", "marketing", "ficha"]) {
    const src = ler(TELAS[nome].arquivo);
    assert.match(src, /<BlocoFolha\b/, `${nome}: tem uma folha (decidir)`);
    assert.match(src, /<(?:BlocoSaber|Indicadores)\b/, `${nome}: tem um bloco para saber`);
  }
  const pecas = ler("src/features/crm/comercialVisual.tsx");
  assert.match(pecas, /export function Indicadores\(/, "a faixa de números para saber é uma peça só");
  assert.match(pecas, /rounded-bloco bg-saber/, "Indicadores mora no saber (sem borda)");
  assert.match(pecas, /font-serifa[^"]*lining-nums_tabular-nums/, "o número é Fraunces com algarismos alinhados");
});

test("as abas da planilha do coordenador e da ficha são as Abas da fundação, logo abaixo do cabeçalho", () => {
  for (const nome of ["coordenador", "ficha"]) {
    const src = semComentarios(ler(TELAS[nome].arquivo));
    assert.match(src, /<Abas\b/, `${nome}: usa as Abas da fundação`);
    assert.ok(src.indexOf("<Cabecalho") < src.indexOf("<Abas"), `${nome}: as abas vêm depois do cabeçalho`);
  }
  const coordenador = ler(TELAS.coordenador.arquivo);
  for (const rotulo of ["Registro de Contatos", "Funil de Contatos", "PDCA Prescrições", "PDCA Agendamentos", "Plano de Ação"]) {
    assert.match(coordenador, new RegExp(rotulo), `a planilha continua com a aba ${rotulo}`);
  }
});

// ---------------------------------------------------------------- o que as telas fazem (não mudou)

test("Minhas tarefas: os mesmos filtros, os mesmos três passos e a mesma trava de quem só vê", () => {
  const src = ler(TELAS.tarefas.arquivo);
  for (const texto of ["Hoje", "Atrasadas", "Próximos 7 dias", "Concluídas", "Todas", "Só as minhas", "Todas do Instituto", "1 · Copiar mensagem", "2 · Enviar no WhatsApp", "3 · Registrar o que aconteceu", "Criar tarefa para amanhã", "Salvar e concluir", "Enviei ✓", "Confirmar envio ✓", "Vai ser atendida", "Já foi atendida"]) {
    assert.ok(src.includes(texto), `Minhas tarefas continua com "${texto}"`);
  }
  assert.match(src, /disabled=\{semEdicao\} onClick=\{completeSelected\}/, "salvar continua travado para quem só vê");
  assert.match(src, /<AccessGate allowed=\{canCrmBratan\} label="CRM · Minhas tarefas" module="crm">/);
});

test("Indicações: o voucher, o registro e o erro colado no botão continuam", () => {
  const src = ler(TELAS.indicacoes.arquivo);
  assert.match(src, /REFERRAL_REWARD_VALUE/);
  assert.match(src, /Voucher entregue/);
  assert.match(src, /canPay \?/, "só a coordenação marca o voucher como entregue");
  assert.match(src, /disabled=\{!telaCrm\.podeEditar\}/, "quem só vê não registra");
  assert.doesNotMatch(src, /✅/, "sem emoji no aviso");
});

test("Check-in: a semana de sexta a quinta, o prescrito digitado e o texto para copiar", () => {
  const src = ler(TELAS.checkin.arquivo);
  for (const texto of ["Semana de hoje", "Meta combinada da semana", "Adicionar quem passou e não pagou", "Recarregar das comandas", "Copiar o check-in", "Valor prescrito", "Valor pago"]) {
    assert.ok(src.includes(texto), `Check-in continua com "${texto}"`);
  }
  assert.match(src, /textoDoCheckin\(semana\)/);
  assert.match(src, /Faltam \$\{numero\(resumo\.faltou\)\}/, "a frase da semana aberta continua");
});

test("Marketing: a cor do formato virou ponto ao lado da palavra; o status da peça é uma trilha de 4 marcas", () => {
  const src = ler(TELAS.marketing.arquivo);
  assert.match(src, /function EtiquetaDoFormato/);
  assert.match(src, /<MarcasDeEtapa etapas=\{pieceStatusEtapas\[piece\.status\]\}/);
  assert.match(src, /pieceStatusOrder\[\(pieceStatusOrder\.indexOf\(piece\.status\) \+ 1\) % pieceStatusOrder\.length\]/, "tocar no status continua passando para a próxima etapa");
  assert.match(src, /Preencher com IA/);
});

// ---------------------------------------------------------------- as frases e o seletor do Kanban (derivados)

const frases = loadTs("src/features/crm/comercialFrases.ts");

test("número por extenso até vinte, no gênero certo; acima disso, o algarismo", () => {
  assert.equal(frases.porExtenso(10), "dez");
  assert.equal(frases.porExtenso(1, "f"), "uma");
  assert.equal(frases.porExtenso(2, "f"), "duas");
  assert.equal(frases.porExtenso(37), "37");
  assert.equal(frases.contagem(1, "paciente"), "um paciente");
  assert.equal(frases.contagem(5, "tarefa", "tarefas", "f"), "cinco tarefas");
  assert.equal(frases.maiuscula("dez pacientes"), "Dez pacientes");
});

test("a frase do quadro da cadência diz quantos, quanto (só para quem vê valores), os toques de hoje e o atraso", () => {
  const comValor = frases.fraseDaCadencia({ ativos: 10, hoje: 5, atrasados: 1, soma: 96191, mostrarValor: true });
  assert.equal(comValor.destaque, "Dez pacientes");
  assert.match(comValor.resto, /estão na régua, somando R\$\s96\.191\. Cinco toques são para hoje\./);
  assert.equal(comValor.alerta, " Um toque atrasou.");
  const semValor = frases.fraseDaCadencia({ ativos: 10, hoje: 5, atrasados: 0, soma: 96191, mostrarValor: false });
  assert.doesNotMatch(semValor.resto, /R\$/, "quem não vê valores não vê a soma");
  assert.equal(semValor.alerta, undefined);
  assert.equal(frases.fraseDaCadencia({ ativos: 0, hoje: 0, atrasados: 0 }).destaque, "Ninguém na régua agora.");
});

test("o seletor de quadro ordena por urgência e nunca perde os três quadros fixos", () => {
  const fixos = [
    { chave: "programa", rotulo: "Plano de Acompanhamento" },
    { chave: "comercial", rotulo: "Em aberto (antes do fechamento)" },
    { chave: "repescagem", rotulo: "Repescagens" },
  ];
  const cadencias = [
    { id: "a", rotulo: "Pós-consulta", nome: "Pós-consulta", ativos: 10, hoje: 5, atrasados: 0 },
    { id: "b", rotulo: "Concierge D+1", nome: "Concierge D+1", ativos: 3, hoje: 3, atrasados: 1 },
    { id: "c", rotulo: "Gestor · 5 ligações", nome: "Gestor", ativos: 4, hoje: 0, atrasados: 0 },
    { id: "d", rotulo: "Aniversário", nome: "Aniversário", ativos: 0, hoje: 0, atrasados: 0 },
  ];
  const secoes = plain(frases.secoesDoSeletor({ fixos, cadencias }));
  assert.deepEqual(secoes.map((s) => s.titulo), ["Quadros", "Com toque hoje", "Com gente na régua", "Sem ninguém agora"]);
  assert.deepEqual(secoes[0].opcoes.map((o) => o.chave), ["programa", "comercial", "repescagem"]);
  assert.deepEqual(secoes[1].opcoes.map((o) => o.chave), ["cadencia:a", "cadencia:b"], "mais toques pendentes primeiro");
  assert.equal(secoes[1].resumo, "9 toques");
  assert.equal(secoes[2].opcoes[0].numero, "4 ativos");
  assert.equal(secoes[3].opcoes[0].numero, "vazia");
  assert.deepEqual(plain(frases.toquesEmOutrasCadencias(cadencias, "a")), { toques: 4, cadencias: 1 });
});

test("as leituras do quadro (Todos · Para hoje · Atrasado · por setor) contam os cartões que estão na tela", () => {
  const leituras = plain(
    frases.leiturasDaCadencia([
      { venceHoje: true, atrasoDias: 0, responsavel: "Concierge" },
      { venceHoje: false, atrasoDias: 2, responsavel: "Comercial" },
      { venceHoje: true, atrasoDias: 0, responsavel: "Concierge" },
      { venceHoje: false, atrasoDias: 0, responsavel: "" },
    ]),
  );
  assert.equal(leituras.todos, 4);
  assert.equal(leituras.hoje, 2);
  assert.equal(leituras.atrasado, 1);
  assert.deepEqual(leituras.responsaveis, [
    { nome: "Concierge", total: 2 },
    { nome: "Comercial", total: 1 },
  ]);
});

test("o Kanban continua lendo e gravando o mesmo ?quadro= e abre o fechamento pelo mesmo caminho", () => {
  const src = ler(TELAS.kanban.arquivo);
  assert.match(src, /params\.get\("quadro"\)/, "o quadro aberto vem do endereço, como antes");
  assert.match(src, /busca\.set\("quadro", next\)/);
  assert.match(src, /<SeletorDeQuadro\b/, "o Trocar quadro é o seletor da imagem 04");
  assert.match(src, /function abrirFechamentoDoDeal\(dealId: string\) \{\s*if \(!telaCrm\.podeEditar\) return avisarSoVe\(\);/);
  const seletor = ler("src/features/crm/SeletorDeQuadro.tsx");
  assert.match(seletor, /Trocar quadro/);
});
