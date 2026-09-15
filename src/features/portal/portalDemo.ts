// Dados de exemplo para o portal em modo prévia (sem Supabase): servem para
// desenhar, testar e mostrar a interface sem tocar em paciente real.
import type { PortalDados } from "./portalPaciente";

export function dadosDemo(hojeISO: string): PortalDados {
  const soma = (dias: number) => {
    const [a, m, d] = hojeISO.split("-").map(Number);
    const x = new Date(a, m - 1, d + dias, 12);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const inicio = soma(-100);
  return {
    paciente: { nome: "Mariana Prado", primeiroNome: "Mariana", contactRef: "demo" },
    plano: { dealId: "demo-deal", canal: "PROGRAMA", inicio, fase: "CADENCIA_PROGRAMA", marcosFeitos: ["CHECK-1", "BIO-1", "CHECK-2", "BIO-2", "MEDICO-1", "CHECK-3", "BIO-3"], valorContratado: 8990, valorRecebido: 5995, closedAt: `${inicio}T15:00:00-03:00`, programPhaseEnteredAt: `${inicio}T15:00:00-03:00`, createdAt: `${inicio}T15:00:00-03:00`, updatedAt: `${hojeISO}T09:00:00-03:00` },
    consultas: [{ id: "c1", em: `${soma(11)}T14:00:00-03:00`, profissional: "Dr. Daniel", tipo: "2ª consulta de acompanhamento", local: "Instituto Bratan · Itaim", status: "AGENDADA", origem: "MANUAL" }],
    medicoes: [
      { id: "m1", dia: inicio, pesoKg: 92.4, gorduraPct: 34.1, massaMagraKg: 55.2, cinturaCm: 98, origem: "ENFERMAGEM" },
      { id: "m2", dia: soma(-86), pesoKg: 91.6, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" },
      { id: "m3", dia: soma(-70), pesoKg: 90.1, gorduraPct: 33.0, massaMagraKg: 55.4, cinturaCm: 96, origem: "ENFERMAGEM" },
      { id: "m4", dia: soma(-55), pesoKg: 89.3, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" },
      { id: "m5", dia: soma(-40), pesoKg: 88.0, gorduraPct: 31.5, massaMagraKg: 55.6, cinturaCm: 94, origem: "ENFERMAGEM" },
      { id: "m6", dia: soma(-26), pesoKg: 87.4, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" },
      { id: "m7", dia: soma(-10), pesoKg: 86.2, gorduraPct: 30.2, massaMagraKg: 55.9, cinturaCm: 92, origem: "ENFERMAGEM" },
    ],
    comandas: [
      { id: "s1", dia: inicio, itens: [{ descricao: "Programa de Acompanhamento · 6 meses", tipo: "PLANO", valor: 8990 }], pagamentos: [{ metodo: "PIX", valor: 2995, parcelas: 1 }, { metodo: "CARTAO_CREDITO", valor: 3000, parcelas: 3 }], total: 8990 },
      { id: "s2", dia: soma(-101), itens: [{ descricao: "Primeira consulta", tipo: "CONSULTA", valor: 1200 }], pagamentos: [{ metodo: "PIX", valor: 1200, parcelas: 1 }], total: 1200 },
    ],
    parcelasAbertas: [{ id: "p1", valor: 1497.5, prevista: soma(9), observacao: "3ª de 4" }, { id: "p2", valor: 1497.5, prevista: soma(39), observacao: "4ª de 4" }],
    documentos: [
      { tipo: "CONTRATO", titulo: "Contrato de adesão (assinado)", url: null, numero: null, dia: inicio },
      { tipo: "NOTA_FISCAL", titulo: "Nota fiscal nº 6104", url: null, numero: "6104", dia: soma(-99) },
    ],
    consentimentos: [{ tipo: "LGPD", aceito: true, em: `${inicio}T15:00:00-03:00` }, { tipo: "TRATAMENTO", aceito: true, em: `${inicio}T15:00:00-03:00` }],
    geradoEm: `${hojeISO}T09:00:00-03:00`,
  };
}
