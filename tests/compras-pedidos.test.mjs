// PEDIDOS DE COMPRA POR SETOR (06/10/2026).
//
// Lucas: "cada setor ou cada usuário vai fazer o seu pedido de compra e eu vou
// autorizar e levar para frente." A máquina de estados mora em dois lugares —
// src/features/compras/comprasData.ts (tela e prévia) e as funções do banco em
// supabase/migrations/202610060001_pedidos_de_compra.sql — e estes testes
// seguram que os dois digam a mesma coisa: quem pode o quê, de qual status
// para qual, com quais frases; e que os três setores antigos do estoque
// continuam com EXATAMENTE a mesma regra de quem mexe e quem vê.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const c = loadTs("src/features/compras/comprasData.ts");
const es = loadTs("src/features/estoque/estoqueData.ts");
const access = loadTs("src/lib/access.ts");
const sql = ler("supabase/migrations/202610060001_pedidos_de_compra.sql");
const sqlSemComentario = sql.replace(/--.*$/gm, "");

/** O corpo (entre $$) de uma função da migração. */
function corpo(nome) {
  const achado = new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`).exec(sql);
  assert.ok(achado, `função ${nome} não encontrada na migração`);
  return achado[1].replace(/--.*$/gm, "");
}

const HOJE = "2026-10-06"; // terça-feira
const AGORA = "2026-10-06T13:00:00.000Z";

const pessoas = {
  lucas: { id: "col-lucas", nome: "Lucas", cargo: "gestor_financeiro", acessos: {} },
  ceo: { id: "col-ceo", nome: "Andrya", cargo: "ceo", acessos: {} },
  dr: { id: "col-dr", nome: "Dr. Daniel", cargo: "dr_daniel", acessos: {} },
  estevao: { id: "col-gestor", nome: "Estevão", cargo: "gestor", acessos: {} },
  aline: { id: "col-aline", nome: "Aline", cargo: "secretaria_executiva", acessos: {} },
  juliana: { id: "col-enf", nome: "Juliana", cargo: "enfermeira", acessos: {} },
  recepcao: { id: "col-rec", nome: "Recepção", cargo: "recepcionista", acessos: {} },
  nutri: { id: "col-nutri", nome: "Géssica", cargo: "nutricionista", acessos: {} },
  limpeza: { id: "col-limp", nome: "Limpeza", cargo: "limpeza", acessos: {} },
  marketing: { id: "col-mkt", nome: "Marketing", cargo: "marketing", acessos: {} },
};

const rascunho = (extra = {}) => ({
  setor: "ENFERMAGEM",
  titulo: "",
  justificativa: "Acabam antes da próxima entrega.",
  urgencia: "NORMAL",
  precisaAte: null,
  itens: [
    { estoqueItemRef: null, descricao: "Luva nitrílica M", quantidade: 10, unidade: "cx", valorUnitario: 32.5, link: "" },
    { estoqueItemRef: null, descricao: "Álcool 70%", quantidade: 6, unidade: "un", valorUnitario: null, link: "" },
  ],
  ...extra,
});

function enviado(ator = pessoas.juliana, extra = {}) {
  const r = c.aplicarAcao(null, "ENVIAR", ator, AGORA, { rascunho: rascunho(extra), novo: { id: "cped-11111111-1111-4111-8111-111111111111", numero: 7 } });
  assert.equal(r.ok, true, r.erro);
  return r.pedido;
}
const passo = (pedido, acao, ator, dados = {}) => c.aplicarAcao(pedido, acao, ator, AGORA, dados);
const compra = { compraRef: "fpur-abc", fornecedor: "Stin Pharma", valorFinal: 325, previsaoEntrega: "2026-10-09" };

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------

test("máquina de estados: exatamente as transições do fluxograma, nenhuma a mais", () => {
  const validas = new Set([
    "null>ENVIAR",
    "DEVOLVIDO>REENVIAR",
    "ENVIADO>APROVAR",
    "ENVIADO>DEVOLVER",
    "ENVIADO>RECUSAR",
    "ENVIADO>CANCELAR",
    "DEVOLVIDO>CANCELAR",
    "APROVADO>CANCELAR",
    "APROVADO>COMPRAR",
    "COMPRADO>DESFAZER_COMPRA",
    "COMPRADO>RECEBER",
  ]);
  const acoes = Object.keys(c.MAQUINA_DO_PEDIDO);
  assert.equal(acoes.length, 9);
  for (const de of [null, ...c.pedidoStatusEmOrdem]) {
    for (const acao of acoes) {
      assert.equal(c.podeTransicionar(de, acao), validas.has(`${de}>${acao}`), `${de} → ${acao}`);
    }
  }
  assert.equal(c.MAQUINA_DO_PEDIDO.APROVAR.para, "APROVADO");
  assert.equal(c.MAQUINA_DO_PEDIDO.DESFAZER_COMPRA.para, "APROVADO");
  assert.equal(c.MAQUINA_DO_PEDIDO.RECEBER.para, "RECEBIDO");
});

test("caminho feliz: enfermagem pede → Lucas aprova → financeiro compra → enfermagem recebe", () => {
  const p1 = enviado();
  assert.equal(p1.status, "ENVIADO");
  assert.equal(p1.solicitanteId, "col-enf");
  assert.equal(p1.titulo, "Luva nitrílica M e mais 1");
  assert.equal(p1.valorEstimado, 325);
  assert.deepEqual(plain(p1.eventos.map((e) => e.tipo)), ["CRIADO"]);

  const p2 = passo(p1, "APROVAR", pessoas.lucas);
  assert.equal(p2.ok, true);
  assert.equal(p2.pedido.status, "APROVADO");
  assert.equal(p2.pedido.decididoPor, "col-lucas");

  const p3 = passo(p2.pedido, "COMPRAR", pessoas.lucas, { compra });
  assert.equal(p3.ok, true);
  assert.equal(p3.pedido.status, "COMPRADO");
  assert.equal(p3.pedido.compraRef, "fpur-abc");
  assert.equal(p3.pedido.fornecedor, "Stin Pharma");

  const recebimento = { itens: p3.pedido.itens.map((item) => ({ itemId: item.id, qtdRecebida: item.quantidade })), divergencia: "" };
  const p4 = passo(p3.pedido, "RECEBER", pessoas.juliana, { recebimento });
  assert.equal(p4.ok, true);
  assert.equal(p4.pedido.status, "RECEBIDO");
  assert.deepEqual(plain(p4.pedido.itens.map((i) => i.qtdRecebida)), [10, 6]);
  assert.deepEqual(plain(p4.pedido.eventos.map((e) => e.tipo)), ["CRIADO", "APROVADO", "COMPRADO", "RECEBIDO"]);
  assert.equal(p1.status, "ENVIADO", "aplicarAcao nunca muda o pedido recebido");
});

test("devolver exige motivo, volta ao setor, e o reenvio limpa a decisão", () => {
  const p1 = enviado();
  assert.deepEqual(plain(passo(p1, "DEVOLVER", pessoas.lucas, { nota: "ok" })), { ok: false, erro: "Diga o motivo para devolver: pelo menos 3 letras." });
  assert.deepEqual(plain(passo(p1, "RECUSAR", pessoas.lucas, { nota: "  " })), { ok: false, erro: "Diga o motivo para recusar: pelo menos 3 letras." });
  const devolvido = passo(p1, "DEVOLVER", pessoas.lucas, { nota: "Mande 2 orçamentos" }).pedido;
  assert.equal(devolvido.status, "DEVOLVIDO");
  assert.equal(devolvido.decisaoNota, "Mande 2 orçamentos");

  const reenviado = passo(devolvido, "REENVIAR", pessoas.juliana, { rascunho: rascunho({ justificativa: "Com os dois orçamentos no link." }) });
  assert.equal(reenviado.ok, true);
  assert.equal(reenviado.pedido.status, "ENVIADO");
  assert.equal(reenviado.pedido.id, p1.id, "reenvio mantém o mesmo pedido");
  assert.equal(reenviado.pedido.decisaoNota, "");
  assert.equal(reenviado.pedido.decididoPor, null);
  assert.deepEqual(plain(reenviado.pedido.eventos.map((e) => e.tipo)), ["CRIADO", "DEVOLVIDO", "REENVIADO"]);

  const recusado = passo(reenviado.pedido, "RECUSAR", pessoas.lucas, { nota: "Fora do orçamento do mês" });
  assert.equal(recusado.pedido.status, "RECUSADO");
  assert.equal(passo(recusado.pedido, "REENVIAR", pessoas.juliana, { rascunho: rascunho() }).ok, false, "recusado não volta");
});

test("transições proibidas falham com a frase do banco", () => {
  const p1 = enviado();
  const aprovado = passo(p1, "APROVAR", pessoas.lucas).pedido;
  assert.deepEqual(plain(passo(aprovado, "DEVOLVER", pessoas.lucas, { nota: "mudei de ideia" })), {
    ok: false,
    erro: 'Este pedido está "aprovado": só pedido aguardando aprovação pode ser decidido.',
  });
  assert.deepEqual(plain(passo(p1, "COMPRAR", pessoas.lucas, { compra })), {
    ok: false,
    erro: 'O pedido #0007 está "aguardando aprovação": só pedido aprovado vira compra.',
  });
  assert.deepEqual(plain(passo(aprovado, "RECEBER", pessoas.juliana, { recebimento: { itens: [], divergencia: "" } })), {
    ok: false,
    erro: 'Este pedido está "aprovado": só pedido já comprado pode ser recebido.',
  });
  const comprado = passo(aprovado, "COMPRAR", pessoas.lucas, { compra }).pedido;
  assert.deepEqual(plain(passo(comprado, "CANCELAR", pessoas.juliana)), {
    ok: false,
    erro: 'A compra já foi feita. Para desistir, o Financeiro exclui a compra e o pedido volta para "aprovado".',
  });
  const recebido = passo(comprado, "RECEBER", pessoas.juliana, {
    recebimento: { itens: comprado.itens.map((i) => ({ itemId: i.id, qtdRecebida: i.quantidade })), divergencia: "" },
  }).pedido;
  assert.deepEqual(plain(passo(recebido, "CANCELAR", pessoas.juliana)), { ok: false, erro: 'Este pedido está "recebido": não dá mais para cancelar.' });
});

test("cancelar: pelo setor ou pelo aprovador, em ENVIADO, DEVOLVIDO ou APROVADO", () => {
  const p1 = enviado();
  assert.equal(passo(p1, "CANCELAR", pessoas.juliana, { nota: "Achei no armário" }).pedido.status, "CANCELADO");
  // 07/10/2026: quem não é do setor (o aprovador, a coordenação) diz o motivo.
  assert.deepEqual(plain(passo(p1, "CANCELAR", pessoas.lucas)), {
    ok: false,
    erro: "Diga o motivo para cancelar o pedido de outro setor: pelo menos 3 letras.",
  });
  const peloLucas = passo(p1, "CANCELAR", pessoas.lucas, { nota: "O fornecedor parou de vender" }).pedido;
  assert.equal(peloLucas.status, "CANCELADO", "o aprovador também cancela");
  assert.deepEqual(plain([peloLucas.eventos.at(-1).porNome, peloLucas.eventos.at(-1).nota]), ["Lucas", "O fornecedor parou de vender"]);
  assert.equal(passo(p1, "CANCELAR", pessoas.nutri).pedido.status, "CANCELADO", "colega do setor cancela sem motivo");
  assert.deepEqual(plain(passo(p1, "CANCELAR", pessoas.recepcao)), { ok: false, erro: "Você não pode cancelar pedidos deste setor." });
  const devolvido = passo(p1, "DEVOLVER", pessoas.lucas, { nota: "Falta o link" }).pedido;
  assert.equal(passo(devolvido, "CANCELAR", pessoas.juliana).pedido.status, "CANCELADO");
  const aprovado = passo(p1, "APROVAR", pessoas.lucas).pedido;
  const cancelado = passo(aprovado, "CANCELAR", pessoas.juliana, { nota: "Doação chegou" }).pedido;
  assert.equal(cancelado.status, "CANCELADO");
  assert.equal(cancelado.eventos.at(-1).nota, "Doação chegou");
  assert.equal(passo(cancelado, "CANCELAR", pessoas.juliana).repetida, true, "clique duplo não dá erro");
});

test("compra excluída no Financeiro: COMPRADO volta para APROVADO (e só se for a mesma compra)", () => {
  const comprado = passo(passo(enviado(), "APROVAR", pessoas.lucas).pedido, "COMPRAR", pessoas.lucas, { compra }).pedido;
  const outra = passo(comprado, "DESFAZER_COMPRA", pessoas.lucas, { compra: { ...compra, compraRef: "fpur-outra" } });
  assert.equal(outra.pedido.status, "COMPRADO", "excluir OUTRA compra não mexe no pedido");
  const desfeito = passo(comprado, "DESFAZER_COMPRA", pessoas.lucas, { compra });
  assert.equal(desfeito.pedido.status, "APROVADO");
  assert.equal(desfeito.pedido.compraRef, null);
  assert.equal(desfeito.pedido.valorFinal, null);
  assert.equal(desfeito.pedido.eventos.at(-1).tipo, "COMPRA_DESFEITA");
  assert.equal(passo(desfeito.pedido, "COMPRAR", pessoas.lucas, { compra: { ...compra, compraRef: "fpur-nova" } }).pedido.status, "COMPRADO", "compra de novo");
});

test("clique duplo não duplica: aprovar o já aprovado e reenviar o já enviado devolvem o mesmo pedido", () => {
  const p1 = enviado();
  const aprovado = passo(p1, "APROVAR", pessoas.lucas).pedido;
  const deNovo = passo(aprovado, "APROVAR", pessoas.lucas);
  assert.equal(deNovo.ok, true);
  assert.equal(deNovo.repetida, true);
  assert.equal(deNovo.pedido.eventos.length, aprovado.eventos.length);
  const reenvio = passo(p1, "ENVIAR", pessoas.juliana, { rascunho: rascunho() });
  assert.equal(reenvio.repetida, true);
});

test("recebimento: quantidade por item, divergência vira evento, item faltando trava", () => {
  const comprado = passo(passo(enviado(), "APROVAR", pessoas.lucas).pedido, "COMPRAR", pessoas.lucas, { compra }).pedido;
  const [luva, alcool] = comprado.itens;
  assert.deepEqual(plain(passo(comprado, "RECEBER", pessoas.juliana, { recebimento: { itens: [{ itemId: luva.id, qtdRecebida: 10 }], divergencia: "" } })), {
    ok: false,
    erro: 'Informe quanto chegou de "Álcool 70%".',
  });
  assert.equal(
    passo(comprado, "RECEBER", pessoas.juliana, {
      recebimento: { itens: [{ itemId: luva.id, qtdRecebida: -1 }, { itemId: alcool.id, qtdRecebida: 6 }], divergencia: "" },
    }).ok,
    false,
  );
  const r = passo(comprado, "RECEBER", pessoas.juliana, {
    recebimento: { itens: [{ itemId: luva.id, qtdRecebida: 8 }, { itemId: alcool.id, qtdRecebida: 6 }], divergencia: "Vieram 8 caixas de luva, não 10" },
  });
  assert.equal(r.pedido.divergencia, "Vieram 8 caixas de luva, não 10");
  assert.deepEqual(plain(r.pedido.eventos.slice(-2).map((e) => [e.tipo, e.nota])), [
    ["RECEBIDO", ""],
    ["DIVERGENCIA", "Vieram 8 caixas de luva, não 10"],
  ]);
});

// ---------------------------------------------------------------------------
// Quem pode
// ---------------------------------------------------------------------------

test("quem pede: o próprio setor; a coordenação pede para os outros, menos Pacientes", () => {
  assert.equal(c.podePedirPara(pessoas.juliana, "ENFERMAGEM"), true);
  assert.equal(c.podePedirPara(pessoas.juliana, "RECEPCAO"), false);
  assert.equal(c.podePedirPara(pessoas.recepcao, "RECEPCAO"), true);
  assert.equal(c.podePedirPara(pessoas.limpeza, "LIMPEZA"), true);
  assert.equal(c.podePedirPara(pessoas.marketing, "MARKETING"), true);
  assert.equal(c.podePedirPara(pessoas.marketing, "COMERCIAL"), false, "marketing não é coordenação");
  assert.equal(c.podePedirPara(pessoas.lucas, "FINANCEIRO"), true);
  assert.equal(c.podePedirPara(pessoas.lucas, "ENFERMAGEM"), true, "coordenação");
  assert.equal(c.podePedirPara(pessoas.lucas, "PACIENTES"), false, "Pacientes é só da Aline e da CEO");
  assert.equal(c.podePedirPara(pessoas.aline, "PACIENTES"), true);
  assert.equal(c.podePedirPara(pessoas.ceo, "DIRETORIA"), true);
  assert.deepEqual(plain(c.aplicarAcao(null, "ENVIAR", pessoas.recepcao, AGORA, { rascunho: rascunho() })), {
    ok: false,
    erro: "Você não pode pedir compras para este setor.",
  });
});

test("quem aprova: o Gestor Financeiro; a exceção de Acessos vence nas duas direções", () => {
  assert.equal(c.podeAprovar(pessoas.lucas), true);
  for (const p of [pessoas.ceo, pessoas.dr, pessoas.estevao, pessoas.aline, pessoas.juliana, pessoas.recepcao]) {
    assert.equal(c.podeAprovar(p), false, p.cargo);
  }
  assert.equal(c.podeAprovar({ ...pessoas.ceo, acessos: { "compras-aprovacao": "EDITAR" } }), true, "Acessos libera a CEO");
  assert.equal(c.podeAprovar({ ...pessoas.lucas, acessos: { "compras-aprovacao": "VER" } }), false, "Acessos tira do Lucas");
  assert.equal(c.podeAprovar({ ...pessoas.lucas, acessos: { "compras-aprovacao": "OCULTO" } }), false);
  assert.equal(c.podeAprovar({ ...pessoas.lucas, acessos: { "compras-aprovacao": "banana" } }), true, "valor estranho = padrão do cargo");
  assert.deepEqual(plain(passo(enviado(), "APROVAR", pessoas.ceo)), { ok: false, erro: "Só quem aprova pedidos de compra pode decidir." });
  assert.equal(passo(enviado(), "APROVAR", { ...pessoas.ceo, acessos: { "compras-aprovacao": "EDITAR" } }).ok, true);
});

test("quem compra: só o financeiro completo; quem recebe: o setor (07/10/2026)", () => {
  const aprovado = passo(enviado(), "APROVAR", pessoas.lucas).pedido;
  assert.equal(passo(aprovado, "COMPRAR", pessoas.juliana, { compra }).ok, false);
  assert.equal(passo(aprovado, "COMPRAR", pessoas.estevao, { compra }).ok, false, "gestor só vê o financeiro");
  assert.equal(passo(aprovado, "COMPRAR", pessoas.ceo, { compra }).ok, true);
  const comprado = passo(aprovado, "COMPRAR", pessoas.lucas, { compra }).pedido;
  const recebimento = { itens: comprado.itens.map((i) => ({ itemId: i.id, qtdRecebida: i.quantidade })), divergencia: "" };
  assert.equal(passo(comprado, "RECEBER", pessoas.recepcao, { recebimento }).ok, false);
  assert.equal(passo(comprado, "RECEBER", pessoas.nutri, { recebimento }).ok, true, "nutricionista mexe na Enfermagem (regra de 19/08)");
  assert.equal(passo(comprado, "RECEBER", pessoas.dr, { recebimento }).ok, true, "a coordenação mexe na Enfermagem");
  // SPEC "RECEBER (o setor)" e regra da CEO de 30/09: Pacientes é só da Aline e da CEO.
  assert.equal(c.podeReceber(pessoas.lucas, "PACIENTES"), false, "financeiro completo não recebe em Pacientes");
  assert.equal(c.podeReceber(pessoas.dr, "PACIENTES"), false);
  assert.equal(c.podeReceber(pessoas.aline, "PACIENTES"), true);
  assert.equal(c.podeReceber(pessoas.ceo, "PACIENTES"), true);
});

test("Acessos em 'Pedidos de compra' vale para pedir, cancelar, receber e ver (07/10/2026, igual ao banco)", () => {
  const soVe = { ...pessoas.juliana, acessos: { compras: "VER" } };
  const oculta = { ...pessoas.juliana, acessos: { compras: "OCULTO" } };
  assert.equal(c.podePedirPara(soVe, "ENFERMAGEM"), false);
  assert.equal(c.podeReceber(soVe, "ENFERMAGEM"), false);
  assert.equal(c.podeCancelar(soVe, "ENFERMAGEM"), false);
  assert.equal(c.podePedirPara({ ...pessoas.juliana, acessos: { compras: "banana" } }, "ENFERMAGEM"), true, "valor estranho = padrão");
  assert.equal(c.podePedirPara({ ...pessoas.marketing, acessos: { compras: "EDITAR" } }, "COMERCIAL"), false, "EDITAR não abre outro setor");
  const doSetor = { setor: "ENFERMAGEM", solicitanteId: "col-outra" };
  assert.equal(c.podeVerPedido(soVe, doSetor), true, "só ver continua vendo os do setor");
  assert.equal(c.podeVerPedido(oculta, doSetor), false, "oculto não vê os do setor");
  assert.equal(c.podeVerPedido(oculta, { ...doSetor, solicitanteId: pessoas.juliana.id }), true, "mas vê o que ela mesma pediu");
  assert.equal(c.pedidosDaPessoa([{ ...doSetor, id: "p" }], soVe).length, 1, "a lista do setor continua para quem só vê");
  assert.equal(c.aplicarAcao(null, "ENVIAR", soVe, AGORA, { rascunho: rascunho() }).ok, false);
});

test("ver o pedido: setor, aprovador, financeiro completo ou quem pediu", () => {
  const pedido = { setor: "ENFERMAGEM", solicitanteId: "col-rec" };
  assert.equal(c.podeVerPedido(pessoas.juliana, pedido), true);
  assert.equal(c.podeVerPedido(pessoas.lucas, pedido), true);
  assert.equal(c.podeVerPedido(pessoas.limpeza, pedido), false);
  assert.equal(c.podeVerPedido(pessoas.recepcao, pedido), true, "quem pediu sempre vê");
});

test("setor principal e setores para pedir (o próprio primeiro)", () => {
  const esperado = {
    recepcionista: "RECEPCAO",
    enfermeira: "ENFERMAGEM",
    nutricionista: "NUTRICAO",
    secretaria_executiva: "PACIENTES",
    ceo: "DIRETORIA",
    gestor: "COMERCIAL",
    gestor_financeiro: "FINANCEIRO",
    dr_daniel: "CONSULTORIO",
    marketing: "MARKETING",
    limpeza: "LIMPEZA",
  };
  for (const cargo of access.cargos) {
    assert.equal(c.setorPrincipalDoCargo(cargo), esperado[cargo], cargo);
    const lista = c.setoresParaPedir(cargo, access.isCoordenacao(cargo));
    assert.equal(lista[0], esperado[cargo], `${cargo}: o próprio setor vem primeiro`);
  }
  assert.equal(c.setorPrincipalDoCargo(null), null);
  assert.deepEqual(plain(c.setoresParaPedir("nutricionista", false)), ["NUTRICAO", "ENFERMAGEM"]);
  assert.deepEqual(plain(c.setoresParaPedir("limpeza", false)), ["LIMPEZA"]);
  assert.deepEqual(plain(c.setoresParaPedir("ceo", true)), ["DIRETORIA", "RECEPCAO", "ENFERMAGEM", "PACIENTES", "COMERCIAL", "FINANCEIRO", "CONSULTORIO", "NUTRICAO", "MARKETING", "LIMPEZA"]);
  assert.ok(!c.setoresParaPedir("gestor_financeiro", true).includes("PACIENTES"));
});

test("acesso: 'compras' é de todo mundo; 'compras-aprovacao' só do Gestor Financeiro", () => {
  for (const cargo of access.cargos) {
    assert.equal(access.moduleLevel({ cargo, acessos: {} }, "compras"), "EDITAR", cargo);
    assert.equal(access.moduleLevel({ cargo, acessos: {} }, "compras-aprovacao"), cargo === "gestor_financeiro" ? "EDITAR" : "OCULTO", cargo);
  }
  assert.equal(access.moduleLabels.compras, "Pedidos de compra");
  assert.equal(access.moduleLabels["compras-aprovacao"], "Aprovar pedidos de compra");
});

// ---------------------------------------------------------------------------
// Formulário: validação, valor estimado, título automático
// ---------------------------------------------------------------------------

test("validação: as mesmas travas do banco, com as mesmas frases", () => {
  assert.deepEqual(plain(c.validarPedido(rascunho())), []);
  const vazio = plain(c.validarPedido(c.rascunhoVazio()));
  assert.ok(vazio.includes("Escolha um setor válido para o pedido."));
  assert.ok(vazio.includes("Diga por que precisa (pelo menos 3 letras)."));
  assert.ok(vazio.includes("Coloque pelo menos um item no pedido."));
  const ruim = plain(
    c.validarPedido(
      rascunho({
        precisaAte: "2026-02-30",
        itens: [
          { estoqueItemRef: null, descricao: "  ", quantidade: 1, unidade: "un", valorUnitario: null, link: "" },
          { estoqueItemRef: null, descricao: "Gaze", quantidade: 0, unidade: "un", valorUnitario: -1, link: "" },
          { estoqueItemRef: null, descricao: "Soro", quantidade: Number.NaN, unidade: "un", valorUnitario: null, link: "" },
          { estoqueItemRef: null, descricao: "Caneta", quantidade: 200000, unidade: "un", valorUnitario: null, link: "" },
        ],
      }),
    ),
  );
  assert.deepEqual(ruim, [
    'A data de "para quando" não é uma data válida.',
    "Escreva o que é o item 1.",
    "Diga a quantidade do item 2 (maior que zero).",
    "O valor do item 2 não é um valor válido.",
    "Diga a quantidade do item 3 (maior que zero).",
    "A quantidade do item 4 passa de 100.000.",
  ]);
  assert.deepEqual(plain(c.validarPedido(rascunho({ justificativa: "x".repeat(501) }))), ['O "por quê" passa de 500 letras.']);
  assert.equal(c.validarPedido(rascunho({ itens: Array.from({ length: 51 }, () => rascunho().itens[1]) })).includes("Um pedido aceita até 50 itens. Divida em dois pedidos."), true);
});

test("validação com o estoque: item tem que ser do setor e não pode repetir", () => {
  const estoque = [
    { id: "est-luva", nome: "Luva nitrílica M", unidade: "cx", setor: "ENFERMAGEM" },
    { id: "est-papel", nome: "Papel A4", unidade: "resma", setor: "RECEPCAO" },
  ];
  const doEstoque = (ref) => ({ estoqueItemRef: ref, descricao: "", quantidade: 2, unidade: "", valorUnitario: null, link: "" });
  assert.deepEqual(plain(c.validarPedido(rascunho({ itens: [doEstoque("est-luva")] }), estoque)), [], "descrição e unidade vêm do estoque");
  assert.deepEqual(plain(c.validarPedido(rascunho({ itens: [doEstoque("est-papel")] }), estoque)), ["O item 1 não é do estoque do setor escolhido."]);
  assert.deepEqual(plain(c.validarPedido(rascunho({ itens: [doEstoque("est-luva"), doEstoque("est-luva")] }), estoque)), [
    'O item "Luva nitrílica M" aparece duas vezes no pedido: junte numa linha só.',
  ]);
  const normal = c.normalizarRascunho(rascunho({ itens: [doEstoque("est-luva")] }), estoque);
  assert.equal(normal.itens[0].descricao, "Luva nitrílica M");
  assert.equal(normal.itens[0].unidade, "cx");
});

test("valor estimado: só os itens com valor, quantidade × valor, 2 casas", () => {
  assert.equal(c.valorEstimado([]), 0);
  assert.equal(c.valorEstimado(rascunho().itens), 325);
  assert.equal(
    c.valorEstimado([
      { quantidade: 3, valorUnitario: 0.1 },
      { quantidade: 1.5, valorUnitario: 10.555 },
      { quantidade: 2, valorUnitario: null },
    ]),
    16.14,
  ); // 0,30 + 1,5 × 10,56 = 16,14
});

test("título automático: 1º item + 'e mais N', cortado em 140", () => {
  assert.equal(c.tituloAutomatico([{ descricao: "Luva" }]), "Luva");
  assert.equal(c.tituloAutomatico([{ descricao: " Luva " }, { descricao: "Gaze" }, { descricao: "Soro" }]), "Luva e mais 2");
  assert.equal(c.tituloAutomatico([]), "");
  assert.equal(c.tituloAutomatico([{ descricao: "x".repeat(200) }]).length, 140);
  assert.equal(c.tituloDoPedido(rascunho({ titulo: "  Reposição de outubro " })), "Reposição de outubro");
  assert.equal(c.tituloDoPedido(rascunho()), "Luva nitrílica M e mais 1");
});

test("resumo e texto do item, em português", () => {
  const p = enviado();
  assert.equal(c.resumoDoPedido(p).replace(/ /g, " "), "2 itens · R$ 325,00 estimado");
  assert.equal(c.resumoDoPedido({ ...p, valorFinal: 300 }).replace(/ /g, " "), "2 itens · R$ 300,00 na compra");
  assert.equal(c.resumoDoPedido({ ...p, itens: [p.itens[1]], valorEstimado: 0 }), "1 item · sem valor estimado");
  assert.equal(c.textoDoItem(p.itens[0]).replace(/ /g, " "), "10 cx × Luva nitrílica M · R$ 32,50 cada");
  assert.equal(c.numeroDoPedido(7), "#0007");
  assert.equal(c.numeroDoPedido(12345), "#12345", "não corta a partir de 10.000");
});

// ---------------------------------------------------------------------------
// Tempo esperando (dias úteis)
// ---------------------------------------------------------------------------

test("dias esperando contam só dias úteis (fim de semana e feriado não)", () => {
  const esperando = (enviadoEm, hoje) => c.diasEsperando({ enviadoEm, createdAt: enviadoEm }, hoje);
  assert.equal(esperando("2026-10-06T12:00:00Z", "2026-10-06"), 0, "hoje");
  assert.equal(esperando("2026-10-02T12:00:00Z", "2026-10-05"), 1, "sexta → segunda = 1");
  assert.equal(esperando("2026-10-02T12:00:00Z", "2026-10-06"), 2, "sexta → terça = 2");
  assert.equal(esperando("2026-10-09T12:00:00Z", "2026-10-13"), 1, "12/10 é feriado: sexta → terça = 1");
  assert.equal(esperando("2026-10-03T12:00:00Z", "2026-10-04"), 0, "sábado → domingo = 0");
  // 22h de segunda em Brasília já é terça em UTC: o dia que vale é o de Brasília.
  assert.equal(c.diaEmSaoPaulo("2026-10-06T01:30:00Z"), "2026-10-05");
  assert.equal(esperando("2026-10-06T01:30:00Z", "2026-10-06"), 1);

  const pedido = (status, enviadoEm) => ({ status, enviadoEm, createdAt: enviadoEm });
  assert.equal(c.estaAtrasado(pedido("ENVIADO", "2026-10-05T12:00:00Z"), HOJE), false, "1 dia útil ainda não é atraso");
  assert.equal(c.estaAtrasado(pedido("ENVIADO", "2026-10-02T12:00:00Z"), HOJE), true, "mais de 1 dia útil = âmbar");
  assert.equal(c.estaAtrasado(pedido("APROVADO", "2026-09-01T12:00:00Z"), HOJE), false, "só o que espera decisão atrasa");
  // 07/10/2026: régua única com o fluxograma — urgente atrasa a partir do dia útil seguinte.
  const urgente = (enviadoEm) => ({ ...pedido("ENVIADO", enviadoEm), urgencia: "URGENTE" });
  assert.equal(c.estaAtrasado(urgente("2026-10-05T12:00:00Z"), HOJE), true, "urgente de ontem já passou do prazo");
  assert.equal(c.estaAtrasado(urgente(AGORA), HOJE), false, "urgente de hoje ainda está no prazo");
  assert.equal(c.contadoresDosPedidos([{ ...urgente("2026-10-05T12:00:00Z"), valorEstimado: 0 }], HOJE).atrasados, 1, "o contador usa a mesma régua");
  assert.equal(c.tempoEsperandoTexto(pedido("ENVIADO", "2026-10-02T12:00:00Z"), HOJE), "há 2 dias úteis");
  assert.equal(c.tempoEsperandoTexto(pedido("ENVIADO", "2026-10-05T12:00:00Z"), HOJE), "há 1 dia útil");
  assert.equal(c.tempoEsperandoTexto(pedido("ENVIADO", AGORA), HOJE), "hoje");
});

// ---------------------------------------------------------------------------
// Contadores, filtros e ordenação
// ---------------------------------------------------------------------------

test("exemplos da prévia: seis pedidos, setores e situações diferentes, coerentes com a máquina", () => {
  const exemplos = c.pedidosDeExemplo(HOJE);
  assert.equal(exemplos.length, 6);
  assert.equal(new Set(exemplos.map((p) => p.id)).size, 6);
  assert.equal(new Set(exemplos.map((p) => p.numero)).size, 6);
  assert.equal(new Set(exemplos.map((p) => p.setor)).size, 6);
  assert.deepEqual(plain([...new Set(exemplos.map((p) => p.status))].sort()), ["APROVADO", "COMPRADO", "DEVOLVIDO", "ENVIADO", "RECEBIDO"]);
  for (const p of exemplos) {
    assert.equal(p.eventos[0].tipo, "CRIADO", p.titulo);
    assert.ok(p.justificativa.length >= 3);
    assert.deepEqual(plain(c.validarPedido(c.rascunhoDoPedido(p))), [], `exemplo ${p.numero} passaria na validação`);
  }
});

test("contadores e filtros da faixa do topo", () => {
  const exemplos = c.pedidosDeExemplo(HOJE);
  assert.deepEqual(plain(c.contadoresDosPedidos(exemplos, HOJE)), {
    aguardando: 2,
    valorAguardando: 471.2, // 100×0,42 + 100×0,25 + 5×32,90 + 3×79,90
    atrasados: 1,
    aprovados: 1,
    aCaminho: 1,
    recebidosNoMes: 1,
    devolvidos: 1,
  });
  assert.equal(c.filtrarPedidos(exemplos, "AGUARDANDO", HOJE).length, 2);
  assert.equal(c.filtrarPedidos(exemplos, "APROVADOS", HOJE).length, 1);
  assert.equal(c.filtrarPedidos(exemplos, "A_CAMINHO", HOJE).length, 1);
  assert.equal(c.filtrarPedidos(exemplos, "RECEBIDOS_MES", HOJE).length, 1);
  assert.equal(c.filtrarPedidos(exemplos, "DEVOLVIDOS", HOJE).length, 1);
  assert.equal(c.filtrarPedidos(exemplos, "TODOS", HOJE).length, 6);
  assert.equal(c.filtrarPedidos(exemplos, "RECEBIDOS_MES", "2026-11-20").length, 0, "o recebido de outubro não conta em novembro");
  // No começo do mês o exemplo recebido cai no mês corrente (a prévia nunca mostra zero).
  assert.equal(c.contadoresDosPedidos(c.pedidosDeExemplo("2026-11-03"), "2026-11-03").recebidosNoMes, 1);
});

test("caixa de aprovação: urgente primeiro, depois o mais antigo", () => {
  const base = enviado();
  const p = (numero, urgencia, enviadoEm, status = "ENVIADO") => ({ ...base, id: `p${numero}`, numero, urgencia, enviadoEm, createdAt: enviadoEm, status });
  const caixa = c.caixaDeAprovacao([
    p(1, "NORMAL", "2026-10-01T12:00:00Z"),
    p(2, "URGENTE", "2026-10-05T12:00:00Z"),
    p(3, "NORMAL", "2026-09-30T12:00:00Z"),
    p(4, "URGENTE", "2026-10-02T12:00:00Z"),
    p(5, "URGENTE", "2026-09-01T12:00:00Z", "APROVADO"),
  ]);
  assert.deepEqual(plain(caixa.map((x) => x.numero)), [4, 2, 3, 1]);
  assert.deepEqual(plain(c.caixaDeAprovacao(c.pedidosDeExemplo(HOJE)).map((x) => x.numero)), [14, 15]);
  assert.deepEqual(plain(c.ordenarPedidos([p(1, "NORMAL", "2026-10-01T12:00:00Z"), p(3, "NORMAL", "2026-10-03T12:00:00Z")]).map((x) => x.numero)), [3, 1]);
});

// ---------------------------------------------------------------------------
// O elo com o estoque
// ---------------------------------------------------------------------------

test("sugestão do estoque: COMPRAR/ZERADO, repõe até 2× o mínimo, sem repetir o que já foi pedido ou comprado", () => {
  const item = (id, minimo) => ({ id, setor: "ENFERMAGEM", nome: id, categoria: "", unidade: "un", minimo, codigoBarras: "", observacao: "", createdAt: "" });
  const linha = (id, minimo, saldo, status, compraAberta = null) => ({ item: item(id, minimo), saldo, status, ultimoMovimento: null, compraAberta });
  const posicao = [
    linha("luva", 10, 4, "COMPRAR"),
    linha("gaze", 5, 0, "ZERADO"),
    linha("soro", 0, 0, "ZERADO"),
    linha("seringa", 10, 50, "OK"),
    linha("agulha", 10, 3, "A_CAMINHO", { id: "fpur-x" }),
    linha("algodao", 4, 0, "ZERADO", { id: "fpur-y" }),
    linha("alcool", 6, 2, "COMPRAR"),
  ];
  const pedidoAberto = { ...enviado(), itens: [{ ...enviado().itens[0], estoqueItemRef: "alcool" }] };
  const sugeridos = plain(c.itensSugeridosDoEstoque(posicao, [pedidoAberto]));
  assert.deepEqual(
    sugeridos.map((s) => [s.estoqueItemRef, s.quantidade]),
    [
      ["luva", 16],
      ["gaze", 10],
      ["soro", 1],
    ],
  );
  assert.equal(sugeridos[0].descricao, "luva");
  assert.equal(sugeridos[0].valorUnitario, null);
  const recusado = { ...pedidoAberto, status: "RECUSADO" };
  assert.ok(c.itensSugeridosDoEstoque(posicao, [recusado]).some((s) => s.estoqueItemRef === "alcool"), "pedido recusado não segura o item");
});

test("recebimento gera as entradas do estoque como o banco: id fixo, motivo com o número, só item do estoque", () => {
  const comprado = passo(
    passo(
      enviado(pessoas.juliana, {
        itens: [
          { estoqueItemRef: "est-luva", descricao: "Luva", quantidade: 10, unidade: "cx", valorUnitario: null, link: "" },
          { estoqueItemRef: null, descricao: "Item novo", quantidade: 1, unidade: "un", valorUnitario: null, link: "" },
          { estoqueItemRef: "est-gaze", descricao: "Gaze", quantidade: 5, unidade: "pct", valorUnitario: null, link: "" },
          { estoqueItemRef: "est-apagado", descricao: "Saiu do cadastro", quantidade: 1, unidade: "un", valorUnitario: null, link: "" },
        ],
      }),
      "APROVAR",
      pessoas.lucas,
    ).pedido,
    "COMPRAR",
    pessoas.lucas,
    { compra },
  ).pedido;
  const estoque = [
    { id: "est-luva", nome: "Luva", unidade: "cx", setor: "ENFERMAGEM" },
    { id: "est-gaze", nome: "Gaze", unidade: "pct", setor: "ENFERMAGEM" },
  ];
  const [luva, novo, gaze, apagado] = comprado.itens;
  const recebimento = {
    itens: [
      { itemId: luva.id, qtdRecebida: 8.004, lote: " L123 ", validade: "2027-03-31" },
      { itemId: novo.id, qtdRecebida: 1 },
      { itemId: gaze.id, qtdRecebida: 0 },
      { itemId: apagado.id, qtdRecebida: 1 },
    ],
    // 07/10/2026: chegou diferente (luva e gaze) → anotar é obrigatório.
    divergencia: "Faltaram 2 caixas de luva e a gaze não veio",
  };
  assert.deepEqual(plain(passo(comprado, "RECEBER", pessoas.juliana, { recebimento: { ...recebimento, divergencia: "" }, itensDoEstoque: estoque })), {
    ok: false,
    erro: "Chegou quantidade diferente da pedida: conte o que não bateu (pelo menos 3 letras).",
  });
  const r = passo(comprado, "RECEBER", pessoas.juliana, { recebimento, itensDoEstoque: estoque });
  assert.equal(r.ok, true);
  assert.equal(r.pedido.eventos.at(-2).nota, "Sem entrada no estoque (o item saiu do cadastro): Saiu do cadastro");
  assert.equal(r.pedido.eventos.at(-1).tipo, "DIVERGENCIA");
  const movs = plain(c.movimentosDoRecebimento(r.pedido, recebimento, HOJE, AGORA, estoque));
  assert.deepEqual(movs, [
    {
      id: `emov-ped-${comprado.id}-1`,
      itemRef: "est-luva",
      setor: "ENFERMAGEM",
      tipo: "ENTRADA",
      quantidade: 8,
      movDate: HOJE,
      lote: "L123",
      validade: "2027-03-31",
      compraRef: "fpur-abc",
      motivo: "Pedido #0007 recebido",
      createdAt: AGORA,
    },
  ]);
});

test("recebimento não dá entrada em dobro: o que já entrou desta compra pelo Estoque fica de fora (07/10/2026)", () => {
  const comprado = passo(
    passo(
      enviado(pessoas.juliana, {
        itens: [
          { estoqueItemRef: "est-luva", descricao: "Luva", quantidade: 10, unidade: "cx", valorUnitario: null, link: "" },
          { estoqueItemRef: "est-gaze", descricao: "Gaze", quantidade: 5, unidade: "pct", valorUnitario: null, link: "" },
        ],
      }),
      "APROVAR",
      pessoas.lucas,
    ).pedido,
    "COMPRAR",
    pessoas.lucas,
    { compra },
  ).pedido;
  const estoque = [
    { id: "est-luva", nome: "Luva", unidade: "cx", setor: "ENFERMAGEM" },
    { id: "est-gaze", nome: "Gaze", unidade: "pct", setor: "ENFERMAGEM" },
  ];
  // A luva já entrou pelo "Chegou — dar entrada"; a gaze tem só a entrada do próprio pedido (repetição).
  const moves = [
    { id: "estqmov-antigo", itemRef: "est-luva", compraRef: "fpur-abc" },
    { id: `emov-ped-${comprado.id}-2`, itemRef: "est-gaze", compraRef: "fpur-abc" },
    { id: "estqmov-outra", itemRef: "est-gaze", compraRef: "fpur-outra" },
  ];
  assert.deepEqual(plain([...c.itensJaComEntradaDaCompra(comprado, moves)]), ["est-luva"]);
  const recebimento = { itens: comprado.itens.map((i) => ({ itemId: i.id, qtdRecebida: i.quantidade })), divergencia: "" };
  const r = passo(comprado, "RECEBER", pessoas.juliana, { recebimento, itensDoEstoque: estoque, movesDoEstoque: moves });
  assert.equal(r.ok, true);
  assert.equal(r.pedido.eventos.at(-1).nota, "Já tinha entrada desta compra no estoque: Luva");
  const movs = plain(c.movimentosDoRecebimento(r.pedido, recebimento, HOJE, AGORA, estoque, moves));
  assert.deepEqual(movs.map((m) => m.itemRef), ["est-gaze"]);
  // Sem os movimentos, o de sempre (as duas entradas).
  assert.equal(c.movimentosDoRecebimento(r.pedido, recebimento, HOJE, AGORA, estoque).length, 2);
});

// ---------------------------------------------------------------------------
// Ida e volta com o banco
// ---------------------------------------------------------------------------

test("o jsonb das funções vira o pedido do app (e o formulário vira o jsonb)", () => {
  const row = {
    id: "9b1d…",
    client_ref: "cped-22222222-2222-4222-8222-222222222222",
    numero: 12,
    setor: "RECEPCAO",
    solicitante_id: "col-rec",
    solicitante_nome: "Recepção",
    titulo: "Papel A4 e mais 1",
    justificativa: "Mês",
    urgencia: "URGENTE",
    precisa_ate: "2026-10-10",
    status: "COMPRADO",
    valor_estimado: "164.50",
    enviado_em: "2026-10-05T12:00:00+00:00",
    decidido_por: null,
    decidido_em: null,
    decisao_nota: "",
    compra_ref: "fpur-1",
    fornecedor: "Kalunga",
    valor_final: "170.00",
    previsao_entrega: null,
    divergencia: "",
    created_at: "2026-10-05T12:00:00+00:00",
    updated_at: "2026-10-05T12:00:00+00:00",
    itens: [
      { id: "i2", ordem: 2, estoque_item_ref: null, descricao: "Clipes", quantidade: "1.000", unidade: "cx", valor_unitario: null, link: "", qtd_recebida: null },
      { id: "i1", ordem: 1, estoque_item_ref: "est-papel", descricao: "Papel A4", quantidade: "5.000", unidade: "resma", valor_unitario: "32.90", link: "", qtd_recebida: null },
    ],
    eventos: [
      { id: "e2", tipo: "COMPRADO", por: "col-lucas", por_nome: "Lucas", em: "2026-10-05T15:00:00+00:00", nota: "Kalunga" },
      { id: "e1", tipo: "CRIADO", por: "col-rec", por_nome: "Recepção", em: "2026-10-05T12:00:00+00:00", nota: "" },
    ],
  };
  const p = c.pedidoDoBanco(row);
  assert.equal(p.id, row.client_ref);
  assert.equal(p.valorEstimado, 164.5);
  assert.equal(p.valorFinal, 170);
  assert.equal(p.urgencia, "URGENTE");
  assert.deepEqual(plain(p.itens.map((i) => [i.ordem, i.quantidade, i.valorUnitario])), [
    [1, 5, 32.9],
    [2, 1, null],
  ]);
  assert.deepEqual(plain(p.eventos.map((e) => e.tipo)), ["CRIADO", "COMPRADO"]);
  assert.equal(p.eventos[1].porNome, "Lucas");

  const ida = plain(c.rascunhoParaBanco("cped-x", c.rascunhoDoPedido(p)));
  assert.deepEqual(Object.keys(ida).sort(), ["client_ref", "itens", "justificativa", "precisa_ate", "setor", "titulo", "urgencia"]);
  assert.deepEqual(ida.itens[0], { estoque_item_ref: "est-papel", descricao: "Papel A4", quantidade: 5, unidade: "resma", valor_unitario: 32.9, link: "" });
  assert.deepEqual(plain(c.recebimentoParaBanco({ itens: [{ itemId: "i1", qtdRecebida: 5, lote: " A1 ", validade: "" }], divergencia: "" })), [
    { item_id: "i1", qtd_recebida: 5, lote: "A1", validade: null },
  ]);
});

test("o id que o app gera é o que o banco aceita (cped-<uuid>)", () => {
  const regex = /_ref !~ '([^']+)'/.exec(corpo("compra_pedido_enviar"))?.[1];
  assert.ok(regex, "a função confere o formato do client_ref");
  const re = new RegExp(regex);
  for (let i = 0; i < 20; i += 1) assert.match(c.novoIdDePedido(), re);
  for (const exemplo of c.pedidosDeExemplo(HOJE)) assert.match(exemplo.id, re);
});

// ---------------------------------------------------------------------------
// Setores: app × banco, e a regra antiga intacta
// ---------------------------------------------------------------------------

function seedDosSetores() {
  const bloco = /insert into public\.setor \(codigo, nome, descricao, cargos, ordem, ativo\) values([\s\S]*?)on conflict \(codigo\) do update/.exec(sql)?.[1];
  assert.ok(bloco, "seed da tabela setor");
  return [...bloco.matchAll(/\('([A-Z_]+)', '([^']*)', '[^']*', '\{([^}]*)\}', (\d+), (true|false)\)/g)].map((m) => ({
    codigo: m[1],
    nome: m[2],
    cargos: m[3].split(",").map((s) => s.trim()).filter(Boolean),
    ordem: Number(m[4]),
    ativo: m[5] === "true",
  }));
}

test("paridade: os setores do banco (seed) são os do app — código, nome, cargos e ordem", () => {
  const seed = seedDosSetores();
  assert.equal(seed.length, 10);
  assert.deepEqual(seed.map((s) => s.codigo), plain(es.setoresEmOrdem));
  assert.deepEqual(Object.keys(es.setorLabels), plain(es.setoresEmOrdem));
  for (const [indice, s] of seed.entries()) {
    assert.equal(s.ordem, indice + 1, s.codigo);
    assert.equal(s.ativo, true, s.codigo);
    assert.equal(s.nome, es.setorNomes[s.codigo], `nome de ${s.codigo}`);
    assert.deepEqual(s.cargos, plain(es.setorCargos[s.codigo]), `cargos de ${s.codigo}`);
    for (const cargo of s.cargos) assert.ok(access.cargos.includes(cargo), `${cargo} é um cargo que existe (nenhum cargo novo)`);
    assert.ok(s.cargos.includes(es.setorDona[s.codigo]), `a dona de ${s.codigo} é do setor`);
  }
  // Todo cargo tem um setor principal que é dele.
  for (const cargo of access.cargos) assert.ok(es.setorCargos[c.setorPrincipalDoCargo(cargo)].includes(cargo), cargo);
});

test("paridade: status, eventos e rótulos do banco são os do app", () => {
  const lista = (re) => (re.exec(sql)?.[1] ?? "").match(/'([A-Z_]+)'/g).map((s) => s.slice(1, -1)).sort();
  assert.deepEqual(lista(/status text not null check \(status in \(([^)]*)\)\)/), plain([...c.pedidoStatusEmOrdem].sort()));
  assert.deepEqual(lista(/tipo text not null check \(tipo in \(([^)]*)\)\)/), plain([...c.pedidoEventoTipos].sort()));
  const rotulos = Object.fromEntries([...corpo("compra_status_rotulo").matchAll(/when '([A-Z]+)' then '([^']+)'/g)].map((m) => [m[1], m[2]]));
  for (const status of c.pedidoStatusEmOrdem) assert.equal(rotulos[status], c.statusNaFrase(status), status);
});

// A regra de ANTES de 06/10/2026 (copiada de estoqueData.ts, commit bd186ca).
function podeMexerAntigo(cargo, setor, ehCoordenacao) {
  if (setor === "PACIENTES") return cargo === "secretaria_executiva" || cargo === "ceo";
  if (ehCoordenacao) return true;
  if (setor === "RECEPCAO") return cargo === "recepcionista";
  return cargo === "enfermeira" || cargo === "nutricionista";
}
const ANTIGOS = ["RECEPCAO", "ENFERMAGEM", "PACIENTES"];

test("os três setores antigos: quem mexe e quem vê é EXATAMENTE o de antes", () => {
  for (const cargo of [...access.cargos, null, undefined, "cargo-que-nao-existe"]) {
    for (const ehCoordenacao of [true, false]) {
      for (const setor of ANTIGOS) {
        assert.equal(es.podeMexerNoSetor(cargo, setor, ehCoordenacao), podeMexerAntigo(cargo, setor, ehCoordenacao), `${cargo} ${ehCoordenacao} ${setor}`);
      }
      const visiveisAntigos = ANTIGOS.filter((setor) => setor === "PACIENTES" || podeMexerAntigo(cargo, setor, ehCoordenacao));
      assert.deepEqual(plain(es.setoresVisiveis(cargo, ehCoordenacao).filter((s) => ANTIGOS.includes(s))), visiveisAntigos, `${cargo} ${ehCoordenacao}`);
    }
  }
});

test("estoque_pode do banco: a mesma fórmula do app, lendo setor.cargos (simulada com o seed)", () => {
  const pode = corpo("estoque_pode");
  assert.match(pode, /from public\.setor s/);
  assert.match(pode, /s\.codigo <> 'PACIENTES' and public\.is_coordenacao\(_user\)/);
  assert.match(pode, /cc\.cargo::text = any \(s\.cargos\)/);
  assert.match(pode, /coalesce\(cc\.auth_id, c\.auth_id\) = _user/);
  assert.match(pode, /c\.ativo = true/);
  // estoque_ve: PACIENTES de toda a equipe ativa; o resto = estoque_pode (igual a 202609300001).
  const veNovo = corpo("estoque_ve").replace(/\s+/g, " ").trim();
  const antiga = ler("supabase/migrations/202609300001_estoque_pacientes.sql");
  const veAntigo = /create or replace function public\.estoque_ve\([\s\S]*?\$\$([\s\S]*?)\$\$;/.exec(antiga)[1].replace(/\s+/g, " ").trim();
  assert.equal(veNovo, veAntigo, "estoque_ve não mudou");

  // Simulação da função do banco com o seed: bate com o app nos 10 setores.
  const seed = Object.fromEntries(seedDosSetores().map((s) => [s.codigo, s.cargos]));
  const sqlPode = (cargo, setor, coord) => setor in seed && ((setor !== "PACIENTES" && coord) || seed[setor].includes(cargo));
  for (const cargo of access.cargos) {
    const coord = access.isCoordenacao(cargo);
    for (const setor of es.setoresEmOrdem) assert.equal(es.podeMexerNoSetor(cargo, setor, coord), sqlPode(cargo, setor, coord), `${cargo} ${setor}`);
  }
});

// ---------------------------------------------------------------------------
// Segurança da migração (lida por regex, como tests/agenda-acesso.test.mjs)
// ---------------------------------------------------------------------------

test("CHECKs de setor viram chave estrangeira para setor (e o resto do estoque fica intacto)", () => {
  for (const [tabela, coluna, antigo] of [
    ["estoque_item", "setor", "estoque_item_setor_check"],
    ["estoque_movimento", "setor", "estoque_movimento_setor_check"],
    ["fin_purchases", "estoque_setor", "fin_purchases_estoque_setor_check"],
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${tabela} drop constraint if exists ${antigo};`), antigo);
    assert.match(sql, new RegExp(`add constraint \\w+ foreign key \\(${coluna}\\) references public\\.setor \\(codigo\\) not valid;`), tabela);
    assert.match(sql, new RegExp(`alter table public\\.${tabela} validate constraint`), tabela);
  }
  assert.doesNotMatch(sqlSemComentario, /check \((estoque_)?setor in/i, "nenhuma lista fixa de setores sobra");
  assert.doesNotMatch(sqlSemComentario, /tipo_check|tipo in \('ENTRADA'/, "o CHECK do tipo de movimento não é mexido");
  assert.doesNotMatch(sqlSemComentario, /registrar_aplicacao|enfermagem_aplicacao/, "a ficha de aplicação não é mexida");
  assert.doesNotMatch(sqlSemComentario, /alter type public\.cargo|create type/i, "nenhum cargo novo");
});

test("as funções de gravação conferem quem está agindo ANTES de gravar", () => {
  const antes = (texto, guarda, gravacao) => {
    const g = texto.indexOf(guarda);
    const w = texto.indexOf(gravacao);
    assert.ok(g >= 0, `falta ${guarda}`);
    assert.ok(w >= 0, `falta ${gravacao}`);
    assert.ok(g < w, `${guarda} vem antes de ${gravacao}`);
  };
  const enviar = corpo("compra_pedido_enviar");
  antes(enviar, "public.compra_pode_pedir(_uid, _setor)", "insert into public.compra_pedido (");
  antes(enviar, "public.compra_pode_pedir(_uid, _p.setor)", "update public.compra_pedido set");
  const decidir = corpo("compra_pedido_decidir");
  antes(decidir, "public.compra_pode_aprovar(_uid)", "update public.compra_pedido set");
  assert.match(decidir, /_dec in \('DEVOLVER', 'RECUSAR'\) and char_length\(_texto\) < 3/, "motivo obrigatório");
  assert.match(decidir, /_p\.status <> 'ENVIADO'/);
  const cancelar = corpo("compra_pedido_cancelar");
  antes(cancelar, "public.compra_pode_pedir(_uid, _p.setor) or public.compra_pode_aprovar(_uid)", "update public.compra_pedido set");
  assert.match(cancelar, /_p\.status not in \('ENVIADO', 'DEVOLVIDO', 'APROVADO'\)/);
  const receber = corpo("compra_pedido_receber");
  // 07/10/2026: quem recebe é o setor (compra_pode_pedir = estoque_pode + Acessos); o financeiro completo não entra mais por fora.
  antes(receber, "public.compra_pode_pedir(_uid, _p.setor)", "insert into public.estoque_movimento");
  assert.doesNotMatch(receber, /is_financeiro_full/);
  assert.match(receber, /_p\.status <> 'COMPRADO'/);
  assert.match(receber, /'emov-ped-' \|\| _p\.client_ref \|\| '-' \|\| _i\.ordem/, "entrada com id determinístico");
  assert.match(receber, /on conflict \(client_ref\) do nothing/);
  assert.match(receber, /at time zone 'America\/Sao_Paulo'/, "o dia é o de Brasília");
  // compra_pode_aprovar: a exceção de Acessos vence nas duas direções.
  const aprovar = corpo("compra_pode_aprovar");
  assert.match(aprovar, /module_access_override\(_user, 'compras-aprovacao'\)/);
  assert.match(aprovar, /in \('OCULTO', 'VER', 'EDITAR'\) then o\.nivel = 'EDITAR'/);
  assert.match(aprovar, /has_cargo\(_user, 'gestor_financeiro'\)/);
  assert.match(corpo("compra_pode_pedir"), /public\.estoque_pode\(_user, _setor\)/);
  // 07/10/2026: a exceção de Acessos no módulo 'compras' vale no banco.
  assert.match(corpo("compra_pode_pedir"), /module_access_override\(_user, 'compras'\) in \('OCULTO', 'VER'\) then false/);
  assert.match(corpo("compra_pode_ver_pedido"), /coalesce\(public\.module_access_override\(_user, 'compras'\), ''\) <> 'OCULTO' and public\.estoque_pode\(_user, _setor\)/);
  // Cancelar pedido de outro setor exige o motivo.
  assert.match(cancelar, /if not _do_setor and char_length\(_texto\) < 3 then\s+raise exception 'Diga o motivo para cancelar o pedido de outro setor: pelo menos 3 letras\.'/);
  antes(cancelar, "if not _do_setor and char_length(_texto) < 3", "update public.compra_pedido set");
  // Recebimento: sem entrada em dobro, divergência obrigatória e o "Chegou" da compra carimbado.
  assert.match(receber, /m\.compra_ref = _p\.compra_ref\s+and m\.item_ref = _i\.estoque_item_ref\s+and m\.deleted_at is null/);
  assert.match(receber, /if _diferente and char_length\(_div\) < 3 then\s+raise exception 'Chegou quantidade diferente da pedida: conte o que não bateu \(pelo menos 3 letras\)\.'/);
  assert.match(receber, /update public\.fin_purchases\s+set received_at = coalesce\(received_at, _hoje\)\s+where client_ref = _p\.compra_ref\s+and deleted_at is null;/);
});

test("o gatilho da compra exige pedido APROVADO, e excluir a compra devolve o pedido", () => {
  const registrar = corpo("compra_pedido_ao_registrar_compra");
  assert.match(registrar, /if _p\.status <> 'APROVADO' then\s+raise exception/);
  assert.match(registrar, /status = 'COMPRADO'/);
  assert.match(sql, /create trigger trg_fin_purchases_pedido_compra\s+after insert on public\.fin_purchases/);
  const mudou = corpo("compra_pedido_compra_mudou");
  assert.match(mudou, /old\.deleted_at is null and new\.deleted_at is not null/);
  assert.match(mudou, /_p\.status = 'COMPRADO' and _p\.compra_ref = old\.client_ref/);
  assert.match(mudou, /'COMPRA_DESFEITA'/);
  assert.match(mudou, /new\.pedido_ref is distinct from old\.pedido_ref then\s+raise exception/, "a ligação não é trocada por fora");
  assert.match(sql, /create trigger trg_fin_purchases_pedido_mudou\s+after update or delete on public\.fin_purchases/);
  assert.match(sql, /alter table public\.fin_purchases add column if not exists pedido_ref text;/);
});

test("RLS: as tabelas do pedido só têm leitura; escrever é só pelas funções", () => {
  const tabelas = ["compra_pedido", "compra_pedido_item", "compra_pedido_evento"];
  for (const tabela of tabelas) {
    assert.match(sql, new RegExp(`alter table public\\.${tabela} enable row level security;`), tabela);
    assert.match(sql, new RegExp(`revoke all on table public\\.${tabela} from anon, authenticated;`), tabela);
    assert.match(sql, new RegExp(`grant select on table public\\.${tabela} to authenticated;`), tabela);
  }
  const policies = [...sqlSemComentario.matchAll(/create policy (\w+) on public\.(\w+)\s+for (\w+)/g)];
  assert.ok(policies.length >= 4);
  for (const [, nome, tabela, comando] of policies) {
    if (tabelas.includes(tabela) || tabela === "setor") assert.equal(comando, "select", `${nome}: só leitura`);
  }
  assert.doesNotMatch(sqlSemComentario, /grant (insert|update|delete|all)[^;]*on table public\.(compra_pedido|setor)/i);
  assert.match(corpo("compra_pode_ver_pedido"), /colaborador_de\(_user\) = _solicitante/);
  assert.match(sql, /using \(public\.compra_pode_ver_pedido\(\(select auth\.uid\(\)\), setor, solicitante_id\)\)/);
});

test("funções: search_path fixo, nada para anon, e quem é a pessoa vem de coalesce(cc.auth_id, c.auth_id)", () => {
  const funcoes = [...sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)([\s\S]*?)as \$\$/g)];
  assert.ok(funcoes.length >= 15);
  for (const [, nome, , cabecalho] of funcoes) {
    assert.match(cabecalho, /set search_path (=|to) /, `${nome}: search_path fixo`);
    if (["estoque_pode", "estoque_ve"].includes(nome)) continue; // recriadas iguais; grants de antes
    assert.match(sql, new RegExp(`revoke all on function public\\.${nome}\\([^)]*\\) from public, anon`), `${nome}: revoke de public e anon`);
  }
  const definer = funcoes.filter(([, , , cabecalho]) => /security definer/.test(cabecalho)).map(([, nome]) => nome);
  for (const nome of ["compra_pedido_enviar", "compra_pedido_decidir", "compra_pedido_cancelar", "compra_pedido_receber", "compra_pode_aprovar", "compra_pode_pedir", "compra_pode_ver_pedido", "colaborador_de", "compra_pedido_ao_registrar_compra", "compra_pedido_compra_mudou"]) {
    assert.ok(definer.includes(nome), `${nome} é security definer`);
  }
  assert.doesNotMatch(sqlSemComentario, /grant[^;]*\bto\b[^;]*\banon\b/i, "nenhum grant para anon");
  assert.doesNotMatch(sqlSemComentario, /current_colaborador_id\(\)/, "não usa current_colaborador_id (só olha c.auth_id)");
  assert.match(corpo("colaborador_de"), /coalesce\(cc\.auth_id, c\.auth_id\) = _user/);
  // Estrutura: todo corpo $$ abre e fecha.
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0, "$$ balanceado");
  // Blocos do plpgsql fechados: sem textos entre aspas e sem as expressões
  // case…end, cada if tem o seu end if, cada loop o seu end loop, e cada
  // begin (inclusive o de begin…exception) o seu end; — o banco não está aqui
  // para compilar, então o teste confere o esqueleto.
  const plpgsql = funcoes.filter(([, , , cabecalho]) => /language plpgsql/.test(cabecalho)).map(([, nome]) => nome);
  assert.ok(plpgsql.length >= 7);
  for (const nome of plpgsql) {
    const texto = corpo(nome);
    assert.match(texto, /^\s*(declare[\s\S]*?)?begin\b/, `${nome}: começa com declare/begin`);
    assert.match(texto, /\bend;\s*$/, `${nome}: termina com end;`);
    const limpo = texto.replace(/'[^']*'/g, "''").replace(/\bcase\b[\s\S]*?\bend\b(?! (if|loop))/g, "<case>");
    const conta = (re) => (limpo.match(re) ?? []).length;
    assert.equal(conta(/\bif\b/g) - conta(/\bend if\b/g), conta(/\bend if;/g), `${nome}: if/end if`);
    assert.equal(conta(/\bloop\b/g) - conta(/\bend loop\b/g), conta(/\bend loop;/g), `${nome}: loop/end loop`);
    assert.equal(conta(/\bbegin\b/g), conta(/\bend;/g), `${nome}: begin/end`);
    // Toda variável usada com := foi declarada (erro clássico que só aparece ao aplicar).
    const declarados = new Set([...(/declare([\s\S]*?)\bbegin\b/.exec(texto)?.[1] ?? "").matchAll(/^\s*(_\w+)\s/gm)].map((m) => m[1]));
    for (const [, variavel] of limpo.matchAll(/(_\w+)\s*:=/g)) assert.ok(declarados.has(variavel), `${nome}: ${variavel} não foi declarada`);
  }
  // 07/10/2026: aplicada em produção depois do ensaio; o cabeçalho registra isso e a ordem (migração antes do front).
  assert.match(sql, /APLICADA EM PRODUÇÃO em 07\/10\/2026/);
  assert.match(sql, /ESTA MIGRAÇÃO ANTES DO FRONT/);
});
