// AGENDA DO DIA — QUEM VÊ E QUEM MARCA (29/09/2026).
// O app (src/lib/access.ts, módulo "agenda") e o banco
// (202609290001_agenda_do_dia.sql) têm que dizer a mesma coisa; a sync de hora
// em hora não pode tocar no que a recepção marcou; o espelho só ganha colunas.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const access = loadTs("src/lib/access.ts");
const migration = ler("supabase/migrations/202609290001_agenda_do_dia.sql");

const veem = ["recepcionista", "secretaria_executiva", "enfermeira", "gestor", "gestor_financeiro", "ceo", "dr_daniel"];
const naoVeem = ["marketing", "nutricionista", "limpeza"];

test("padrão do cargo: recepção, concierge, enfermagem e coordenação veem e marcam", () => {
  for (const cargo of veem) assert.equal(access.moduleLevel({ cargo, acessos: {} }, "agenda"), "EDITAR", cargo);
  for (const cargo of naoVeem) assert.equal(access.moduleLevel({ cargo, acessos: {} }, "agenda"), "OCULTO", cargo);
  assert.equal(access.moduleLevel({ cargo: "nutricionista", acessos: { agenda: "VER" } }, "agenda"), "VER", "o Lucas libera pessoa a pessoa");
  assert.ok(access.moduleKeys.includes("agenda"));
  assert.ok(access.moduleLabels.agenda);
});

test("o banco libera os mesmos cargos que o app", () => {
  const corpo = /create or replace function public\.can_agenda_read[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(migration)?.[1] ?? "";
  assert.match(corpo, /is_coordenacao\(_user\)/);
  assert.match(corpo, /has_cargo\(_user, 'recepcionista'\)/);
  assert.match(corpo, /has_cargo\(_user, 'enfermeira'\)/);
  assert.match(corpo, /module_access_override\(_user, 'agenda'\) in \('VER', 'EDITAR'\)/);
  for (const cargo of naoVeem) assert.doesNotMatch(corpo, new RegExp(`'${cargo}'`), cargo);
  // coordenação no app = coordenação no banco
  assert.equal(JSON.stringify(access.coordenacaoCargos.slice().sort()), JSON.stringify(["ceo", "dr_daniel", "gestor", "gestor_financeiro", "secretaria_executiva"]));
});

test("agenda_espelho deixa de ser 'todo logado lê' e só ganha colunas", () => {
  assert.match(migration, /drop policy if exists agenda_espelho_select/);
  assert.doesNotMatch(migration.replace(/--.*$/gm, ""), /using \(true\)/);
  assert.doesNotMatch(migration, /alter table public\.agenda_espelho\s+(drop|rename|alter column \w+ type)/i, "o portal do paciente lê o espelho: nada sai nem muda de tipo");
  assert.match(migration, /add column if not exists cor text/);
  assert.match(migration, /add column if not exists criado_em timestamptz/);
});

test("presença: sem apagar, Veio/Faltou só até hoje, quem marcou vem do login", () => {
  assert.match(migration, /create table if not exists public\.agenda_presenca/);
  assert.match(migration, /unique \(origem, origem_id\)/);
  assert.doesNotMatch(migration, /for delete/);
  assert.match(migration, /dia <= \(now\(\) at time zone 'America\/Sao_Paulo'\)::date/);
  assert.match(migration, /new\.marcado_por := auth\.uid\(\)/);
});

test("a sync de hora em hora nunca toca no que a recepção marcou", () => {
  const sync = ler("supabase/functions/google-agenda-sync/index.ts") + ler("supabase/functions/_shared/agendaIcs.ts");
  assert.doesNotMatch(sync, /agenda_presenca/);
  assert.doesNotMatch(sync, /confirmacao_status|criado_em/, "a sync não sobrescreve confirmação nem a data de chegada");
});

test("a tela não pede telefone do espelho", () => {
  const remoto = ler("src/lib/remote/agenda.ts");
  assert.doesNotMatch(remoto.replace(/\/\/.*$/gm, ""), /telefone/);
});
