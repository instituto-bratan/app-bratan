// PAPEL & MUSGO — a parte SEM React dos componentes padrão (08/10/2026).
//
// O redesenho aprovado pelo Lucas ("pode implantar") troca as ~70 telas, aos
// poucos, para um vocabulário só: cabeçalho, abas, selo, botão de decisão, blocos
// saber/folha, contador, fio do mês e campo de busca. As regras que decidem o que
// cada peça mostra (quantas marcas do selo estão cheias, onde cai o arco de hoje,
// para qual aba a seta leva, como o contador escreve 120) moram aqui, num .ts puro,
// para os testes de node conferirem sem montar React (tests/redesenho-fundacao).
//
// As classes Tailwind escritas aqui são geradas normalmente: o Tailwind lê
// src/**/*.ts. Oliva e dourado NUNCA aparecem como cor de texto (3,5:1 e 2,2:1).

// ---------------------------------------------------------------- selo

/** Situações que o selo sabe mostrar. As 8 pedidas + "cancelado" (pedido de compra). */
export type EstadoSelo =
  | "aguardando"
  | "aprovado"
  | "a-caminho"
  | "recebido"
  | "devolvido"
  | "recusado"
  | "pago"
  | "vencido"
  | "cancelado";

/** Cheia = etapa feita · vazada = é a vez dela · vazia = ainda não chegou (ou o fluxo acabou). */
export type MarcaDeEtapa = "cheia" | "vazada" | "vazia";

type DefinicaoDoSelo = {
  /** A palavra que vai ao lado das marcas: quem não distingue cor lê a forma e a palavra. */
  palavra: string;
  /** Quantas das 4 etapas (pedido · aprovação · compra · recebimento) já foram feitas. */
  etapas: number;
  /** Fluxo encerrado: nenhuma marca fica vazada esperando a vez. */
  fim: boolean;
  /** Cor do texto e das marcas (sempre um token que passa no AA). */
  texto: string;
  /** Fundo do selo "cheio" (o do painel de detalhe). */
  fundo: string;
};

export const SELOS: Record<EstadoSelo, DefinicaoDoSelo> = {
  aguardando: { palavra: "Aguardando aprovação", etapas: 1, fim: false, texto: "text-ouro", fundo: "bg-ouro-claro" },
  aprovado: { palavra: "Aprovado", etapas: 2, fim: false, texto: "text-musgo", fundo: "bg-musgo-claro" },
  "a-caminho": { palavra: "A caminho", etapas: 3, fim: false, texto: "text-petroleo", fundo: "bg-petroleo-claro" },
  recebido: { palavra: "Recebido", etapas: 4, fim: true, texto: "text-ok", fundo: "bg-ok-claro" },
  devolvido: { palavra: "Devolvido para ajuste", etapas: 1, fim: true, texto: "text-atencao", fundo: "bg-atencao-claro" },
  recusado: { palavra: "Recusado", etapas: 1, fim: true, texto: "text-erro", fundo: "bg-erro-claro" },
  // Conta a pagar: lançada · aprovada · agendada · paga. Pago = as 4 feitas.
  pago: { palavra: "Pago", etapas: 4, fim: true, texto: "text-ok", fundo: "bg-ok-claro" },
  // Vencido: falta só pagar e o prazo passou — a última marca fica vazada, em laranja.
  vencido: { palavra: "Vencido", etapas: 3, fim: false, texto: "text-atencao", fundo: "bg-atencao-claro" },
  cancelado: { palavra: "Cancelado", etapas: 0, fim: true, texto: "text-tinta-2", fundo: "bg-saber" },
};

export const ESTADOS_DO_SELO = Object.keys(SELOS) as EstadoSelo[];

/** As 4 marcas do selo, da primeira etapa à última. */
export function marcasDoSelo(etapasFeitas: number, fim: boolean): MarcaDeEtapa[] {
  const feitas = Math.max(0, Math.min(4, Math.trunc(etapasFeitas)));
  return [0, 1, 2, 3].map((i) => (i < feitas ? "cheia" : i === feitas && !fim ? "vazada" : "vazia"));
}

// ---------------------------------------------------------------- fio do mês

export type EntalheDoFio = {
  /** Dia útil (1 = o primeiro do mês). */
  dia: number;
  estado: "passou" | "hoje" | "falta";
  /** Onde o entalhe cai, em % da largura: o dia k fica no FIM do seu trecho (k/total). */
  posicao: number;
};

export type FioCalculado = {
  total: number;
  /** Dia útil de hoje, já limitado a 0…total (0 = o mês ainda não teve dia útil). */
  hoje: number;
  /** Dias úteis que ainda faltam depois de hoje (é a conta da meta por dia). */
  faltam: number;
  entalhes: EntalheDoFio[];
  /** Onde fica o arco de hoje, em % (null quando hoje = 0). */
  posicaoHoje: number | null;
  /** "hoje é o dia útil 4 de 21" */
  fraseHoje: string;
  /** "faltam 17 dias úteis" · "falta 1 dia útil" · "último dia útil do mês" */
  fraseResto: string;
  /** Leitura para leitor de tela: "Outubro tem 21 dias úteis; hoje é o 4º." */
  rotuloAcessivel: string;
};

/**
 * A régua do mês (imagem 01 do redesenho): um entalhe por dia útil, os que
 * passaram em musgo, os que faltam em traço claro, e hoje como o arco de ouro.
 * Quem chama já sabe os dias úteis (feriados inclusos) — a peça só desenha.
 */
export function fioDoMes(diasUteis: number, hojeDiaUtil: number, mes = "O mês"): FioCalculado {
  const total = Math.max(1, Math.trunc(diasUteis) || 1);
  const hoje = Math.max(0, Math.min(total, Math.trunc(hojeDiaUtil) || 0));
  const faltam = total - hoje;
  const entalhes: EntalheDoFio[] = Array.from({ length: total }, (_, i) => {
    const dia = i + 1;
    return {
      dia,
      estado: dia < hoje ? "passou" : dia === hoje ? "hoje" : "falta",
      posicao: (dia / total) * 100,
    };
  });
  const fraseHoje = hoje === 0 ? "o mês ainda não teve dia útil" : `hoje é o dia útil ${hoje} de ${total}`;
  const fraseResto =
    faltam === 0 ? "último dia útil do mês" : faltam === 1 ? "falta 1 dia útil" : `faltam ${faltam} dias úteis`;
  const rotuloAcessivel =
    hoje === 0
      ? `${mes} tem ${total} dias úteis; nenhum passou ainda.`
      : `${mes} tem ${total} dias úteis; hoje é o ${hoje}º.`;
  return {
    total,
    hoje,
    faltam,
    entalhes,
    posicaoHoje: hoje === 0 ? null : (hoje / total) * 100,
    fraseHoje,
    fraseResto,
    rotuloAcessivel,
  };
}

// ---------------------------------------------------------------- abas

/** Para qual aba a tecla leva (←/→ dão a volta; Home/End vão às pontas). null = tecla que não é das abas. */
export function indiceDaTecla(atual: number, total: number, tecla: string): number | null {
  if (total <= 0) return null;
  if (tecla === "ArrowRight") return (atual + 1) % total;
  if (tecla === "ArrowLeft") return (atual - 1 + total) % total;
  if (tecla === "Home") return 0;
  if (tecla === "End") return total - 1;
  return null;
}

/**
 * Qual aba está aberta, pela rota. Vence o endereço mais comprido que casa
 * (/financeiro/contas/123 abre a aba de /financeiro/contas, não a de /financeiro).
 * `exata: true` exige o endereço igual.
 */
export function abaAtivaPorRota(pathname: string, itens: { id: string; to?: string; exata?: boolean }[]): string | null {
  const limpo = pathname.replace(/\/+$/, "") || "/";
  let melhor: { id: string; tamanho: number } | null = null;
  for (const item of itens) {
    if (!item.to) continue;
    const alvo = item.to.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
    const casa = limpo === alvo || (!item.exata && alvo !== "/" && limpo.startsWith(`${alvo}/`));
    if (casa && (!melhor || alvo.length > melhor.tamanho)) melhor = { id: item.id, tamanho: alvo.length };
  }
  return melhor?.id ?? null;
}

// ---------------------------------------------------------------- contador

/** O que a bolinha escreve: nada para zero (salvo se pedirem), "99+" acima do teto. */
export function textoDoContador(valor: number, opcoes: { max?: number; mostrarZero?: boolean } = {}): string | null {
  const max = opcoes.max ?? 99;
  const n = Math.trunc(Number.isFinite(valor) ? valor : 0);
  if (n <= 0) return opcoes.mostrarZero ? "0" : null;
  return n > max ? `${max}+` : String(n);
}

// ---------------------------------------------------------------- dinheiro

/** "R$ 486,00" (com espaço inseparável, para o valor nunca quebrar no meio). */
export function formatarReais(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

// ---------------------------------------------------------------- tokens (para o guia)

/** Os tokens de cor, na ordem do guia aprovado, com o "para quê" de cada um. */
export const TOKENS_DE_COR: { grupo: string; nome: string; uso: string }[] = [
  { grupo: "Superfícies", nome: "mesa", uso: "Menu lateral (o tom mais fundo)" },
  { grupo: "Superfícies", nome: "papel", uso: "Fundo do conteúdo" },
  { grupo: "Superfícies", nome: "saber", uso: "Bloco só para saber: sem borda, sem sombra" },
  { grupo: "Superfícies", nome: "folha", uso: "Bloco que pede decisão: com borda" },
  { grupo: "Superfícies", nome: "fio", uso: "Divisória leve, borda da folha" },
  { grupo: "Superfícies", nome: "fio-2", uso: "Divisória firme, contorno do botão secundário" },
  { grupo: "Superfícies", nome: "borda-campo", uso: "Contorno de campo de formulário (3:1)" },
  { grupo: "Texto", nome: "tinta", uso: "Texto principal" },
  { grupo: "Texto", nome: "tinta-2", uso: "Texto secundário, meta da linha, rubrica" },
  { grupo: "Marca", nome: "musgo", uso: "Ação, link, foco, item ativo" },
  { grupo: "Marca", nome: "musgo-claro", uso: "Botão suave, linha escolhida" },
  { grupo: "Marca", nome: "oliva", uso: "SÓ ícone. Nunca texto" },
  { grupo: "Marca", nome: "dourado", uso: "SÓ enfeite: o arco de hoje, o filete do “Por quê”" },
  { grupo: "Marca", nome: "ouro-fio", uso: "Traço que informa: aba e subitem ativos, prazo" },
  { grupo: "Marca", nome: "ouro", uso: "Quando o ouro vira texto: “Aguardando aprovação”, “hoje”" },
  { grupo: "Situação", nome: "atencao", uso: "Prazo vencido, devolvido, falta algo" },
  { grupo: "Situação", nome: "erro", uso: "Recusar, recusado, urgente, erro de campo" },
  { grupo: "Situação", nome: "ok", uso: "Recebido, pago, faixa saudável" },
  { grupo: "Situação", nome: "petroleo", uso: "Só “a caminho”" },
];
