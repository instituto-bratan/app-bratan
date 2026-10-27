// Dados de exemplo para o portal em modo prévia (sem Supabase): servem para
// desenhar, testar e mostrar a interface sem tocar em paciente real.
import type { PortalDados } from "./portalPaciente";
import { SEMANAS_DE_EXEMPLO, semanaDoPlano } from "../../../supabase/functions/_shared/semanaDoPaciente";

/**
 * A semana do meio do plano na demonstração (27/10/2026). Texto de exemplo, no
 * mesmo tom que a equipe vai escrever: educativo, sem promessa e sem remédio.
 */
export const SEMANA_DO_MEIO_DE_EXEMPLO = {
  titulo: "Meio do caminho: constância vale mais que pressa",
  costumaAcontecer: "Por volta do quarto mês é comum a balança andar mais devagar. Nesta fase a rotina pesa mais do que qualquer semana isolada, e a composição do corpo conta a parte da história que o peso não conta.",
  missao: "Escolha uma refeição da semana para preparar com calma e repare em como você se sente depois dela.",
};

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
    // As consultas que já aconteceram entram na linha do tempo da Jornada (22/09/2026).
    consultas: [
      { id: "c0", em: `${soma(-101)}T10:00:00-03:00`, profissional: "Dr. Daniel", tipo: "Primeira consulta", local: "Instituto Bratan · Itaim", status: "REALIZADA", origem: "MANUAL" },
      { id: "c2", em: `${soma(-40)}T14:00:00-03:00`, profissional: "Dr. Daniel", tipo: "1ª consulta de acompanhamento", local: "Instituto Bratan · Itaim", status: "REALIZADA", origem: "MANUAL" },
      { id: "c1", em: `${soma(11)}T14:00:00-03:00`, profissional: "Dr. Daniel", tipo: "2ª consulta de acompanhamento", local: "Instituto Bratan · Itaim", status: "AGENDADA", origem: "MANUAL" },
    ],
    medicoes: [
      { id: "m1", dia: inicio, pesoKg: 92.4, gorduraPct: 34.1, massaMagraKg: 55.2, cinturaCm: 98, inbodyScore: 64, gorduraVisceral: 12, massaMuscularKg: 30.1, tmbKcal: 1562, origem: "ENFERMAGEM" },
      { id: "m2", dia: soma(-86), pesoKg: 91.6, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" },
      { id: "m3", dia: soma(-70), pesoKg: 90.1, gorduraPct: 33.0, massaMagraKg: 55.4, cinturaCm: 96, inbodyScore: 66, gorduraVisceral: 11, massaMuscularKg: 30.3, tmbKcal: 1566, origem: "ENFERMAGEM" },
      { id: "m4", dia: soma(-55), pesoKg: 89.3, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" },
      { id: "m5", dia: soma(-40), pesoKg: 88.0, gorduraPct: 31.5, massaMagraKg: 55.6, cinturaCm: 94, inbodyScore: 69, gorduraVisceral: 10, massaMuscularKg: 30.6, tmbKcal: 1571, origem: "ENFERMAGEM" },
      { id: "m6", dia: soma(-26), pesoKg: 87.4, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" },
      { id: "m7", dia: soma(-10), pesoKg: 86.2, gorduraPct: 30.2, massaMagraKg: 55.9, cinturaCm: 92, inbodyScore: 72, gorduraVisceral: 10, massaMuscularKg: 30.9, tmbKcal: 1579, origem: "ENFERMAGEM" },
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
    // Fotos de evolução: na demo são silhuetas desenhadas (nunca foto de gente).
    // A voz do doutor: na demo é só texto (não existe áudio de exemplo — e não se inventa voz do médico).
    // MOTIVO PARA ABRIR (27/10/2026): a semana do plano com o check-in em branco e um
    // recado do Dr. ainda trancado. Na demonstração não existe áudio: o cadeado mostra
    // a contagem, e quem toca um recado aberto lê que não se inventa a voz de ninguém.
    semana: { numero: semanaDoPlano(inicio, hojeISO) ?? 1, conteudo: SEMANA_DO_MEIO_DE_EXEMPLO, checkin: null },
    recados: [{ id: "demo-recado-dr", autor: "DOUTOR", quemFala: "Dr. Daniel", duracaoS: 42, abreEm: soma(5), aberto: false, ouvidoEm: null, criadoEm: `${soma(-40)}T15:00:00-03:00` }],
    vozDoDoutor: { id: "demo-voz", fase: "MEIO", rotuloDaFase: "Meio do caminho", titulo: "Você está no meio do caminho", texto: "Mariana, esse é o mês em que a balança costuma andar mais devagar — e é normal. O que eu olho agora é a composição: gordura caindo, músculo firme. Você está fazendo exatamente isso. Mantém a rotina, me manda a pesagem da semana, e a gente ajusta o resto na consulta.", urlAudio: null, duracaoS: null, ouvidaEm: null },
    fotos: [
      { id: "demo-f1", dia: inicio, angulo: "FRENTE", url: silhueta(1.0, "primeira") },
      { id: "demo-f2", dia: hojeISO, angulo: "FRENTE", url: silhueta(0.86, "hoje") },
      { id: "demo-l1", dia: inicio, angulo: "LADO", url: silhueta(1.0, "primeira") },
    ],
    geradoEm: `${hojeISO}T09:00:00-03:00`,
  };
}

/**
 * O PACIENTE QUE ACABOU DE ENTRAR (16/09/2026).
 *
 * É o estado que a maioria vê no primeiro acesso: plano fechado, primeira
 * consulta marcada e mais nada — sem medição, sem histórico, sem documento.
 * Serve para a recepção mostrar como o portal chega para quem está começando,
 * e para conferirmos que a tela vazia continua bonita.
 */
export function dadosDemoNovo(hojeISO: string): PortalDados {
  const base = dadosDemo(hojeISO);
  const [a, m, d] = hojeISO.split("-").map(Number);
  const dia = (n: number) => {
    const x = new Date(a, m - 1, d + n, 12);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const inicio = dia(-3);
  return {
    ...base,
    paciente: { nome: "Helena Costa", primeiroNome: "Helena", contactRef: "demo-novo" },
    plano: { ...base.plano!, inicio, marcosFeitos: [], valorRecebido: 0, closedAt: `${inicio}T15:00:00-03:00`, programPhaseEnteredAt: `${inicio}T15:00:00-03:00`, createdAt: `${inicio}T15:00:00-03:00` },
    consultas: [{ id: "c1", em: `${dia(6)}T09:30:00-03:00`, profissional: "Dr. Daniel", tipo: "1ª consulta do plano", local: "Instituto Bratan · Itaim", status: "AGENDADA", origem: "MANUAL" }],
    medicoes: [],
    comandas: [],
    parcelasAbertas: [],
    documentos: [],
    fotos: [],
    // Primeira semana: o texto de exemplo da semana 1 e o recado que o Dr. gravou no
    // fechamento, trancado até o dia 15 do plano (27/10/2026).
    semana: { numero: semanaDoPlano(inicio, hojeISO) ?? 1, conteudo: { titulo: SEMANAS_DE_EXEMPLO[0].titulo, costumaAcontecer: SEMANAS_DE_EXEMPLO[0].costumaAcontecer, missao: SEMANAS_DE_EXEMPLO[0].missao }, checkin: null },
    recados: [{ id: "demo-recado-dr-novo", autor: "DOUTOR", quemFala: "Dr. Daniel", duracaoS: 38, abreEm: dia(12), aberto: false, ouvidoEm: null, criadoEm: `${inicio}T15:00:00-03:00` }],
    // Quem acabou de entrar está no COMEÇO — a mensagem do meio do caminho (e o
    // nome da Mariana) não cabem aqui (22/09/2026).
    vozDoDoutor: { id: "demo-voz-comeco", fase: "COMECO", rotuloDaFase: "Começo", titulo: "Bem-vinda ao seu plano", texto: "Começar é a parte mais difícil, e você já fez. Nas primeiras semanas o corpo está se ajustando: a balança sobe e desce, e isso não quer dizer nada ainda. Não se pese todo dia. Vem na primeira consulta que a gente monta o caminho juntos.", urlAudio: null, duracaoS: null, ouvidaEm: null },
  };
}

/**
 * Silhueta para a demo das fotos de evolução: um SVG desenhado, com a largura
 * do tronco em escala, para a comparação "primeira × hoje" aparecer sem usar
 * foto de pessoa nenhuma.
 */
function silhueta(escala: number, legenda: string) {
  const w = Math.round(46 * escala);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 200"><rect width="150" height="200" fill="#e8efe9"/><circle cx="75" cy="38" r="16" fill="#9fb8a6"/><rect x="${75 - w}" y="58" width="${w * 2}" height="78" rx="22" fill="#9fb8a6"/><rect x="${75 - w * 0.7}" y="130" width="${w * 0.55}" height="56" rx="10" fill="#9fb8a6"/><rect x="${75 + w * 0.15}" y="130" width="${w * 0.55}" height="56" rx="10" fill="#9fb8a6"/><text x="75" y="196" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#5c7a64">${legenda}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
