// CPF NA NOTA, NUMA TELA SÓ (07/10/2026). Pedido do Lucas: "colocar/editar o
// CPF direto no Lote de notas conferido (Impostos & NFs) e emitir numa tela
// só, sem ir na aba Pacientes. E em Lançar Dia também: colocar o CPF e já
// emitir de lá."
//
// O que estes testes trancam:
//  · a TRAVA de nome diferente: nota no nome de X com a comanda ligada à ficha
//    de Y → o CPF não vai para a ficha; quem emite manda só nesta nota;
//  · só quem podeEmitirNota recebe uma ação que emite; quem não grava CPF não
//    vê o campo de guardar;
//  · o lote e o Lançar Dia usam o MESMO componente (nenhum tem campo próprio);
//  · o CPF não vai para console/log nem aparece inteiro em recado de erro.
// CPFs de exemplo gerados (válidos na conta, de ninguém): 529.982.247-25.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => fs.readFileSync(path.resolve(repoRoot, arquivo), "utf8");

const regras = loadTs("src/features/financeiro/cpfDaNota.ts");
const access = loadTs("src/lib/access.ts");

const SITUACOES = ["CARREGANDO", "SEM_FICHA", "OUTRA_PESSOA", "SEM_CPF", "COM_CPF"];

// ---------------------------------------------------------------- a trava

test("TRAVA: nota da Simone com a comanda na ficha do Murilo é 'outra pessoa'; a mesma pessoa escrita diferente não é", () => {
  assert.equal(regras.fichaDeOutraPessoa("SIMONE APARECIDA PAULO DE LIMA", "MURILO DE PAULA"), true);
  assert.equal(regras.fichaDeOutraPessoa("Luciane Modernel", "LUCIANE MODERNEL DA SILVA"), false);
  assert.equal(regras.fichaDeOutraPessoa("Mônica Prado", "monica"), false);
  assert.equal(regras.fichaDeOutraPessoa("Paula Mendes", "Paulo Mendes"), true, "troca de gênero é outra pessoa");
  assert.equal(regras.fichaDeOutraPessoa("Simone", null), false, "nome da ficha desconhecido não trava");
  assert.equal(regras.fichaDeOutraPessoa("Simone", ""), false);
});

test("TRAVA: com a ficha de outra pessoa nunca há 'guardar'; quem emite manda só nesta nota; quem não emite só lê o aviso", () => {
  const situacao = regras.situacaoDoCpfDaNota({ contactRef: "contact-tel-11996395448", nomeDaNota: "SIMONE APARECIDA", nomeDaFicha: "MURILO DE PAULA", temCpf: true });
  assert.equal(situacao, "OUTRA_PESSOA", "nem olha se a ficha (do filho) tem CPF");
  for (const editando of [false, true]) {
    for (const podeGravarCpf of [false, true]) {
      const emite = plain(regras.acoesDoCpfDaNota({ situacao, podeGravarCpf, podeEmitir: true, editando }));
      assert.deepEqual(emite, { mostraCampo: true, acoes: ["SO_NESTA_NOTA"] });
      const naoEmite = plain(regras.acoesDoCpfDaNota({ situacao, podeGravarCpf, podeEmitir: false, editando }));
      assert.deepEqual(naoEmite, { mostraCampo: false, acoes: [] });
    }
  }
  const aviso = regras.avisoDoCpfDaNota(situacao, { nomeDaNota: "SIMONE APARECIDA", nomeDaFicha: "MURILO DE PAULA" });
  assert.match(aviso, /^Esta nota sai no nome de SIMONE APARECIDA, mas a comanda está ligada à ficha de MURILO DE PAULA\./);
  assert.equal(regras.rotuloDaAcao("SO_NESTA_NOTA", ["SO_NESTA_NOTA"]), "Emitir com este CPF só nesta nota");
});

test("sem ficha ligada: também não guarda (não tem onde)", () => {
  assert.equal(regras.situacaoDoCpfDaNota({ contactRef: "", nomeDaNota: "X", nomeDaFicha: null, temCpf: undefined }), "SEM_FICHA");
  assert.deepEqual(plain(regras.acoesDoCpfDaNota({ situacao: "SEM_FICHA", podeGravarCpf: true, podeEmitir: false, editando: false })), { mostraCampo: false, acoes: [] });
});

// ---------------------------------------------------------------- quem faz o quê

test("sem CPF na ficha: quem grava vê 'Guardar CPF'; quem emite vê 'Guardar CPF e emitir'; quem não grava não vê o campo", () => {
  const sit = "SEM_CPF";
  assert.deepEqual(plain(regras.acoesDoCpfDaNota({ situacao: sit, podeGravarCpf: true, podeEmitir: false, editando: false })), { mostraCampo: true, acoes: ["GUARDAR"] });
  const emite = plain(regras.acoesDoCpfDaNota({ situacao: sit, podeGravarCpf: true, podeEmitir: true, editando: false }));
  assert.deepEqual(emite, { mostraCampo: true, acoes: ["GUARDAR_E_EMITIR", "GUARDAR"] });
  assert.equal(regras.rotuloDaAcao("GUARDAR_E_EMITIR", emite.acoes), "Guardar CPF e emitir");
  assert.equal(regras.rotuloDaAcao("GUARDAR", ["GUARDAR"]), "Guardar CPF");
  assert.deepEqual(plain(regras.acoesDoCpfDaNota({ situacao: sit, podeGravarCpf: false, podeEmitir: true, editando: false })), { mostraCampo: false, acoes: [] });
});

test("com CPF na ficha: mostra o guardado; o campo só volta com 'Trocar'", () => {
  assert.deepEqual(plain(regras.acoesDoCpfDaNota({ situacao: "COM_CPF", podeGravarCpf: true, podeEmitir: true, editando: false })), { mostraCampo: false, acoes: [] });
  assert.deepEqual(plain(regras.acoesDoCpfDaNota({ situacao: "COM_CPF", podeGravarCpf: true, podeEmitir: false, editando: true })), { mostraCampo: true, acoes: ["GUARDAR"] });
});

test("NENHUMA combinação dá ação que emite para quem não podeEmitirNota", () => {
  for (const situacao of SITUACOES) {
    for (const podeGravarCpf of [false, true]) {
      for (const editando of [false, true]) {
        const { acoes } = regras.acoesDoCpfDaNota({ situacao, podeGravarCpf, podeEmitir: false, editando });
        assert.ok(!acoes.includes("GUARDAR_E_EMITIR") && !acoes.includes("SO_NESTA_NOTA"), `${situacao}/${podeGravarCpf}/${editando}`);
        const comEmissao = regras.acoesDoCpfDaNota({ situacao, podeGravarCpf, podeEmitir: true, editando }).acoes;
        if (!podeGravarCpf) assert.ok(!comEmissao.includes("GUARDAR") && !comEmissao.includes("GUARDAR_E_EMITIR"), "sem permissão de gravar, nada grava");
      }
    }
  }
});

test("quem vê/grava CPF é o espelho da RLS de contato_documento; quem emite é só o Estevão por padrão", () => {
  const lucas = { cargo: "gestor_financeiro", acessos: {} };
  const estevao = { cargo: "gestor", acessos: {} };
  const recepcao = { cargo: "recepcionista", acessos: {} };
  assert.equal(access.podeGravarCpf(lucas), true, "financeiro completo guarda CPF");
  assert.equal(access.podeEmitirNota(lucas), false, "mas o Lucas não emite");
  assert.equal(access.podeGravarCpf(estevao), true, "o Estevão só VÊ a tela de impostos e mesmo assim guarda (coordenação)");
  assert.equal(access.podeEmitirNota(estevao), true);
  assert.equal(access.podeVerCpf(recepcao), false);
  assert.equal(access.podeGravarCpf(recepcao), false);
  assert.equal(access.podeVerCpf({ ...recepcao, acessos: { "fin-impostos": "VER" } }), true);
  assert.equal(access.podeGravarCpf({ ...recepcao, acessos: { "fin-impostos": "VER" } }), false);
  assert.equal(access.podeGravarCpf({ ...recepcao, acessos: { "fin-impostos": "EDITAR" } }), true);
  const rls = ler("supabase/migrations/202609280001_reconciliacao_schema_producao.sql");
  assert.match(rls, /create policy contato_documento_write[\s\S]*?is_coordenacao\(auth\.uid\(\)\)\s*or public\.is_financeiro_full\(auth\.uid\(\)\)\s*or public\.module_access_override\(auth\.uid\(\), 'fin-impostos'\) = 'EDITAR'/);
});

// ---------------------------------------------------------------- o componente

const COMPONENTE = ler("src/features/financeiro/CpfDaNotaInline.tsx");

test("o componente só emite com podeEmitirNota, e a trava é conferida de novo antes de gravar", () => {
  assert.match(COMPONENTE, /import \{[^}]*\bpodeEmitirNota\b[^}]*\} from "@\/lib\/access";/);
  assert.match(COMPONENTE, /const podeEmitir = podeEmitirNota\(pessoa\) && Boolean\(emitir\);/);
  assert.match(COMPONENTE, /if \(!podeEmitir \|\| !emitir\) return;\s*await emitir\(\{ cpf \}\);/);
  const trava = COMPONENTE.indexOf('situacao === "OUTRA_PESSOA" || situacao === "SEM_FICHA" || !gravaCpf) return;');
  assert.ok(trava > 0 && trava < COMPONENTE.indexOf("await salvarRemoteCpfDoContato("), "nunca grava na ficha de outra pessoa");
  assert.match(COMPONENTE, /if \(!veCpf && !podeEmitir\) return null;/, "recepção não vê nada");
  assert.match(COMPONENTE, /queryKey: \["contato-cpf", contactRef\]/, "o mesmo cache do cartão da ficha e do diálogo da nota");
  assert.match(COMPONENTE, /cpfMascarado\(/, "o guardado aparece mascarado");
  assert.match(COMPONENTE, /cpfEnquantoDigita\(evento\.target\.value\)/, "máscara enquanto digita");
  assert.match(COMPONENTE, /const motivo = semCpfNoTexto\(/, "erro do banco na tela, sem número");
  assert.match(COMPONENTE, /tom: "erro"/);
});

test("o lote e o Lançar Dia usam o MESMO componente — nenhum tem campo de CPF próprio", () => {
  const lote = ler("src/features/financeiro/LoteDeNotasCard.tsx");
  const lancar = ler("src/features/financeiro/FinanceiroLancarDiaPage.tsx");
  for (const [nome, src] of [["lote", lote], ["Lançar Dia", lancar]]) {
    assert.match(src, /import \{ CpfDaNotaInline \} from "\.\/CpfDaNotaInline";/, nome);
    assert.match(src, /<CpfDaNotaInline\b/, nome);
  }
  assert.doesNotMatch(lote, /salvarRemoteCpfDoContato|cpfEnquantoDigita|from "@\/lib\/cpf"/, "o lote não grava CPF por conta própria");
  // Lote: guarda e emite a linha com a MESMA função de emitir; CPF vai como tomador.cpf.
  assert.match(lote, /emitir=\{podeEmitir \? \(\{ cpf \}\) => emitirLinha\(item, cpf\) : undefined\}/);
  assert.match(lote, /tomador: \{ nome: item\.tomadorNome, \.\.\.\(cpfDaNota \? \{ cpf: cpfDaNota \} : \{\}\) \},/);
  assert.match(lote, /onGuardado=\{recarregarProntidao\}/);
  assert.match(lote, /queryClient\.invalidateQueries\(\{ queryKey: \["nfse-lote-prontidao"\] \}\)/, "depois de guardar, a linha deixa de dizer 'sem CPF'");
  assert.match(lote, /if \(!cpfDaNota && fichaTrocada\(item\)\) \{/, "linha da ficha de outra pessoa não sai sem o CPF da nota");
  assert.match(lote, /const emitiveis = pendentes\.filter\(\(i\) => !fichaTrocada\(i\)\);/, "e fica fora do 'Emitir todas'");
  // Lançar Dia: toda comanda sem nota, para quem pode gravar; quem emite abre a confirmação já com o CPF.
  assert.match(lancar, /\{pedeEmissao && !isPreview \? \(\s*<CpfDaNotaInline/);
  assert.match(lancar, /podeEmitir\s*\? \(\{ cpf \}\) => \{\s*setCpfParaANota\(cpf\);\s*setNotaDaComanda\(sale\);/);
  assert.match(lancar, /cpfInicial=\{cpfParaANota\}/);
  assert.match(lancar, /nomeDaFicha=\{nomeDaFichaDe\(notaDaComanda\.crmContactRef\)\}/);
});

test("o diálogo da nota (Lançar Dia) também respeita a trava: não grava na ficha de outra pessoa nem usa o CPF dela", () => {
  const src = ler("src/features/financeiro/NotaDaComandaDialog.tsx");
  assert.match(src, /const outraPessoa = fichaDeOutraPessoa\(sale\.patientName, nomeDaFicha\);/);
  assert.match(src, /if \(cpfDigitado && !cpfNaFicha\.data\?\.cpf && sale\.crmContactRef && !outraPessoa\) \{/);
  assert.match(src, /cpf: cpfNaFicha\.data\?\.cpf && !outraPessoa \? "na ficha" : ""/);
  assert.match(src, /const podeEmitir = temPermissao && [^;]*!travaDaFicha/);
});

test("o CPF nunca vai para console/log; recado de erro sai sem o número", () => {
  for (const arquivo of [
    "src/features/financeiro/CpfDaNotaInline.tsx",
    "src/features/financeiro/cpfDaNota.ts",
    "src/features/financeiro/LoteDeNotasCard.tsx",
    "src/features/financeiro/NotaDaComandaDialog.tsx",
  ]) {
    assert.doesNotMatch(ler(arquivo), /console\./, arquivo);
  }
  const lancar = ler("src/features/financeiro/FinanceiroLancarDiaPage.tsx");
  for (const linha of lancar.split("\n").filter((l) => /console\./.test(l))) assert.doesNotMatch(linha, /cpf/i, linha.trim());
  assert.equal(regras.semCpfNoTexto("erro com 529.982.247-25 no meio"), "erro com ***.***.***-** no meio");
  assert.equal(regras.semCpfNoTexto("chave (52998224725) já existe"), "chave (***.***.***-**) já existe");
  assert.equal(regras.semCpfNoTexto("sem número"), "sem número");
});
