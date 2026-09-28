// CHECKPOINT E TEXTO DO PRONTUÁRIO (28/09/2026).
//
// O formato é o da Dra. Géssica (áudio de 28/09): uma linha por tema, na ordem
// do roteiro, depois a linha do plano e o bloco "Suplementos e Medicamentos".
// O que estes testes protegem:
// - campo vazio sai "não informado", nunca "não";
// - valor trazido do atendimento anterior não entra no texto nem deixa
//   finalizar enquanto não for confirmado;
// - sugestão da IA pendente também impede finalizar;
// - suplemento com prescrição, relato e orientação datada, sem prescrição da IA;
// - retificação guarda o que havia antes, com motivo.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const campos = loadTs("src/features/nutricao/dominio/campos.ts");
const suplementos = loadTs("src/features/nutricao/dominio/suplementos.ts");
const resumo = loadTs("src/features/nutricao/dominio/resumo.ts");
const { CONFIG_PADRAO } = loadTs("src/features/nutricao/dominio/config.ts");

const AGORA = "2026-09-28T12:40:00.000Z";

function atendimento(extra = {}) {
  return {
    id: "a1",
    pessoaId: "p1",
    data: "2026-09-28",
    tipo: "checkpoint",
    numeroCheckpoint: 3,
    estado: "rascunho",
    campos: campos.camposVazios(),
    suplementos: [],
    conduta: "",
    linhaPlano: { ativa: true, texto: "Plano será entregue em até 72 horas úteis." },
    proximoAcompanhamento: null,
    consentimentoGravacao: null,
    gravacaoId: null,
    transcricao: null,
    organizacao: null,
    prazoPlano: null,
    textoCopiadoEm: null,
    finalizadoEm: null,
    retificacoes: [],
    versao: 1,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
    ...extra,
  };
}

test("todos os temas começam vazios e saem 'não informado'", () => {
  const vazios = campos.camposVazios();
  assert.equal(Object.keys(vazios).length, 14);
  assert.equal(campos.linhaDoCampo("treino", vazios.treino, CONFIG_PADRAO), "Treino: não informado");
  assert.equal(campos.linhaDoCampo("finsDeSemana", vazios.finsDeSemana, CONFIG_PADRAO), "Finais de semana: não informado");
});

test("texto digitado vira a linha, com o rótulo dela e sem &", () => {
  const valor = campos.editarTexto(campos.valorVazio(), "musculação 3x/sem & caminhada", AGORA);
  assert.equal(valor.estado, "preenchido");
  assert.equal(valor.origem, "digitado");
  assert.equal(campos.linhaDoCampo("treino", valor, CONFIG_PADRAO), "Treino: musculação 3x/sem e caminhada");
});

test("apagar o texto volta a ser 'não informado'", () => {
  const cheio = campos.editarTexto(campos.valorVazio(), "boa", AGORA);
  const vazio = campos.editarTexto(cheio, "   ", AGORA);
  assert.equal(vazio.estado, "vazio");
  assert.equal(campos.linhaDoCampo("disposicao", vazio, CONFIG_PADRAO), "Disposição: não informado");
});

test("bio monta peso, PGC e gordura visceral com as siglas dela", () => {
  const bio = campos.editarBio(campos.valorVazio(), { pesoKg: 71.2, pgc: 31.5, visceral: 7, fonte: "InBody 28/09 09h05" }, AGORA);
  assert.equal(campos.linhaDoCampo("bio", bio, CONFIG_PADRAO), "Bio: Peso: 71,2 kg | PGC: 31,5% | MGV: 7");
});

test("bio com número faltando diz qual não foi informado", () => {
  const bio = campos.editarBio(campos.valorVazio(), { pesoKg: 71.2, pgc: null, visceral: null, fonte: null }, AGORA);
  assert.equal(campos.linhaDoCampo("bio", bio, CONFIG_PADRAO), "Bio: Peso: 71,2 kg | PGC: não informado | MGV: não informado");
});

test("bio sem número nenhum é 'não informado'", () => {
  const bio = campos.editarBio(campos.valorVazio(), { pesoKg: null, pgc: null, visceral: null, fonte: null }, AGORA);
  assert.equal(bio.estado, "vazio");
  assert.equal(campos.linhaDoCampo("bio", bio, CONFIG_PADRAO), "Bio: não informado");
});

test("valor do atendimento anterior fica pendente e não entra no texto", () => {
  const anterior = campos.editarTexto(campos.valorVazio(), "3x/dia, último às 17h, sem açúcar", "2026-08-26T12:00:00.000Z");
  const trazido = campos.trazerDoAnterior(anterior, "2026-08-26");
  assert.equal(trazido.estado, "anterior_pendente");
  assert.equal(trazido.anteriorDe, "2026-08-26");
  assert.equal(trazido.origem, null);
  assert.equal(campos.linhaDoCampo("cafe", trazido, CONFIG_PADRAO), null);
});

test("confirmar o anterior registra a origem e a hora", () => {
  const anterior = campos.editarTexto(campos.valorVazio(), "3x/dia", "2026-08-26T12:00:00.000Z");
  const confirmado = campos.confirmarAnterior(campos.trazerDoAnterior(anterior, "2026-08-26"), AGORA);
  assert.equal(confirmado.estado, "preenchido");
  assert.equal(confirmado.origem, "anterior_confirmado");
  assert.equal(confirmado.anteriorDe, "2026-08-26");
  assert.equal(confirmado.confirmadoEm, AGORA);
  assert.equal(campos.linhaDoCampo("cafe", confirmado, CONFIG_PADRAO), "Café: 3x/dia");
});

test("editar um valor trazido do anterior vira digitado de hoje", () => {
  const anterior = campos.editarTexto(campos.valorVazio(), "3x/dia", "2026-08-26T12:00:00.000Z");
  const editado = campos.editarTexto(campos.trazerDoAnterior(anterior, "2026-08-26"), "2x/dia", AGORA);
  assert.equal(editado.estado, "preenchido");
  assert.equal(editado.origem, "digitado");
  assert.equal(editado.anteriorDe, null);
});

test("aceitar sugestão da IA guarda as evidências; editar depois vira ia_editada", () => {
  const sugestao = { campo: "sono", texto: "~6 h/noite, acorda 1x", bio: null, evidencias: [{ segmento: 4, trecho: "durmo umas seis horas", quem: "pessoa" }], incerto: false, motivo: null, estado: "pendente" };
  const aceito = campos.aceitarSugestao(campos.valorVazio(), sugestao, AGORA);
  assert.equal(aceito.origem, "ia_aceita");
  assert.equal(aceito.evidencias.length, 1);
  const editado = campos.editarTexto(aceito, "~6 h/noite", AGORA);
  assert.equal(editado.origem, "ia_editada");
  assert.equal(editado.evidencias.length, 1);
});

test("atalho acrescenta ao texto com vírgula", () => {
  assert.equal(campos.acrescentarAtalho("", "musculação"), "musculação");
  assert.equal(campos.acrescentarAtalho("musculação 3x/sem", "caminhada"), "musculação 3x/sem, caminhada");
  assert.equal(campos.acrescentarAtalho("musculação", "musculação"), "musculação");
});

// ------------------------------------------------------------ suplementos

const b12 = { id: "c1", itemId: "i1", nome: "Vitamina B12", prescricao: "manhã e noite", usoRelatado: "só pela manhã", adesao: "divergente", orientacao: "seguir a prescrição, manhã e noite", orientadoEm: "2026-09-28", origem: "digitado", evidencias: [] };

test("suplemento divergente: prescrição, relato e orientação com data", () => {
  assert.equal(
    suplementos.linhaDaConferencia(b12),
    "Vitamina B12: prescrição manhã e noite; relatou uso só pela manhã. Orientação em 28/09/2026: seguir a prescrição, manhã e noite.",
  );
});

test("suplemento com adesão ok", () => {
  assert.equal(suplementos.linhaDaConferencia({ ...b12, nome: "Creatina", adesao: "ok", usoRelatado: "", orientacao: "", orientadoEm: null }), "Creatina: adesão ok.");
});

test("suplemento que não está usando", () => {
  assert.equal(
    suplementos.linhaDaConferencia({ ...b12, nome: "Vitamina D", adesao: "nao_usa", usoRelatado: "acabou há 2 semanas", orientacao: "" }),
    "Vitamina D: não está usando (acabou há 2 semanas).",
  );
});

test("suplemento não conferido é 'não informado'", () => {
  assert.equal(suplementos.linhaDaConferencia({ ...b12, adesao: "nao_informado", usoRelatado: "", orientacao: "" }), "Vitamina B12: não informado.");
});

test("a prescrição da conferência vem do item registrado", () => {
  const item = { id: "i1", pessoaId: "p1", nome: "Vitamina B12", tipo: "suplemento", dose: "1 cápsula", frequencia: "2x ao dia", horario: "manhã e noite", inicio: null, termino: null, responsavel: "Dr. Daniel", fonte: "prescricao", situacao: "em_uso", observacoes: "", registradoEm: "2026-08-12", versao: 1, criadoEm: AGORA, atualizadoEm: AGORA };
  const conferencia = suplementos.conferenciaDoItem(item, () => "c9");
  assert.equal(conferencia.prescricao, "1 cápsula, 2x ao dia, manhã e noite");
  assert.equal(conferencia.adesao, "nao_informado");
  assert.equal(conferencia.itemId, "i1");
  assert.equal(conferencia.id, "c9");
});

// ------------------------------------------------------------ texto do prontuário

test("o texto do prontuário segue a ordem dela e termina no bloco de suplementos", () => {
  const at = atendimento();
  at.campos.bio = campos.editarBio(at.campos.bio, { pesoKg: 71.2, pgc: 31.5, visceral: 7, fonte: null }, AGORA);
  at.campos.treino = campos.editarTexto(at.campos.treino, "musculação 3x/sem", AGORA);
  at.suplementos = [b12];
  const linhas = resumo.textoDoProntuario(at, CONFIG_PADRAO).split("\n");
  assert.equal(linhas[0], "Bio: Peso: 71,2 kg | PGC: 31,5% | MGV: 7");
  assert.equal(linhas[1], "Treino: musculação 3x/sem");
  assert.equal(linhas[2], "Sono: não informado");
  assert.equal(linhas[13], "Finais de semana: não informado");
  assert.equal(linhas[14], "Plano será entregue em até 72 horas úteis.");
  assert.equal(linhas[15], "");
  assert.equal(linhas[16], "Suplementos e Medicamentos");
  assert.equal(linhas[17], b12.nome + ": prescrição manhã e noite; relatou uso só pela manhã. Orientação em 28/09/2026: seguir a prescrição, manhã e noite.");
  assert.equal(linhas.length, 18);
});

test("sem suplementos conferidos, o bloco diz 'não informado'", () => {
  const texto = resumo.textoDoProntuario(atendimento(), CONFIG_PADRAO);
  assert.ok(texto.endsWith("Suplementos e Medicamentos\nNão informado."));
});

test("linha do plano desligada não aparece", () => {
  const texto = resumo.textoDoProntuario(atendimento({ linhaPlano: { ativa: false, texto: "Plano será entregue em até 72 horas úteis." } }), CONFIG_PADRAO);
  assert.ok(!texto.includes("Plano será entregue"));
});

test("linha pendente do anterior fica fora do texto e aparece nas pendências", () => {
  const at = atendimento();
  const anterior = campos.editarTexto(campos.valorVazio(), "3x/dia", "2026-08-26T12:00:00.000Z");
  at.campos.cafe = campos.trazerDoAnterior(anterior, "2026-08-26");
  const texto = resumo.textoDoProntuario(at, CONFIG_PADRAO);
  assert.ok(!texto.includes("Café"));
  const pendencias = plain(resumo.pendenciasParaFinalizar(at));
  assert.equal(pendencias.length, 1);
  assert.equal(pendencias[0].tipo, "anterior_pendente");
  assert.equal(pendencias[0].campo, "cafe");
  assert.equal(resumo.podeFinalizar(at), false);
});

test("linhas estruturadas marcam o estado de cada uma para a folha", () => {
  const at = atendimento();
  at.campos.treino = campos.editarTexto(at.campos.treino, "musculação", AGORA);
  at.campos.cafe = campos.trazerDoAnterior(campos.editarTexto(campos.valorVazio(), "3x/dia", AGORA), "2026-08-26");
  const linhas = plain(resumo.linhasDaFolha(at, CONFIG_PADRAO));
  const porCampo = Object.fromEntries(linhas.filter((l) => l.campo).map((l) => [l.campo, l.estado]));
  assert.equal(porCampo.treino, "ok");
  assert.equal(porCampo.sono, "nao_informado");
  assert.equal(porCampo.cafe, "pendente");
});

test("sugestões da IA pendentes impedem finalizar", () => {
  const at = atendimento({
    organizacao: {
      geradaEm: AGORA,
      modelo: "claude-opus-5",
      campos: [{ campo: "sono", texto: "~6 h", bio: null, evidencias: [], incerto: false, motivo: null, estado: "pendente" }],
      suplementos: [],
      conduta: null,
      acordos: [],
      naoClassificados: [{ id: "n1", texto: "dor no joelho", evidencias: [], estado: "pendente" }],
      naoMencionados: [],
      descartadas: [],
    },
  });
  const tipos = plain(resumo.pendenciasParaFinalizar(at)).map((p) => p.tipo).sort();
  assert.deepEqual(tipos, ["nao_classificado_pendente", "sugestao_pendente"]);
});

test("finalizar grava a hora e o prazo do plano; sem pendência", () => {
  const final = resumo.finalizarAtendimento(atendimento(), AGORA, "2026-10-01");
  assert.equal(final.estado, "finalizado");
  assert.equal(final.finalizadoEm, AGORA);
  assert.equal(final.prazoPlano, "2026-10-01");
});

test("finalizar com pendência é recusado", () => {
  const at = atendimento();
  at.campos.cafe = campos.trazerDoAnterior(campos.editarTexto(campos.valorVazio(), "3x/dia", AGORA), "2026-08-26");
  assert.throws(() => resumo.finalizarAtendimento(at, AGORA, null), /pendência/);
});

test("finalizar sem a linha do plano não cria prazo", () => {
  const final = resumo.finalizarAtendimento(atendimento({ linhaPlano: { ativa: false, texto: "" } }), AGORA, "2026-10-01");
  assert.equal(final.prazoPlano, null);
});

test("retificar exige motivo e guarda o que havia antes", () => {
  const final = resumo.finalizarAtendimento(atendimento(), AGORA, "2026-10-01");
  const novosCampos = { ...final.campos, sono: campos.editarTexto(final.campos.sono, "~7 h/noite", AGORA) };
  assert.throws(() => resumo.aplicarRetificacao(final, { campos: novosCampos, suplementos: [], conduta: "", linhaPlano: final.linhaPlano }, "  ", "Géssica", AGORA), /motivo/);
  const retificado = resumo.aplicarRetificacao(final, { campos: novosCampos, suplementos: [], conduta: "", linhaPlano: final.linhaPlano }, "sono dito errado na consulta", "Géssica", "2026-09-29T10:00:00.000Z");
  assert.equal(retificado.estado, "finalizado");
  assert.equal(retificado.retificacoes.length, 1);
  assert.equal(retificado.retificacoes[0].motivo, "sono dito errado na consulta");
  assert.equal(retificado.retificacoes[0].antes.campos.sono.estado, "vazio");
  assert.equal(retificado.campos.sono.texto, "~7 h/noite");
  assert.equal(retificado.finalizadoEm, AGORA);
});

test("retificar um rascunho não é permitido", () => {
  assert.throws(() => resumo.aplicarRetificacao(atendimento(), { campos: campos.camposVazios(), suplementos: [], conduta: "", linhaPlano: { ativa: true, texto: "" } }, "x", "G", AGORA), /finalizado/);
});

test("nenhum texto gerado tem &", () => {
  const at = atendimento();
  at.campos.alcool = campos.editarTexto(at.campos.alcool, "vinho & cerveja", AGORA);
  at.suplementos = [{ ...b12, orientacao: "manhã & noite" }];
  assert.ok(!resumo.textoDoProntuario(at, CONFIG_PADRAO).includes("&"));
});

test("digitar num campo ainda pendente do anterior descarta o valor antigo inteiro, inclusive os números da bio", () => {
  const bioAntiga = campos.editarBio(campos.valorVazio(), { pesoKg: 72, pgc: 32.1, visceral: 7, fonte: "InBody 26/08" }, "2026-08-26T12:00:00.000Z");
  const trazida = campos.trazerDoAnterior(bioAntiga, "2026-08-26");
  const comObservacao = campos.editarTexto(trazida, "bioimpedância não realizada hoje", AGORA);
  assert.equal(comObservacao.bio, null);
  assert.equal(campos.linhaDoCampo("bio", comObservacao, CONFIG_PADRAO), "Bio: bioimpedância não realizada hoje");
  const soPeso = campos.editarBio(trazida, { pesoKg: 71.2, pgc: null, visceral: null, fonte: null }, AGORA);
  assert.equal(campos.linhaDoCampo("bio", soPeso, CONFIG_PADRAO), "Bio: Peso: 71,2 kg | PGC: não informado | MGV: não informado");
});

// ------------------------------------------------------------ achados da revisão (28/09/2026)

test("orientação dada sem conferir a adesão não se perde", () => {
  assert.equal(
    suplementos.linhaDaConferencia({ ...b12, nome: "Creatina", adesao: "nao_informado", usoRelatado: "", orientacao: "tomar após o treino", orientadoEm: "2026-09-28" }),
    "Creatina: adesão não informada. Orientação em 28/09/2026: tomar após o treino.",
  );
});

test("retificação não grava valor do atendimento anterior sem confirmação", () => {
  const final = resumo.finalizarAtendimento(atendimento(), AGORA, "2026-10-01");
  const pendente = campos.trazerDoAnterior(campos.editarTexto(campos.valorVazio(), "3x/dia", AGORA), "2026-08-26");
  const novo = { campos: { ...final.campos, cafe: pendente }, suplementos: [], conduta: "", linhaPlano: final.linhaPlano };
  assert.throws(() => resumo.aplicarRetificacao(final, novo, "corrigir café", "Géssica", AGORA), /pendência/);
});

test("prescrição da conferência acompanha a lista registrada enquanto o checkpoint é rascunho", () => {
  const item = (id, nome, frequencia, situacao = "em_uso") => ({ id, pessoaId: "p1", nome, tipo: "suplemento", dose: "", frequencia, horario: "", inicio: null, termino: null, responsavel: "Dr. Daniel", fonte: "prescricao", situacao, observacoes: "", registradoEm: "2026-08-12", versao: 1, criadoEm: AGORA, atualizadoEm: AGORA });
  let n = 0;
  const lista = [{ ...b12, itemId: "i1", prescricao: "1x ao dia" }, { ...b12, id: "c2", itemId: null, nome: "Ômega 3", prescricao: "" }];
  const itens = [item("i1", "Vitamina B12", "2x ao dia, manhã e noite"), item("i2", "Creatina", "1x ao dia"), item("i3", "Ferro", "1x ao dia", "suspenso")];
  const novo = plain(suplementos.sincronizarPrescricoes(lista, itens, () => `n${++n}`));
  assert.equal(novo[0].prescricao, "2x ao dia, manhã e noite");
  assert.equal(novo[0].usoRelatado, b12.usoRelatado);
  assert.equal(novo[1].nome, "Ômega 3");
  assert.deepEqual(novo.map((c) => c.nome), ["Vitamina B12", "Ômega 3", "Creatina"]);
  assert.equal(novo[2].itemId, "i2");
  // nada mudou: devolve a mesma lista (sem regravar à toa)
  assert.equal(suplementos.sincronizarPrescricoes(novo, itens, () => "x"), novo);
});

test("item mencionado fora da lista e registrado depois vira o mesmo item, sem duplicar no prontuário", () => {
  const item = { id: "i9", pessoaId: "p1", nome: "Vitamina D", tipo: "suplemento", dose: "2.000 UI", frequencia: "1x ao dia", horario: "", inicio: null, termino: null, responsavel: "Dr. Daniel", fonte: "prescricao", situacao: "em_uso", observacoes: "", registradoEm: "2026-09-28", versao: 1, criadoEm: AGORA, atualizadoEm: AGORA };
  const fora = { ...b12, id: "c7", itemId: null, nome: "vitamina d", prescricao: "", usoRelatado: "1x por semana", adesao: "divergente" };
  const novo = plain(suplementos.sincronizarPrescricoes([fora], [item], () => "nunca"));
  assert.equal(novo.length, 1);
  assert.equal(novo[0].id, "c7");
  assert.equal(novo[0].itemId, "i9");
  assert.equal(novo[0].nome, "Vitamina D");
  assert.equal(novo[0].prescricao, "2.000 UI, 1x ao dia");
  assert.equal(novo[0].usoRelatado, "1x por semana");
  assert.equal(novo[0].adesao, "divergente");
});
