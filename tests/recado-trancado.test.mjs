// O RECADO TRANCADO (27/10/2026) — Meu Bratan, motivo para abrir.
//
// O que se protege aqui:
//  · a data: padrão de 15 dias, nunca "abre hoje", o "porquê" no dia 45 do plano;
//  · o cadeado: antes da data o portal recebe só a contagem — nunca caminho nem
//    link; o link é curto e só sai depois de abre_em, só para o dono;
//  · o aviso no celular sem dado clínico, uma vez por recado, num agendamento
//    que NÃO roda sozinho (fica fora das migrações);
//  · as 3 camadas de quem grava: tela (acessoDoPortal.ts), banco (RLS) e função;
//  · apagar a conta leva o "porquê" do paciente junto.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const mod = loadTs("supabase/functions/_shared/recadoTrancado.ts");
const acesso = loadTs("src/lib/acessoDoPortal.ts");
const conta = loadTs("supabase/functions/_shared/contaDoPortal.ts");
const HOJE = "2026-10-27";

test("a data do recado do Dr.: padrão de 15 dias, a partir de amanhã, até um ano", () => {
  assert.equal(mod.abreEmPadrao(HOJE), "2026-11-11");
  assert.match(mod.validarAberturaDoDoutor(HOJE, HOJE), /a partir de amanhã/);
  assert.match(mod.validarAberturaDoDoutor("2026-10-01", HOJE), /a partir de amanhã/);
  assert.equal(mod.validarAberturaDoDoutor("2026-10-28", HOJE), "");
  assert.equal(mod.validarAberturaDoDoutor("2027-10-27", HOJE), "", "um ano certinho vale");
  assert.match(mod.validarAberturaDoDoutor("2027-10-28", HOJE), /um ano/);
  assert.match(mod.validarAberturaDoDoutor("", HOJE), /Escolha o dia/);
});

test("o 'por que eu comecei' abre no dia 45 do plano; tarde demais (ou sem plano), 45 dias depois de gravar", () => {
  assert.deepEqual(plain(mod.quandoAbreOPorque("2026-10-20", HOJE)), { abreEm: "2026-12-03", noDia45DoPlano: true }, "dia 1 = fechamento; dia 45 = +44");
  assert.deepEqual(plain(mod.quandoAbreOPorque("2026-09-15", HOJE)), { abreEm: "2026-12-11", noDia45DoPlano: false }, "faltavam 2 dias para o dia 45");
  assert.deepEqual(plain(mod.quandoAbreOPorque("2026-06-01", HOJE)), { abreEm: "2026-12-11", noDia45DoPlano: false }, "dia 45 já passou");
  assert.deepEqual(plain(mod.quandoAbreOPorque(null, HOJE)), { abreEm: "2026-12-11", noDia45DoPlano: false });
  assert.deepEqual(plain(mod.quandoAbreOPorque("lixo", HOJE)), { abreEm: "2026-12-11", noDia45DoPlano: false });
});

test("trancado, novo e ouvido — e a contagem do cadeado", () => {
  assert.equal(mod.estadoDoRecado({ abreEm: "2026-10-28", ouvidoEm: null }, HOJE), "TRANCADO");
  assert.equal(mod.estadoDoRecado({ abreEm: HOJE, ouvidoEm: null }, HOJE), "NOVO", "no dia, abre");
  assert.equal(mod.estadoDoRecado({ abreEm: "2026-10-20", ouvidoEm: "2026-10-21T12:00:00Z" }, HOJE), "OUVIDO");
  assert.equal(mod.recadoAberto("2026-10-28", HOJE), false);
  assert.equal(mod.recadoAberto("", HOJE), false, "data que não presta não abre");
  assert.deepEqual(plain(mod.contagemDoRecado("2026-11-08", HOJE)), { dias: 12, frase: "faltam 12 dias" });
  assert.deepEqual(plain(mod.contagemDoRecado("2026-10-28", HOJE)), { dias: 1, frase: "abre amanhã" });
  assert.deepEqual(plain(mod.contagemDoRecado(HOJE, HOJE)), { dias: 0, frase: "abre hoje" });
  // O dia é o de São Paulo: 01h UTC do dia 28 ainda é dia 27 lá.
  assert.equal(mod.hojeEmSaoPaulo(Date.parse("2026-10-28T01:00:00Z")), "2026-10-27");
  assert.equal(mod.hojeEmSaoPaulo(Date.parse("2026-10-28T03:00:00Z")), "2026-10-28");
});

test("o aviso no celular não leva dado clínico, nome nem data", () => {
  assert.deepEqual(plain(mod.textoDoAvisoDeRecado("DOUTOR")), { title: "Meu Bratan", body: "O recado do Dr. abriu." });
  assert.deepEqual(plain(mod.textoDoAvisoDeRecado("PACIENTE")), { title: "Meu Bratan", body: "O seu recado abriu." });
});

test("o áudio: só áudio aceito pelo bucket, até 1 minuto e 3 MB; duração inteira de 1 a 60", () => {
  assert.equal(mod.validarAudioDoRecado("audio/mp4", 500_000, 42), "");
  assert.equal(mod.validarAudioDoRecado("audio/webm;codecs=opus", 300_000, 60), "", "o codec não atrapalha");
  assert.equal(mod.validarAudioDoRecado("audio/mp4", 500_000, 61), "", "1 s de folga do relógio");
  assert.match(mod.validarAudioDoRecado("audio/mp4", 500_000, 62), /até 1 minuto/);
  assert.match(mod.validarAudioDoRecado("video/mp4", 500_000, 42), /formato/);
  assert.match(mod.validarAudioDoRecado("audio/flac", 500_000, 42), /formato/, "fora da lista do bucket");
  assert.match(mod.validarAudioDoRecado("audio/mp4", 0, 42), /vazio/);
  assert.match(mod.validarAudioDoRecado("audio/mp4", 4 * 1024 * 1024, 42), /grande demais/);
  assert.match(mod.validarAudioDoRecado("audio/mp4", 500_000, 0.4), /pelo menos 1 segundo/);
  assert.match(mod.validarAudioDoRecado("audio/mp4", 500_000, null), /pelo menos 1 segundo/);
  assert.equal(mod.duracaoDoRecado(60.4), 60);
  assert.equal(mod.duracaoDoRecado(0.2), 1);
  assert.equal(mod.duracaoDoRecado(42.6), 43);
  assert.equal(mod.duracaoDoRecadoTexto(42), "0:42");
  assert.equal(mod.duracaoDoRecadoTexto(60), "1:00");
});

test("o arquivo mora na pasta do autor: a equipe só alcança doutor/", () => {
  assert.equal(mod.caminhoDoRecado("DOUTOR", "contact-abc", "id1", "audio/mp4"), "doutor/contact-abc/id1.m4a");
  assert.equal(mod.caminhoDoRecado("PACIENTE", "contact x/y", "id2", "audio/webm;codecs=opus"), "paciente/contact_x_y/id2.webm");
  assert.equal(mod.caminhoDoRecado("DOUTOR", "c", "id3", "audio/mpeg"), "doutor/c/id3.mp3");
  assert.equal(mod.limparQuemFala("   "), "Dr. Daniel");
  assert.equal(mod.limparQuemFala("Dra.   Exemplo  "), "Dra. Exemplo");
  assert.equal(mod.limparQuemFala("x".repeat(80)).length, 40);
});

test("a lista de tipos é a mesma do bucket da migração", () => {
  const sql = ler("supabase/migrations/202610280401_recado_trancado.sql");
  const doBucket = sql.match(/array\[([^\]]+)\]/)[1].split(",").map((tipo) => tipo.trim().replace(/'/g, ""));
  assert.deepEqual(doBucket, [...mod.RECADO_TIPOS]);
  assert.match(sql, /values \('paciente-recados', 'paciente-recados', false, 3145728/, "bucket privado de 3 MB");
  assert.equal(mod.RECADO_MAX_BYTES, 3145728);
  assert.equal(mod.RECADO_BUCKET, "paciente-recados");
});

test("banco: RLS ligada, a equipe só vê e grava recado do DOUTOR, e o storage só deixa a pasta doutor/", () => {
  const sql = ler("supabase/migrations/202610280401_recado_trancado.sql");
  assert.match(sql, /alter table public\.paciente_recado enable row level security/);
  assert.match(sql, /create policy paciente_recado_select[\s\S]*?using \(autor = 'DOUTOR' and \(select public\.pode_recado_do_doutor\(auth\.uid\(\)\)\)\)/);
  const insert = sql.slice(sql.indexOf("create policy paciente_recado_insert"), sql.indexOf("drop policy if exists paciente_recado_delete"));
  for (const trava of ["autor = 'DOUTOR'", "storage_path like 'doutor/%'", "ouvido_em is null", "aviso_enviado_em is null", "abre_em > (now() at time zone 'America/Sao_Paulo')::date"]) {
    assert.ok(insert.includes(trava), `a política de gravar não tem: ${trava}`);
  }
  assert.match(sql, /create policy paciente_recado_delete[\s\S]*?ouvido_em is null/, "recado ouvido não se apaga");
  assert.doesNotMatch(sql, /for update/, "sem política de UPDATE");
  assert.match(sql, /revoke all on table public\.paciente_recado from anon, authenticated/);
  assert.doesNotMatch(sql, /to anon/, "nada para a chave anônima");
  const storage = sql.slice(sql.indexOf("paciente_recados_storage_select"));
  assert.equal((storage.match(/\(storage\.foldername\(name\)\)\[1\] = 'doutor'/g) ?? []).length, 3, "ler, subir e apagar: só em doutor/");
  assert.match(sql, /constraint paciente_recado_pasta_do_autor/);
});

test("tela e banco concordam em quem grava o recado do Dr. (médicos e coordenação)", () => {
  const sql = ler("supabase/migrations/202610280401_recado_trancado.sql");
  assert.match(sql, /select public\.is_coordenacao\(_user\) or public\.has_cargo\(_user, 'dr_daniel'\)/);
  for (const cargo of ["dr_daniel", "ceo", "gestor", "gestor_financeiro", "secretaria_executiva"]) assert.equal(acesso.podeGravarRecadoDoDoutor(cargo), true, cargo);
  for (const cargo of ["recepcionista", "enfermeira", "nutricionista", "marketing", "limpeza", null, undefined]) assert.equal(acesso.podeGravarRecadoDoDoutor(cargo), false, String(cargo));
  // A ficha só mostra a gravação para quem pode.
  assert.match(ler("src/features/portal/PortalDoPacienteCard.tsx"), /podeGravarRecadoDoDoutor\(cargo\) \? <RecadoDoDoutorNaFicha/);
});

test("função do portal: antes da data, nada de caminho nem link; depois, link curto só para o dono", () => {
  const funcao = ler("supabase/functions/portal-paciente/index.ts");
  const url = funcao.slice(funcao.indexOf('entrada.acao === "recado_url"'), funcao.indexOf('entrada.acao === "recado_ouvido"'));
  assert.match(url, /\.eq\("contact_ref", contactRef\)/, "só recado deste paciente");
  assert.ok(url.indexOf("recadoAberto(") > 0 && url.indexOf("recadoAberto(") < url.indexOf("createSignedUrl"), "confere a data ANTES de assinar o link");
  assert.match(url, /createSignedUrl\(String\(recado\.storage_path\), RECADO_URL_SEGUNDOS\)/);
  assert.ok(mod.RECADO_URL_SEGUNDOS <= 600, "link curto");
  // Em "dados" o recado vai sem caminho do arquivo.
  const dados = funcao.slice(funcao.indexOf("RECADOS TRANCADOS e SEMANA X DE N"));
  const selecao = dados.match(/from\("paciente_recado"\)\.select\("([^"]+)"\)/)[1];
  assert.doesNotMatch(selecao, /storage_path/);
  assert.doesNotMatch(dados.slice(0, dados.indexOf("let semana")), /createSignedUrl/);
  // O paciente só apaga o que ele mesmo gravou; a data do "porquê" é do servidor.
  const apagar = funcao.slice(funcao.indexOf('entrada.acao === "recado_apagar"'), funcao.indexOf('entrada.acao === "checkin"'));
  assert.match(apagar, /\.eq\("contact_ref", contactRef\)\.eq\("autor", "PACIENTE"\)/);
  const gravar = funcao.slice(funcao.indexOf('entrada.acao === "recado_gravar"'), funcao.indexOf('entrada.acao === "recado_apagar"'));
  assert.match(gravar, /quandoAbreOPorque\(await inicioDoPlanoAtual\(\), hoje\)/);
  assert.match(gravar, /caminhoDoRecado\("PACIENTE"/);
  assert.match(gravar, /validarAudioDoRecado\(/);
  // Ouvir marca uma vez, só depois de abrir.
  const ouvido = funcao.slice(funcao.indexOf('entrada.acao === "recado_ouvido"'), funcao.indexOf('entrada.acao === "recado_gravar"'));
  assert.match(ouvido, /\.is\("ouvido_em", null\)\.lte\("abre_em", hojeEmSaoPaulo\(\)\)/);
});

test("apagar a conta leva o 'porquê' do paciente (arquivo e linha) e as respostas do check-in", () => {
  const funcao = ler("supabase/functions/portal-paciente/index.ts");
  const bloco = funcao.slice(funcao.indexOf('entrada.acao === "apagar_conta"'), funcao.indexOf('entrada.acao === "sair_de_todos"'));
  assert.match(bloco, /storage\.from\(RECADO_BUCKET\)\.remove/);
  assert.match(bloco, /from\("paciente_recado"\)\.delete\(\)\.eq\("contact_ref", contactRef\)\.eq\("autor", "PACIENTE"\)/, "o recado do Dr. é do Instituto e fica");
  assert.match(bloco, /from\("paciente_checkin"\)\.delete\(/);
  assert.ok(conta.O_QUE_SE_APAGA.some((item) => /recado de voz/.test(item)));
  assert.ok(conta.O_QUE_SE_APAGA.some((item) => /check-in/.test(item)));
});

test("aviso do recado aberto: rotina da push-paciente, uma vez por recado, só para acesso ativo", () => {
  const push = ler("supabase/functions/push-paciente/index.ts");
  assert.match(push, /rotina === "recados" \? await recadosQueAbriram\(client\) : await resumoDeSexta\(client\)/);
  const rotina = push.slice(push.indexOf("async function recadosQueAbriram"), push.indexOf("Deno.serve"));
  assert.match(rotina, /\.is\("aviso_enviado_em", null\)/);
  assert.match(rotina, /\.is\("revogado_em", null\)/);
  assert.match(rotina, /textoDoAvisoDeRecado\(autor\)/);
  assert.match(rotina, /update\(\{ aviso_enviado_em: new Date\(\)\.toISOString\(\) \}\)\.in\("id", lista\.map/, "marca todos, com ou sem celular");
  assert.doesNotMatch(rotina, /quem_fala|duracao|storage_path/, "o aviso não lê nada do conteúdo");
});

test("o agendamento diário fica FORA das migrações, documentado e sem segredo", () => {
  const caminho = "supabase/agendamentos/portal-recados-abertos.sql";
  const sql = ler(caminho);
  assert.match(sql, /NÃO É MIGRAÇÃO/);
  assert.match(sql, /select cron\.schedule\(\s*'portal-recados-abertos',\s*'0 12 \* \* \*'/);
  assert.match(sql, /\/functions\/v1\/push-paciente\?rotina=recados/);
  assert.match(sql, /cron\.unschedule\('portal-recados-abertos'\)/, "diz como desligar");
  assert.doesNotMatch(sql, /eyJ|service_role|sb_secret|apikey\s*[:=]/i, "nenhuma chave no arquivo");
  for (const migracao of fs.readdirSync(path.join(repoRoot, "supabase/migrations"))) {
    assert.doesNotMatch(ler(`supabase/migrations/${migracao}`), /portal-recados-abertos/, `${migracao} agendaria o aviso sozinho`);
  }
});

test("o áudio toca no site e grava no app: CSP com media-src e microfone no Info.plist", () => {
  const csp = JSON.parse(ler("vercel.json")).headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
  assert.match(csp, /media-src 'self' blob: https:\/\/\*\.supabase\.co/, "link assinado do storage e prévia da gravação");
  assert.match(csp, /img-src [^;]*https:\/\/\*\.supabase\.co/, "foto de evolução (link assinado) também abre");
  const permissoes = JSON.parse(ler("vercel.json")).headers[0].headers.find((h) => h.key === "Permissions-Policy").value;
  assert.match(permissoes, /microphone=\(self\)/);
  assert.match(ler("ios/App/App/Info.plist"), /<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]*recado[^<]*<\/string>/);
});

test("o pacote do paciente não leva telas da equipe (a gravação do Dr. e o editor das semanas ficam fora)", () => {
  for (const arquivo of ["src/features/portal/PortalPacienteApp.tsx", "src/features/portal/RecadosDoPortal.tsx", "src/features/portal/SemanaDoPlano.tsx", "src/features/portal/AvisoDaPolitica.tsx"]) {
    const texto = ler(arquivo);
    assert.doesNotMatch(texto, /RecadoDoDoutorNaFicha|SemanasDoPortalPage|CheckinsNaFicha|@\/lib\/remote\/|PortalDoPacienteCard/, `${arquivo} puxaria tela da equipe para o app`);
  }
});

test("a política de privacidade fala do que é novo, com data", () => {
  const politica = ler("src/features/portal/PoliticaDePrivacidade.tsx");
  assert.match(politica, /ATUALIZADA_EM = "27 de outubro de 2026"/);
  assert.match(politica, /check-in da semana/);
  assert.match(politica, /recados de voz/);
  assert.match(politica, /Ninguém da equipe ouve/);
});
