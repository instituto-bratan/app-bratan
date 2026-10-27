// SEMANA X DE N (27/10/2026) — Meu Bratan, motivo para abrir toda semana.
//
// O que se protege aqui:
//  · a semana do plano é a mesma conta do anel da jornada, e o N cobre o último dia;
//  · vermelho = terceiro nível de QUALQUER item, e vira UMA tarefa por semana para
//    a ENFERMAGEM — no banco (gatilho), com os mesmos textos do TypeScript;
//  · a tarefa da ligação não é cancelada pela "regra de ouro" do CRM;
//  · os textos de exemplo (e os da demonstração) não citam remédio nem prometem;
//  · tela e banco concordam em quem edita as semanas (coordenação e enfermagem).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const mod = loadTs("supabase/functions/_shared/semanaDoPaciente.ts");
const acesso = loadTs("src/lib/acessoDoPortal.ts");
const demo = loadTs("src/features/portal/portalDemo.ts");
const portal = loadTs("src/features/portal/portalPaciente.ts");
const recado = loadTs("supabase/functions/_shared/recadoTrancado.ts");
const SQL = ler("supabase/migrations/202610280402_semana_do_portal.sql");
const HOJE = "2026-10-27";

test("a semana do plano: semana 1 do fechamento ao sexto dia depois dele", () => {
  assert.equal(mod.semanaDoPlano("2026-10-20", "2026-10-20"), 1);
  assert.equal(mod.semanaDoPlano("2026-10-20", "2026-10-26"), 1);
  assert.equal(mod.semanaDoPlano("2026-10-20", "2026-10-27"), 2);
  assert.equal(mod.semanaDoPlano("2026-07-19", HOJE), 15, "a demo (100 dias) está na semana 15");
  assert.equal(mod.semanaDoPlano("2026-11-01", HOJE), 1, "plano com data futura = semana 1");
  assert.equal(mod.semanaDoPlano(null, HOJE), null);
  assert.equal(mod.semanaDoPlano("lixo", HOJE), null);
  assert.equal(mod.semanaDoPlano("2026-10-20T18:30:00-03:00", HOJE), 2, "aceita o closed_at com hora");
});

test("o N do 'Semana X de N' cobre o último dia do plano", () => {
  assert.equal(mod.totalDeSemanas("2026-04-27", 6), 27, "183 dias: o último dia ainda cabe");
  assert.equal(mod.semanaDoPlano("2026-04-27", "2026-10-26"), 27);
  assert.equal(mod.totalDeSemanas("2026-01-31", 1), 4, "fim de mês curto não escorrega");
  assert.equal(mod.totalDeSemanas(null, 6), null);
  assert.equal(mod.totalDeSemanas("2026-04-27", 0), null);
});

test("vermelho é o terceiro nível de qualquer item", () => {
  assert.equal(mod.NIVEL_VERMELHO, 3);
  assert.equal(mod.ehVermelho({ fome: 3, energia: null, enjoo: null }), true);
  assert.equal(mod.ehVermelho({ fome: 2, energia: 2, enjoo: 1 }), false);
  assert.equal(mod.ehVermelho(null), false);
  assert.deepEqual(plain(mod.itensVermelhos({ fome: 3, energia: 1, enjoo: 3 })), ["fome", "enjoo"]);
  assert.equal(mod.itemValido("enjoo"), true);
  assert.equal(mod.itemValido("humor"), false);
  assert.equal(mod.nivelValido(3), true);
  assert.equal(mod.nivelValido(4), false);
  assert.equal(mod.nivelValido("3"), false, "o servidor converte antes de conferir");
  for (const item of mod.ITENS_DO_CHECKIN) assert.equal(mod.PERGUNTAS_DO_CHECKIN[item].niveis.length, 3, item);
});

test("a tarefa da enfermagem: id fixo por semana e a frase que a enfermeira lê", () => {
  assert.equal(mod.chaveDaTarefaDoCheckin("contact-teste", 3), "task-checkin-contact-teste-s3");
  assert.equal(
    mod.descricaoDaTarefaDoCheckin(3, ["enjoo"]),
    "Na semana 3 do plano, o paciente marcou no check-in do Meu Bratan: enjoo forte. Ligue hoje para saber como ele está e registre o que combinaram. Mudança no tratamento é decisão do médico.",
  );
  assert.match(mod.descricaoDaTarefaDoCheckin(5, ["fome", "energia"]), /: fome difícil \(demais ou sem conseguir comer\), energia muito baixa\./);
});

test("o gatilho do banco usa a MESMA regra e os MESMOS textos do TypeScript", () => {
  assert.match(SQL, /coalesce\(fome = 3, false\) or coalesce\(energia = 3, false\) or coalesce\(enjoo = 3, false\)/);
  for (const item of mod.ITENS_DO_CHECKIN) {
    assert.ok(SQL.includes(`if new.${item} = 3 then itens := array_append(itens, '${mod.PERGUNTAS_DO_CHECKIN[item].naTarefa}')`), `gatilho sem o texto de ${item}`);
  }
  const formato = SQL.match(/format\(\s*'([^']+)'/)[1];
  assert.equal(formato, mod.descricaoDaTarefaDoCheckin(999, ["fome"]).replace("999", "%s").replace(mod.PERGUNTAS_DO_CHECKIN.fome.naTarefa, "%s"));
  assert.ok(SQL.includes(`'${mod.TITULO_DA_TAREFA_DO_CHECKIN}'`));
  assert.ok(SQL.includes(`'${mod.PREFIXO_DA_TAREFA_DO_CHECKIN}' || new.contact_ref || '-s' || new.semana`));
  for (const campo of ["'CALL'", "'ENFERMAGEM'", "'HIGH'", "'ROLE'", "on conflict (client_ref) do nothing"]) assert.ok(SQL.includes(campo), campo);
  assert.match(SQL, /after insert or update of fome, energia, enjoo on public\.paciente_checkin[\s\S]*?when \(new\.vermelho and new\.tarefa_ref is null\)/, "AFTER (coluna gerada) e uma vez só");
});

test("banco: resposta só entra pela função; equipe clínica lê; semanas só coordenação e enfermagem editam", () => {
  assert.match(SQL, /alter table public\.paciente_checkin enable row level security/);
  assert.match(SQL, /create policy paciente_checkin_select[\s\S]*?can_paciente_medicao_read\(auth\.uid\(\)\)/);
  assert.doesNotMatch(SQL, /create policy paciente_checkin_(insert|update|delete)/, "ninguém da equipe grava 'o paciente disse'");
  assert.match(SQL, /revoke all on table public\.paciente_checkin from anon, authenticated;\s*grant select on table public\.paciente_checkin to authenticated;/);
  assert.match(SQL, /constraint paciente_checkin_uma_por_semana unique \(contact_ref, semana\)/);
  assert.match(SQL, /alter table public\.portal_semana_conteudo enable row level security/);
  assert.match(SQL, /select public\.is_coordenacao\(_user\) or public\.has_cargo\(_user, 'enfermeira'\)/);
  assert.doesNotMatch(SQL, /to anon/);
  for (const cargo of ["dr_daniel", "ceo", "gestor", "gestor_financeiro", "secretaria_executiva", "enfermeira"]) assert.equal(acesso.podeEditarSemanasDoPortal(cargo), true, cargo);
  for (const cargo of ["recepcionista", "nutricionista", "marketing", "limpeza", null]) assert.equal(acesso.podeEditarSemanasDoPortal(cargo), false, String(cargo));
});

test("as 4 semanas de exemplo do banco são as mesmas do código, e nenhuma cita remédio ou promete", () => {
  assert.equal(mod.SEMANAS_DE_EXEMPLO.length, 4);
  const seed = SQL.slice(SQL.indexOf("insert into public.portal_semana_conteudo"), SQL.indexOf("on conflict (semana) do nothing"));
  for (const semana of mod.SEMANAS_DE_EXEMPLO) {
    for (const texto of [semana.titulo, semana.costumaAcontecer, semana.missao]) {
      assert.ok(seed.includes(`'${texto.replace(/'/g, "''")}'`), `semana ${semana.semana}: o SQL não tem "${texto.slice(0, 40)}…"`);
    }
    assert.deepEqual(plain(mod.validarConteudoDaSemana(semana)), [], `semana ${semana.semana} não passa na trava`);
  }
  const textos = [...mod.SEMANAS_DE_EXEMPLO.flatMap((s) => [s.titulo, s.costumaAcontecer, s.missao]), ...Object.values(demo.SEMANA_DO_MEIO_DE_EXEMPLO)];
  for (const texto of textos) assert.deepEqual(plain(mod.problemasDoTexto(texto)), { bloqueia: [], avisa: [] }, texto);
});

test("a trava do editor: remédio e dose não salvam; promessa avisa", () => {
  const remedio = mod.problemasDoTexto("Nesta semana a Tirzepatida 2,5 mg começa a agir.");
  assert.equal(remedio.bloqueia.length, 2, "remédio e dose");
  assert.match(remedio.bloqueia[0], /tirzepatida/);
  assert.equal(mod.problemasDoTexto("O OZEMPIC ajuda").bloqueia.length, 1, "sem diferença de maiúscula");
  const promessa = mod.problemasDoTexto("Você vai perder 5 kg, resultado garantido!");
  assert.equal(promessa.bloqueia.length, 0);
  assert.match(promessa.avisa[0], /garantido/);
  assert.match(mod.problemasDoTexto("Perca até 3 quilos").avisa[0] ?? "", /promessa/);
  assert.deepEqual(plain(mod.problemasDoTexto("Procure a enfermagem se algo incomodar.")), { bloqueia: [], avisa: [] });
  assert.deepEqual(plain(mod.problemasDoTexto("Quem procura ajuda cedo se cuida melhor.")), { bloqueia: [], avisa: [] }, "'procura' não é 'cura'");
  const erros = mod.validarConteudoDaSemana({ semana: 0, titulo: "", costumaAcontecer: "x".repeat(701), missao: "" });
  assert.ok(erros.some((e) => /1 a 104/.test(e)));
  assert.ok(erros.some((e) => /título/.test(e)));
  assert.ok(erros.some((e) => /700/.test(e)));
});

test("o servidor conta a semana e só deixa o paciente responder o que é dele", () => {
  const funcao = ler("supabase/functions/portal-paciente/index.ts");
  const bloco = funcao.slice(funcao.indexOf('entrada.acao === "checkin"'), funcao.indexOf('if (entrada.acao !== "dados")'));
  assert.match(bloco, /!itemValido\(item\) \|\| !nivelValido\(nivel\)/);
  assert.match(bloco, /semanaDoPlano\(await inicioDoPlanoAtual\(\), hojeEmSaoPaulo\(\)\)/, "a semana não vem do aparelho");
  assert.match(bloco, /\.eq\("contact_ref", contactRef\)\.eq\("semana", semana\)/);
  assert.match(bloco, /log\(contactRef, "CHECKIN", \{ semana \}\)/, "no registro de acesso vai só a semana");
  assert.doesNotMatch(bloco, /crm_tasks/, "a tarefa é do gatilho do banco, não da função");
});

test("a tarefa da ligação convive com a régua: a regra de ouro do CRM não cancela", () => {
  const crm = loadTs("src/features/crm/crmData.ts");
  const tarefa = (id, dueAt, extra = {}) => ({ id, contactId: "contact-teste", assignedToUserId: "enfermeira-1", status: "PENDING", isGate: false, generatedBy: "CADENCE_ENGINE", dueAt, ...extra });
  const estado = (tasks) => ({ contacts: [], deals: [], tasks, cadences: [], cadenceSteps: [], cadenceEnrollments: [], messageTemplates: [], touchpoints: [], timelineEvents: [] });
  const comCheckin = crm.enforceOneTaskPerPersonPerPatient(
    estado([tarefa("task-regua-14", "2026-10-20T09:00:00Z"), tarefa(mod.chaveDaTarefaDoCheckin("contact-teste", 3), "2026-10-27T12:00:00Z", { generatedBy: "PIPELINE_STAGE" })]),
  );
  assert.deepEqual(plain(comCheckin.tasks.map((t) => t.status)), ["PENDING", "PENDING"], "as duas continuam abertas");
  // Controle: sem o check-in, a regra continua valendo para as outras.
  const semCheckin = crm.enforceOneTaskPerPersonPerPatient(estado([tarefa("task-a", "2026-10-20T09:00:00Z"), tarefa("task-b", "2026-10-27T12:00:00Z")]));
  assert.deepEqual(plain(semCheckin.tasks.map((t) => t.status)), ["PENDING", "CANCELED"]);
});

test("a demonstração já mostra os cartões novos, sem áudio inventado", () => {
  const meio = demo.dadosDemo(HOJE);
  assert.equal(meio.semana.numero, 15);
  assert.equal(meio.semana.conteudo.titulo, demo.SEMANA_DO_MEIO_DE_EXEMPLO.titulo);
  assert.equal(meio.semana.checkin, null);
  assert.equal(meio.recados.length, 1);
  assert.equal(meio.recados[0].autor, "DOUTOR");
  assert.equal(recado.estadoDoRecado(meio.recados[0], HOJE), "TRANCADO", "na demo o recado está trancado: não existe áudio de exemplo");
  const novo = demo.dadosDemoNovo(HOJE);
  assert.equal(novo.semana.numero, 1);
  assert.equal(novo.semana.conteudo.titulo, mod.SEMANAS_DE_EXEMPLO[0].titulo);
  assert.equal(recado.contagemDoRecado(novo.recados[0].abreEm, HOJE).dias, 12, "abre no dia 15 do plano");
});

test("o ponto da aba Hoje acende com recado aberto e não ouvido", () => {
  assert.equal(JSON.stringify(portal.pendenciasDasAbas(null, { recadosNovos: 1 })), '{"hoje":1}');
  assert.equal(JSON.stringify(portal.pendenciasDasAbas({ podeResponder: true }, { recadosNovos: 2 })), '{"hoje":3}');
  assert.equal(JSON.stringify(portal.pendenciasDasAbas(null, { recadosNovos: 0 })), "{}");
});
