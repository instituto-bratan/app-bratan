// O PLANO DA V22 → PROTOCOLO DO SISTEMA (28/10/2026).
//
// O app do doutor (public/doutor/plano.js, a v22 que ele já conhece) continua
// calculando tudo: preço de cada item, pellets, desconto, Pix (+8%) e 6x
// (+12%). Ele só passou a expor um "retrato" do plano (window.BratanPlano).
// Este arquivo transforma o retrato no que a tabela `protocolo` guarda e confere
// a conta antes de enviar: se o Pix do retrato não bate com a regra da v22, o
// envio é recusado aqui, antes de chegar ao comercial com número torto.
//
// Sem React, sem Supabase: os testes (tests/doutor-protocolo.test.mjs) leem
// este arquivo direto.
import type { ItemDoProtocolo, OpcoesDePagamento } from "@/features/fechamento/protocolo";

/** Regras de valor da v22: 8% sobre a soma no à vista, e mais 12% no parcelado em 6x. */
export const FATOR_AVISTA_V22 = 1.08;
export const FATOR_PARCELADO_V22 = 1.12;
export const PARCELAS_V22 = 6;

export type LinhaDoRetrato = {
  id: string;
  nome: string;
  nomeParaPaciente: string;
  /** "4 doses", "2 frascos", "3x" — o texto que a v22 já usa. */
  quantidadeTexto: string;
  /** Observação do catálogo para o paciente ("até 30 unidades por dose"). */
  nota: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  precoDeTabela: number;
  valor: number;
  pellets: { id: string; nome: string; quantidade: number; precoUnitario: number; valor: number }[];
};

/** O que window.BratanPlano.retrato() devolve (public/doutor/plano.js). */
export type RetratoDaV22 = {
  versao: string;
  nome: string;
  linhas: LinhaDoRetrato[];
  totais: {
    soma: number;
    avistaSemDesconto: number;
    desconto: number;
    pix: number;
    parceladoTotal: number;
    parcela: number;
    parcelas: number;
    fatorAvista: number;
    fatorParcelado: number;
  };
  desconto: { tipo: "reais" | "pct"; informado: number; texto: string };
  /** BRA-AAAAMMDD-NNN, quando o doutor já baixou o relatório deste plano. */
  numeroBra: string | null;
  /** O código do Closer, no formato de sempre ("BRA" + base64 do JSON). */
  codigoBra: string;
  /** O estado cru da v22 (bratan_rascunho_v2), para conferência. */
  estado: unknown;
};

/** O corpo que vai para public.protocolo_enviar (snake_case, como o banco lê). */
export type EnvioDoProtocolo = {
  client_ref: string;
  paciente_nome: string;
  contact_ref: string | null;
  agenda_ref: string | null;
  itens: ItemDoProtocolo[];
  opcoes_pagamento: OpcoesDePagamento;
  payload: Record<string, unknown>;
  numero_bra: string | null;
  substitui: string | null;
  criado_no_aparelho_em: string;
};

const centavos = (valor: number) => Math.round((Number.isFinite(valor) ? valor : 0) * 100) / 100;

/**
 * A conta da v22, refeita do zero a partir das linhas e do desconto. É a mesma
 * de totals() em plano.js: desconto sobre o à vista (soma + 8%), em reais ou em
 * % (no máximo 100%), nunca abaixo de zero; o 6x é o Pix + 12%.
 */
export function calcularOpcoesV22(soma: number, desconto: { tipo: "reais" | "pct"; informado: number }): OpcoesDePagamento {
  const avistaSemDesconto = soma * FATOR_AVISTA_V22;
  const informado = Number.isFinite(desconto.informado) && desconto.informado > 0 ? desconto.informado : 0;
  let valorDoDesconto = 0;
  if (informado > 0 && soma > 0) {
    valorDoDesconto = desconto.tipo === "pct" ? avistaSemDesconto * (Math.min(informado, 100) / 100) : Math.min(informado, avistaSemDesconto);
  }
  const pix = Math.max(0, avistaSemDesconto - valorDoDesconto);
  const parceladoTotal = pix * FATOR_PARCELADO_V22;
  return {
    soma_itens: centavos(soma),
    avista_sem_desconto: centavos(avistaSemDesconto),
    desconto: centavos(valorDoDesconto),
    desconto_tipo: desconto.tipo === "pct" ? "pct" : "reais",
    desconto_informado: informado,
    pix: centavos(pix),
    parcelas: PARCELAS_V22,
    parcela: centavos(parceladoTotal / PARCELAS_V22),
    parcelado_total: centavos(parceladoTotal),
    fator_avista: FATOR_AVISTA_V22,
    fator_parcelado: FATOR_PARCELADO_V22,
  };
}

/** As linhas da v22 viram os itens do protocolo (o vendedor lê; o banco confere a soma). */
export function itensDoRetrato(retrato: RetratoDaV22): ItemDoProtocolo[] {
  return retrato.linhas.map((linha) => {
    const detalhe = [linha.quantidadeTexto.trim(), linha.nota.trim()].filter(Boolean).join(", ");
    return {
      id: linha.id,
      nome: linha.nome,
      nome_paciente: linha.nomeParaPaciente || linha.nome,
      detalhe: detalhe ? detalhe.charAt(0).toUpperCase() + detalhe.slice(1) : "",
      categoria: linha.categoria,
      unidade: linha.unidade || "un",
      quantidade: Math.max(1, Math.round(linha.quantidade) || 1),
      preco_unitario: centavos(linha.precoUnitario),
      preco_tabela: centavos(linha.precoDeTabela),
      valor: centavos(linha.valor),
      pellets: (linha.pellets ?? []).map((pellet) => ({
        id: pellet.id,
        nome: pellet.nome,
        quantidade: Math.max(1, Math.round(pellet.quantidade) || 1),
        preco_unitario: centavos(pellet.precoUnitario),
        valor: centavos(pellet.valor),
      })),
    };
  });
}

/** As opções de pagamento COMO A V22 CALCULOU (os números que o paciente viu). */
export function opcoesDoRetrato(retrato: RetratoDaV22): OpcoesDePagamento {
  const t = retrato.totais;
  return {
    soma_itens: centavos(t.soma),
    avista_sem_desconto: centavos(t.avistaSemDesconto),
    desconto: centavos(t.desconto),
    desconto_tipo: retrato.desconto.tipo === "pct" ? "pct" : "reais",
    desconto_informado: Number.isFinite(retrato.desconto.informado) ? retrato.desconto.informado : 0,
    pix: centavos(t.pix),
    parcelas: Math.max(1, Math.round(t.parcelas) || PARCELAS_V22),
    parcela: centavos(t.parcela),
    parcelado_total: centavos(t.parceladoTotal),
    fator_avista: t.fatorAvista || FATOR_AVISTA_V22,
    fator_parcelado: t.fatorParcelado || FATOR_PARCELADO_V22,
  };
}

/**
 * O que impede enviar. `null` = pode. A conta é refeita aqui: um plano.js
 * velho (cache do aparelho) ou mexido não manda número torto ao comercial.
 */
export function travaDoRetrato(retrato: RetratoDaV22 | null | undefined): string | null {
  if (!retrato || !Array.isArray(retrato.linhas)) return "O plano não carregou. Feche e abra o app do doutor.";
  if (!retrato.linhas.length) return "Adicione itens ao plano antes de enviar.";
  if (retrato.nome.trim().length < 2) return "Informe o nome do paciente antes de enviar.";
  const somaDasLinhas = retrato.linhas.reduce((soma, linha) => soma + (Number.isFinite(linha.valor) ? linha.valor : 0), 0);
  if (Math.abs(somaDasLinhas - retrato.totais.soma) > 1) return "A soma dos itens não confere com o plano. Feche e abra o app do doutor.";
  const conferida = calcularOpcoesV22(retrato.totais.soma, retrato.desconto);
  if (Math.abs(conferida.pix - retrato.totais.pix) > 1 || Math.abs(conferida.parcelado_total - retrato.totais.parceladoTotal) > 1) {
    return "O valor do Pix não confere com a regra do plano (soma + 8%, menos o desconto). Feche e abra o app do doutor.";
  }
  return null;
}

function normalizarNome(nome: string) {
  return nome.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A "impressão digital" do plano: muda quando muda o paciente, um item, uma
 * quantidade, um preço, um pellet ou o desconto. É ela que decide se apertar
 * "Enviar" de novo é o MESMO protocolo (não duplica) ou uma versão nova.
 */
export function assinaturaDoRetrato(retrato: RetratoDaV22): string {
  return JSON.stringify({
    n: normalizarNome(retrato.nome),
    l: retrato.linhas.map((linha) => [
      linha.id,
      Math.round(linha.quantidade) || 1,
      centavos(linha.precoUnitario),
      (linha.pellets ?? []).map((pellet) => [pellet.id, Math.round(pellet.quantidade) || 1]),
    ]),
    d: [retrato.desconto.tipo === "pct" ? "pct" : "reais", Number.isFinite(retrato.desconto.informado) ? retrato.desconto.informado : 0],
  });
}

/** Monta o corpo do envio. Os refs vêm da agenda (quando o doutor escolheu dela). */
export function montarEnvio(
  retrato: RetratoDaV22,
  contexto: { clientRef: string; agendaRef: string | null; contactRef: string | null; substitui: string | null; agoraISO: string },
): EnvioDoProtocolo {
  return {
    client_ref: contexto.clientRef,
    paciente_nome: retrato.nome.replace(/\s+/g, " ").trim(),
    contact_ref: contexto.contactRef,
    agenda_ref: contexto.agendaRef,
    itens: itensDoRetrato(retrato),
    opcoes_pagamento: opcoesDoRetrato(retrato),
    payload: {
      origem: "app-do-doutor",
      versao: retrato.versao,
      linhas: retrato.linhas,
      totais: retrato.totais,
      desconto: retrato.desconto,
      codigo_bra: retrato.codigoBra,
      estado: retrato.estado,
    },
    numero_bra: retrato.numeroBra,
    substitui: contexto.substitui,
    criado_no_aparelho_em: contexto.agoraISO,
  };
}
