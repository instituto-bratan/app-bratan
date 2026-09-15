// FILA DO DIA — A HOME DE TODOS OS CARGOS (aprovado pelo Lucas em 14/09/2026,
// proposta 4.1 do estudo de evolução).
//
// O padrão que os melhores produtos operacionais de 2026 convergiram (Triage do
// Linear, "o que devo focar hoje" do Attio): UMA lista só, ordenada por
// urgência, com ações de um toque. Concluir tira o item da frente. Aqui a lista
// junta o que hoje mora em sete telas — contas que vencem, compras que chegaram,
// pagamentos sem comprovante, notas a emitir, toques do CRM, lembretes de
// pagamento, itens abaixo do mínimo no estoque, pacientes esperando o contato
// de NPS, checklist do dia, fechamento sem conferir — cada um já filtrado pelo
// que a pessoa pode ver. Nada é digitado: tudo deriva dos dados que já existem.
//
// Este módulo é puro (testável com node --test). A tela decide o que carregar
// por cargo; o motor só ordena, agrupa e escreve as frases.
import type { FilaFinanceira } from "@/features/financeiro/filaFinanceira";
import { saleTotal, type FinReconciliation, type FinSale } from "@/features/financeiro/financeiroData";
import { diaUtilAnterior } from "@/features/financeiro/recebiveisRede";

export type OrigemFila = "CONTA" | "COMPRA" | "COMPROVANTE" | "NOTA" | "CRM" | "LEMBRETE" | "ESTOQUE" | "NPS" | "CHECKLIST" | "FECHAMENTO" | "AVISO" | "ACHADO";

/** 0 = atrasado · 1 = hoje · 2 = esta semana · 3 = para saber. */
export type Urgencia = 0 | 1 | 2 | 3;

export type ItemFilaDoDia = {
  chave: string;
  origem: OrigemFila;
  titulo: string;
  detalhe: string;
  /** Data que manda na ordem (ISO); vazio = sem data. */
  quando: string;
  urgencia: Urgencia;
  valor?: number;
  href: string;
  /** O verbo do botão principal. */
  acao: string;
  /** Quantos itens este cartão agrupa (1 = item único). */
  quantidade: number;
  /** Achado da rotina diária: id para "Resolvido" marcar no banco. */
  achadoId?: string;
};

export type FilaDoDia = {
  hoje: string;
  itens: ItemFilaDoDia[];
  /** Itens escondidos por "silenciar até" (ainda válidos). */
  silenciados: number;
  contagem: Record<Urgencia, number>;
  porOrigem: Partial<Record<OrigemFila, number>>;
  /** "3 atrasados · 4 para hoje · 6 nesta semana". */
  resumo: string;
  /** O número do ícone do app: atrasados + hoje. */
  badge: number;
};

export type TarefaCrmDaFila = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  contato: string;
  taskType: string;
};

export type EntradasDaFila = {
  hoje: string;
  financeira?: FilaFinanceira | null;
  /** Pagamentos de comandas do mês sem decisão sobre o comprovante. */
  comprovantesPendentes?: { quantidade: number; valor: number } | null;
  /** Comandas do mês que ainda não têm nota fiscal para todo o valor. */
  comandasSemNota?: { quantidade: number; valor: number } | null;
  /** Tarefas do CRM já filtradas para a pessoa (o motor classifica pela data). */
  crmTasks?: TarefaCrmDaFila[];
  lembretes?: { vencidos: { id: string; nome: string; valor: number; data: string }[]; hoje: { id: string; nome: string; valor: number; data: string }[] } | null;
  /** Itens abaixo do mínimo por setor do estoque. */
  estoque?: { setor: string; rotulo: string; itens: number; zerados: number }[];
  /** Pacientes que passaram e ainda não receberam o contato de NPS. */
  npsFila?: { quantidade: number; maisAntigoDias: number } | null;
  checklist?: { pendentes: number; proxima: string | null } | null;
  fechamentoPendente?: { dia: string; total: number } | null;
  avisosImportantes?: { id: string; corpo: string; publicadoEm: string }[];
  /**
   * ACHADOS DA ROTINA DIÁRIA (14/09/2026, proposta 1.2): o que a rotina das 6h
   * encontrou e ainda está aberto, já filtrado pelo cargo de quem vê.
   */
  achados?: { id: string; chave: string; tipo: string; dia: string; titulo: string; detalhe: string; valor: number | null; href: string; urgencia: Urgencia; quantidade: number }[];
  /** chave → ISO do dia até o qual o item fica escondido. */
  silenciados?: Record<string, string>;
};

const brl = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor || 0);
const diaCurto = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export function somaDiasISO(iso: string, dias: number) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

const taskTypeLabel: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  CALL: "ligação",
  EMAIL: "e-mail",
  IN_PERSON: "presencial",
  INTERNAL_CHECK: "conferência",
  CONTRACT: "contrato",
  PAYMENT: "pagamento",
  SCHEDULE: "agendamento",
  FOLLOW_UP: "follow-up",
  RESCUE: "resgate",
  CHURN_INVESTIGATION: "investigar churn",
};

/** O fechamento de ontem (dia útil anterior) ficou sem conferir? */
export function fechamentoPendente(sales: FinSale[], reconciliations: FinReconciliation[], hoje: string): { dia: string; total: number } | null {
  const dia = diaUtilAnterior(hoje);
  const total = Math.round(sales.filter((sale) => sale.saleDate === dia).reduce((soma, sale) => soma + saleTotal(sale), 0) * 100) / 100;
  if (total <= 0.005) return null;
  if (reconciliations.some((rec) => rec.day === dia && rec.status !== "PENDENTE")) return null;
  return { dia, total };
}

/** Remove silenciamentos que já venceram. */
export function limparSilenciados(silenciados: Record<string, string>, hoje: string): Record<string, string> {
  const limpo: Record<string, string> = {};
  for (const [chave, ate] of Object.entries(silenciados)) if (ate >= hoje) limpo[chave] = ate;
  return limpo;
}

export function buildFilaDoDia(entrada: EntradasDaFila): FilaDoDia {
  const { hoje } = entrada;
  const limiteSemana = somaDiasISO(hoje, 7);
  const itens: ItemFilaDoDia[] = [];

  // ---- contas e compras (Fila financeira já derivada) --------------------------
  const fin = entrada.financeira;
  if (fin) {
    for (const item of fin.vencidas.slice(0, 6)) {
      itens.push({ chave: item.chave, origem: "CONTA", titulo: item.titulo, detalhe: `venceu ${diaCurto(item.data)}${item.detalhe ? ` · ${item.detalhe}` : ""}`, quando: item.data, urgencia: 0, valor: item.valor, href: "/financeiro/contas", acao: "Resolver", quantidade: 1 });
    }
    if (fin.vencidas.length > 6) {
      const resto = fin.vencidas.slice(6);
      itens.push({ chave: "conta:vencidas-resto", origem: "CONTA", titulo: `+${resto.length} ${plural(resto.length, "conta vencida", "contas vencidas")}`, detalhe: `somam ${brl(resto.reduce((s, i) => s + i.valor, 0))}`, quando: resto[0]?.data ?? hoje, urgencia: 0, valor: resto.reduce((s, i) => s + i.valor, 0), href: "/financeiro/contas", acao: "Ver todas", quantidade: resto.length });
    }
    for (const item of fin.vencemHoje) {
      itens.push({ chave: item.chave, origem: "CONTA", titulo: item.titulo, detalhe: `vence hoje${item.detalhe ? ` · ${item.detalhe}` : ""}${item.alerta === "SEM_ARQUIVO" ? " · sem boleto anexado" : ""}`, quando: hoje, urgencia: 1, valor: item.valor, href: "/financeiro/contas", acao: "Pagar", quantidade: 1 });
    }
    if (fin.semana.length) {
      itens.push({ chave: "conta:semana", origem: "CONTA", titulo: `${fin.semana.length} ${plural(fin.semana.length, "conta vence", "contas vencem")} nos próximos 7 dias`, detalhe: `${brl(fin.totais.semana)} · primeira em ${diaCurto(fin.semana[0].data)}${fin.totais.boletosSemArquivo ? ` · ${fin.totais.boletosSemArquivo} sem boleto anexado` : ""}`, quando: fin.semana[0].data, urgencia: 2, valor: fin.totais.semana, href: "/financeiro/contas", acao: "Abrir a fila", quantidade: fin.semana.length });
    }
    for (const item of fin.pendencias.slice(0, 4)) {
      const urgencia: Urgencia = item.alerta === "ATRASADO" ? 0 : item.alerta === "CHEGANDO" ? 1 : 2;
      itens.push({ chave: item.chave, origem: "COMPRA", titulo: item.titulo, detalhe: item.detalhe, quando: item.data, urgencia, valor: item.valor, href: "/financeiro/contas", acao: item.alerta === "SEM_NF" ? "Anotar NF" : item.alerta === "SEM_CONTA" ? "Virar conta" : "Chegou?", quantidade: 1 });
    }
  }

  // ---- comprovantes e notas -----------------------------------------------------
  if (entrada.comprovantesPendentes && entrada.comprovantesPendentes.quantidade > 0) {
    const c = entrada.comprovantesPendentes;
    itens.push({ chave: "comprovante:pendentes", origem: "COMPROVANTE", titulo: `${c.quantidade} ${plural(c.quantidade, "pagamento", "pagamentos")} sem definir o comprovante`, detalhe: `${brl(c.valor)} em comandas do mês · um toque na comanda resolve: tenho · vai mandar · não se aplica`, quando: hoje, urgencia: 1, valor: c.valor, href: "/financeiro/lancar-dia", acao: "Definir", quantidade: c.quantidade });
  }
  if (entrada.comandasSemNota && entrada.comandasSemNota.quantidade > 0) {
    const n = entrada.comandasSemNota;
    itens.push({ chave: "nota:pendentes", origem: "NOTA", titulo: `${n.quantidade} ${plural(n.quantidade, "comanda", "comandas")} do mês sem nota fiscal`, detalhe: `${brl(n.valor)} ainda sem NF emitida`, quando: hoje, urgencia: 2, valor: n.valor, href: "/financeiro/impostos", acao: "Emitir", quantidade: n.quantidade });
  }

  // ---- toques do CRM ------------------------------------------------------------
  const tarefas = (entrada.crmTasks ?? []).filter((t) => !["DONE", "CANCELED", "SKIPPED"].includes(t.status) && t.dueAt);
  const atrasadas = tarefas.filter((t) => t.dueAt.slice(0, 10) < hoje).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const deHoje = tarefas.filter((t) => t.dueAt.slice(0, 10) === hoje).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const daSemana = tarefas.filter((t) => t.dueAt.slice(0, 10) > hoje && t.dueAt.slice(0, 10) <= limiteSemana);
  const tarefaItem = (t: TarefaCrmDaFila, urgencia: Urgencia): ItemFilaDoDia => ({
    chave: `crm:${t.id}`,
    origem: "CRM",
    titulo: `${t.contato} · ${t.title}`,
    detalhe: `${taskTypeLabel[t.taskType] ?? t.taskType.toLowerCase()}${urgencia === 0 ? ` · era para ${diaCurto(t.dueAt.slice(0, 10))}` : ""}`,
    quando: t.dueAt.slice(0, 10),
    urgencia,
    href: "/crm/minhas-tarefas",
    acao: "Fazer o toque",
    quantidade: 1,
  });
  for (const t of atrasadas.slice(0, 5)) itens.push(tarefaItem(t, 0));
  if (atrasadas.length > 5) {
    itens.push({ chave: "crm:atrasadas-resto", origem: "CRM", titulo: `+${atrasadas.length - 5} toques atrasados`, detalhe: "os mais antigos primeiro em Minhas tarefas", quando: atrasadas[5].dueAt.slice(0, 10), urgencia: 0, href: "/crm/minhas-tarefas", acao: "Ver todos", quantidade: atrasadas.length - 5 });
  }
  for (const t of deHoje.slice(0, 6)) itens.push(tarefaItem(t, 1));
  if (deHoje.length > 6) {
    itens.push({ chave: "crm:hoje-resto", origem: "CRM", titulo: `+${deHoje.length - 6} toques para hoje`, detalhe: "em Minhas tarefas", quando: hoje, urgencia: 1, href: "/crm/minhas-tarefas", acao: "Ver todos", quantidade: deHoje.length - 6 });
  }
  if (daSemana.length) {
    const primeiro = [...daSemana].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    itens.push({ chave: "crm:semana", origem: "CRM", titulo: `${daSemana.length} ${plural(daSemana.length, "toque", "toques")} nos próximos 7 dias`, detalhe: `o primeiro em ${diaCurto(primeiro.dueAt.slice(0, 10))}`, quando: primeiro.dueAt.slice(0, 10), urgencia: 2, href: "/crm/minhas-tarefas", acao: "Ver a semana", quantidade: daSemana.length });
  }

  // ---- lembretes de pagamento ----------------------------------------------------
  if (entrada.lembretes) {
    for (const l of entrada.lembretes.vencidos.slice(0, 4)) {
      itens.push({ chave: `lembrete:${l.id}`, origem: "LEMBRETE", titulo: `${l.nome} · lembrete de pagamento vencido`, detalhe: `combinado para ${diaCurto(l.data)}`, quando: l.data, urgencia: 0, valor: l.valor, href: "/lembretes-pagamento", acao: "Cobrar", quantidade: 1 });
    }
    for (const l of entrada.lembretes.hoje) {
      itens.push({ chave: `lembrete:${l.id}`, origem: "LEMBRETE", titulo: `${l.nome} · pagamento combinado para hoje`, detalhe: "lembrete de pagamento", quando: hoje, urgencia: 1, valor: l.valor, href: "/lembretes-pagamento", acao: "Recebi", quantidade: 1 });
    }
  }

  // ---- estoque, NPS, checklist, fechamento, avisos -------------------------------
  for (const setor of entrada.estoque ?? []) {
    if (setor.itens <= 0) continue;
    itens.push({ chave: `estoque:${setor.setor}`, origem: "ESTOQUE", titulo: `${setor.itens} ${plural(setor.itens, "item", "itens")} abaixo do mínimo · ${setor.rotulo}`, detalhe: setor.zerados ? `${setor.zerados} ${plural(setor.zerados, "zerado", "zerados")} — comprar antes que falte` : "lista de compra pronta no Estoque", quando: hoje, urgencia: setor.zerados ? 1 : 2, href: "/estoque", acao: "Ver lista", quantidade: setor.itens });
  }
  if (entrada.npsFila && entrada.npsFila.quantidade > 0) {
    const n = entrada.npsFila;
    itens.push({ chave: "nps:fila", origem: "NPS", titulo: `${n.quantidade} ${plural(n.quantidade, "paciente espera", "pacientes esperam")} o contato de NPS`, detalhe: n.maisAntigoDias > 0 ? `o mais antigo passou há ${n.maisAntigoDias} ${plural(n.maisAntigoDias, "dia", "dias")}` : "passaram hoje", quando: hoje, urgencia: n.maisAntigoDias >= 3 ? 1 : 2, href: "/concierge/nps", acao: "Contatar", quantidade: n.quantidade });
  }
  if (entrada.checklist && entrada.checklist.pendentes > 0) {
    itens.push({ chave: "checklist:hoje", origem: "CHECKLIST", titulo: `Checklist: ${entrada.checklist.pendentes} ${plural(entrada.checklist.pendentes, "tarefa pendente", "tarefas pendentes")}`, detalhe: entrada.checklist.proxima ? `próxima: ${entrada.checklist.proxima}` : "", quando: hoje, urgencia: 2, href: "/tarefas", acao: "Abrir", quantidade: entrada.checklist.pendentes });
  }
  if (entrada.fechamentoPendente) {
    const f = entrada.fechamentoPendente;
    itens.push({ chave: `fechamento:${f.dia}`, origem: "FECHAMENTO", titulo: `Fechamento de ${diaCurto(f.dia)} sem conferir`, detalhe: `${brl(f.total)} em comandas esperando a conferência da maquininha`, quando: f.dia, urgencia: 1, valor: f.total, href: "/financeiro/fechamento", acao: "Conferir", quantidade: 1 });
  }
  for (const aviso of (entrada.avisosImportantes ?? []).slice(0, 2)) {
    itens.push({ chave: `aviso:${aviso.id}`, origem: "AVISO", titulo: aviso.corpo.length > 90 ? `${aviso.corpo.slice(0, 87)}…` : aviso.corpo, detalhe: `aviso importante · ${diaCurto(aviso.publicadoEm.slice(0, 10))}`, quando: aviso.publicadoEm.slice(0, 10), urgencia: 3, href: "/mural", acao: "Ler", quantidade: 1 });
  }

  // ---- achados da rotina diária --------------------------------------------------
  for (const achado of entrada.achados ?? []) {
    itens.push({ chave: `achado:${achado.chave}`, origem: "ACHADO", titulo: achado.titulo, detalhe: `${achado.detalhe}${achado.dia ? ` · visto pela rotina em ${diaCurto(achado.dia)}` : ""}`, quando: achado.dia || hoje, urgencia: achado.urgencia, valor: achado.valor ?? undefined, href: achado.href, acao: "Abrir", quantidade: achado.quantidade || 1, achadoId: achado.id });
  }

  // ---- silenciados, ordem e frases ----------------------------------------------
  const silenciados = limparSilenciados(entrada.silenciados ?? {}, hoje);
  const visiveis = itens.filter((item) => !silenciados[item.chave]);
  visiveis.sort((a, b) => a.urgencia - b.urgencia || (a.quando || "9999").localeCompare(b.quando || "9999") || (b.valor ?? 0) - (a.valor ?? 0) || a.titulo.localeCompare(b.titulo, "pt-BR"));

  const contagem: Record<Urgencia, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const porOrigem: Partial<Record<OrigemFila, number>> = {};
  for (const item of visiveis) {
    contagem[item.urgencia] += 1;
    porOrigem[item.origem] = (porOrigem[item.origem] ?? 0) + item.quantidade;
  }
  const partes: string[] = [];
  if (contagem[0]) partes.push(`${contagem[0]} ${plural(contagem[0], "atrasado", "atrasados")}`);
  if (contagem[1]) partes.push(`${contagem[1]} para hoje`);
  if (contagem[2]) partes.push(`${contagem[2]} nesta semana`);
  if (!partes.length) partes.push(contagem[3] ? "nada urgente — só avisos" : "tudo em dia");

  return {
    hoje,
    itens: visiveis,
    silenciados: itens.length - visiveis.length,
    contagem,
    porOrigem,
    resumo: partes.join(" · "),
    badge: contagem[0] + contagem[1],
  };
}

export const origemLabels: Record<OrigemFila, string> = {
  CONTA: "conta a pagar",
  COMPRA: "compra",
  COMPROVANTE: "comprovante",
  NOTA: "nota fiscal",
  CRM: "toque do CRM",
  LEMBRETE: "lembrete de pagamento",
  ESTOQUE: "estoque",
  NPS: "NPS",
  CHECKLIST: "checklist",
  FECHAMENTO: "fechamento",
  AVISO: "aviso",
  ACHADO: "rotina diária",
};

export const urgenciaLabels: Record<Urgencia, string> = { 0: "Atrasado", 1: "Hoje", 2: "Esta semana", 3: "Para saber" };
