// REDESENHO ETAPA 4 · PACIENTES (08/10/2026).
//
// Pacientes (Todos), Plano de acompanhamento, NPS da Concierge e a Nutrição
// (Do dia · Pessoas · Biblioteca · Guia, a ficha da pessoa, a consulta e o
// plano alimentar) ganharam a forma Papel & Musgo. A regra de ouro: o que cada
// tela FAZ não muda. Estes testes conferem as duas metades — a forma nova (um
// cabeçalho por tela com a frase do número, nada de vidro/degradê, letra mínima
// de 12 px, oliva e dourado nunca como texto, folha para decidir e saber para
// ler) e o comportamento que não podia mexer (CPF com a permissão de Impostos &
// NFs, a trava de quem só vê, os mesmos botões e textos de regra).
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
/** O NPS monta a folha impressa do dia 5 num template de HTML: ela não é tela, sai da conta. */
const semImpressao = (src) => src.replace(/const html = `[\s\S]*?`;/g, "");

const TELAS = {
  pacientes: { arquivo: "src/features/pacientes/PacientesPage.tsx", rubrica: /sobrancelha="Pacientes · Todos"/ },
  acompanhamento: { arquivo: "src/features/programa/ProgramaAcompanhamentoPage.tsx", rubrica: /sobrancelha="Pacientes · Caminhada do paciente"/ },
  nps: { arquivo: "src/features/concierge/ConciergeNpsPage.tsx", rubrica: /sobrancelha="Pacientes · Experiência do paciente"/ },
};

const NUTRICAO_ABAS = {
  dia: "src/features/nutricao/paginas/NutricaoHojePage.tsx",
  pessoas: "src/features/nutricao/paginas/NutricaoPessoasPage.tsx",
  biblioteca: "src/features/nutricao/paginas/NutricaoBibliotecaPage.tsx",
  guia: "src/features/nutricao/paginas/NutricaoGuiaPage.tsx",
};
const NUTRICAO_DETALHES = {
  pessoa: "src/features/nutricao/paginas/NutricaoPessoaPage.tsx",
  consulta: "src/features/nutricao/paginas/NutricaoConsultaPage.tsx",
  plano: "src/features/nutricao/paginas/NutricaoPlanoPage.tsx",
};

function tsxDe(pasta) {
  const saida = [];
  const andar = (dir) => {
    for (const nome of fs.readdirSync(path.join(repoRoot, dir))) {
      const rel = `${dir}/${nome}`;
      if (fs.statSync(path.join(repoRoot, rel)).isDirectory()) andar(rel);
      else if (rel.endsWith(".tsx")) saida.push(rel);
    }
  };
  andar(pasta);
  return saida;
}

const TODOS_OS_ARQUIVOS = [
  ...tsxDe("src/features/pacientes"),
  ...tsxDe("src/features/programa"),
  ...tsxDe("src/features/concierge"),
  ...tsxDe("src/features/nutricao"),
];

// ---------------------------------------------------------------- a forma

test("Pacientes, Acompanhamento e NPS têm UM cabeçalho da fundação, com a rubrica do grupo, a frase do número e nenhum h1 solto", () => {
  for (const [nome, { arquivo, rubrica }] of Object.entries(TELAS)) {
    const src = semImpressao(semComentarios(ler(arquivo)));
    assert.equal((src.match(/<Cabecalho\b/g) ?? []).length, 1, `${nome}: um Cabecalho só`);
    assert.ok(!/<h1\b/.test(src), `${nome}: o título é o do Cabecalho`);
    assert.match(src, /from "@\/components\/ui\/fundacao"/, `${nome}: usa a fundação`);
    assert.match(src, rubrica, `${nome}: a rubrica diz onde a tela mora`);
    assert.match(src, /frase=\{/, `${nome}: o cabeçalho tem a frase do número`);
    assert.match(src, /className="alerta"/, `${nome}: o que pede atenção vai em laranja dentro da frase`);
  }
});

test("Nutrição: todas as telas usam o cabeçalho da fundação (inclusive a consulta e o plano), e as quatro abas têm a mesma largura", () => {
  const basicos = ler("src/features/nutricao/ui/basicos.tsx");
  assert.match(basicos, /import \{ Abas as AbasDaFundacao, Cabecalho \} from "@\/components\/ui\/fundacao"/);
  assert.match(basicos, /<Cabecalho\s/, "CabecalhoDaPagina é o Cabecalho da fundação");
  for (const [nome, arquivo] of Object.entries({ ...NUTRICAO_ABAS, ...NUTRICAO_DETALHES })) {
    const src = semComentarios(ler(arquivo));
    assert.equal((src.match(/<CabecalhoDaPagina\b/g) ?? []).length, 1, `${nome}: um cabeçalho só`);
    assert.ok(!/<h1\b/.test(src), `${nome}: sem h1 solto`);
  }
  for (const [nome, arquivo] of Object.entries(NUTRICAO_ABAS)) {
    const src = semComentarios(ler(arquivo));
    assert.match(src, /sobretitulo="Pacientes · Nutrição"/, `${nome}: a mesma rubrica nas quatro abas`);
    // O módulo sem largura própria: o cabeçalho e as abas não pulam ao trocar de aba.
    assert.ok(!/<Modulo className="[^"]*max-w-/.test(src), `${nome}: o módulo tem a largura padrão`);
  }
});

test("nada de vidro, blur, degradê, sombra pesada, animação de entrada nem as peças antigas (Button/Card/Input do ui)", () => {
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const src = semComentarios(ler(arquivo));
    assert.ok(!/liquid-glass|LiquidButton|backdrop-blur|bg-gradient-|shadow-(?:lg|xl|2xl|calm|ios)\b/.test(src), `${arquivo}: sem vidro, blur, degradê ou sombra pesada`);
    assert.ok(!/from "@\/components\/ui\/(?:button|card|input|badge|label|liquid-glass-button)"/.test(src), `${arquivo}: sem as peças antigas`);
    assert.ok(!/from "framer-motion"/.test(src), `${arquivo}: sem animação de entrada`);
  }
});

test("as cores antigas com opacidade (que hoje não geram CSS) e as paletas genéricas saíram", () => {
  const antigas =
    /\b(?:bg|text|border|ring|from|to|via)-(?:brand-(?:oliva|creme|musgo|dourado|papel|tinta|grave)|neutral-\d|slate-\d|gray-\d|zinc-\d|stone-\d|emerald-\d|green-\d|red-\d|rose-\d|amber-\d|yellow-\d|orange-\d|sky-\d|blue-\d|indigo-\d|violet-\d|purple-\d|teal-\d|lime-\d)|\bbg-white\b|\btext-black\b|text-muted-foreground|text-destructive/;
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const achado = semComentarios(ler(arquivo)).match(antigas);
    assert.equal(achado, null, `${arquivo}: classe antiga ${achado?.[0]}`);
  }
  // Opacidade fora da escala do Tailwind (/12, /14…) não gera CSS: o fundo sumia calado.
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const achado = semComentarios(ler(arquivo)).match(/\b(?:bg|text|border)-[a-z-]+\/(?:12|14|16|18|22)\b/);
    assert.equal(achado, null, `${arquivo}: opacidade que não gera CSS ${achado?.[0]}`);
  }
});

test("letra mínima de 12 px, e oliva/dourado nunca como cor de texto", () => {
  for (const arquivo of TODOS_OS_ARQUIVOS) {
    const src = semComentarios(ler(arquivo));
    assert.ok(!/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/.test(src), `${arquivo}: nada abaixo de 12 px`);
    assert.ok(!/text-(?:dourado|ouro-fio)\b/.test(src), `${arquivo}: dourado não é cor de texto`);
    for (const linha of src.split("\n").filter((l) => /\btext-oliva\b/.test(l))) {
      assert.match(linha, /<[A-Z][A-Za-z0-9]*\s+className="[^"]*text-oliva/, `${arquivo}: oliva só em ícone — ${linha.trim().slice(0, 90)}`);
    }
  }
  const css = ler("src/features/nutricao/nutricao.css");
  for (const [, px] of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(px) >= 12, `nutricao.css: font-size ${px}px`);
  assert.ok(!/monospace|backdrop-filter|linear-gradient/.test(css), "a Nutrição sem monoespaçada, vidro ou degradê");
});

test("blocos: o que pede decisão mora numa folha, o que é para saber mora no saber", () => {
  for (const nome of ["acompanhamento", "nps"]) {
    const src = ler(TELAS[nome].arquivo);
    assert.match(src, /<BlocoFolha\b/, `${nome}: tem uma folha (decidir)`);
    assert.match(src, /<(?:BlocoSaber|Indicadores)\b/, `${nome}: tem um bloco para saber`);
  }
  assert.match(ler(TELAS.pacientes.arquivo), /<BlocoFolha\b/, "a lista de pacientes mora numa folha");
  // Os filtros viram leituras com a contagem de cada tipo/canal.
  assert.match(ler(TELAS.pacientes.arquivo), /<Leitura\b[^>]*numero=/);
  assert.match(ler(TELAS.acompanhamento.arquivo), /<Leitura\b[^>]*numero=\{porCanal\[opcao\]\}/);
  // Cartão da Nutrição: folha com fio (decidir) ou saber (ler), sem sombra.
  const basicos = ler("src/features/nutricao/ui/basicos.tsx");
  assert.match(basicos, /tom === "saber" \? "bg-saber" : "border border-fio bg-folha"/);
});

// ---------------------------------------------------------------- o que as telas fazem (não mudou)

test("Pacientes: a mesma busca, os mesmos filtros e o CPF com a permissão de Impostos & NFs (mascarado no cartão)", () => {
  const src = ler(TELAS.pacientes.arquivo);
  assert.match(src, /<AccessGate allowed=\{canCrmBratan\} label="Pacientes" module="pacientes">/);
  assert.match(src, /const veCpf = canSeeModule\(pessoa, "fin-impostos"\);/);
  assert.match(src, /const editaCpf = canEditModule\(pessoa, "fin-impostos"\);/);
  assert.match(src, /enabled: usaRemoto && veCpf/, "quem não vê o CPF nem pergunta ao banco quem tem");
  assert.match(src, /\{veCpf \? \(/, "a coluna do CPF só aparece para quem vê");
  assert.match(src, /\{aberto && editaCpf \? \(/, "o cartão do CPF só abre para quem edita");
  assert.match(src, /<CpfDoPacienteCard contactRef=\{p\.id\} pessoaId=\{pessoaId\} ativo \/>/);
  assert.match(src, /to=\{`\/crm\/contatos\/\$\{p\.id\}`\}/, "a linha abre a ficha completa");
  assert.match(src, /buscar\(lista, termo, filtro\)/);
  for (const texto of ["Pacientes", "Ex-pacientes", "Leads", "Todos", "Nome, telefone ou e-mail", "Colocar CPF", "guardado", "sem CPF"]) {
    assert.ok(src.includes(texto), `Pacientes continua com "${texto}"`);
  }
  // O número do CPF nunca vem na lista: só "tem" ou "não tem".
  assert.ok(!/cpfFormatado|cpfMascarado/.test(src));
  const cartao = ler("src/features/crm/CpfDoPacienteCard.tsx");
  assert.match(cartao, /cpfMascarado/, "o cartão continua mostrando o CPF mascarado");
});

test("Acompanhamento: a mesma trava de quem só vê, os mesmos botões, filtros, marcos e o resgate", () => {
  const src = ler(TELAS.acompanhamento.arquivo);
  assert.match(src, /useNivelDaTela\("acompanhamento"\)/);
  assert.match(src, /useCrmState\(\{ modulo: "acompanhamento" \}\)/);
  assert.match(src, /function toggle\(dealId: string, key: string\) \{\s*if \(semEdicao\) return avisarSoVe\(\);/);
  assert.match(src, /disabled=\{semEdicao\}/, "quem só vê não adiciona paciente ao plano");
  assert.match(src, /\{enrollOpen && !semEdicao \? \(/);
  assert.match(src, /onResgate=\{semEdicao \? undefined :/, "quem só vê não cria resgate");
  assert.match(src, /\{podeGravarMedicoes \? \(\s*<ImportarInBodyCard/, "a InBody segue a regra própria do dado clínico");
  assert.match(src, /\{podeVerMedicoes \? \(/);
  for (const texto of [
    "Relatório p/ Performance",
    "Adicionar paciente ao plano",
    "Adicionar ao plano",
    "Copiar quem falta",
    "Todas as fases",
    "Sem canal",
    "Não fecharam",
    "Caminhada completa",
    "só tratamento",
    "Criar tarefa de resgate (ligar hoje)",
    "Conferência:",
    "Por que importa:",
    "O que fazer:",
  ]) {
    assert.ok(src.includes(texto), `Acompanhamento continua com "${texto}"`);
  }
  assert.match(src, /exportBrandedPdf\(\{/, "o relatório continua sendo o PDF da marca");
  assert.match(src, /criarTarefaDeResgatePorRisco\(current, c\.dealId, c\.risco\.motivos/);
  assert.match(src, /enrollPatientInProgram\(current, input\)/);
});

test("NPS: a mesma fila, os mesmos registros, a mesma impressão do dia 5 e a mesma permissão", () => {
  const src = ler(TELAS.nps.arquivo);
  assert.match(src, /const podeEditar = canEditModule\(pessoa, "concierge-nps"\);/);
  assert.match(src, /<AccessGate allowed=\{\(c\) => canSeeModule\(\{ cargo: c \}, "concierge-nps"\)\} label="NPS da Concierge" module="concierge-nps">/);
  assert.match(src, /filaDeContatos\(crmState\.contacts, financeiro\.sales, contatos, hoje\)/);
  for (const texto of ["Para contatar", "Foi bem", "Reclamou", "Registrar reclamação", "Resolvido ✓", "Imprimir (dia 5)", "Salvar mês", "Registrar alguém fora da lista", "Fechar o mês para a reunião do dia 5", "PDCA — experiência do paciente"]) {
    assert.ok(src.includes(texto), `NPS continua com "${texto}"`);
  }
  assert.match(src, /<script>window\.print\(\)<\/script>/, "a folha do dia 5 continua imprimindo sozinha");
  assert.match(src, /\{pendencias\.length && podeEditar \? \(/, "a resolução só aparece para quem edita");
  assert.doesNotMatch(semImpressao(src), /[😊👏💚🎉]/u, "sem emoji na tela");
});

test("Nutrição: o prontuário e os planos continuam com as mesmas ações", () => {
  const consulta = ler(NUTRICAO_DETALHES.consulta);
  for (const texto of ["Finalizar checkpoint", "Retificar", "Salvar retificação", "Montar o plano", "Trazer o anterior para conferir", "Recarregar a versão gravada"]) {
    assert.ok(consulta.includes(texto), `a consulta continua com "${texto}"`);
  }
  const plano = ler(NUTRICAO_DETALHES.plano);
  for (const texto of ["Revisar e finalizar", "Nova versão a partir desta", "Gerar PDF", "Anexei no iClinic", "Copiar mensagem de entrega"]) {
    assert.ok(plano.includes(texto), `o plano continua com "${texto}"`);
  }
  // A porta da Nutrição é o controle de Acessos (módulo "nutricao") e a edição segue o nível dele.
  assert.match(ler("src/App.tsx"), /<AccessGate allowed=\{\(\) => false\} module="nutricao" label="Nutrição">/);
  for (const arquivo of [NUTRICAO_DETALHES.consulta, NUTRICAO_DETALHES.plano, NUTRICAO_DETALHES.pessoa, NUTRICAO_ABAS.biblioteca]) {
    assert.match(ler(arquivo), /canEditModule\(usuario, "nutricao"\)/, `${arquivo}: edição pelo nível de Acessos`);
  }
});

// ---------------------------------------------------------------- as frases (derivadas, nada novo é gravado)

const frases = loadTs("src/features/pacientes/frasesPacientes.ts");

test("frase de Pacientes: contatos, pacientes e — só para quem vê o CPF — quantos ainda estão sem ele", () => {
  assert.deepEqual(plain(frases.fraseDaListaDePacientes({ contatos: 7, pacientes: 4, comCpf: 2, pacientesSemCpf: 3, sabeCpf: true })), {
    destaque: "Sete contatos",
    resto: ", quatro pacientes. Dois contatos com CPF guardado.",
    alerta: " Três pacientes ainda sem CPF — sem ele a nota não sai.",
  });
  const semCpf = plain(frases.fraseDaListaDePacientes({ contatos: 7, pacientes: 4, comCpf: 2, pacientesSemCpf: 3, sabeCpf: false }));
  assert.equal(semCpf.resto, ", quatro pacientes.", "quem não vê o CPF não fica sabendo quantos têm");
  assert.equal(semCpf.alerta, undefined);
  assert.equal(frases.fraseDaListaDePacientes({ contatos: 312, pacientes: 84, comCpf: 15, pacientesSemCpf: 0, sabeCpf: true }).destaque, "312 contatos");
  assert.equal(frases.fraseDaListaDePacientes({ contatos: 0, pacientes: 0, comCpf: 0, pacientesSemCpf: 0, sabeCpf: true, semConta: true }).destaque, "Nenhum contato carregado.");
  assert.equal(frases.fraseDaListaDePacientes({ contatos: 0, pacientes: 0, comCpf: 0, pacientesSemCpf: 0, sabeCpf: true, carregando: true }).destaque, "Carregando a lista…");
});

test("frase do Acompanhamento: quantos no plano, quantos em dia, e atraso/semáforo vermelho no alerta", () => {
  assert.deepEqual(plain(frases.fraseDoAcompanhamento({ pacientes: 7, emDia: 4, atrasados: 3, vermelhos: 0 })), {
    destaque: "Sete pacientes",
    resto: " no plano de acompanhamento, quatro em dia.",
    alerta: " Três pacientes com marco atrasado.",
  });
  assert.equal(frases.fraseDoAcompanhamento({ pacientes: 2, emDia: 2, atrasados: 0, vermelhos: 1 }).resto, " no plano de acompanhamento, todos em dia.");
  assert.equal(frases.fraseDoAcompanhamento({ pacientes: 2, emDia: 2, atrasados: 0, vermelhos: 1 }).alerta, " Um paciente no semáforo vermelho.");
  assert.equal(frases.fraseDoAcompanhamento({ pacientes: 1, emDia: 1, atrasados: 0, vermelhos: 0 }).resto, " no plano de acompanhamento, em dia.");
  assert.equal(frases.fraseDoAcompanhamento({ pacientes: 0, emDia: 0, atrasados: 0, vermelhos: 0 }).destaque, "Ninguém no plano ainda.");
});

test("frase do NPS: a fila e as reclamações que esperam a resolução", () => {
  assert.deepEqual(plain(frases.fraseDoNps({ fila: 4, pendencias: 1 })), {
    destaque: "Quatro pessoas para contatar",
    resto: ": passaram na clínica e ainda não receberam o contato.",
    alerta: " Uma reclamação espera a resolução.",
  });
  assert.equal(frases.fraseDoNps({ fila: 1, pendencias: 0 }).resto, ": passou na clínica e ainda não recebeu o contato.");
  assert.equal(frases.fraseDoNps({ fila: 0, pendencias: 2 }).destaque, "Fila em dia:");
  assert.equal(frases.fraseDoNps({ fila: 0, pendencias: 2 }).alerta, " Duas reclamações esperam a resolução.");
  assert.equal(frases.percentualBR(92.5), "92,5%");
  assert.equal(frases.percentualBR(null), "—");
});

test("frases da Nutrição: o dia, as pessoas e a biblioteca", () => {
  const nutri = loadTs("src/features/nutricao/dominio/frases.ts");
  assert.deepEqual(plain(nutri.fraseDoDia({ consultas: 4, planosAEntregar: 2, atrasados: 1 })), {
    destaque: "4 consultas hoje",
    resto: "e 2 planos para entregar.",
    alerta: "Um passou do prazo.",
  });
  assert.equal(nutri.fraseDasPessoas({ pessoas: 6, comPlanoVigente: 1 }).resto, "com registro neste computador, 1 com plano vigente.");
  assert.deepEqual(plain(nutri.fraseDaBiblioteca({ listas: 2, alimentos: 597, medidas: 0 })), {
    destaque: "2 listas prontas",
    resto: "para entrar nos planos, 597 alimentos da TACO e nenhuma medida caseira registrada ainda.",
    alerta: null,
  });
  assert.match(nutri.fraseDaBiblioteca({ listas: 1, alimentos: 1, medidas: 1 }).resto, /1 alimento da TACO e 1 medida caseira registrada\.$/);
});
