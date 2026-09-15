// CONFIGURAÇÕES DO NEGÓCIO COM VIGÊNCIA (14/09/2026, proposta 7.3 do estudo).
//
// Até aqui, mudar a grade de salas, o limite de aprovação de um pagamento, o
// dia da transferência aos sócios ou o valor do voucher exigia deploy. Agora
// cada constante tem uma CHAVE, um valor padrão (o que valia no código) e um
// histórico de linhas com data de vigência na tabela app_config_vigencia: o
// valor que vale num dia é o da última linha com vigente_de <= dia.
//
// Este módulo é PURO (sem Supabase): guarda um cache em memória que o hook
// useConfigNegocio preenche ao entrar no app. Os motores chamam configAtual()
// na hora de calcular — nos testes, sem cache, valem os padrões do código.
export type ChaveConfig =
  | "salas.grade"
  | "transferencias.dias"
  | "caixa.piso"
  | "aprovacao.limite"
  | "aprovacao.aprovadores"
  | "crm.sla_lead_minutos"
  | "indicacao.voucher"
  | "indicacao.modo"
  | "lucro.provisoes_pct"
  | "lucro.reserva_pct"
  | "lucro.reserva_meta_meses"
  | "antecipacao.alternativas"
  | "rotina.hora"
  | "ocupacao.meta";

export type DefinicaoConfig<T = unknown> = {
  chave: ChaveConfig;
  grupo: "Salas e agenda" | "Lucro Inteligente" | "Contas a pagar" | "CRM e indicações" | "Rotinas";
  titulo: string;
  explicacao: string;
  padrao: T;
  /** Como a tela edita: número, lista de números, texto, escolha ou JSON livre. */
  tipo: "numero" | "percentual" | "lista-numeros" | "lista-textos" | "escolha" | "json";
  opcoes?: { valor: string; rotulo: string }[];
  unidade?: string;
};

export const DEFINICOES_CONFIG: DefinicaoConfig[] = [
  { chave: "salas.grade", grupo: "Salas e agenda", titulo: "Grade de salas (horas disponíveis)", explicacao: "Salas produtivas e horas por dia usadas no KPI de ocupação (planilha de precificação: 7 salas × 9 h). Quando a agenda estiver espelhada no app, as horas disponíveis passam a vir dela.", padrao: { salas: 7, horasPorDiaPorSala: 9 }, tipo: "json" },
  { chave: "ocupacao.meta", grupo: "Salas e agenda", titulo: "Faixa saudável de ocupação (%)", explicacao: "Benchmark de clínica saudável usado no Painel e na Home.", padrao: { minima: 75, maxima: 85 }, tipo: "json" },
  { chave: "transferencias.dias", grupo: "Lucro Inteligente", titulo: "Dias das transferências (sócios e médico)", explicacao: "Dias do mês em que as transferências do Lucro Inteligente são feitas; caindo em fim de semana ou feriado, vale o dia útil seguinte.", padrao: [10, 25], tipo: "lista-numeros" },
  { chave: "caixa.piso", grupo: "Lucro Inteligente", titulo: "Piso do caixa projetado", explicacao: "Saldo mínimo que o caixa projetado destaca como aperto quando a curva passa abaixo.", padrao: 0, tipo: "numero", unidade: "R$" },
  { chave: "lucro.provisoes_pct", grupo: "Lucro Inteligente", titulo: "Envelope Provisões (% do líquido)", explicacao: "Separa todo dia uma parte do líquido para 13º, férias e IRPJ/CSLL trimestrais. Zero = envelope desligado (o que valia até 14/09).", padrao: 0, tipo: "percentual", unidade: "%" },
  { chave: "lucro.reserva_pct", grupo: "Lucro Inteligente", titulo: "Envelope Reserva (% do líquido)", explicacao: "Separa uma parte do líquido para a reserva de emergência até atingir a meta em meses de despesa fixa. Zero = desligado.", padrao: 0, tipo: "percentual", unidade: "%" },
  { chave: "lucro.reserva_meta_meses", grupo: "Lucro Inteligente", titulo: "Meta da reserva (meses de despesas fixas)", explicacao: "Profit First recomenda de 1 a 3 meses de despesas fixas guardados.", padrao: 2, tipo: "numero", unidade: "meses" },
  { chave: "antecipacao.alternativas", grupo: "Lucro Inteligente", titulo: "Alternativas de antecipação de recebíveis", explicacao: "Taxas mensais para comparar com o RAV da Rede no painel de antecipação (proposta 2.10). Preços públicos de 14/09/2026; atualize quando negociar.", padrao: [{ nome: "Asaas (antecipação de cartão)", taxaMensal: 1.25 }, { nome: "InfinitePay Nitro", taxaMensal: 1.99 }], tipo: "json" },
  { chave: "aprovacao.limite", grupo: "Contas a pagar", titulo: "Limite para exigir aprovação", explicacao: "Conta com valor igual ou acima disso só pode ser marcada como paga depois de aprovada por alguém da lista de aprovadores. Zero = sem aprovação.", padrao: 5000, tipo: "numero", unidade: "R$" },
  { chave: "aprovacao.aprovadores", grupo: "Contas a pagar", titulo: "Quem aprova pagamentos acima do limite", explicacao: "Cargos que podem aprovar: ceo, dr_daniel, gestor_financeiro, gestor.", padrao: ["ceo", "dr_daniel"], tipo: "lista-textos" },
  { chave: "crm.sla_lead_minutos", grupo: "CRM e indicações", titulo: "SLA de resposta ao lead (minutos)", explicacao: "Tempo máximo entre o lead entrar e o primeiro toque. Responder em menos de 1 hora qualifica 7 vezes mais; a meta da casa é 5 minutos.", padrao: 5, tipo: "numero", unidade: "min" },
  { chave: "indicacao.voucher", grupo: "CRM e indicações", titulo: "Valor da cortesia por indicação", explicacao: "Valor do voucher/cortesia ao indicador.", padrao: 500, tipo: "numero", unidade: "R$" },
  { chave: "indicacao.modo", grupo: "CRM e indicações", titulo: "Como a cortesia é liberada", explicacao: "CONDICIONADO: libera quando o indicado passa em consulta (regra atual). CORTESIA: liberada ao indicar, sem condicionar a fechamento — leitura mais segura da CFM 2.336/2023 (art. 9º, VIII veda 'premiações'). Aguarda parecer (decisão D8).", padrao: "CONDICIONADO", tipo: "escolha", opcoes: [{ valor: "CONDICIONADO", rotulo: "Condicionado à consulta do indicado" }, { valor: "CORTESIA", rotulo: "Cortesia clínica não condicionada" }] },
  { chave: "rotina.hora", grupo: "Rotinas", titulo: "Hora da rotina diária", explicacao: "Hora (Brasília) em que a rotina monta a fila e os achados do dia. Mudar aqui exige reagendar o cron no Supabase.", padrao: 6, tipo: "numero", unidade: "h" },
];

export type LinhaConfig = { chave: string; valor: unknown; vigenteDe: string; criadoEm: string; observacao: string; criadoPorNome?: string | null };

let cache: LinhaConfig[] = [];
let carregadoEm: string | null = null;

/** O hook grava aqui as linhas vindas do banco; nos testes fica vazio e valem os padrões. */
export function definirCacheConfig(linhas: LinhaConfig[]) {
  cache = [...linhas].sort((a, b) => b.vigenteDe.localeCompare(a.vigenteDe) || b.criadoEm.localeCompare(a.criadoEm));
  carregadoEm = new Date().toISOString();
}

export function cacheConfigCarregado() {
  return carregadoEm !== null;
}

export function definicaoDaChave(chave: ChaveConfig) {
  return DEFINICOES_CONFIG.find((d) => d.chave === chave) ?? null;
}

/** Valor vigente de uma chave num dia (padrão: hoje), lendo o cache; sem linha, o padrão do código. */
export function configAtual<T>(chave: ChaveConfig, dia?: string, linhas: LinhaConfig[] = cache): T {
  const hoje = dia ?? new Date().toISOString().slice(0, 10);
  const vigente = linhas.find((linha) => linha.chave === chave && linha.vigenteDe <= hoje);
  if (vigente) return vigente.valor as T;
  const definicao = definicaoDaChave(chave);
  return definicao?.padrao as T;
}

/** Histórico de uma chave, do mais recente ao mais antigo. */
export function historicoDaChave(chave: ChaveConfig, linhas: LinhaConfig[] = cache) {
  return linhas.filter((linha) => linha.chave === chave);
}

/** Valida e normaliza o valor digitado para a chave (devolve mensagem de erro em português, ou null). */
export function validarValorConfig(definicao: DefinicaoConfig, valor: unknown): string | null {
  if (definicao.tipo === "numero" || definicao.tipo === "percentual") {
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return "Informe um número maior ou igual a zero.";
    if (definicao.tipo === "percentual" && valor > 100) return "Percentual não pode passar de 100.";
    return null;
  }
  if (definicao.tipo === "lista-numeros") {
    if (!Array.isArray(valor) || !valor.length || valor.some((v) => typeof v !== "number" || !Number.isFinite(v))) return "Informe uma lista de números separados por vírgula.";
    return null;
  }
  if (definicao.tipo === "lista-textos") {
    if (!Array.isArray(valor) || valor.some((v) => typeof v !== "string" || !v.trim())) return "Informe uma lista de textos separados por vírgula.";
    return null;
  }
  if (definicao.tipo === "escolha") {
    if (!definicao.opcoes?.some((o) => o.valor === valor)) return "Escolha uma das opções.";
    return null;
  }
  if (valor === null || typeof valor !== "object") return "Informe um JSON válido (objeto).";
  return null;
}

/** Converte o texto digitado na tela para o valor da chave, conforme o tipo. */
export function valorDoTexto(definicao: DefinicaoConfig, texto: string): unknown {
  const t = texto.trim();
  if (definicao.tipo === "numero" || definicao.tipo === "percentual") return Number(t.replace(/\./g, "").replace(",", "."));
  if (definicao.tipo === "lista-numeros") return t.split(/[,;\s]+/).filter(Boolean).map((p) => Number(p.replace(",", ".")));
  if (definicao.tipo === "lista-textos") return t.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
  if (definicao.tipo === "escolha") return t;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function textoDoValor(definicao: DefinicaoConfig, valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (definicao.tipo === "numero" || definicao.tipo === "percentual") return typeof valor === "number" ? String(valor).replace(".", ",") : String(valor);
  if (definicao.tipo === "lista-numeros" || definicao.tipo === "lista-textos") return Array.isArray(valor) ? valor.join(", ") : String(valor);
  if (definicao.tipo === "escolha") return String(valor);
  return JSON.stringify(valor);
}
