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

export type OrigemFila = "CONTA" | "COMPRA" | "PEDIDO" | "COMPROVANTE" | "NOTA" | "CRM" | "LEMBRETE" | "ESTOQUE" | "NPS" | "CHECKLIST" | "FECHAMENTO" | "AVISO" | "ACHADO";

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
  /**
   * Itens em falta por setor do estoque. Desde 06/10/2026 (pedidos de compra),
   * `itens` e `zerados` contam só o que AINDA não tem pedido nem compra — é a
   * tarefa; o que já foi pedido ou está a caminho vem à parte, só na frase.
   */
  estoque?: EntradaEstoqueDaFila[];
  /** Pedidos de compra (06/10/2026): o que espera a pessoa, conforme o papel dela no fluxo. */
  pedidos?: EntradaPedidosDaFila | null;
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

export type EntradaEstoqueDaFila = {
  setor: string;
  rotulo: string;
  /** Em falta (zerado ou abaixo do mínimo) e sem pedido nem compra. */
  itens: number;
  /** Desses, quantos estão zerados. */
  zerados: number;
  /** Em falta, mas já pedidos (esperando aprovação ou compra). */
  jaPedidos?: number;
  /** Em falta, mas já comprados e a caminho. */
  aCaminho?: number;
  /** Para onde o botão leva (padrão: /estoque). */
  href?: string;
  /**
   * O verbo do botão (07/10/2026): "Pedir compra" só quando o href abre o
   * pedido já preenchido; "Ver no estoque" quando leva ao Estoque.
   */
  acao?: string;
  /** Resumo de setores que não são da pessoa (coordenação): entra como "para saber". */
  paraSaber?: boolean;
  /** Frase pronta (o resumo dos outros setores diz quais são). */
  detalhe?: string;
};

/**
 * PEDIDOS DE COMPRA NA FILA (06/10/2026, POP-COMP-001). Cada papel do fluxo
 * vê só a sua vez: quem aprova, os que esperam decisão; o Financeiro, os
 * aprovados que falta comprar; o setor (ou quem pediu), o devolvido para
 * ajustar e o comprado que já devia ter chegado.
 */
export type EntradaPedidosDaFila = {
  aprovar?: {
    quantidade: number;
    valor: number;
    urgentes: number;
    /** Passaram do prazo de resposta (1 dia útil; urgente, no mesmo dia — estaAtrasado). */
    atrasados: number;
    /** Dias úteis do mais antigo. */
    maisAntigoDias: number;
    /** Dia (ISO) em que o mais antigo foi enviado. */
    desde: string;
  } | null;
  comprar?: {
    quantidade: number;
    valor: number;
    urgentes: number;
    /** Com "para quando" já vencido. */
    vencidos: number;
    /** Dias úteis desde a aprovação do mais antigo. */
    maisAntigoDias: number;
    desde: string;
  } | null;
  devolvidos?: { id: string; numero: string; titulo: string; motivo: string; dia: string }[];
  chegou?: { id: string; numero: string; titulo: string; fornecedor: string; previsao: string | null; dia: string; atrasado: boolean }[];
  /**
   * Recusado, ou cancelado por outra pessoa, nos últimos 7 dias (07/10/2026):
   * o setor e quem pediu ficam sabendo, com o motivo ("para saber").
   */
  parados?: { id: string; numero: string; titulo: string; status: "RECUSADO" | "CANCELADO"; por: string; motivo: string; dia: string }[];
  /** Recebido diferente do pedido nos últimos 7 dias: quem compra confere a nota e cobra o fornecedor (07/10/2026). */
  divergencias?: { id: string; numero: string; titulo: string; setor: string; texto: string; dia: string }[];
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

  // ---- pedidos de compra (06/10/2026) --------------------------------------------
  // Os links usam o que a tela /compras lê da URL (pedidoTela.lerPedidoDaUrl):
  // ?filtro= abre a lista certa e ?pedido= abre o pedido da vez.
  const ped = entrada.pedidos;
  // &acao= (07/10/2026): "Ajustar" e "Confirmar" abrem a gaveta certa, não só a lista.
  const linkDoPedido = (id: string, acao?: "receber" | "ajustar") => `/compras?pedido=${encodeURIComponent(id)}${acao ? `&acao=${acao}` : ""}`;
  if (ped?.aprovar && ped.aprovar.quantidade > 0) {
    const a = ped.aprovar;
    const partes = [
      a.urgentes ? `${a.urgentes} ${plural(a.urgentes, "urgente", "urgentes")}` : "",
      a.maisAntigoDias > 0 ? `o mais antigo espera há ${a.maisAntigoDias} ${plural(a.maisAntigoDias, "dia útil", "dias úteis")}` : "chegou hoje",
    ].filter(Boolean);
    // Passou do prazo de resposta (1 dia útil; urgente, no mesmo dia) já é
    // atraso — a mesma régua da tela de pedidos (estaAtrasado, 07/10/2026).
    itens.push({ chave: "pedido:aprovar", origem: "PEDIDO", titulo: `${a.quantidade} ${plural(a.quantidade, "pedido de compra espera", "pedidos de compra esperam")} sua aprovação`, detalhe: partes.join(" · "), quando: a.desde || hoje, urgencia: a.atrasados ? 0 : 1, valor: a.valor > 0 ? a.valor : undefined, href: "/compras?filtro=AGUARDANDO", acao: "Decidir", quantidade: a.quantidade });
  }
  if (ped?.comprar && ped.comprar.quantidade > 0) {
    const c = ped.comprar;
    const partes = [
      c.vencidos ? `${c.vencidos} já ${plural(c.vencidos, "passou", "passaram")} do "para quando"` : "",
      c.urgentes ? `${c.urgentes} ${plural(c.urgentes, "urgente", "urgentes")}` : "",
      c.maisAntigoDias > 0 ? `o mais antigo foi aprovado há ${c.maisAntigoDias} ${plural(c.maisAntigoDias, "dia útil", "dias úteis")}` : "aprovado hoje",
    ].filter(Boolean);
    const urgencia: Urgencia = c.vencidos ? 0 : c.urgentes || c.maisAntigoDias >= 2 ? 1 : 2;
    itens.push({ chave: "pedido:comprar", origem: "PEDIDO", titulo: `${c.quantidade} ${plural(c.quantidade, "pedido aprovado", "pedidos aprovados")} para comprar`, detalhe: partes.join(" · "), quando: c.desde || hoje, urgencia, valor: c.valor > 0 ? c.valor : undefined, href: "/compras?filtro=APROVADOS", acao: "Registrar compra", quantidade: c.quantidade });
  }
  const devolvidos = ped?.devolvidos ?? [];
  for (const d of devolvidos.slice(0, 5)) {
    itens.push({ chave: `pedido:devolvido:${d.id}`, origem: "PEDIDO", titulo: `Pedido ${d.numero} devolvido: ajuste e reenvie`, detalhe: `${d.titulo}${d.motivo ? ` · motivo: ${d.motivo}` : ""}`, quando: d.dia || hoje, urgencia: 1, href: linkDoPedido(d.id, "ajustar"), acao: "Ajustar", quantidade: 1 });
  }
  if (devolvidos.length > 5) {
    itens.push({ chave: "pedido:devolvidos-resto", origem: "PEDIDO", titulo: `+${devolvidos.length - 5} pedidos devolvidos para ajuste`, detalhe: "em Pedidos de compra", quando: hoje, urgencia: 1, href: "/compras?filtro=DEVOLVIDOS", acao: "Ver todos", quantidade: devolvidos.length - 5 });
  }
  const chegou = ped?.chegou ?? [];
  for (const p of chegou.slice(0, 5)) {
    const quando = p.previsao ? (p.atrasado ? `era para ${diaCurto(p.previsao)}` : "previsto para hoje") : `comprado em ${diaCurto(p.dia)}`;
    itens.push({ chave: `pedido:chegou:${p.id}`, origem: "PEDIDO", titulo: `Pedido ${p.numero} chegou? Confirme o recebimento`, detalhe: [p.titulo, p.fornecedor, quando].filter(Boolean).join(" · "), quando: p.previsao || p.dia || hoje, urgencia: p.atrasado ? 0 : 1, href: linkDoPedido(p.id, "receber"), acao: "Confirmar", quantidade: 1 });
  }
  if (chegou.length > 5) {
    itens.push({ chave: "pedido:chegou-resto", origem: "PEDIDO", titulo: `+${chegou.length - 5} pedidos comprados esperando a confirmação da chegada`, detalhe: "em Pedidos de compra", quando: hoje, urgencia: 1, href: "/compras?filtro=A_CAMINHO", acao: "Ver todos", quantidade: chegou.length - 5 });
  }
  // Recusado / cancelado por outra pessoa (07/10/2026): "para saber", com o
  // motivo — antes a tela dizia "o setor é avisado" e nada avisava.
  for (const p of (ped?.parados ?? []).slice(0, 5)) {
    const titulo =
      p.status === "RECUSADO"
        ? `Pedido ${p.numero} recusado${p.motivo ? `: ${p.motivo}` : ""}`
        : `Pedido ${p.numero} cancelado${p.por ? ` por ${p.por}` : ""}${p.motivo ? `: ${p.motivo}` : ""}`;
    itens.push({ chave: `pedido:parado:${p.id}`, origem: "PEDIDO", titulo, detalhe: `${p.titulo} · se ainda precisar, faça um pedido novo explicando`, quando: p.dia || hoje, urgencia: 3, href: linkDoPedido(p.id), acao: "Ver o pedido", quantidade: 1 });
  }
  // Chegou diferente do pedido (07/10/2026; fluxograma, passo 7): o Financeiro confere a nota e cobra o fornecedor.
  for (const d of (ped?.divergencias ?? []).slice(0, 5)) {
    itens.push({ chave: `pedido:divergencia:${d.id}`, origem: "PEDIDO", titulo: `Pedido ${d.numero} chegou diferente do pedido`, detalhe: `${d.setor} · ${d.texto}`, quando: d.dia || hoje, urgencia: 2, href: linkDoPedido(d.id), acao: "Conferir", quantidade: 1 });
  }

  // ---- estoque, NPS, checklist, fechamento, avisos -------------------------------
  for (const setor of entrada.estoque ?? []) {
    if (setor.itens <= 0) continue;
    // O que já foi pedido ou está a caminho não é tarefa (06/10/2026): só entra
    // na frase, para ninguém pedir de novo.
    const andando = [
      setor.jaPedidos ? `${setor.jaPedidos} já ${plural(setor.jaPedidos, "pedido", "pedidos")}` : "",
      setor.aCaminho ? `${setor.aCaminho} a caminho` : "",
    ].filter(Boolean);
    const detalhe = setor.detalhe ?? [
      setor.zerados ? `${setor.zerados} ${plural(setor.zerados, "zerado", "zerados")} — peça a compra antes que falte` : "abaixo do mínimo — peça a compra pelo Estoque",
      ...andando,
    ].join(" · ");
    itens.push({
      chave: `estoque:${setor.setor}`,
      origem: "ESTOQUE",
      titulo: setor.paraSaber
        ? `${setor.itens} ${plural(setor.itens, "item", "itens")} em falta e sem pedido · ${setor.rotulo}`
        : `${setor.itens} ${plural(setor.itens, "item", "itens")} em falta · ${setor.rotulo}`,
      detalhe,
      quando: hoje,
      urgencia: setor.paraSaber ? 3 : setor.zerados ? 1 : 2,
      href: setor.href ?? "/estoque",
      // 07/10/2026: o verbo diz para onde o botão leva ("Pedir compra" só
      // quando abre o pedido preenchido; senão "Ver no estoque").
      acao: setor.acao ?? (setor.paraSaber ? "Ver" : "Ver no estoque"),
      quantidade: setor.itens,
    });
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
  PEDIDO: "pedido de compra",
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
