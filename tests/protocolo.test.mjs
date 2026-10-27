// PROTOCOLO DO DOUTOR (28/10/2026): a máquina de estados da tela é a mesma do
// banco, os 6 motivos do "não fechou" viram a objeção do CRM, e a migração tem
// RLS ligada, políticas explícitas, nenhuma de apagar e a mesma lista de
// transições. Dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const p = loadTs("src/features/fechamento/protocolo.ts");
const access = loadTs("src/lib/access.ts");
const MIGRACAO = fs.readFileSync("supabase/migrations/202610280101_protocolo.sql", "utf8");

test("transições: o que pode e o que não pode", () => {
  assert.equal(p.podeMudar("PRESCRITO", "EM_NEGOCIACAO"), true);
  assert.equal(p.podeMudar("PRESCRITO", "FECHADO"), true, "fechar direto, sem abrir a negociação, vale");
  assert.equal(p.podeMudar("EM_NEGOCIACAO", "PRESCRITO"), false, "não volta para prescrito");
  assert.equal(p.podeMudar("NAO_FECHOU", "EM_NEGOCIACAO"), true, "o paciente voltou");
  assert.equal(p.podeMudar("NAO_FECHOU", "FECHADO"), true);
  for (const para of p.STATUS_DO_PROTOCOLO.filter((s) => s !== "FECHADO")) assert.equal(p.podeMudar("FECHADO", para), false, `FECHADO → ${para}`);
  for (const para of p.STATUS_DO_PROTOCOLO.filter((s) => s !== "CANCELADO")) assert.equal(p.podeMudar("CANCELADO", para), false, `CANCELADO → ${para}`);
});

test("a lista de transições da tela é a mesma do gatilho do banco", () => {
  const corpo = MIGRACAO.slice(MIGRACAO.indexOf("function public.protocolo_transicao_valida"), MIGRACAO.indexOf("create or replace function public.protocolo_antes_de_gravar"));
  const doBanco = [...corpo.matchAll(/\('([A-Z_]+)', '([A-Z_]+)'\)/g)].map((m) => `${m[1]}→${m[2]}`).sort();
  const daTela = Object.entries(p.TRANSICOES).flatMap(([de, paras]) => paras.map((para) => `${de}→${para}`)).sort();
  assert.ok(doBanco.length >= 10);
  assert.deepEqual(doBanco, daTela);
});

test("travaDaMudanca fala a mesma frase do banco", () => {
  const prescrito = { status: "PRESCRITO", dealRef: null, contactRef: null };
  const comercial = { comercial: true };
  assert.match(p.travaDaMudanca(prescrito, { status: "EM_NEGOCIACAO" }, comercial), /faltou o contato ou o negócio/);
  assert.equal(p.travaDaMudanca(prescrito, { status: "EM_NEGOCIACAO", dealRef: "deal-1", contactRef: "contact-1" }, comercial), null);
  assert.match(p.travaDaMudanca(prescrito, { status: "FECHADO", dealRef: "d", contactRef: "c" }, comercial), /informe o valor fechado/);
  assert.match(p.travaDaMudanca(prescrito, { status: "FECHADO", dealRef: "d", contactRef: "c", valorFechado: 10 }, comercial), /forma que o paciente escolheu/);
  assert.equal(p.travaDaMudanca(prescrito, { status: "FECHADO", dealRef: "d", contactRef: "c", valorFechado: 10, formaEscolhida: "PIX_A_VISTA" }, comercial), null);
  assert.match(p.travaDaMudanca(prescrito, { status: "NAO_FECHOU" }, comercial), /escolha o motivo/);
  assert.match(p.travaDaMudanca({ ...prescrito, status: "FECHADO" }, { status: "NAO_FECHOU", motivoNaoFechou: "PRECO" }, comercial), /não permitida/);
  // O médico do protocolo (sem o módulo de fechamento) só cancela o que ninguém abriu.
  assert.equal(p.travaDaMudanca(prescrito, { status: "CANCELADO" }, { comercial: false }), null);
  assert.match(p.travaDaMudanca(prescrito, { status: "EM_NEGOCIACAO", dealRef: "d", contactRef: "c" }, { comercial: false }), /Só o comercial/);
  for (const frase of ["faltou o contato ou o negócio", "Fechou: informe o valor fechado", "Não fechou: escolha o motivo", "Só o comercial muda a situação"]) {
    assert.ok(MIGRACAO.includes(frase), `a frase "${frase}" está no gatilho também`);
  }
});

test("os 6 motivos do não fechou e a objeção que vai para o CRM", () => {
  assert.deepEqual(plain(p.MOTIVOS_NAO_FECHOU.map((m) => m.chave)), ["QUEM_PAGA", "PRECO", "MEDO", "TEMPO", "JA_TENTOU", "VAI_PENSAR"]);
  const crm = loadTs("src/features/crm/crmData.ts");
  for (const motivo of p.MOTIVOS_NAO_FECHOU) assert.ok(crm.objectionCategoryLabels[motivo.categoria], `${motivo.chave} cai numa categoria que o CRM conhece`);
  assert.equal(p.motivoNaoFechou("PRECO").categoria, "PRICE");
  assert.equal(p.objecaoDoMotivo("VAI_PENSAR", ""), "Vai pensar");
  assert.equal(p.objecaoDoMotivo("QUEM_PAGA", " esposa decide "), "Quem paga não estava — esposa decide");
  // O CHECK do banco aceita exatamente os mesmos motivos (lição do CHECK velho de 24/07).
  const check = MIGRACAO.match(/motivo_nao_fechou in \(([^)]+)\)/)[1];
  assert.deepEqual(check.match(/'([A-Z_]+)'/g).map((s) => s.slice(1, -1)), plain(p.MOTIVOS_NAO_FECHOU.map((m) => m.chave)));
});

test("linha do banco → protocolo, sem quebrar com campo torto", () => {
  const linha = {
    id: "u1", client_ref: "prot-teste-0001", medico_id: "m1", medico_nome: "Doutor Teste", enviado_por: "m1", paciente_nome: "Paciente Ficticio",
    contact_ref: null, agenda_ref: "iclinic:abc", status: "STATUS_INVENTADO", total: "1296.00",
    itens: [{ id: "proj", nome: "Projeto", quantidade: 1, valor: 1000 }, null, { nome: "" }, { id: "x", nome: "Vitamina D", quantidade: "2", valor: "200", pellets: [{ nome: "Testosterona 100mg", quantidade: 2, valor: 380 }] }],
    opcoes_pagamento: { soma_itens: 1200, pix: 1296, parcelado_total: 1451.52, parcela: 241.92, parcelas: 6 },
    forma_escolhida: "QUALQUER", motivo_nao_fechou: "PRECO", criado_em: "2026-10-27T15:00:00Z", criado_no_aparelho_em: "2026-10-27T14:50:00Z",
  };
  const prot = p.protocoloDoBanco(linha);
  assert.equal(prot.status, "PRESCRITO", "situação desconhecida cai em prescrito");
  assert.equal(prot.total, 1296);
  assert.equal(prot.itens.length, 2, "item vazio ou nulo fica de fora");
  assert.equal(prot.itens[1].quantidade, 2);
  assert.equal(prot.itens[1].pellets[0].quantidade, 2);
  assert.equal(prot.formaEscolhida, null);
  assert.equal(prot.motivoNaoFechou, "PRECO");
  assert.equal(p.prescritoEm(prot), "2026-10-27T14:50:00Z", "vale a hora do aparelho (o envio pode ter esperado a internet)");
  assert.equal(p.detalheDoItem(prot.itens[1]), "2× · pellets: Testosterona 100mg ×2");
});

test("canal sugerido, valor da forma e as frases da lista", () => {
  assert.equal(p.canalSugerido([{ id: "proj", nome: "Projeto de Acompanhamento · 6 meses" }]), "PROGRAMA_ACOMPANHAMENTO");
  assert.equal(p.canalSugerido([{ id: "materno", nome: "Projeto Materno · 6 meses" }]), "PROGRAMA_ACOMPANHAMENTO");
  assert.equal(p.canalSugerido([{ id: "black", nome: "Consulta Black" }]), "CLUBE_BRATAN");
  assert.equal(p.canalSugerido([{ id: "tirz30", nome: "Tirzepatida" }]), "SOMENTE_TRATAMENTO");
  const opcoes = p.opcoesDoJson({ soma_itens: 1200, pix: 1296, parcelado_total: 1451.52, parcela: 241.92 });
  assert.equal(p.valorDaForma(opcoes, "PIX_A_VISTA"), 1296);
  assert.equal(p.valorDaForma(opcoes, "PARCELADO_6X"), 1451.52);
  assert.equal(p.resumoDosItens([{ nome: "A" }, { nome: "B" }, { nome: "C" }, { nome: "D" }, { nome: "E" }]), "A · B · C · e mais 2");
  const agora = Date.parse("2026-10-27T15:00:00Z");
  assert.equal(p.haQuantoTempo("2026-10-27T14:59:30Z", agora), "agora há pouco");
  assert.equal(p.haQuantoTempo("2026-10-27T14:20:00Z", agora), "há 40 min");
  assert.equal(p.haQuantoTempo("2026-10-27T10:00:00Z", agora), "há 5 h");
  assert.equal(p.haQuantoTempo("2026-10-24T15:00:00Z", agora), "há 3 dias");
  const base = p.protocoloDoBanco({ id: "1", client_ref: "prot-1", paciente_nome: "A B", status: "PRESCRITO", total: 1000, criado_em: "2026-10-27T10:00:00Z" });
  const lista = [base, { ...base, id: "2", status: "EM_NEGOCIACAO", criadoEm: "2026-10-27T12:00:00Z" }, { ...base, id: "3", status: "FECHADO" }];
  assert.deepEqual(plain(p.abertosDoMaisNovo(lista).map((x) => x.id)), ["2", "1"]);
  assert.match(p.fraseDaLista(p.abertosDoMaisNovo(lista)), /^2 protocolos esperando \(1 novo e 1 em negociação\), somando R\$\s?2\.000 à vista no Pix\.$/);
  assert.match(p.fraseDaLista([]), /Nenhum protocolo esperando/);
});

test("acesso: módulos doutor e fechamento, padrão coordenação, exceção vence nas duas direções (tela = banco)", () => {
  assert.ok(access.moduleKeys.includes("doutor") && access.moduleKeys.includes("fechamento"));
  for (const cargo of access.cargos) {
    const esperado = access.isCoordenacao(cargo) ? "EDITAR" : "OCULTO";
    assert.equal(access.moduleLevel({ cargo }, "doutor"), esperado, `doutor · ${cargo}`);
    assert.equal(access.moduleLevel({ cargo }, "fechamento"), esperado, `fechamento · ${cargo}`);
  }
  assert.equal(access.moduleLevel({ cargo: "enfermeira", acessos: { doutor: "EDITAR" } }, "doutor"), "EDITAR", "um médico de outro cargo ganha pela tela Acessos");
  assert.equal(access.moduleLevel({ cargo: "dr_daniel", acessos: { doutor: "OCULTO" } }, "doutor"), "OCULTO");
  assert.equal(access.moduleLevel({ cargo: "marketing", acessos: { fechamento: "VER" } }, "fechamento"), "VER");
  // O banco faz a mesma conta (CASE com a exceção primeiro, coordenação no padrão).
  for (const [funcao, modulo] of [["pode_enviar_protocolo", "doutor"], ["pode_ver_protocolos", "fechamento"], ["pode_negociar_protocolo", "fechamento"]]) {
    const corpo = MIGRACAO.slice(MIGRACAO.indexOf(`function public.${funcao}`));
    assert.match(corpo.slice(0, 600), new RegExp(`module_access_override\\(_user, '${modulo}'\\)`));
    assert.match(corpo.slice(0, 600), /else coalesce\(public\.is_coordenacao\(_user\), false\)/);
  }
});

test("a migração: numeração da frente, RLS ligada, políticas explícitas, sem apagar, idempotente", () => {
  assert.ok(fs.existsSync("supabase/migrations/202610280101_protocolo.sql"));
  assert.match(MIGRACAO, /create table if not exists public\.protocolo/);
  assert.match(MIGRACAO, /alter table public\.protocolo enable row level security;/);
  for (const politica of ["protocolo_select", "protocolo_insert", "protocolo_update"]) {
    assert.match(MIGRACAO, new RegExp(`drop policy if exists ${politica} on public\\.protocolo;\\s*create policy ${politica}`));
  }
  assert.doesNotMatch(MIGRACAO, /for delete/i, "protocolo errado vira CANCELADO, não some");
  assert.match(MIGRACAO, /revoke all on public\.protocolo from anon;/);
  assert.match(MIGRACAO, /client_ref text not null unique/);
  assert.match(MIGRACAO, /on conflict \(client_ref\) do nothing/, "o reenvio offline não duplica");
  assert.match(MIGRACAO, /revoke all on function public\.protocolo_enviar\(jsonb\) from public, anon;/);
  // O status do CHECK é a lista da tela (valor novo no código = conferir o CHECK).
  const check = MIGRACAO.match(/check \(status in \(([^)]+)\)\)/)[1];
  assert.deepEqual(check.match(/'([A-Z_]+)'/g).map((s) => s.slice(1, -1)), plain(p.STATUS_DO_PROTOCOLO));
  // A central (skill) já lê estas colunas: criado_em, status, fechado_em, total.
  for (const coluna of ["criado_em timestamptz", "fechado_em timestamptz", "total numeric(12, 2)", "status text"]) assert.ok(MIGRACAO.includes(coluna), coluna);
  // Nada de dado real: nenhum nome próprio, CPF ou chave no arquivo.
  assert.doesNotMatch(MIGRACAO, /\d{3}\.\d{3}\.\d{3}-\d{2}|eyJ[a-zA-Z0-9_-]{20,}|sk_live|service_role_key/);
});
