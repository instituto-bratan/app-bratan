// DADOS CLÍNICOS SÓ PARA QUEM CUIDA DO PACIENTE (28/09/2026).
//
// O que se protege: (1) nenhuma política "using (true)" volta para medição,
// consulta e acesso do portal; (2) a regra do app (src/lib/access.ts) e a do
// banco (202609280002_rls_dados_clinicos.sql) dizem a mesma coisa; (3) as
// colunas que a equipe pode ler/gravar em paciente_acesso cobrem exatamente o
// que as telas pedem, sem hash nenhum; (4) o que o código usa e só existia em
// produção agora está numa migration, e a reconciliação não mexe em produção.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pastaMigrations = path.join(repoRoot, "supabase/migrations");
const arquivos = fs.readdirSync(pastaMigrations).filter((nome) => nome.endsWith(".sql")).sort();
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const migration = (nome) => fs.readFileSync(path.join(pastaMigrations, nome), "utf8");
const semComentario = (sql) => sql.replace(/--.*$/gm, "");
const todasAsMigrations = arquivos.map((nome) => semComentario(migration(nome))).join("\n");

const access = loadTs("src/lib/access.ts");
const pessoa = (cargo, acessos = {}) => ({ cargo, acessos });

const TABELAS = ["paciente_medicao", "paciente_consulta", "paciente_acesso"];

/** Refaz, em texto, o efeito das migrations em ordem: o que sobra de política em cada tabela. */
function politicasFinais() {
  const porTabela = new Map(TABELAS.map((tabela) => [tabela, new Map()]));
  const comando = /drop policy if exists "?(\w+)"? on public\.(\w+)\s*;|create policy "?(\w+)"? on public\.(\w+)([\s\S]*?);/gi;
  for (const nome of arquivos) {
    for (const m of semComentario(migration(nome)).matchAll(comando)) {
      const tabela = m[2] ?? m[4];
      if (!porTabela.has(tabela)) continue;
      if (m[1]) porTabela.get(tabela).delete(m[1]);
      else porTabela.get(tabela).set(m[3], { arquivo: nome, texto: m[5].replace(/\s+/g, " ").trim() });
    }
  }
  return porTabela;
}

/** Corpo da ÚLTIMA versão de uma função SQL nas migrations. */
function corpoDaFuncao(nome) {
  const re = new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "gi");
  const achados = [...todasAsMigrations.matchAll(re)];
  assert.ok(achados.length, `função ${nome} não encontrada nas migrations`);
  return achados.at(-1)[1];
}

const aspas = (texto) => [...texto.matchAll(/'(\w+)'/g)].map((m) => m[1]);

/** Colunas de um "grant <priv> (...) on table public.paciente_acesso to authenticated" da migration nova. */
function colunasConcedidas(privilegio) {
  const sql = semComentario(migration("202609280002_rls_dados_clinicos.sql"));
  const m = sql.match(new RegExp(`grant ${privilegio} \\(([^)]*)\\)\\s*on table public\\.paciente_acesso to authenticated`, "i"));
  assert.ok(m, `grant ${privilegio} em paciente_acesso não encontrado`);
  return m[1].split(",").map((c) => c.trim());
}

// ---------------------------------------------------------------------------
// Banco: o que sobra depois de todas as migrations
// ---------------------------------------------------------------------------

test("nenhuma política aberta (true) sobra em medição, consulta e acesso do portal", () => {
  for (const [tabela, politicas] of politicasFinais()) {
    assert.ok(politicas.size >= 3, `${tabela} ficou com ${politicas.size} políticas`);
    for (const [nome, { arquivo, texto }] of politicas) {
      assert.doesNotMatch(texto, /\(\s*true\s*\)/i, `${tabela}.${nome} (${arquivo}) ainda é aberta: ${texto}`);
      assert.match(texto, /public\.can_paciente_(medicao|portal)_(read|write)\(auth\.uid\(\)\)/, `${tabela}.${nome} não usa a função de acesso`);
    }
  }
});

test("ninguém da equipe apaga linha de verdade: sem política de DELETE nem FOR ALL", () => {
  for (const [tabela, politicas] of politicasFinais()) {
    for (const [nome, { texto }] of politicas) {
      assert.doesNotMatch(texto, /\bfor (all|delete)\b/i, `${tabela}.${nome}: ${texto}`);
    }
  }
});

test("medição: a equipe não grava origem PACIENTE (só a função do portal)", () => {
  const insert = politicasFinais().get("paciente_medicao").get("paciente_medicao_insert");
  assert.ok(insert, "política de insert da medição sumiu");
  assert.match(insert.texto, /origem in \('ENFERMAGEM', 'IMPORTACAO'\)/);
});

test("acesso do portal: a equipe só revoga — não põe sessão conhecida na linha", () => {
  const revogar = politicasFinais().get("paciente_acesso").get("paciente_acesso_revogar");
  assert.ok(revogar, "política de update do acesso sumiu");
  assert.match(revogar.texto, /revogado_em is not null/);
  assert.match(revogar.texto, /sessao_hash is null/);
  assert.match(revogar.texto, /sessao_expira_em is null/);
});

// ---------------------------------------------------------------------------
// App × banco: a mesma regra dos dois lados
// ---------------------------------------------------------------------------

test("a coordenação do app é a mesma do is_coordenacao do banco", () => {
  assert.deepEqual([...aspas(corpoDaFuncao("is_coordenacao"))].sort(), [...access.coordenacaoCargos].sort());
});

test("equipe clínica: mesma lista no app e no banco, e ninguém a mais", () => {
  const corpo = corpoDaFuncao("is_equipe_clinica");
  assert.match(corpo, /public\.is_coordenacao\(_user\)/);
  const doBanco = new Set([...access.coordenacaoCargos, ...aspas(corpo)]);
  for (const cargo of access.cargos) {
    assert.equal(access.isEquipeClinica(cargo), doBanco.has(cargo), `cargo ${cargo}`);
  }
  assert.equal(access.isEquipeClinica("limpeza"), false);
  assert.equal(access.isEquipeClinica("marketing"), false);
  assert.equal(access.isEquipeClinica("recepcionista"), false);
});

test("as funções do banco usam a tela certa de Acessos e a recepção só no portal", () => {
  for (const nome of ["can_paciente_medicao_read", "can_paciente_medicao_write"]) {
    const corpo = corpoDaFuncao(nome);
    assert.match(corpo, /module_access_override\(_user, 'acompanhamento'\)/, nome);
    assert.doesNotMatch(corpo, /recepcionista/, `${nome}: recepção não vê bioimpedância`);
  }
  for (const nome of ["can_paciente_portal_read", "can_paciente_portal_write"]) {
    const corpo = corpoDaFuncao(nome);
    assert.match(corpo, /module_access_override\(_user, 'crm'\)/, nome);
    assert.match(corpo, /has_cargo\(_user, 'recepcionista'\)/, nome);
  }
  assert.match(corpoDaFuncao("can_paciente_medicao_read"), /in \('VER', 'EDITAR'\)/);
  assert.match(corpoDaFuncao("can_paciente_medicao_write"), /= 'EDITAR'/);
  assert.match(corpoDaFuncao("can_paciente_portal_read"), /in \('VER', 'EDITAR'\)/);
  assert.match(corpoDaFuncao("can_paciente_portal_write"), /= 'EDITAR'/);
});

test("app: quem vê e quem grava, cargo a cargo", () => {
  const esperado = {
    dr_daniel: [true, true, true, true],
    ceo: [true, true, true, true],
    gestor: [true, true, true, true],
    gestor_financeiro: [true, true, true, true],
    secretaria_executiva: [true, true, true, true],
    enfermeira: [true, true, true, true],
    nutricionista: [true, true, true, true],
    recepcionista: [false, false, true, true],
    marketing: [false, false, false, false],
    limpeza: [false, false, false, false],
  };
  for (const cargo of access.cargos) {
    const p = pessoa(cargo);
    assert.deepEqual(
      [access.canVerMedicoes(p), access.canGravarMedicoes(p), access.canVerPortalPaciente(p), access.canGravarPortalPaciente(p)],
      esperado[cargo],
      `cargo ${cargo} [vê medição, grava medição, vê portal, grava portal]`,
    );
  }
  assert.equal(access.canVerMedicoes(null), false);
  assert.equal(access.canVerPortalPaciente({ cargo: null, acessos: { crm: "EDITAR" } }), false, "sem cargo não entra nem com exceção");
});

test("app: exceção em Acessos só soma — VER lê, EDITAR grava, OCULTO não tranca a equipe clínica", () => {
  assert.equal(access.canVerMedicoes(pessoa("marketing", { acompanhamento: "VER" })), true);
  assert.equal(access.canGravarMedicoes(pessoa("marketing", { acompanhamento: "VER" })), false);
  assert.equal(access.canGravarMedicoes(pessoa("limpeza", { acompanhamento: "EDITAR" })), true);
  assert.equal(access.canVerPortalPaciente(pessoa("marketing", { crm: "VER" })), true);
  assert.equal(access.canGravarPortalPaciente(pessoa("marketing", { crm: "VER" })), false);
  assert.equal(access.canGravarPortalPaciente(pessoa("marketing", { crm: "EDITAR" })), true);
  // a exceção de uma tela não vaza para a outra
  assert.equal(access.canVerMedicoes(pessoa("recepcionista", { crm: "EDITAR" })), false);
  assert.equal(access.canVerPortalPaciente(pessoa("marketing", { acompanhamento: "EDITAR" })), false);
  // igual ao banco: OCULTO não tira o dado clínico de quem cuida
  assert.equal(access.canVerMedicoes(pessoa("enfermeira", { acompanhamento: "OCULTO" })), true);
});

// ---------------------------------------------------------------------------
// paciente_acesso: colunas liberadas × colunas que a tela usa
// ---------------------------------------------------------------------------

const remotoPortal = ler("src/lib/remote/portalPaciente.ts");

test("a equipe lê do acesso só o que a tela mostra — sem hash e sem login", () => {
  const selecionadas = remotoPortal.match(/from\("paciente_acesso"\)\.select\("([^"]+)"\)/)[1].split(",").map((c) => c.trim());
  const liberadas = colunasConcedidas("select");
  for (const coluna of selecionadas) assert.ok(liberadas.includes(coluna), `a tela lê ${coluna} e o grant não libera`);
  for (const proibida of ["token_hash", "sessao_hash", "senha_hash", "login"]) {
    assert.ok(!liberadas.includes(proibida), `${proibida} não pode ser legível pela equipe`);
  }
});

test("gerar link e revogar gravam só colunas liberadas", () => {
  const chaves = (trecho) => [...trecho.matchAll(/(\w+):/g)].map((m) => m[1]);
  const insert = remotoPortal.match(/from\("paciente_acesso"\)\.insert\(\{([^}]+)\}\)/)[1];
  const update = remotoPortal.match(/from\("paciente_acesso"\)\.update\(\{([^}]+)\}\)/)[1];
  const podeInserir = colunasConcedidas("insert");
  const podeAtualizar = colunasConcedidas("update");
  for (const coluna of chaves(insert)) assert.ok(podeInserir.includes(coluna), `insert de ${coluna} sem grant`);
  for (const coluna of chaves(update)) assert.ok(podeAtualizar.includes(coluna), `update de ${coluna} sem grant`);
  assert.ok(!podeInserir.includes("sessao_hash"), "ninguém nasce com sessão pela mão da equipe");
});

// ---------------------------------------------------------------------------
// Reconciliação: o que o código usa está em migration, e ela não mexe em produção
// ---------------------------------------------------------------------------

test("o que o código usa e só existia em produção agora está numa migration", () => {
  const funcaoPortal = ler("supabase/functions/portal-paciente/index.ts");
  for (const coluna of ["login", "senha_hash", "senha_criada_em", "tentativas", "bloqueado_ate"]) {
    assert.match(funcaoPortal, new RegExp(`\\b${coluna}\\b`), `a função do portal não usa mais ${coluna}? revise a lista`);
    assert.match(todasAsMigrations, new RegExp(`add column if not exists ${coluna}\\b`), `paciente_acesso.${coluna} sem migration`);
  }
  assert.match(ler("src/lib/remoteData.ts"), /program_milestones_done/);
  assert.match(todasAsMigrations, /add column if not exists program_milestones_done jsonb/);
  assert.match(ler("src/lib/remote/compliance.ts"), /from\("contato_documento"\)/);
  assert.match(todasAsMigrations, /create table public\.contato_documento/);
});

test("reconciliação não muda produção: nada de drop, e contato_documento só nasce se não existir", () => {
  const sql = semComentario(migration("202609280001_reconciliacao_schema_producao.sql"));
  assert.doesNotMatch(sql, /\bdrop\b/i);
  assert.doesNotMatch(sql, /alter column/i);
  const guarda = sql.indexOf("if to_regclass('public.contato_documento') is null then");
  assert.ok(guarda > 0, "a criação de contato_documento precisa da guarda");
  const fim = sql.indexOf("end if;", guarda);
  for (const trecho of ["create table public.contato_documento", "enable row level security", "create policy"]) {
    const onde = sql.indexOf(trecho);
    assert.ok(onde > guarda && onde < fim, `"${trecho}" fora da guarda`);
  }
  assert.match(sql, /indexdef ilike '%lower\(login\)%'/, "índice do login checado pela expressão, não pelo nome");
});
