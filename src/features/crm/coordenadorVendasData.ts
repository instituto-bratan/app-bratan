// PLANILHA DE GESTÃO — COORDENADOR DE VENDAS (08/09/2026, planilha do Lucas).
//
// A planilha tem 5 abas: Registro de Contatos (uma linha por paciente que
// entrou em contato: data, nome, origem, agendou?, compareceu?, fechou?, obs.),
// Funil de Contatos (soma AUTOMÁTICA da primeira aba, por origem), PDCA de
// Prescrições, PDCA de Agendamentos e Plano de Ação.
//
// No app, a primeira aba NÃO é digitada: cada lead/negociação do CRM já é uma
// linha — data de entrada, origem pelo canal do contato, e "agendou /
// compareceu / fechou" pela etapa em que o card está. O funil se soma sozinho,
// como na planilha. As três abas de PDCA continuam sendo leitura humana e ficam
// guardadas por mês (crm_coordenador_mes).
import type { FinSale } from "@/features/financeiro/financeiroData";
import {
  contactDisplayName,
  dealStages,
  normalizeSalesChannel,
  objectionCategoryLabels,
  type CrmContact,
  type CrmDeal,
  type CrmState,
} from "./crmData";

export type OrigemContato = "INDICACAO" | "FIDELIZADO" | "REDES_OUTROS";

export const origemLabels: Record<OrigemContato, string> = {
  INDICACAO: "Indicação",
  FIDELIZADO: "Fidelizados (nova consulta)",
  REDES_OUTROS: "Redes sociais / páginas / outros",
};
export const origens: OrigemContato[] = ["INDICACAO", "FIDELIZADO", "REDES_OUTROS"];

export type LinhaRegistro = {
  dealId: string;
  contactId: string;
  data: string;
  nome: string;
  origem: OrigemContato;
  canal: string;
  agendou: boolean;
  compareceu: boolean;
  fechou: boolean;
  observacoes: string;
};

const indice = (stage: CrmDeal["stage"]) => dealStages.indexOf(stage);
const I_AGENDADA = indice("CONSULTA_AGENDADA");
const I_REALIZADA = indice("CONSULTA_REALIZADA");
// Etapas depois da consulta que não são "consulta realizada" mas pressupõem que ela aconteceu.
const POS_CONSULTA = new Set<CrmDeal["stage"]>(["PRESCRICAO_FEITA", "EM_NEGOCIACAO", "FECHOU_COMPLETO", "FECHOU_PARCIAL", "NAO_FECHOU", "RECUPERACAO_D1_MEDICO", "RECUPERACAO_D2_GESTOR", "NAO_ADESAO"]);

export function origemDoContato(contact: CrmContact | undefined, jaEraPaciente: boolean): OrigemContato {
  if (!contact) return "REDES_OUTROS";
  if (contact.referrerContactId || normalizeSalesChannel(contact.sourceChannel) === "Indicação") return "INDICACAO";
  if (jaEraPaciente) return "FIDELIZADO";
  return "REDES_OUTROS";
}

export function dealAgendou(deal: CrmDeal) {
  return Boolean(deal.programPhase) || indice(deal.stage) >= I_AGENDADA;
}
export function dealCompareceu(deal: CrmDeal) {
  return Boolean(deal.programPhase) || indice(deal.stage) >= I_REALIZADA || POS_CONSULTA.has(deal.stage);
}
export function dealFechou(deal: CrmDeal) {
  return Boolean(deal.programPhase) || deal.status === "WON_FULL" || deal.status === "WON_PARTIAL" || deal.stage === "FECHOU_COMPLETO" || deal.stage === "FECHOU_PARCIAL";
}

/** Aba 1 — Registro de contatos do mês, derivado das negociações criadas no mês. */
export function registroDeContatos(state: CrmState, sales: FinSale[], monthKey: string): LinhaRegistro[] {
  const contatos = new Map(state.contacts.map((contact) => [contact.id, contact]));
  const primeiraComanda = new Map<string, string>();
  for (const sale of sales) {
    if (!sale.crmContactRef) continue;
    const atual = primeiraComanda.get(sale.crmContactRef);
    if (!atual || sale.saleDate < atual) primeiraComanda.set(sale.crmContactRef, sale.saleDate);
  }
  return state.deals
    .filter((deal) => deal.createdAt.slice(0, 7) === monthKey)
    .map((deal) => {
      const contact = contatos.get(deal.contactId);
      const primeira = primeiraComanda.get(deal.contactId);
      const jaEraPaciente = Boolean(primeira && primeira < deal.createdAt.slice(0, 10));
      const objecao = deal.mainObjection || (deal.objectionCategory && deal.objectionCategory !== "OTHER" ? objectionCategoryLabels[deal.objectionCategory] : "");
      return {
        dealId: deal.id,
        contactId: deal.contactId,
        data: deal.createdAt.slice(0, 10),
        nome: contactDisplayName(contact),
        origem: origemDoContato(contact, jaEraPaciente),
        canal: contact ? normalizeSalesChannel(contact.sourceChannel) : "Não informado",
        agendou: dealAgendou(deal),
        compareceu: dealCompareceu(deal),
        fechou: dealFechou(deal),
        observacoes: objecao,
      };
    })
    .sort((a, b) => b.data.localeCompare(a.data) || a.nome.localeCompare(b.nome));
}

export type LinhaFunil = {
  origem: OrigemContato | "TOTAL";
  mensagens: number;
  agendaram: number;
  pctAgendamento: number | null;
  compareceram: number;
  fecharam: number;
  pctFechamento: number | null;
};

/** Aba 2 — Funil de contatos: soma automática da aba 1, por origem (as mesmas fórmulas da planilha). */
export function funilDeContatos(linhas: LinhaRegistro[]): LinhaFunil[] {
  const soma = (lista: LinhaRegistro[], origem: LinhaFunil["origem"]): LinhaFunil => {
    const mensagens = lista.length;
    const agendaram = lista.filter((l) => l.agendou).length;
    const compareceram = lista.filter((l) => l.compareceu).length;
    const fecharam = lista.filter((l) => l.fechou).length;
    return {
      origem,
      mensagens,
      agendaram,
      pctAgendamento: mensagens ? agendaram / mensagens : null,
      compareceram,
      fecharam,
      pctFechamento: agendaram ? fecharam / agendaram : null,
    };
  };
  return [...origens.map((origem) => soma(linhas.filter((l) => l.origem === origem), origem)), soma(linhas, "TOTAL")];
}

// ---- Abas 3, 4 e 5: leitura humana, guardadas por mês -----------------------
export type LinhaPrescricao = { profissional: string; prescritos: number; fechados: number; observacoes: string };
export type LinhaAgendamento = { colaborador: string; meta: number; realizados: number; acao: string };
export type PlanoDeAcao = { plan: string; do: string; check: string; act: string };

/** Linha digitada à mão no Registro (como na planilha), sem virar lead no CRM. */
export type LinhaManual = {
  id: string;
  data: string;
  nome: string;
  origem: OrigemContato;
  agendou: boolean;
  compareceu: boolean;
  fechou: boolean;
  observacoes: string;
};

export function linhaManualComoRegistro(linha: LinhaManual): LinhaRegistro {
  return {
    dealId: `manual:${linha.id}`,
    contactId: "",
    data: linha.data,
    nome: linha.nome || "(sem nome)",
    origem: linha.origem,
    canal: "digitado",
    agendou: linha.agendou,
    compareceu: linha.compareceu,
    fechou: linha.fechou,
    observacoes: linha.observacoes,
  };
}

export type CoordenadorMes = {
  registroManual: LinhaManual[];
  prescricoes: LinhaPrescricao[];
  agendamentos: LinhaAgendamento[];
  planoDeAcao: PlanoDeAcao;
};

export const coordenadorMesVazio: CoordenadorMes = {
  registroManual: [],
  prescricoes: [{ profissional: "Dr. Daniel", prescritos: 0, fechados: 0, observacoes: "" }],
  agendamentos: [],
  planoDeAcao: { plan: "", do: "", check: "", act: "" },
};

export function normalizaCoordenadorMes(raw: unknown): CoordenadorMes {
  const r = (raw ?? {}) as Partial<CoordenadorMes>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const origem = (v: unknown): OrigemContato => (origens.includes(v as OrigemContato) ? (v as OrigemContato) : "REDES_OUTROS");
  return {
    registroManual: Array.isArray(r.registroManual)
      ? r.registroManual.map((l, i) => ({
          id: String(l?.id ?? `man-${i}`),
          data: String(l?.data ?? ""),
          nome: String(l?.nome ?? ""),
          origem: origem(l?.origem),
          agendou: Boolean(l?.agendou),
          compareceu: Boolean(l?.compareceu),
          fechou: Boolean(l?.fechou),
          observacoes: String(l?.observacoes ?? ""),
        }))
      : [],
    prescricoes: Array.isArray(r.prescricoes)
      ? r.prescricoes.map((p) => ({ profissional: String(p?.profissional ?? ""), prescritos: num(p?.prescritos), fechados: num(p?.fechados), observacoes: String(p?.observacoes ?? "") }))
      : coordenadorMesVazio.prescricoes,
    agendamentos: Array.isArray(r.agendamentos)
      ? r.agendamentos.map((a) => ({ colaborador: String(a?.colaborador ?? ""), meta: num(a?.meta), realizados: num(a?.realizados), acao: String(a?.acao ?? "") }))
      : [],
    planoDeAcao: { plan: String(r.planoDeAcao?.plan ?? ""), do: String(r.planoDeAcao?.do ?? ""), check: String(r.planoDeAcao?.check ?? ""), act: String(r.planoDeAcao?.act ?? "") },
  };
}

export function pct(numerador: number, denominador: number): number | null {
  return denominador > 0 ? numerador / denominador : null;
}

export function formataPct(valor: number | null) {
  return valor === null ? "—" : `${Math.round(valor * 1000) / 10}%`.replace(".", ",");
}
