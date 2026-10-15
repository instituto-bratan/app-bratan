// CONTRATO DE MEDICAÇÃO: DOS DADOS DA TELA AO TEXTO DE CADA CAMPO (14/10/2026).
//
// Pedido do Lucas: "esse é o modelo de contrato manual que nós mandamos para o
// SuperSign... dentro do contrato vai ter as medicações do que o doutor
// prescreveu". O modelo .docx (bucket privado "modelos-contrato") tem campos
// {{...}}; aqui sai o valor de cada um, no mesmo formato que a recepção
// escrevia à mão (maiúsculas, valores e quantidades por extenso).
// Só importa relativo (os testes carregam direto).
import { dataCurta, dataPorExtenso, quantidadeComExtenso, valorComExtenso } from "./extenso";
import type { ItemDoProtocolo, TtoLido } from "./lerTto";

export type ProtocoloDoContrato = {
  titulo: string;
  via: string;
  sessoes: number;
  posologia: string;
  meses: number | null;
  itens: ItemDoProtocolo[];
};

export type PagamentoDoContrato = { valor: number; meio: string; parcelas: number; data: string };

export type DadosDoContrato = {
  numero: number | null;
  ano: number;
  paciente: {
    nome: string;
    nacionalidade: string;
    estadoCivil: string;
    profissao: string;
    rg: string;
    cpf: string;
    nascimento: string;
    endereco: string;
    numeroEnd: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    telefone: string;
    email: string;
  };
  responsavel: { nome: string; rg: string; cpf: string };
  planoSaude: string;
  cids: string[];
  tipo: { imediato: boolean; curto: boolean; medio: boolean };
  consultaEm: string;
  protocolos: ProtocoloDoContrato[];
  prazo: string;
  valorTotal: number;
  pagamentos: PagamentoDoContrato[];
  assinaturaEm: string;
};

export type LinhaDoContrato = { texto: string; destaque: boolean };
export type GrupoDeMedicamentos = { titulo: string; itens: ItemDoProtocolo[] };

export const MEIOS_DE_PAGAMENTO = ["PIX", "CARTÃO DE CRÉDITO", "CARTÃO DE DÉBITO", "LINK DE PAGAMENTO", "DINHEIRO", "BOLETO", "TRANSFERÊNCIA"] as const;

export const VIAS = ["INTRAMUSCULAR", "ENDOVENOSO", "SUBCUTÂNEO", "IMPLANTE", "ORAL", "TÓPICO"] as const;

const TRACO = "------------------------------------------------------------------------";

export const PRAZO_PADRAO_CONSULTA = [
  "O PRESENTE ATENDIMENTO REFERE-SE À CONSULTA REALIZADA COM O DR. DANIEL BRATAN, DESTINADA À AVALIAÇÃO CLÍNICA E À DEFINIÇÃO DAS CONDUTAS E NECESSIDADES IDENTIFICADAS NO MOMENTO DO ATENDIMENTO.",
  "CASO HAJA INDICAÇÃO DE CONTINUIDADE OU MODIFICAÇÃO DO TRATAMENTO MEDICAMENTOSO, OS RESPECTIVOS CUSTOS SERÃO PREVIAMENTE INFORMADOS E ALINHADOS COM O(A) PACIENTE.",
].join("\n");

function maiusculo(texto: string) {
  return (texto || "").trim().toUpperCase();
}

export function cpfDoContrato(cpf: string) {
  const d = (cpf || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : maiusculo(cpf);
}

export function dadosVazios(hojeIso: string): DadosDoContrato {
  return {
    numero: null,
    ano: Number(hojeIso.slice(0, 4)),
    paciente: { nome: "", nacionalidade: "BRASILEIRA", estadoCivil: "", profissao: "", rg: "", cpf: "", nascimento: "", endereco: "", numeroEnd: "", bairro: "", municipio: "SÃO PAULO", uf: "SP", cep: "", telefone: "", email: "" },
    responsavel: { nome: "", rg: "", cpf: "" },
    planoSaude: "",
    cids: [],
    tipo: { imediato: true, curto: false, medio: false },
    consultaEm: hojeIso,
    protocolos: [],
    prazo: PRAZO_PADRAO_CONSULTA,
    valorTotal: 0,
    pagamentos: [],
    assinaturaEm: hojeIso,
  };
}

/** Tipo de tratamento sugerido: dose única = imediato; até 1 mês = curto; mais que isso = médio. */
export function tipoSugerido(protocolos: ProtocoloDoContrato[]): DadosDoContrato["tipo"] {
  const imediato = protocolos.length === 0 || protocolos.some((p) => p.sessoes <= 1);
  const curto = protocolos.some((p) => p.sessoes > 1 && (p.meses ?? 1) <= 1);
  const medio = protocolos.some((p) => (p.meses ?? 0) > 1);
  return { imediato, curto, medio };
}

/** Prazo sugerido: o maior número de meses entre os protocolos, ou o texto da consulta. */
export function prazoSugerido(protocolos: ProtocoloDoContrato[]): string {
  const meses = Math.max(0, ...protocolos.map((p) => p.meses ?? 0));
  if (meses <= 0) return PRAZO_PADRAO_CONSULTA;
  return [
    `O PRESENTE TRATAMENTO TERÁ DURAÇÃO PREVISTA DE ${quantidadeComExtenso(meses, "m")} ${meses === 1 ? "MÊS" : "MESES"}, A CONTAR DA DATA DA CONSULTA, CONFORME O CRONOGRAMA DOS PROTOCOLOS DESCRITOS NA CLÁUSULA 1.0.`,
    "CASO HAJA INDICAÇÃO DE CONTINUIDADE OU MODIFICAÇÃO DO TRATAMENTO MEDICAMENTOSO, OS RESPECTIVOS CUSTOS SERÃO PREVIAMENTE INFORMADOS E ALINHADOS COM O(A) PACIENTE.",
  ].join("\n");
}

/** O TTO lido vira o começo do contrato (a tela deixa conferir tudo). */
export function dadosDoTto(base: DadosDoContrato, tto: TtoLido): DadosDoContrato {
  const protocolos: ProtocoloDoContrato[] = tto.protocolos.map((p) => ({ titulo: p.titulo, via: p.via, sessoes: p.sessoes, posologia: p.posologia, meses: p.meses, itens: p.itens }));
  const cids = [...new Set(tto.protocolos.flatMap((p) => p.cids))];
  const e = tto.endereco;
  return {
    ...base,
    paciente: {
      ...base.paciente,
      nome: maiusculo(tto.paciente) || base.paciente.nome,
      cpf: tto.cpf || base.paciente.cpf,
      endereco: e ? maiusculo(e.logradouro) : base.paciente.endereco,
      numeroEnd: e ? maiusculo(e.numero) : base.paciente.numeroEnd,
      bairro: e ? maiusculo(e.bairro) : base.paciente.bairro,
      municipio: e?.municipio ? maiusculo(e.municipio) : base.paciente.municipio,
      uf: e?.uf ? maiusculo(e.uf) : base.paciente.uf,
      cep: e ? e.cep : base.paciente.cep,
    },
    cids: cids.length ? cids : base.cids,
    consultaEm: tto.emitidoEm ?? base.consultaEm,
    protocolos,
    tipo: tipoSugerido(protocolos),
    prazo: prazoSugerido(protocolos),
  };
}

/** Cláusula 1.4: consulta + cada protocolo com via, sessões e posologia. */
export function linhasContempla(d: DadosDoContrato): LinhaDoContrato[] {
  const linhas: LinhaDoContrato[] = [
    { texto: `  01 (UMA) CONSULTA COM O DR. DANIEL BRATAN, SENDO REALIZADA EM ${dataCurta(d.consultaEm)};`, destaque: true },
  ];
  for (const p of d.protocolos) {
    linhas.push({ texto: "", destaque: false });
    linhas.push({ texto: `   ${maiusculo(p.titulo)}`, destaque: true });
    const via = maiusculo(p.via);
    const sessoes = Math.max(1, Math.round(p.sessoes || 1));
    linhas.push({ texto: `   ${via ? `TRATAMENTO ${via}, ` : ""}COMPREENDENDO ${quantidadeComExtenso(sessoes, "f")} ${sessoes === 1 ? "SESSÃO" : "SESSÕES"};`, destaque: true });
    const posologia = maiusculo(p.posologia) || (sessoes === 1 ? "DOSE ÚNICA." : "");
    if (posologia) linhas.push({ texto: `   ${posologia}`, destaque: false });
  }
  return linhas;
}

/** Cláusula 1.5: medicamentos agrupados pela via ("TRATAMENTO ENDOVENOSO"). */
export function gruposDeMedicamentos(d: DadosDoContrato): GrupoDeMedicamentos[] {
  const grupos = new Map<string, ItemDoProtocolo[]>();
  for (const p of d.protocolos) {
    const titulo = p.via ? `TRATAMENTO ${maiusculo(p.via)}` : maiusculo(p.titulo);
    const lista = grupos.get(titulo) ?? [];
    for (const item of p.itens) if (item.nome.trim()) lista.push({ nome: maiusculo(item.nome), dose: maiusculo(item.dose) });
    grupos.set(titulo, lista);
  }
  return [...grupos].filter(([, itens]) => itens.length).map(([titulo, itens]) => ({ titulo, itens }));
}

/** Cláusula 4.1: uma linha por forma de pagamento. */
export function linhasPagamento(d: DadosDoContrato): LinhaDoContrato[] {
  return d.pagamentos
    .filter((p) => p.valor > 0)
    .map((p, i) => {
      const inicio = i === 0 ? "VALOR DE" : "RESTANTE DO VALOR,";
      const parcelas = Math.max(1, Math.round(p.parcelas || 1));
      const parcela = parcelas > 1 ? `, PARCELADO EM ${parcelas}X DE ${valorComExtenso(Math.round((p.valor / parcelas) * 100) / 100)}` : "";
      const data = p.data ? `, DIA ${dataCurta(p.data)}` : "";
      return { texto: ` ${inicio} ${valorComExtenso(p.valor)} VIA ${maiusculo(p.meio)}${parcela}${data}.`, destaque: true };
    });
}

export function linhasDoTexto(texto: string, destaque = true): LinhaDoContrato[] {
  return texto.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((t) => ({ texto: maiusculo(t), destaque }));
}

export function numeroDoContrato(d: Pick<DadosDoContrato, "numero" | "ano">, separador = "/") {
  return d.numero ? `${d.numero}${separador}${d.ano}` : "";
}

/** Valor de cada campo {{...}} do modelo. */
export function camposDoContrato(d: DadosDoContrato): Record<string, string> {
  const p = d.paciente;
  const ouTraco = (v: string) => maiusculo(v) || TRACO;
  const sim = (v: boolean) => (v ? "SIM" : "NÃO");
  return {
    NUMERO: numeroDoContrato(d, "/"),
    NUMERO_CAB: numeroDoContrato(d, "-"),
    NOME: maiusculo(p.nome),
    NACIONALIDADE: maiusculo(p.nacionalidade),
    ESTADO_CIVIL: maiusculo(p.estadoCivil),
    PROFISSAO: maiusculo(p.profissao),
    RG: maiusculo(p.rg),
    CPF: cpfDoContrato(p.cpf),
    NASCIMENTO: p.nascimento ? dataCurta(p.nascimento) : "",
    ENDERECO: maiusculo(p.endereco),
    NUMERO_END: maiusculo(p.numeroEnd),
    BAIRRO: maiusculo(p.bairro),
    MUNICIPIO: maiusculo(p.municipio),
    UF: maiusculo(p.uf),
    CEP: p.cep.trim(),
    TELEFONE: p.telefone.trim(),
    EMAIL: p.email.trim().toLowerCase(),
    RESP_NOME: ouTraco(d.responsavel.nome),
    RESP_RG: ouTraco(d.responsavel.rg),
    RESP_CPF: d.responsavel.cpf.trim() ? cpfDoContrato(d.responsavel.cpf) : TRACO,
    PLANO_SAUDE: ouTraco(d.planoSaude),
    CID: d.cids.map((c) => `CID10: ${maiusculo(c)}`).join("; "),
    T_IMEDIATO: sim(d.tipo.imediato),
    T_CURTO: sim(d.tipo.curto),
    T_MEDIO: sim(d.tipo.medio),
    VALOR_TOTAL: valorComExtenso(d.valorTotal),
    DATA_EXTENSO: dataPorExtenso(d.assinaturaEm),
  };
}

/** O que impede gerar (lista vazia = pode gerar). */
export function pendenciasDoContrato(d: DadosDoContrato): string[] {
  const falta: string[] = [];
  if (!d.numero || d.numero <= 0) falta.push("o número do contrato");
  if (!d.paciente.nome.trim()) falta.push("o nome do paciente");
  if ((d.paciente.cpf || "").replace(/\D/g, "").length !== 11) falta.push("o CPF do paciente (11 dígitos)");
  if (!d.paciente.endereco.trim() || !d.paciente.municipio.trim()) falta.push("o endereço do paciente");
  if (!d.cids.length) falta.push("o CID");
  if (!d.protocolos.length) falta.push("pelo menos um protocolo");
  if (d.protocolos.some((p) => !p.titulo.trim())) falta.push("o nome de cada protocolo");
  if (!(d.valorTotal > 0)) falta.push("o valor total");
  const pago = Math.round(d.pagamentos.reduce((s, p) => s + (p.valor || 0), 0) * 100);
  if (!d.pagamentos.length) falta.push("a forma de pagamento");
  else if (pago !== Math.round(d.valorTotal * 100)) falta.push(`a forma de pagamento somar o valor total (hoje soma ${valorComExtenso(pago / 100)})`);
  return falta;
}

/** O que convém conferir, sem travar (o modelo aceita campo em branco). */
export function avisosDoContrato(d: DadosDoContrato): string[] {
  const avisos: string[] = [];
  const p = d.paciente;
  if (!p.rg.trim()) avisos.push("RG em branco");
  if (!p.estadoCivil.trim()) avisos.push("estado civil em branco");
  if (!p.profissao.trim()) avisos.push("profissão em branco");
  if (!p.nascimento) avisos.push("data de nascimento em branco");
  if (p.cep.replace(/\D/g, "").length !== 8) avisos.push("CEP sem 8 dígitos");
  if (!p.email.trim()) avisos.push("e-mail em branco");
  if (d.protocolos.some((x) => !x.itens.length)) avisos.push("protocolo sem medicamento na tabela 1.5");
  if (!d.tipo.imediato && !d.tipo.curto && !d.tipo.medio) avisos.push("nenhum tipo de tratamento marcado");
  return avisos;
}

// ---------------------------------------------------------------------------
// O PAGAMENTO QUE O SISTEMA JÁ CONHECE (15/10/2026). Lucas: "se for para
// escrever tudo, a gente já faz isso". A cláusula 4 sai da comanda do
// fechamento (o que já foi pago, com forma e parcelas) e dos lembretes em
// aberto (o que foi combinado para depois). A recepção só confere.
// ---------------------------------------------------------------------------

export type ComandaParaContrato = { ref: string; dia: string; pagamentos: { metodo: string; valor: number; parcelas: number }[] };
export type LembreteParaContrato = { valor: number; dataPrevista: string; observacao: string };

const MEIO_DO_METODO: Record<string, string> = {
  PIX: "PIX",
  CARTAO_CREDITO: "CARTÃO DE CRÉDITO",
  CARTAO_DEBITO: "CARTÃO DE DÉBITO",
  DINHEIRO: "DINHEIRO",
  TRANSFERENCIA: "TRANSFERÊNCIA",
  BOLETO: "BOLETO",
};

/** A forma do lembrete sai da observação que a recepção escreveu ("6x no link", "pix dia 20"). */
export function meioDoLembrete(observacao: string): { meio: string | null; parcelas: number } {
  const t = (observacao || "").toLowerCase();
  const parcelas = Number(t.match(/(\d{1,2})\s*x\b/)?.[1] ?? 1) || 1;
  if (/\blink\b/.test(t)) return { meio: "LINK DE PAGAMENTO", parcelas };
  if (/cart[aã]o|cr[eé]dito/.test(t)) return { meio: "CARTÃO DE CRÉDITO", parcelas };
  if (/boleto/.test(t)) return { meio: "BOLETO", parcelas };
  if (/\bpix\b/.test(t)) return { meio: "PIX", parcelas };
  return { meio: null, parcelas };
}

export function pagamentoSugerido(comanda: ComandaParaContrato | null, lembretes: LembreteParaContrato[]): { valorTotal: number; pagamentos: PagamentoDoContrato[]; avisos: string[] } {
  const pagamentos: PagamentoDoContrato[] = [];
  const avisos: string[] = [];
  for (const p of comanda?.pagamentos ?? []) {
    if (!(p.valor > 0)) continue;
    pagamentos.push({ valor: p.valor, meio: MEIO_DO_METODO[p.metodo] ?? p.metodo, parcelas: Math.max(1, p.parcelas || 1), data: comanda!.dia });
  }
  for (const l of [...lembretes].sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista))) {
    if (!(l.valor > 0)) continue;
    const { meio, parcelas } = meioDoLembrete(l.observacao);
    if (!meio) avisos.push(`A forma do pagamento de ${l.dataPrevista.split("-").reverse().join("/")} não está escrita no lembrete: confira.`);
    pagamentos.push({ valor: l.valor, meio: meio ?? "PIX", parcelas, data: l.dataPrevista });
  }
  const valorTotal = Math.round(pagamentos.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  return { valorTotal, pagamentos, avisos };
}

/** A ficha guardada vira os campos do contratante (só preenche o que estiver vazio). */
export type FichaDoContato = Partial<Pick<DadosDoContrato["paciente"], "nacionalidade" | "estadoCivil" | "profissao" | "rg" | "nascimento" | "endereco" | "numeroEnd" | "bairro" | "municipio" | "uf" | "cep" | "cpf" | "email" | "telefone">>;

export function completarComFicha(base: DadosDoContrato, ficha: FichaDoContato): DadosDoContrato {
  const p = { ...base.paciente };
  const padrao: Partial<Record<keyof typeof p, string>> = { nacionalidade: "BRASILEIRA", municipio: "SÃO PAULO", uf: "SP" };
  for (const [k, v] of Object.entries(ficha) as [keyof typeof p, string | undefined][]) {
    if (!v) continue;
    const atual = (p[k] ?? "").trim();
    // Vazio, ou ainda com o valor padrão da tela: a ficha vence.
    if (!atual || atual === padrao[k]) p[k] = k === "email" || k === "nascimento" || k === "cep" || k === "telefone" ? v : v.toUpperCase();
  }
  return { ...base, paciente: p };
}
