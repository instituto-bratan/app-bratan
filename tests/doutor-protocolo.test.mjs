// APP DO DOUTOR (28/10/2026): o plano da v22 vira o protocolo do sistema sem
// mudar a conta do doutor; a fila do aparelho nunca duplica e espera a
// internet/o login; e os arquivos estáticos respeitam a CSP do site (sem script
// em linha, sem Google Fonts) e não brigam com o service worker do 360.
// Valores e nomes fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const v22 = loadTs("src/doutor/protocoloDaV22.ts");
const fila = loadTs("src/doutor/filaDeEnvio.ts");
const ler = (arquivo) => fs.readFileSync(arquivo, "utf8");

/** Um plano como window.BratanPlano.retrato() devolve (conta da v22: soma, +8% no Pix, −10%, +12% no 6x). */
function retrato(extra = {}) {
  const soma = 2000;
  const avista = soma * 1.08;
  const desconto = avista * 0.1;
  const pix = avista - desconto;
  return {
    versao: "v22",
    nome: "Paciente Ficticio",
    linhas: [
      { id: "proj", nome: "Projeto de Acompanhamento · 6 meses", nomeParaPaciente: "Projeto de Acompanhamento", quantidadeTexto: "", nota: "6 meses", categoria: "Acompanhamento", unidade: "un", quantidade: 1, precoUnitario: 1000, precoDeTabela: 1000, valor: 1000, pellets: [] },
      { id: "tirz30", nome: "Tirzepatida · até 30 un", nomeParaPaciente: "Tirzepatida", quantidadeTexto: "4 doses", nota: "até 30 unidades por dose", categoria: "Composição corporal", unidade: "dose", quantidade: 4, precoUnitario: 100, precoDeTabela: 100, valor: 400, pellets: [] },
      { id: "implante", nome: "Honorários de Implante", nomeParaPaciente: "Implante hormonal", quantidadeTexto: "", nota: "", categoria: "Implante hormonal", unidade: "un", quantidade: 1, precoUnitario: 500, precoDeTabela: 500, valor: 600, pellets: [{ id: "t100", nome: "Testosterona 100mg", quantidade: 2, precoUnitario: 50, valor: 100 }] },
    ],
    totais: { soma, avistaSemDesconto: avista, desconto, pix, parceladoTotal: pix * 1.12, parcela: (pix * 1.12) / 6, parcelas: 6, fatorAvista: 1.08, fatorParcelado: 1.12 },
    desconto: { tipo: "pct", informado: 10, texto: "10" },
    numeroBra: "BRA-20261027-001",
    codigoBra: "BRAeyJ0IjoiUGFjaWVudGUifQ==",
    estado: { name: "Paciente Ficticio", lines: [] },
    ...extra,
  };
}

// ---------------------------------------------------------------- mapeamento

test("as linhas da v22 viram os itens do protocolo (com pellets e o detalhe que o vendedor lê)", () => {
  const itens = plain(v22.itensDoRetrato(retrato()));
  assert.equal(itens.length, 3);
  assert.deepEqual(itens.map((i) => i.valor), [1000, 400, 600]);
  assert.equal(itens[1].detalhe, "4 doses, até 30 unidades por dose");
  assert.equal(itens[0].detalhe, "6 meses");
  assert.equal(itens[1].nome_paciente, "Tirzepatida");
  assert.deepEqual(itens[2].pellets, [{ id: "t100", nome: "Testosterona 100mg", quantidade: 2, preco_unitario: 50, valor: 100 }]);
  assert.equal(itens.reduce((s, i) => s + i.valor, 0), 2000, "a soma dos itens é a soma do plano");
});

test("as opções de pagamento são as que a v22 calculou — e a conta refeita bate", () => {
  const opcoes = plain(v22.opcoesDoRetrato(retrato()));
  assert.equal(opcoes.soma_itens, 2000);
  assert.equal(opcoes.avista_sem_desconto, 2160);
  assert.equal(opcoes.desconto, 216);
  assert.equal(opcoes.pix, 1944, "o prescrito é o Pix");
  assert.equal(opcoes.parcelado_total, 2177.28);
  assert.equal(opcoes.parcela, 362.88);
  assert.deepEqual(plain(v22.calcularOpcoesV22(2000, { tipo: "pct", informado: 10 })), opcoes);
  // Desconto em reais acima do à vista não deixa o Pix negativo; % acima de 100 vira 100.
  assert.equal(v22.calcularOpcoesV22(1000, { tipo: "reais", informado: 5000 }).pix, 0);
  assert.equal(v22.calcularOpcoesV22(1000, { tipo: "pct", informado: 150 }).pix, 0);
  assert.equal(v22.calcularOpcoesV22(1000, { tipo: "reais", informado: 0 }).pix, 1080);
});

test("a v22 continua com a mesma regra de valor (8% no Pix, 12% no 6x) e expõe o retrato", () => {
  const plano = ler("public/doutor/plano.js");
  assert.match(plano, /var F_AVISTA=1\.08, F_PARC=1\.12;/);
  assert.match(plano, /var pix=Math\.max\(0,avB-desc\), parcTot=pix\*F_PARC;/);
  assert.match(plano, /window\.BratanPlano=\{/);
  for (const campo of ["quantidadeTexto", "nomeParaPaciente", "precoDeTabela", "avistaSemDesconto", "parceladoTotal", "numeroBra", "codigoBra"]) assert.ok(plano.includes(`${campo}:`), `retrato traz ${campo}`);
  assert.match(plano, /avisarPonte\('novo'\)/, "o 'Novo plano' avisa a ponte");
});

test("trava antes de enviar: plano vazio, sem nome ou com conta que não bate", () => {
  assert.equal(v22.travaDoRetrato(retrato()), null);
  assert.match(v22.travaDoRetrato(retrato({ linhas: [] })), /Adicione itens/);
  assert.match(v22.travaDoRetrato(retrato({ nome: " " })), /nome do paciente/);
  const torto = retrato();
  torto.totais = { ...torto.totais, pix: torto.totais.pix + 500 };
  assert.match(v22.travaDoRetrato(torto), /não confere com a regra/);
  assert.match(v22.travaDoRetrato(null), /não carregou/);
});

test("assinatura: o mesmo plano é o mesmo protocolo; mudou item, quantidade ou desconto, é versão nova", () => {
  const a = v22.assinaturaDoRetrato(retrato());
  assert.equal(v22.assinaturaDoRetrato(retrato({ nome: "  paciente   FICTICIO " })), a, "espaço e maiúscula não contam");
  const outraDose = retrato();
  outraDose.linhas = outraDose.linhas.map((l) => (l.id === "tirz30" ? { ...l, quantidade: 5, valor: 500 } : l));
  assert.notEqual(v22.assinaturaDoRetrato(outraDose), a);
  assert.notEqual(v22.assinaturaDoRetrato(retrato({ desconto: { tipo: "pct", informado: 5, texto: "5" } })), a);
});

test("o envio leva o que o banco confere (soma dos itens = soma do plano) e o plano inteiro da v22", () => {
  const envio = plain(v22.montarEnvio(retrato({ nome: " Paciente  Ficticio " }), { clientRef: "prot-teste-0001", agendaRef: "iclinic:ev1", contactRef: "contact-tel-1", substitui: null, agoraISO: "2026-10-27T15:00:00.000Z" }));
  assert.equal(envio.client_ref, "prot-teste-0001");
  assert.equal(envio.paciente_nome, "Paciente Ficticio");
  assert.equal(envio.agenda_ref, "iclinic:ev1");
  assert.equal(envio.contact_ref, "contact-tel-1");
  assert.equal(envio.opcoes_pagamento.pix, 1944);
  assert.equal(envio.itens.reduce((s, i) => s + i.valor, 0), envio.opcoes_pagamento.soma_itens);
  assert.equal(envio.payload.codigo_bra, "BRAeyJ0IjoiUGFjaWVudGUifQ==");
  assert.equal(envio.payload.versao, "v22");
  assert.equal(envio.numero_bra, "BRA-20261027-001");
  // Bate com o que protocolo_enviar exige.
  assert.match(envio.client_ref, /^[A-Za-z0-9_-]{8,80}$/);
});

// ---------------------------------------------------------------- fila

const AGORA = "2026-10-27T15:00:00.000Z";
let seq = 0;
const novoId = () => `prot-teste-${String(++seq).padStart(4, "0")}`;

test("idempotência: apertar Enviar duas vezes não cria dois protocolos", () => {
  let e = fila.estadoVazio;
  const um = fila.colocarNaFila(e, retrato(), { agoraISO: AGORA, novoId });
  e = um.estado;
  assert.equal(e.fila.length, 1);
  const dois = fila.colocarNaFila(e, retrato(), { agoraISO: AGORA, novoId });
  assert.equal(dois.clientRef, um.clientRef);
  assert.equal(dois.jaNaFila, true);
  assert.equal(dois.estado.fila.length, 1);
  // Subiu: sai da fila e fica lembrado; apertar de novo só diz que já está lá.
  e = fila.aoResponder(dois.estado, um.clientRef, { id: "u1" }, AGORA);
  assert.equal(e.fila.length, 0);
  assert.equal(e.enviados[0].clientRef, um.clientRef);
  const tres = fila.colocarNaFila(e, retrato(), { agoraISO: AGORA, novoId });
  assert.equal(tres.jaEnviado, true);
  assert.equal(tres.clientRef, um.clientRef);
  assert.equal(tres.estado.fila.length, 0);
});

test("versão nova do plano: substitui a que subiu; troca a que ainda esperava na fila", () => {
  const mudado = retrato();
  mudado.linhas = mudado.linhas.slice(0, 2);
  mudado.totais = { ...mudado.totais, soma: 1400 };
  // 1) a anterior já subiu → a nova leva "substitui"
  let e = fila.colocarNaFila(fila.estadoVazio, retrato(), { agoraISO: AGORA, novoId }).estado;
  const primeiro = e.fila[0].clientRef;
  e = fila.aoResponder(e, primeiro, { id: "u1" }, AGORA);
  const v2 = fila.colocarNaFila(e, mudado, { agoraISO: AGORA, novoId });
  assert.notEqual(v2.clientRef, primeiro);
  assert.equal(v2.estado.fila[0].envio.substitui, primeiro);
  // 2) a anterior ainda estava na fila (sem internet) → é trocada ali, sem "substitui"
  let off = fila.colocarNaFila(fila.estadoVazio, retrato(), { agoraISO: AGORA, novoId }).estado;
  const naFila = off.fila[0].clientRef;
  off = fila.colocarNaFila(off, mudado, { agoraISO: AGORA, novoId }).estado;
  assert.equal(off.fila.length, 1);
  assert.notEqual(off.fila[0].clientRef, naFila);
  assert.equal(off.fila[0].envio.substitui, null);
  // 3) outro paciente não substitui ninguém
  const outro = fila.colocarNaFila(e, retrato({ nome: "Outra Pessoa Ficticia" }), { agoraISO: AGORA, novoId });
  assert.equal(outro.estado.fila.at(-1).envio.substitui, null);
});

test("falhas: rede e login esperam; recusa do banco para a fila até o doutor apertar de novo", () => {
  assert.equal(fila.classificarFalha(new TypeError("Failed to fetch")).definitiva, false);
  assert.equal(fila.classificarFalha({ message: "Load failed" }).definitiva, false);
  assert.equal(fila.classificarFalha({ code: "28000", message: "Entre no sistema para enviar o protocolo." }).precisaEntrar, true);
  assert.equal(fila.classificarFalha({ code: "PGRST301", message: "JWT expired" }).precisaEntrar, true);
  assert.equal(fila.classificarFalha({ code: "42501", message: "Seu acesso não envia protocolo" }).definitiva, true);
  assert.equal(fila.classificarFalha({ code: "22023", message: "O protocolo está sem itens." }).definitiva, true);
  let e = fila.colocarNaFila(fila.estadoVazio, retrato(), { agoraISO: AGORA, novoId }).estado;
  const ref = e.fila[0].clientRef;
  e = fila.aoFalhar(e, ref, fila.classificarFalha({ code: "42501", message: "Seu acesso não envia protocolo" }));
  assert.equal(e.fila[0].parado, true);
  assert.equal(fila.prontosParaEnviar(e).length, 0);
  const deNovo = fila.colocarNaFila(e, retrato(), { agoraISO: AGORA, novoId });
  assert.equal(deNovo.clientRef, ref, "o mesmo protocolo, não um novo");
  assert.equal(fila.prontosParaEnviar(deNovo.estado).length, 1, "apertar de novo destrava");
});

test("a frase embaixo do botão sempre diz onde o protocolo está", () => {
  const a = v22.assinaturaDoRetrato(retrato());
  const ctx = { temSessao: true, online: true, enviando: false };
  assert.equal(fila.situacaoDoPlano(fila.estadoVazio, null, ctx).tipo, "vazio");
  assert.equal(fila.situacaoDoPlano(fila.estadoVazio, a, ctx).tipo, "nunca");
  const naFila = fila.colocarNaFila(fila.estadoVazio, retrato(), { agoraISO: AGORA, novoId }).estado;
  assert.match(fila.situacaoDoPlano(naFila, a, { ...ctx, temSessao: false }).texto, /Entre no sistema/);
  assert.match(fila.situacaoDoPlano(naFila, a, { ...ctx, online: false }).texto, /internet voltar/);
  assert.equal(fila.situacaoDoPlano(naFila, a, { ...ctx, enviando: true }).tipo, "enviando");
  const subiu = fila.aoResponder(naFila, naFila.fila[0].clientRef, { id: "u1" }, AGORA);
  assert.equal(fila.situacaoDoPlano(subiu, a, ctx).tipo, "enviado");
  assert.match(fila.situacaoDoPlano(subiu, a, ctx).texto, /^Enviado ao sistema ✓/);
  const mudado = retrato({ desconto: { tipo: "pct", informado: 5, texto: "5" } });
  assert.equal(fila.situacaoDoPlano(subiu, v22.assinaturaDoRetrato(mudado), ctx).tipo, "mudou");
});

test("vínculo com a agenda: cai se o doutor trocar o nome; 'Novo plano' zera; estado torto não quebra", () => {
  let e = fila.vincularAgenda(fila.estadoVazio, { agendaRef: "iclinic:ev1", contactRef: "contact-1", nome: "José da Silva" });
  assert.equal(fila.conferirNomeDaAgenda(e, "  JOSÉ DA SILVA ").vinculo.agendaRef, "iclinic:ev1", "mesmo nome, outra grafia");
  assert.equal(fila.conferirNomeDaAgenda(e, "Jose da Silva").vinculo.agendaRef, "iclinic:ev1", "sem acento também");
  assert.equal(fila.conferirNomeDaAgenda(e, "Maria Souza").vinculo.agendaRef, null);
  e = fila.novoPlano(e);
  assert.deepEqual(plain(e.vinculo), plain(fila.vinculoVazio));
  assert.deepEqual(plain(fila.lerEstado("lixo")), plain(fila.estadoVazio));
  assert.deepEqual(plain(fila.lerEstado({ fila: [{ semNada: 1 }], enviados: "x", vinculo: { clientRef: 5 } })), plain(fila.estadoVazio));
});

// ---------------------------------------------------------------- arquivos estáticos e roteamento

test("a página do doutor não tem script em linha nem Google Fonts (CSP script-src 'self')", () => {
  const pagina = ler("doutor/index.html");
  const scripts = [...pagina.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(scripts.map((s) => s[1].trim()), ['src="/doutor/plano.js"', 'type="module" src="/src/doutor/ponte.ts"'], "a v22 roda antes da ponte");
  for (const s of scripts) assert.equal(s[2].trim(), "", "nenhum script em linha");
  assert.doesNotMatch(pagina, /\son[a-z]+="/i, "nenhum onclick em linha");
  assert.doesNotMatch(pagina, /googleapis|gstatic/);
  assert.match(pagina, /<link rel="manifest" href="\/doutor\/manifest\.webmanifest">/);
  for (const id of ["ptConta", "ptAgenda", "ptVinculo", "ptEnvio", "ptEnviar", "ptSituacao", "ptModal", "ptCard", "pName"]) assert.ok(pagina.includes(`id="${id}"`), `a ponte acha #${id}`);
  const apresentacao = ler("public/doutor/apresentacao.html");
  assert.doesNotMatch(apresentacao, /<script>(?!<\/script>)/, "a apresentação também sem script em linha");
  assert.match(apresentacao, /<script src="\/doutor\/apresentacao\.js"><\/script>/);
  assert.doesNotMatch(apresentacao + ler("public/doutor/plano.css") + ler("public/doutor/plano.js") + ler("public/doutor/apresentacao.js"), /googleapis|gstatic/);
  assert.match(ler("public/doutor/plano.css"), /--sans:'Jost','Avenir Next',Avenir,system-ui/);
});

test("manifesto e service worker do doutor: escopo /doutor/, sem apagar o cache do 360 (e vice-versa)", () => {
  const manifesto = JSON.parse(ler("public/doutor/manifest.webmanifest"));
  assert.equal(manifesto.id, "/doutor/");
  assert.equal(manifesto.scope, "/doutor/");
  assert.equal(manifesto.start_url, "/doutor/");
  for (const icone of manifesto.icons) assert.ok(fs.existsSync(`public${icone.src}`), icone.src);
  const sw = ler("public/doutor/sw.js");
  assert.match(sw, /const PREFIXO = "bratan-doutor-";/);
  assert.match(sw, /k\.startsWith\(PREFIXO\) && k !== CACHE/, "só apaga os próprios caches");
  assert.match(sw, /if \(url\.origin !== self\.location\.origin\) return;/, "o Supabase vai sempre direto para a rede");
  assert.match(ler("public/doutor/plano.js"), /navigator\.serviceWorker\.register\('\/doutor\/sw\.js',\{scope:'\/doutor\/'\}\)/);
  const sw360 = ler("public/sw.js");
  assert.match(sw360, /key\.startsWith\(PREFIXO\) && key !== CACHE/);
  assert.match(sw360, /if \(url\.pathname === "\/doutor" \|\| url\.pathname\.startsWith\("\/doutor\/"\)\) return;/);
});

test("Vercel: /doutor/* é estático, o login do doutor cai no 360, só a apresentação aceita moldura do próprio site", () => {
  const vercel = JSON.parse(ler("vercel.json"));
  assert.deepEqual(vercel.rewrites, [
    { source: "/doutor/entrar", destination: "/index.html" },
    { source: "/((?!doutor/).*)", destination: "/index.html" },
  ]);
  assert.deepEqual(vercel.redirects, [{ source: "/doutor", destination: "/doutor/", permanent: false }]);
  const csp = (regra) => regra.headers.find((h) => h.key === "Content-Security-Policy").value;
  const geral = vercel.headers.find((h) => h.source === "/((?!doutor/apresentacao\\.html).*)");
  const apresentacao = vercel.headers.find((h) => h.source === "/doutor/apresentacao.html");
  assert.ok(geral && apresentacao);
  assert.match(csp(geral), /frame-ancestors 'none'/);
  assert.match(csp(apresentacao), /frame-ancestors 'self'/);
  assert.equal(apresentacao.headers.find((h) => h.key === "X-Frame-Options").value, "SAMEORIGIN");
  for (const regra of [geral, apresentacao]) {
    assert.match(csp(regra), /script-src 'self';/, "nenhuma das duas abre script em linha");
    assert.doesNotMatch(csp(regra), /unsafe-eval|script-src[^;]*unsafe-inline/);
  }
  assert.equal(csp(geral).replace("'none'", "'self'"), csp(apresentacao), "fora a moldura, a mesma CSP");
  const vite = ler("vite.config.ts");
  assert.match(vite, /doutor: path\.resolve\(__dirname, "doutor\/index\.html"\)/);
  const app = ler("src/App.tsx");
  assert.match(app, /<Route path="\/doutor\/entrar" element=\{<LoginPage voltarPara="\/doutor\/" \/>\} \/>/);
  assert.match(ler("src/routes/LoginPage.tsx"), /redirectTo\.startsWith\("\/doutor\/"\)/);
});
