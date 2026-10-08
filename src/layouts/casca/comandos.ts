// ---------------------------------------------------------------------------
// O QUE O ⌘K ENTENDE (08/10/2026) — redesenho "Papel & Musgo", etapa 1.
//
// A busca nova acha os destinos pelo mapa (navegacao.ts: buscar, com sinônimos
// e só o que a pessoa vê) e faz as 3 ações do menu aprovado (Novo pedido de
// compra · Lançar dia · Nova conta a pagar). O ⌘K de 14/09 já fazia MAIS do que
// isso — entendia um valor ("1250" → lançar conta de R$ 1.250,00) e verbos do
// dia a dia que levam a um ponto exato de uma tela ("aprovar" → a caixa de
// aprovação já filtrada). Regra de ouro desta etapa: nenhuma tela perde
// funcionalidade, então esses comandos vêm junto, aqui, num módulo puro que os
// testes de node conferem (antes eles moravam dentro do AppLayout).
//
// A permissão é a mesma do mapa: um comando só aparece se a pessoa VÊ a tela
// para onde ele leva (e, quando existe, a regra extra `so`).
// ---------------------------------------------------------------------------
import { canEditModule } from "@/lib/access";
import {
  ACOES_RAPIDAS,
  acoesRapidas,
  buscar,
  destinosBuscaveis,
  hrefDaAcao,
  normalizarBusca,
  type NomeIcone,
  type PessoaNav,
} from "@/lib/navegacao";

/** Uma linha do resultado do ⌘K. */
export type LinhaDaBusca = {
  chave: string;
  /** "fazer" = ação (vai a um ponto exato); "telas" = destino do mapa. */
  secao: "fazer" | "telas";
  rotulo: string;
  /** De onde vem ("Financeiro › Pagar", "Ação rápida"). */
  contexto: string;
  href: string;
  icone: NomeIcone;
  /** Id do destino quando a linha é uma tela que dá para fixar (⌘D). */
  destinoId: string | null;
  /** Quão bem a linha casa com o termo (a mesma escala do buscar do mapa: 100 = nome exato). */
  pontos: number;
};

type Comando = {
  palavras: string[];
  rotulo: string;
  href: string;
  icone: NomeIcone;
  /** Regra além de ver a tela (ex.: só quem aprova vê "Aprovar pedidos"). */
  so?: (pessoa: PessoaNav) => boolean;
};

// Os verbos do ⌘K de 14/09/2026, com os mesmos destinos. Os que viraram as 3
// ações do menu aprovado (pedido, comanda, conta) não se repetem aqui.
export const COMANDOS: readonly Comando[] = [
  { palavras: ["fechamento", "fechar", "registrar fechamento", "aderiu"], rotulo: "Registrar fechamento (Kanban)", href: "/crm/vendas", icone: "SquareKanban" },
  { palavras: ["toque", "tarefa", "cadencia", "ligar", "mensagem"], rotulo: "Meus toques do CRM", href: "/crm/minhas-tarefas", icone: "ListChecks" },
  { palavras: ["comprovante", "pix do paciente", "anexar"], rotulo: "Anexar comprovante", href: "/comprovantes", icone: "ReceiptText" },
  { palavras: ["extrato", "conciliar", "itau", "banco"], rotulo: "Conciliar extrato do Itaú", href: "/financeiro/extrato", icone: "Landmark" },
  { palavras: ["fatura", "cartao", "cartao de credito", "visa", "master"], rotulo: "Importar fatura do cartão", href: "/financeiro/fatura-cartao", icone: "CreditCard" },
  { palavras: ["lucro", "envelope", "transferir", "repasse"], rotulo: "Lucro Inteligente (envelopes)", href: "/financeiro/lucro", icone: "Sprout" },
  { palavras: ["painel", "reuniao", "apresentar", "mes"], rotulo: "Painel do mês", href: "/financeiro/painel", icone: "Presentation" },
  // Pedidos de compra (06/10/2026): aprovar só aparece para quem aprova.
  {
    palavras: ["aprovar", "aprovacao", "aprovar compra", "autorizar"],
    rotulo: "Aprovar pedidos de compra",
    href: "/compras?filtro=AGUARDANDO",
    icone: "ClipboardCheck",
    so: (pessoa) => canEditModule(pessoa, "compras-aprovacao"),
  },
  { palavras: ["estoque", "contar", "saldo", "validade"], rotulo: "Estoque do setor", href: "/estoque", icone: "Boxes" },
  { palavras: ["aplicacao", "aplicar", "dose", "lote", "injecao", "implante", "pellet"], rotulo: "Registrar aplicação (enfermagem)", href: "/estoque/aplicacoes", icone: "Syringe" },
  { palavras: ["nps", "pesquisa", "satisfacao"], rotulo: "NPS da Concierge", href: "/concierge/nps", icone: "MessageSquareHeart" },
  { palavras: ["configuracao", "limite", "regra", "vigencia"], rotulo: "Configurações do negócio", href: "/administracao/configuracoes", icone: "SlidersHorizontal" },
  { palavras: ["ia", "inteligencia artificial", "governanca"], rotulo: "O que a IA fez", href: "/administracao/ia", icone: "Bot" },
  { palavras: ["integracao", "whatsapp oficial", "nota fiscal", "nfse", "push", "feegow", "supersign"], rotulo: "Integrações", href: "/administracao/integracoes", icone: "Plug" },
  { palavras: ["lgpd", "compliance", "dpo", "consentimento", "incidente", "ripd"], rotulo: "Cofre de compliance", href: "/administracao/compliance", icone: "Vault" },
  { palavras: ["agenda", "consulta do dia", "iclinic", "veio", "faltou", "falta", "paciente de hoje", "horario"], rotulo: "Agenda do dia (iClinic)", href: "/agenda", icone: "CalendarDays" },
  { palavras: ["fila", "hoje", "home", "inicio", "decidir"], rotulo: "Para decidir (Início)", href: "/", icone: "House" },
];

/**
 * Lê um valor digitado ("1250", "1.250,00", "R$ 89,90", "2380.5"). Devolve o
 * número ou null. É a leitura do ⌘K de 14/09/2026, com um conserto (08/10):
 * a expressão antiga aceitava o "1.250" sem ponto pela primeira alternativa e
 * parava no terceiro dígito — "1250" virava R$ 125,00. Agora o milhar com ponto
 * exige o ponto, e o número sem ponto é lido inteiro.
 */
export function valorDigitado(texto: string): number | null {
  const achado = String(texto ?? "").trim().match(/^r?\$?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/i);
  if (!achado) return null;
  const bruto = achado[1];
  const valor = bruto.includes(",") ? Number(bruto.replace(/\./g, "").replace(",", ".")) : Number(bruto.replace(/\.(?=\d{3}(?:\D|$))/g, ""));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

const reais = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

/** As rotas (sem ?busca) que a pessoa abre — é o "podeIr" do ⌘K de 14/09. */
function rotasQueAPessoaVe(pessoa: PessoaNav): Set<string> {
  return new Set(["/", ...destinosBuscaveis(pessoa).map((atalho) => atalho.href.split("?")[0])]);
}

/** Os comandos que casam com o termo e que a pessoa pode usar. */
export function comandosDoTermo(termo: string, pessoa: PessoaNav): LinhaDaBusca[] {
  const busca = normalizarBusca(termo);
  // Uma letra só casaria com quase tudo ("a" está em "aprovar", "agenda"…).
  if (busca.length < 2) return [];
  const pode = rotasQueAPessoaVe(pessoa);
  const saida: LinhaDaBusca[] = [];
  for (const comando of COMANDOS) {
    if (!pode.has(comando.href.split("?")[0])) continue;
    if (comando.so && !comando.so(pessoa)) continue;
    // O verbo exato ("aprovar") é forte: vale mais que um sinônimo de tela (85).
    // Começo de palavra vale menos que um sinônimo exato de tela, e "contém"
    // menos ainda — assim "nota" abre Impostos & NFs, não Integrações.
    let pontos = 0;
    for (const palavra of comando.palavras) {
      const p = normalizarBusca(palavra);
      if (p === busca) pontos = Math.max(pontos, 90);
      else if (p.startsWith(busca)) pontos = Math.max(pontos, 70);
      else if (p.includes(busca) || busca.includes(p)) pontos = Math.max(pontos, 45);
    }
    if (pontos) saida.push({ chave: `comando:${comando.href}`, secao: "fazer", rotulo: comando.rotulo, contexto: "Atalho", href: comando.href, icone: comando.icone, destinoId: null, pontos });
  }
  return saida;
}

/** Valor digitado vira "Nova conta a pagar de R$ X" (com o valor) e "Lançar comanda de R$ X". */
export function acoesDoValor(termo: string, pessoa: PessoaNav): LinhaDaBusca[] {
  const valor = valorDigitado(termo);
  if (valor === null) return [];
  const minhas = new Set(acoesRapidas(pessoa).map((acao) => acao.id));
  const saida: LinhaDaBusca[] = [];
  const conta = ACOES_RAPIDAS.find((acao) => acao.id === "nova-conta");
  if (conta && minhas.has("nova-conta")) {
    saida.push({ chave: "valor:conta", secao: "fazer", rotulo: `Nova conta a pagar de ${reais(valor)}`, contexto: "Ação rápida", href: hrefDaAcao(conta, valor), icone: conta.icone, destinoId: null, pontos: 200 });
  }
  const dia = ACOES_RAPIDAS.find((acao) => acao.id === "lancar-dia");
  if (dia && minhas.has("lancar-dia")) {
    saida.push({ chave: "valor:comanda", secao: "fazer", rotulo: `Lançar comanda de ${reais(valor)}`, contexto: "Ação rápida", href: dia.href, icone: dia.icone, destinoId: null, pontos: 199 });
  }
  return saida;
}

/**
 * O resultado do ⌘K para um termo, em duas seções: o que FAZ (valor, ações
 * rápidas e comandos) e as TELAS do mapa. Vem primeiro a seção que tem o
 * melhor acerto — o Enter abre a primeira linha, então ela tem que ser a mais
 * certa: "1250" e "aprovar" abrem a ação; "nota" e "contas" abrem a tela. No
 * empate, a tela. Sem repetir o mesmo endereço. Termo vazio devolve nada (a
 * paleta mostra as ações, os fixados e o menu).
 */
export function linhasDaBusca(termo: string, pessoa: PessoaNav, limiteTelas = 12): LinhaDaBusca[] {
  if (!normalizarBusca(termo)) return [];
  const achados = buscar(termo, pessoa, 40);
  const fazer: LinhaDaBusca[] = [...acoesDoValor(termo, pessoa)];
  for (const achado of achados) {
    if (achado.tipo !== "acao") continue;
    fazer.push({ chave: `acao:${achado.id}`, secao: "fazer", rotulo: achado.rotulo, contexto: achado.contexto, href: achado.href, icone: achado.icone, destinoId: null, pontos: achado.pontos });
  }
  fazer.push(...comandosDoTermo(termo, pessoa));

  const telas: LinhaDaBusca[] = achados
    .filter((achado) => achado.tipo !== "acao")
    .slice(0, limiteTelas)
    .map((achado) => ({
      chave: `${achado.tipo}:${achado.id}`,
      secao: "telas" as const,
      rotulo: achado.rotulo,
      contexto: achado.contexto,
      href: achado.href,
      icone: achado.icone,
      destinoId: achado.tipo === "tela" ? achado.id : null,
      pontos: achado.pontos,
    }));

  // Ação que leva exatamente para uma tela que já aparece em "telas" é repetição.
  const hrefsDasTelas = new Set(telas.map((linha) => linha.href));
  const vistos = new Set<string>();
  const fazerLimpo = fazer
    .map((linha, ordem) => ({ linha, ordem }))
    .sort((a, b) => b.linha.pontos - a.linha.pontos || a.ordem - b.ordem)
    .map(({ linha }) => linha)
    .filter((linha) => {
      if (vistos.has(linha.href) || hrefsDasTelas.has(linha.href)) return false;
      vistos.add(linha.href);
      return true;
    })
    .slice(0, 5);

  const melhorFazer = fazerLimpo[0]?.pontos ?? 0;
  const melhorTela = telas[0]?.pontos ?? 0;
  return melhorFazer > melhorTela ? [...fazerLimpo, ...telas] : [...telas, ...fazerLimpo];
}
