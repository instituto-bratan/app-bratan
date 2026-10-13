// REDESENHO ETAPA 4 · AJUSTES (08/10/2026).
//
// Colaboradores, Perfil do colaborador, Acessos, Configurações do negócio,
// Integrações, Segurança, Auditoria, O que a IA fez, Cofre de compliance,
// Portal do paciente (a voz do doutor) e Gestão de Estalecas ganharam a forma
// Papel & Musgo. A regra de ouro é que o que cada tela FAZ não muda: estes
// testes conferem as duas metades — a forma nova (um cabeçalho, blocos da
// fundação, nada de vidro, letra mínima de 12 px, oliva e dourado nunca como
// texto) e as regras que continuam (as portas de cada tela, Acessos intacto,
// as travas dos formulários e a ordem das decisões).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.join(repoRoot, arquivo), "utf8");

const TELAS = {
  colaboradores: "src/features/admin/ColaboradoresPage.tsx",
  perfil: "src/features/admin/ColaboradorPerfilPage.tsx",
  acessos: "src/features/admin/AcessosPage.tsx",
  configuracoes: "src/features/admin/ConfiguracoesNegocioPage.tsx",
  integracoes: "src/features/admin/IntegracoesPage.tsx",
  seguranca: "src/features/admin/SegurancaPage.tsx",
  auditoria: "src/features/admin/AuditoriaPage.tsx",
  ia: "src/features/admin/GovernancaIaPage.tsx",
  compliance: "src/features/admin/ComplianceCofrePage.tsx",
  portal: "src/features/admin/VozDoDoutorPage.tsx",
  estalecas: "src/features/admin/EstalecasAdminPage.tsx",
};
const PECAS = "src/features/admin/pecasAjustes.tsx";
const FRASES = "src/features/admin/frasesAjustes.ts";
const TUDO = { ...TELAS, pecas: PECAS };

/** O código sem os comentários (a história do arquivo cita classes antigas de propósito). */
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------- a forma

test("cada tela de Ajustes tem UM cabeçalho (Cabecalho da fundação) com a rubrica 'Ajustes', e nenhum h1 solto", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    const src = semComentarios(ler(arquivo));
    assert.equal((src.match(/<Cabecalho\b/g) ?? []).length, 1, `${nome}: um Cabecalho só`);
    assert.doesNotMatch(src, /<h1\b/, `${nome}: o título é o do Cabecalho`);
    assert.match(src, /from "@\/components\/ui\/fundacao"/, `${nome}: usa a fundação`);
    assert.match(src, /sobrancelha=(\{[^}]*)?"Ajustes/, `${nome}: a rubrica diz que a tela mora em Ajustes`);
    assert.match(src, /className="mx-auto grid w-full max-w-\[1200px\]/, `${nome}: a mesma largura das telas redesenhadas`);
  }
});

test("o número vem explicado numa frase no cabeçalho (o Lucas rejeita número solto)", () => {
  for (const nome of ["colaboradores", "acessos", "configuracoes", "integracoes", "seguranca", "auditoria", "ia", "compliance", "portal", "estalecas"]) {
    assert.match(ler(TELAS[nome]), /frase=\{fraseDoTopo\}/, `${nome}: o cabeçalho tem a frase do número`);
  }
});

test("blocos da fundação: decidir em FOLHA e saber em SABER", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    assert.match(ler(arquivo), /<BlocoFolha\b/, `${nome}: o que pede decisão mora numa folha`);
  }
  for (const nome of ["perfil", "seguranca", "auditoria", "ia", "compliance", "estalecas"]) {
    assert.match(ler(TELAS[nome]), /<BlocoSaber\b/, `${nome}: o que é só para saber mora no saber`);
  }
});

test("nada de vidro, blur, animação por tela, Card/Badge/Input antigos, branco chapado ou cor fora dos tokens", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /LiquidButton|MetalButton|liquid-glass/, `${nome}: sem botão de vidro`);
    assert.doesNotMatch(src, /\bbackdrop-blur\b|\bbackdrop-blur-(sm|md|lg|xl)\b/, `${nome}: sem blur`);
    assert.doesNotMatch(src, /from "framer-motion"/, `${nome}: sem animação de entrada por tela (a casca já anima)`);
    assert.doesNotMatch(src, /from "@\/components\/ui\/(card|badge|input|label|button)"/, `${nome}: sem Card/Badge/Input/Label/Button antigos`);
    assert.doesNotMatch(src, /\bbrand-(oliva|creme|dourado|musgo|papel|tinta)\b/, `${nome}: sem os nomes antigos da paleta`);
    assert.doesNotMatch(src, /\bbg-white\b|\bshadow-calm\b|\bshadow-ios\b|text-muted-foreground|text-destructive|bg-destructive/, `${nome}: sem branco chapado, sombra pesada ou cor do shadcn`);
    assert.doesNotMatch(src, /\b(text|bg|border)-(emerald|amber|red|rose|slate|sky|neutral)-\d/, `${nome}: cores de situação só pelos tokens`);
    assert.doesNotMatch(src, /\bsection\b[^>]*className="[^"]*\brounded-lg\b[^"]*\bborder\b/, `${nome}: nada de section.rounded-lg.border (vira vidro no celular)`);
  }
});

test("letra mínima de 12 px, e oliva e dourado nunca como cor de texto (o ícone usa stroke-oliva)", () => {
  for (const [nome, arquivo] of Object.entries(TUDO)) {
    const src = semComentarios(ler(arquivo));
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, `${nome}: nada abaixo de 12 px`);
    assert.doesNotMatch(src, /\btext-(oliva|dourado)\b/, `${nome}: oliva/dourado não viram texto (contraste AA)`);
  }
});

test("números em tabular-nums; o número grande em Fraunces também", () => {
  for (const nome of ["configuracoes", "seguranca", "auditoria", "ia", "compliance", "estalecas"]) {
    assert.match(ler(TELAS[nome]), /tabular-nums|<NumeroComFrase\b/, `${nome}: valores tabulares`);
  }
  // As contagens das leituras (Ativos 10 · Desligados 2) saem tabulares da própria peça.
  assert.match(ler(PECAS), /export function Leitura[\s\S]*?tabular-nums/);
  assert.match(ler(PECAS), /font-serifa[^"]*lining-nums_tabular-nums/, "o número principal é Fraunces tabular");
});

test("peças de Ajustes: campos com foco visível e borda de campo (3:1); etiqueta e recado sempre com palavra", () => {
  const src = ler(PECAS);
  for (const nome of ["CAMPO", "CAMPO_PQ", "CAMPO_AREA"]) {
    const def = new RegExp(`export const ${nome} =([\\s\\S]*?);\\n`).exec(src)?.[1] ?? "";
    assert.match(def, /focus:outline-foco/, `${nome}: foco visível`);
    assert.match(def, /border-borda-campo/, `${nome}: borda de campo`);
  }
  assert.match(src, /export function Segmentado[\s\S]*?aria-pressed=\{escolhida\}/, "o segmentado diz qual está escolhido");
  assert.match(src, /export function Leitura[\s\S]*?aria-pressed=\{ativa\}/, "a leitura diz qual está marcada");
});

// ---------------------------------------------------------------- as regras que continuam

test("as portas de cada tela são as mesmas de antes", () => {
  const portas = {
    colaboradores: "allowed={canAdministracao}",
    perfil: "allowed={canAdministracao}",
    acessos: "allowed={canManageAcessos}",
    configuracoes: "allowed={canManageAcessos}",
    integracoes: "allowed={(cargo) => isCoordenacao(cargo)}",
    seguranca: "allowed={canAdministracao}",
    auditoria: "allowed={canAdministracao}",
    ia: "allowed={(cargo) => canAdministracao(cargo) || canFinanceiroFull(cargo)}",
    compliance: "allowed={(cargo) => isCoordenacao(cargo)}",
    portal: "allowed={(cargo) => isCoordenacao(cargo)}",
    estalecas: "allowed={canAdministracao}",
  };
  for (const [nome, porta] of Object.entries(portas)) {
    const src = ler(TELAS[nome]);
    assert.ok(src.includes(`<AccessGate ${porta}`), `${nome}: a porta é ${porta}`);
    assert.equal((src.match(/<AccessGate\b/g) ?? []).length, 1, `${nome}: uma porta só, em volta da tela toda`);
  }
});

test("Acessos: só Lucas, Dr. Daniel e CEO; as exceções por tela e o que se grava continuam iguais", () => {
  const src = ler(TELAS.acessos);
  assert.match(src, /const levelOptions: \(AccessLevel \| "PADRAO"\)\[\] = \["PADRAO", "OCULTO", "VER", "EDITAR"\];/);
  assert.match(src, /mutationFn: \(\) => saveRemoteColaboradorAcessos\(pessoa\.id, draft, editorId\)/, "grava o rascunho da pessoa");
  assert.match(src, /if \(level === "PADRAO"\) delete next\[module\];\s*else next\[module\] = level;/, "Padrão apaga a exceção (volta ao cargo)");
  assert.match(src, /const padrao = cargoDefaultLevelFor\(pessoa\.cargo, module\);/, "o padrão vem do cargo");
  assert.match(src, /\{moduleKeys\.map\(\(module\) => \{/, "uma linha por tela do controle de acessos");
  assert.match(src, /\.filter\(\(item\) => item\.ativo\)/, "só quem está ativo");
  assert.match(src, /disabled=\{!dirty\}/, "salvar só com mudança");
  assert.match(src, /Voltar tudo ao padrão do cargo/);
  assert.match(src, /aria-pressed=\{selected === level\}/, "o nível escolhido é anunciado");
  assert.match(src, /void queryClient\.invalidateQueries\(\{ queryKey: \["admin-colaboradores-acessos"\] \}\)/);
});

test("Colaboradores: as travas do cadastro, do login e do desligar continuam", () => {
  const src = ler(TELAS.colaboradores);
  assert.match(src, /if \(password\.length < 12\) \{\s*setAccessError\("Use uma senha inicial com pelo menos 12 caracteres\."\);/);
  assert.match(src, /if \(!form\.id && createAccessNow && initialPassword\.trim\(\)\.length < 12\) \{/);
  assert.match(src, /Este e-mail já está cadastrado\. Edite ou reative o colaborador existente\./);
  assert.match(src, /Você não pode desligar o próprio acesso\./);
  assert.match(src, /disabled=\{deactivateMutation\.isPending \|\| colaborador\.id === pessoa\?\.id\}/, "não desliga a si mesmo");
  assert.match(src, /\{useRemote && colaborador\.ativo && !colaborador\.auth_id \? \(/, "Criar acesso só para ativo sem login, com banco");
  assert.match(src, /confirmar\(`Desligar \$\{colaborador\.nome\}\?`/, "desligar pede confirmação");
  assert.match(src, /to=\{`\/administracao\/colaboradores\/\$\{colaborador\.id\}`\}/, "o perfil continua na mesma URL");
});

test("Configurações do negócio: altera só quem gerencia acessos, com banco, a partir de uma data", () => {
  const src = ler(TELAS.configuracoes);
  assert.match(src, /const podeEditar = canManageAcessos\(pessoa\?\.cargo\);/);
  assert.match(src, /podeEditar=\{podeEditar && remoto\}/);
  assert.match(src, /Alterar a partir de uma data/);
  assert.match(src, /Informe a data a partir da qual o valor vale\./);
  assert.match(src, /salvar\.mutateAsync\(\{ chave: d\.chave, valor, vigenteDe, observacao \}\)/);
});

test("Integrações: ligar exige os segredos e confirmação; testar só ligada; edita só quem gerencia acessos", () => {
  const src = ler(TELAS.integracoes);
  assert.match(src, /const podeEditar = canManageAcessos\(pessoa\?\.cargo\);/);
  assert.match(src, /if \(segredos && !segredos\.prontos\) \{/);
  assert.match(src, /await confirmar\(`Ligar "\$\{item\.nome\}"\?`/);
  assert.match(src, /\{teste && item\.ligada && podeEditar \? \(/);
  assert.match(src, /\{podeEditar && !semFuncao \? \(/, "integração sem função (aguarda contrato) não tem botão de ligar");
  assert.match(src, /Ordem sugerida: avisos no celular/);
});

test("O que a IA fez: as três revisões, com o 'Estava errado' na ponta, longe do aceitar", () => {
  const src = ler(TELAS.ia);
  const aceito = src.indexOf('decisao: "ACEITO"');
  const ajustado = src.indexOf('decisao: "AJUSTADO"');
  const recusado = src.indexOf('decisao: "RECUSADO"', src.indexOf("Ajustei antes de usar"));
  assert.ok(aceito > 0 && ajustado > aceito && recusado > ajustado, "Aceitei → Ajustei → Estava errado");
  assert.match(src, /variante="perigo"[\s\S]{0,300}?Estava errado/);
  assert.match(src, /\{e\.permissao === "PROPOSTA" && !e\.decisao \? \(/, "só a proposta sem revisão pede decisão");
  assert.match(src, /export const INVENTARIO_IA = \[/);
  assert.match(src, /export const REGIME_DE_DADOS = \[/);
});

test("Cofre de compliance: o relógio de 3 dias úteis, o imprimir e quem edita continuam", () => {
  const src = ler(TELAS.compliance);
  assert.match(src, /prazoEm: diasUteisDepois\(agora, 3\)/);
  assert.match(src, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(src, /const podeEditar = isCoordenacao\(pessoa\?\.cargo\);/);
  assert.match(src, /\{podeEditar \? \(\s*<Botao variante="perigo"[\s\S]{0,300}?Registrar incidente/);
  assert.match(src, /to="\/administracao\/ia"/, "o inventário de IA continua a um clique");
  assert.match(src, /export const TIPOS_CONSENTIMENTO/);
});

test("Portal do paciente: gravar, enviar, colocar no ar, tirar do ar e voltar com uma gravação antiga", () => {
  const src = ler(TELAS.portal);
  assert.match(src, /if \(s >= AUDIO_MAX_SEGUNDOS\) pararGravacao\(\);/, "o limite de áudio continua");
  for (const rotulo of ["Gravar agora", "Enviar arquivo", "Colocar no ar", "Gravar de novo", "Tirar do ar", "Voltar com esta"]) {
    assert.ok(src.includes(rotulo), `o botão "${rotulo}" continua`);
  }
  assert.match(src, /validarAudio\(mime, audio\.size, segundos\)/);
});

test("Gestão de Estalecas: travas, motivo obrigatório e a ordem Aprovar (com o valor) → Recusar", () => {
  const src = ler(TELAS.estalecas);
  assert.match(src, /if \(!reason \|\| reason\.length < 6\) \{\s*setError\("Informe um motivo antes de alterar o status da transação\."\);/);
  assert.match(src, /Este lançamento deixaria o saldo negativo\./);
  assert.match(src, /Apenas transações aprovadas e positivas podem ser estornadas\./);
  assert.match(src, /disabled=\{reviewMutation\.isPending \|\| !nota\.trim\(\)\}/, "recusar conquista só com a observação");
  assert.match(src, /disabled=\{Boolean\(monthlyWinner\) \|\| monthlyWinnerMutation\.isPending\}/, "um vencedor por mês");
  for (const bloco of [/<BotaoDecisao tipo="aprovar"[^>]*valor=\{`\$\{valor\} Estalecas`\}[\s\S]*?<BotaoDecisao tipo="recusar"/, /<BotaoDecisao tipo="aprovar"[^>]*valor=\{`\$\{formatEstalecas\(transaction\.amount\)\} Estalecas`\}[\s\S]*?<BotaoDecisao tipo="recusar"/]) {
    assert.match(src, bloco, "Aprovar com o valor no rótulo, depois Recusar");
  }
  assert.match(src, /onEscolher=\{\(status\) => updateRewardStatus\(reward, status\)\}/, "a situação do prêmio muda pelo mesmo caminho");
  assert.doesNotMatch(semComentarios(src), /[✓✗]/, "sem símbolo solto no lugar de ícone");
});

test("Segurança: e-mail próprio continua INFORMAÇÃO e a lista de revisar é só de quem está sem login", () => {
  const src = ler(TELAS.seguranca);
  assert.match(src, /const etiqueta = etiquetaDoSinal\(signal\.level\);/, "a palavra e o tom vêm do nível do sinal");
  assert.match(src, /\{semLogin\.slice\(0, 8\)\.map/);
});

// ---------------------------------------------------------------- as frases (funções puras)

function carregarFrases() {
  const arquivo = path.join(repoRoot, FRASES);
  const saida = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: arquivo,
  }).outputText;
  const modulo = { exports: {} };
  vm.runInNewContext(saida, { module: modulo, exports: modulo.exports, Number, String, Object, Array }, { filename: arquivo });
  return modulo.exports;
}

test("frases: plural, por extenso, exceções, sinal de segurança, pendências do cofre e datas", () => {
  const f = carregarFrases();
  assert.equal(f.contagem(1, "pessoa ativa", "pessoas ativas"), "1 pessoa ativa");
  assert.equal(f.contagem(10, "pessoa ativa", "pessoas ativas"), "10 pessoas ativas");
  assert.equal(f.contagem(3, "regra"), "3 regras");
  assert.equal(f.porExtenso(2), "Duas");
  assert.equal(f.porExtenso(1, "m"), "Um");
  assert.equal(f.porExtenso(12), "12");
  assert.equal(f.maiuscula("ajustes"), "Ajustes");
  assert.equal(f.pessoasComExcecao([{ acessos: { "fin-contas": "VER" } }, { acessos: {} }, { acessos: null }, {}]), 1);
  assert.equal(f.textoDasExcecoes(0), "padrão do cargo");
  assert.equal(f.textoDasExcecoes(1), "1 exceção");
  assert.equal(f.textoDasExcecoes(3), "3 exceções");
  assert.deepEqual({ ...f.etiquetaDoSinal("ok") }, { palavra: "ok", tom: "ok" });
  assert.deepEqual({ ...f.etiquetaDoSinal("attention") }, { palavra: "atenção", tom: "atencao" });
  assert.deepEqual({ ...f.etiquetaDoSinal("critical") }, { palavra: "atenção", tom: "erro" });
  assert.equal(f.pendentesDoCofre([true, null, false, false]), 2);
  assert.equal(f.diaCurto("2026-10-08T12:00:00Z"), "08/10");
  assert.equal(f.diaCompleto("2026-10-08"), "08/10/2026");
  assert.equal(f.diaCompleto(null), "—");
  assert.equal(f.nomeParaInicial("[CEO]"), "CEO");
  assert.equal(f.nomeParaInicial("Lucas Daniel"), "Lucas Daniel");
});
