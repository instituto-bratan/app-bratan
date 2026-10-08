// ---------------------------------------------------------------------------
// MAPA DE NAVEGAÇÃO DO APP (08/10/2026) — redesenho "Papel & Musgo", etapa 1.
//
// O Lucas aprovou o menu novo em 08/10 ("pode implantar"): de 12 grupos para 7
// grupos + Ajustes no rodapé, 29 itens no menu, e NENHUM dos destinos de hoje
// some (os 62 do levantamento de 06/10, mais Pedidos de compra, que nasceu
// depois). Este arquivo é só o MODELO — dados e funções puras, sem React e sem
// visual — para que a casca nova (menu, barra de caminho, ⌘K, fixados e barra
// do celular) leia tudo de um lugar só, e para que os testes provem que a troca
// não tira nem dá acesso a ninguém.
//
// Regras desta etapa:
// - Nenhuma URL muda. Cada destino guarda a rota de HOJE. Destino novo ganha
//   rota nova (Avisos e as portas Dia, Pagar e Banco do Financeiro) e a etapa
//   da casca cria essas rotas no App.tsx.
// - Quem vê cada tela continua sendo a MESMA regra do AppLayout de 07/10: tela
//   com módulo segue o controle de Acessos (canSeeModule, a exceção por pessoa
//   vence o cargo); tela sem módulo segue a função de cargo de access.ts.
// - Um item aparece se a pessoa vê ao menos uma das telas dele; um grupo
//   aparece se sobra ao menos um item. O link do item leva à primeira tela que
//   a pessoa vê (senão cairia numa porta trancada).
//
// Decisões do Lucas que moram aqui (08/10/2026):
// - O contador do Início mostra SÓ as decisões pendentes ("decisoes").
// - Nota fiscal sem CPF vai para Avisos, como prioridade ("avisos"). As telas
//   do Início chegam na etapa 2; aqui fica só o lugar de cada contador.
// ---------------------------------------------------------------------------
import type { Cargo } from "@/types/database";
import { canAdministracao, canFinanceiroFull, canManageAcessos, canSeeModule, isCoordenacao, type ModuleKey } from "@/lib/access";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type GrupoId = "inicio" | "pacientes" | "comercial" | "financeiro" | "compras-estoque" | "resultados" | "equipe" | "ajustes";

/** Onde o destino mora: é o próprio item do menu, é uma aba dentro de um item, ou é um detalhe (ficha, perfil). */
export type Lugar = "menu" | "aba" | "detalhe";

/**
 * O número que aparece no grupo ou item:
 * - "decisoes": no Início, SÓ o que espera decisão (Lucas, 08/10);
 * - "avisos": o sino e o item Avisos (nota sem CPF entra como prioridade);
 * - "pedidos-para-aprovar": em Compras e estoque, como na imagem 01 aprovada
 *   ("3 pedidos esperam aprovação"); só faz sentido para quem aprova.
 */
export type Contador = "decisoes" | "avisos" | "pedidos-para-aprovar";

/**
 * Nomes de ícones do lucide-react. Fica como texto (e não o componente) para o
 * modelo continuar puro; a casca troca o nome pelo componente.
 */
export type NomeIcone =
  | "ArrowRightLeft"
  | "Banknote"
  | "Bell"
  | "BookOpen"
  | "Bot"
  | "Boxes"
  | "BrainCircuit"
  | "Calculator"
  | "CalendarClock"
  | "CalendarDays"
  | "CalendarRange"
  | "ChartColumn"
  | "CircleDollarSign"
  | "ClipboardCheck"
  | "ClipboardList"
  | "Coins"
  | "Contact"
  | "CreditCard"
  | "FileText"
  | "Gift"
  | "Goal"
  | "HandCoins"
  | "Handshake"
  | "HeartPulse"
  | "History"
  | "House"
  | "KeyRound"
  | "Landmark"
  | "LifeBuoy"
  | "ListChecks"
  | "ListTodo"
  | "Lock"
  | "Megaphone"
  | "Menu"
  | "MessageCircle"
  | "MessageSquareHeart"
  | "Mic"
  | "Newspaper"
  | "NotebookTabs"
  | "Package"
  | "Palette"
  | "PiggyBank"
  | "Plug"
  | "Plus"
  | "Presentation"
  | "Receipt"
  | "ReceiptText"
  | "RefreshCw"
  | "Repeat"
  | "Route"
  | "Ruler"
  | "Salad"
  | "Search"
  | "Settings"
  | "Settings2"
  | "Sheet"
  | "ShieldCheck"
  | "ShoppingCart"
  | "SlidersHorizontal"
  | "Smile"
  | "Sprout"
  | "SquareCheck"
  | "SquareKanban"
  | "Syringe"
  | "Target"
  | "TrendingUp"
  | "UserCog"
  | "UserRound"
  | "UserRoundCheck"
  | "UsersRound"
  | "Utensils"
  | "Vault"
  | "Wallet"
  | "Workflow";

/** Conferência na compilação: todo nome acima existe no lucide-react instalado (o tsc reclama se não existir). */
export type ConferenciaDosIcones = Pick<typeof import("lucide-react"), NomeIcone>;

/** A mesma regra que decidia o item no AppLayout de 07/10/2026. */
export type Acesso =
  | { tipo: "todos" }
  | { tipo: "modulo"; modulo: ModuleKey }
  | { tipo: "cargo"; regra: string; pode: (cargo: Cargo | null | undefined) => boolean };

/** O pedaço da Pessoa que a navegação usa (aceita a Pessoa do useAuth). */
export type PessoaNav = { id?: string | null; cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined;

export type Destino = {
  /** Fixo: é o que os Fixados guardam. Não reaproveite id de destino que saiu. */
  id: string;
  /** Nome completo: busca, fixados e título. */
  rotulo: string;
  /** Nome curto dentro do item (aba ou seletor). */
  aba: string;
  /** A URL de HOJE. Detalhes usam o padrão do react-router (":id"). */
  rota: string;
  /** Outros endereços que abrem a mesma tela ("/inicio" = "/"). */
  aliases: readonly string[];
  icone: NomeIcone;
  grupo: GrupoId;
  item: string;
  lugar: Lugar;
  acesso: Acesso;
  /** Sinônimos em português para a busca (sem precisar de acento). */
  palavras: readonly string[];
  /** Rota criada pelo redesenho (a casca precisa registrá-la no App.tsx). */
  novo: boolean;
  /** Aparece na busca e pode ser fixado (detalhe com ":id" não pode). */
  buscavel: boolean;
  /** Detalhe: a aba que fica marcada quando ele está aberto. */
  mae: string | null;
};

export type ItemDoMapa = {
  id: string;
  rotulo: string;
  icone: NomeIcone;
  grupo: GrupoId;
  /** A porta do item: rota nova do hub (Dia, Pagar, Banco, Avisos) ou a rota da primeira tela. */
  rota: string;
  /** Hub com rota própria, que só leva à primeira aba que a pessoa vê. */
  ehPorta: boolean;
  /** Ids dos destinos, na ordem das abas (detalhes no fim). */
  destinos: readonly string[];
  /** Inteligência 360 mostra as seções num seletor; o resto, em abas. */
  abasComo: "abas" | "seletor";
  novo: boolean;
  /** Não entra na lista do menu (Meu perfil mora no avatar). */
  foraDoMenu: boolean;
  contador: Contador | null;
  palavras: readonly string[];
};

export type GrupoDoMapa = {
  id: GrupoId;
  rotulo: string;
  icone: NomeIcone;
  /** Ajustes mora no rodapé do menu, fora da conta dos 29 itens. */
  rodape: boolean;
  contador: Contador | null;
  itens: readonly string[];
};

// ---------------------------------------------------------------------------
// O mapa (a ordem aqui é a ordem do menu aprovado, imagem 07)
// ---------------------------------------------------------------------------

type DefDestino = {
  id: string;
  rotulo: string;
  /** Obrigatório quando o item tem mais de uma tela; senão vale o nome do item. */
  aba?: string;
  rota: string;
  icone: NomeIcone;
  acesso: Acesso;
  lugar: Lugar;
  palavras: string[];
  aliases?: string[];
  novo?: boolean;
  mae?: string;
};

type DefItem = {
  id: string;
  rotulo: string;
  icone: NomeIcone;
  /** Rota NOVA do hub. Só Dia, Pagar e Banco (o Fechamento já tem rota: /financeiro/fechamento). */
  porta?: string;
  novo?: boolean;
  abasComo?: "abas" | "seletor";
  contador?: Contador;
  foraDoMenu?: boolean;
  palavras?: string[];
  destinos: DefDestino[];
};

type DefGrupo = { id: GrupoId; rotulo: string; icone: NomeIcone; rodape?: boolean; contador?: Contador; itens: DefItem[] };

const TODOS: Acesso = { tipo: "todos" };
const modulo = (chave: ModuleKey): Acesso => ({ tipo: "modulo", modulo: chave });
const porCargo = (regra: string, pode: (cargo: Cargo | null | undefined) => boolean): Acesso => ({ tipo: "cargo", regra, pode });

// Regras SEM módulo, copiadas do AppLayout de 07/10/2026 (Administração e
// Configurações do 360 nunca passaram pelo controle de Acessos).
const soAdministracao = porCargo("canAdministracao", canAdministracao);
const soQuemGerenciaAcessos = porCargo("canManageAcessos", canManageAcessos);
const soCoordenacao = porCargo("isCoordenacao", (cargo) => isCoordenacao(cargo));
const administracaoOuFinanceiro = porCargo("canAdministracao || canFinanceiroFull", (cargo) => canAdministracao(cargo) || canFinanceiroFull(cargo));

const MAPA: DefGrupo[] = [
  {
    id: "inicio",
    rotulo: "Início",
    icone: "House",
    contador: "decisoes",
    itens: [
      {
        id: "para-decidir",
        rotulo: "Para decidir",
        icone: "House",
        contador: "decisoes",
        destinos: [
          {
            id: "inicio",
            rotulo: "Para decidir",
            rota: "/",
            aliases: ["/inicio"],
            icone: "House",
            acesso: TODOS,
            lugar: "menu",
            palavras: ["início", "home", "fila do dia", "decidir", "decisões", "pendências", "aprovar", "o que fazer hoje"],
          },
        ],
      },
      {
        // "Hoje" é a antiga Tarefas (checklist) com a Agenda do dia em aba.
        id: "hoje",
        rotulo: "Hoje",
        icone: "SquareCheck",
        destinos: [
          { id: "tarefas", rotulo: "Tarefas do dia", aba: "Tarefas", rota: "/tarefas", icone: "SquareCheck", acesso: modulo("hoje"), lugar: "menu", palavras: ["checklist", "tarefas", "lista do dia", "turno", "hoje"] },
          {
            id: "agenda",
            rotulo: "Agenda do dia",
            aba: "Agenda do dia",
            rota: "/agenda",
            icone: "CalendarDays",
            acesso: modulo("agenda"),
            lugar: "aba",
            palavras: ["agenda", "consultas", "consulta do dia", "iclinic", "horário", "veio", "faltou", "paciente de hoje", "primeira consulta"],
          },
        ],
      },
      {
        // NOVO (08/10/2026): tudo o que chegou para a pessoa. Nota sem CPF entra aqui como prioridade.
        id: "avisos",
        rotulo: "Avisos",
        icone: "Bell",
        novo: true,
        contador: "avisos",
        destinos: [
          {
            id: "avisos",
            rotulo: "Avisos",
            rota: "/avisos",
            icone: "Bell",
            acesso: TODOS,
            lugar: "menu",
            novo: true,
            palavras: ["avisos", "notificações", "recados", "novidades", "o que chegou", "nota sem cpf"],
          },
        ],
      },
    ],
  },
  {
    id: "pacientes",
    rotulo: "Pacientes",
    icone: "UserRound",
    itens: [
      {
        id: "pacientes",
        rotulo: "Todos",
        icone: "UsersRound",
        destinos: [
          {
            id: "pacientes",
            rotulo: "Pacientes",
            aba: "Todos",
            rota: "/pacientes",
            icone: "UsersRound",
            acesso: modulo("pacientes"),
            lugar: "menu",
            palavras: ["paciente", "pacientes", "contato", "contatos", "ficha", "cpf", "telefone", "e-mail", "buscar paciente", "cliente"],
          },
          // A ficha abre pelo Kanban, por Pacientes e pelo ⌘K; a porta dela é o módulo do CRM.
          { id: "ficha-paciente", rotulo: "Ficha do paciente", rota: "/crm/contatos/:id", icone: "Contact", acesso: modulo("crm"), lugar: "detalhe", palavras: [], mae: "pacientes" },
        ],
      },
      {
        id: "acompanhamento",
        rotulo: "Acompanhamento",
        icone: "HeartPulse",
        destinos: [
          {
            id: "acompanhamento",
            rotulo: "Plano de acompanhamento",
            aba: "Acompanhamento",
            rota: "/acompanhamento",
            icone: "HeartPulse",
            acesso: modulo("acompanhamento"),
            lugar: "menu",
            palavras: ["acompanhamento", "plano", "programa", "jornada", "marcos", "doses", "bioimpedância", "inbody", "checkpoint", "listas do dr daniel"],
          },
        ],
      },
      {
        id: "nps",
        rotulo: "NPS",
        icone: "MessageSquareHeart",
        destinos: [
          {
            id: "nps",
            rotulo: "NPS da Concierge",
            aba: "NPS",
            rota: "/concierge/nps",
            icone: "MessageSquareHeart",
            acesso: modulo("concierge-nps"),
            lugar: "menu",
            palavras: ["nps", "pesquisa", "satisfação", "experiência", "concierge", "totem", "elogios", "reclamações"],
          },
        ],
      },
      {
        id: "nutricao",
        rotulo: "Nutrição",
        icone: "Salad",
        destinos: [
          { id: "nutricao-hoje", rotulo: "Nutrição do dia", aba: "Do dia", rota: "/nutricao", icone: "Salad", acesso: modulo("nutricao"), lugar: "menu", palavras: ["nutrição", "nutricionista", "consulta de nutrição"] },
          { id: "nutricao-pessoas", rotulo: "Pessoas da nutrição", aba: "Pessoas", rota: "/nutricao/pessoas", icone: "UsersRound", acesso: modulo("nutricao"), lugar: "aba", palavras: ["prontuário", "pacientes da nutrição"] },
          {
            id: "nutricao-biblioteca",
            rotulo: "Biblioteca da nutrição",
            aba: "Biblioteca",
            rota: "/nutricao/biblioteca",
            icone: "BookOpen",
            acesso: modulo("nutricao"),
            lugar: "aba",
            palavras: ["receitas", "alimentos", "taco", "modelos de plano"],
          },
          { id: "nutricao-guia", rotulo: "Guia da nutrição", aba: "Guia", rota: "/nutricao/guia", icone: "LifeBuoy", acesso: modulo("nutricao"), lugar: "aba", palavras: ["manual da nutrição", "como usar a nutrição"] },
          { id: "nutricao-pessoa", rotulo: "Pessoa da nutrição", rota: "/nutricao/pessoas/:id", icone: "Contact", acesso: modulo("nutricao"), lugar: "detalhe", palavras: [], mae: "nutricao-pessoas" },
          { id: "nutricao-consulta", rotulo: "Consulta de nutrição", rota: "/nutricao/consultas/:id", icone: "NotebookTabs", acesso: modulo("nutricao"), lugar: "detalhe", palavras: [], mae: "nutricao-pessoas" },
          { id: "nutricao-plano", rotulo: "Plano alimentar", rota: "/nutricao/planos/:id", icone: "Salad", acesso: modulo("nutricao"), lugar: "detalhe", palavras: [], mae: "nutricao-pessoas" },
        ],
      },
    ],
  },
  {
    id: "comercial",
    rotulo: "Comercial",
    icone: "Handshake",
    itens: [
      {
        id: "kanban",
        rotulo: "Kanban",
        icone: "SquareKanban",
        destinos: [
          {
            id: "kanban",
            rotulo: "Kanban comercial",
            aba: "Kanban",
            rota: "/crm/vendas",
            icone: "SquareKanban",
            acesso: modulo("crm"),
            lugar: "menu",
            palavras: ["kanban", "vendas", "venda", "funil", "registrar fechamento", "aderiu", "repescagem", "crm", "oportunidade", "negociação"],
          },
        ],
      },
      {
        id: "cadencias",
        rotulo: "Cadências",
        icone: "MessageCircle",
        destinos: [
          {
            id: "cadencias",
            rotulo: "Cadências",
            aba: "Cadências",
            rota: "/crm/cadencias",
            icone: "MessageCircle",
            acesso: modulo("crm"),
            lugar: "menu",
            palavras: ["cadência", "régua", "réguas", "inscrever", "radar de resgate", "resgate", "toques"],
          },
          {
            id: "planilha-cadencias",
            rotulo: "Planilha de cadências",
            aba: "Planilha",
            rota: "/crm/planilha",
            icone: "Sheet",
            acesso: modulo("crm"),
            lugar: "aba",
            palavras: ["planilha", "toques por setor", "d1", "d5", "ligações do gestor"],
          },
        ],
      },
      {
        id: "minhas-tarefas",
        rotulo: "Minhas tarefas",
        icone: "ListChecks",
        destinos: [
          {
            id: "minhas-tarefas",
            rotulo: "Minhas tarefas",
            rota: "/crm/minhas-tarefas",
            icone: "ListChecks",
            acesso: modulo("crm"),
            lugar: "menu",
            palavras: ["tarefas do crm", "toques", "toque", "ligar", "mensagem", "atrasadas", "retorno", "follow-up"],
          },
        ],
      },
      {
        id: "indicacoes",
        rotulo: "Indicações",
        icone: "Gift",
        destinos: [
          { id: "indicacoes", rotulo: "Indicações", rota: "/crm/indicacoes", icone: "Gift", acesso: modulo("crm"), lugar: "menu", palavras: ["indicação", "voucher", "canais de venda", "quem indicou"] },
        ],
      },
      {
        id: "coordenacao",
        rotulo: "Coordenação",
        icone: "ClipboardList",
        destinos: [
          {
            id: "gestao-vendas",
            rotulo: "Gestão de vendas",
            aba: "Gestão de vendas",
            rota: "/crm/coordenador",
            icone: "ClipboardList",
            acesso: modulo("crm"),
            lugar: "menu",
            palavras: ["coordenador", "coordenação", "pdca de prescrições", "pdca de agendamentos", "plano de ação", "funil", "registro de vendas"],
          },
          {
            id: "checkin",
            rotulo: "Check-in semanal",
            aba: "Check-in",
            rota: "/crm/checkin",
            icone: "CalendarRange",
            acesso: modulo("crm"),
            lugar: "aba",
            palavras: ["check-in", "checkin", "semana", "meta da semana", "prescrito", "relatório de sexta"],
          },
        ],
      },
      {
        // Só aparece para quem cuida do marketing (módulo "marketing", como hoje).
        id: "marketing",
        rotulo: "Marketing",
        icone: "Megaphone",
        destinos: [
          {
            id: "marketing",
            rotulo: "Marketing",
            rota: "/marketing",
            icone: "Megaphone",
            acesso: modulo("marketing"),
            lugar: "menu",
            palavras: ["briefing", "briefing do mês", "conteúdo", "plano de conteúdo", "instagram", "posts"],
          },
        ],
      },
    ],
  },
  {
    // Financeiro (08/10/2026): 16 itens soltos viram 4 portas pelo ritmo do
    // trabalho. As abas apontam para as telas de sempre; as portas Dia, Pagar e
    // Banco ganham rota nova. O Fechamento NÃO ganha rota nova: /financeiro/fechamento
    // já é a tela do Fechamento do dia (regra de ouro — nenhuma URL muda), então
    // a porta do item é a própria primeira aba.
    id: "financeiro",
    rotulo: "Financeiro",
    icone: "Wallet",
    itens: [
      {
        id: "dia",
        rotulo: "Dia",
        icone: "Banknote",
        porta: "/financeiro/dia",
        novo: true,
        palavras: ["dia", "caixa", "caixa do dia", "movimento do dia", "entradas"],
        destinos: [
          {
            id: "lancar-dia",
            rotulo: "Lançar dia",
            aba: "Lançar dia",
            rota: "/financeiro/lancar-dia",
            icone: "Banknote",
            acesso: modulo("fin-lancar-dia"),
            lugar: "aba",
            palavras: ["comanda", "comandas", "lançar comanda", "venda do dia", "recebi", "maquininha", "pix", "dinheiro", "cartão"],
          },
          { id: "crediario", rotulo: "Crediário", aba: "Crediário", rota: "/financeiro/crediario", icone: "HandCoins", acesso: modulo("fin-crediario"), lugar: "aba", palavras: ["dinheiro vivo", "espécie", "crediário"] },
          {
            id: "comprovantes",
            rotulo: "Comprovantes",
            aba: "Comprovantes",
            rota: "/comprovantes",
            icone: "ReceiptText",
            acesso: modulo("comprovantes"),
            lugar: "aba",
            palavras: ["comprovante", "pix do paciente", "anexar", "recibo", "estorno"],
          },
        ],
      },
      {
        id: "pagar",
        rotulo: "Pagar",
        icone: "Receipt",
        porta: "/financeiro/pagar",
        novo: true,
        palavras: ["pagar", "pagamentos", "saídas"],
        destinos: [
          {
            id: "contas",
            rotulo: "Contas a pagar",
            aba: "Contas",
            rota: "/financeiro/contas",
            icone: "Receipt",
            acesso: modulo("fin-contas"),
            lugar: "aba",
            palavras: ["contas a pagar", "conta", "contas", "boleto", "pagamento", "despesa", "fornecedor", "vencimento", "aprovar conta", "nota do fornecedor"],
          },
          {
            id: "fatura",
            rotulo: "Fatura do cartão",
            aba: "Fatura do cartão",
            rota: "/financeiro/fatura-cartao",
            icone: "CreditCard",
            acesso: modulo("fin-fatura"),
            lugar: "aba",
            palavras: ["fatura", "cartão de crédito", "visa", "master", "itaú", "santander", "safra"],
          },
          {
            // Lembretes usa o mesmo módulo de Contas (fin-contas), como no menu de 07/10.
            id: "lembretes",
            rotulo: "Lembretes de pagamento",
            aba: "Lembretes",
            rota: "/lembretes-pagamento",
            icone: "CalendarClock",
            acesso: modulo("fin-contas"),
            lugar: "aba",
            palavras: ["lembrete", "cobrança", "paciente devendo", "a receber", "quem deve"],
          },
        ],
      },
      {
        id: "banco",
        rotulo: "Banco",
        icone: "Landmark",
        porta: "/financeiro/banco",
        novo: true,
        palavras: ["banco", "conta corrente", "itaú"],
        destinos: [
          {
            id: "extrato",
            rotulo: "Extrato do banco",
            aba: "Extrato",
            rota: "/financeiro/extrato",
            icone: "Landmark",
            acesso: modulo("fin-extrato"),
            lugar: "aba",
            palavras: ["extrato", "conciliar", "conciliação", "saldo do banco", "itaú", "ofx"],
          },
          { id: "poupanca", rotulo: "Poupança", aba: "Poupança", rota: "/financeiro/poupanca", icone: "PiggyBank", acesso: modulo("fin-poupanca"), lugar: "aba", palavras: ["cofre", "resgate", "rendimento", "reserva", "obra"] },
        ],
      },
      {
        id: "fechamento",
        rotulo: "Fechamento",
        icone: "ShieldCheck",
        novo: true,
        destinos: [
          {
            id: "fechamento",
            rotulo: "Fechamento do dia",
            aba: "Fechamento",
            rota: "/financeiro/fechamento",
            icone: "ShieldCheck",
            acesso: modulo("fin-fechamento"),
            lugar: "aba",
            palavras: ["fechamento", "fechar o dia", "conferir caixa", "conferência", "contagem"],
          },
          {
            id: "impostos",
            rotulo: "Impostos & NFs",
            aba: "Impostos & NFs",
            rota: "/financeiro/impostos",
            icone: "FileText",
            acesso: modulo("fin-impostos"),
            lugar: "aba",
            palavras: ["imposto", "impostos", "nota", "notas", "nota fiscal", "notas fiscais", "nf", "nfs", "nfse", "nfs-e", "emitir nota", "lote de notas", "iss", "prefeitura", "focus"],
          },
          {
            id: "repasses",
            rotulo: "Repasses",
            aba: "Repasses",
            rota: "/financeiro/repasses",
            icone: "ArrowRightLeft",
            acesso: modulo("fin-repasses"),
            lugar: "aba",
            palavras: ["repasse", "nutri", "psi", "nutricionista", "psicóloga", "comissão"],
          },
        ],
      },
    ],
  },
  {
    // Compras e estoque (08/10/2026): o Controle de compras do Financeiro
    // (/financeiro/compras) mora aqui como aba de Pedidos — "junta Compras e
    // Estoque", como no menu aprovado — sem mudar de endereço.
    id: "compras-estoque",
    rotulo: "Compras e estoque",
    icone: "Package",
    contador: "pedidos-para-aprovar",
    itens: [
      {
        id: "pedidos",
        rotulo: "Pedidos",
        icone: "ClipboardCheck",
        contador: "pedidos-para-aprovar",
        destinos: [
          {
            id: "pedidos",
            rotulo: "Pedidos de compra",
            aba: "Pedidos",
            rota: "/compras",
            icone: "ClipboardCheck",
            acesso: modulo("compras"),
            lugar: "menu",
            palavras: ["pedido", "pedidos", "pedido de compra", "comprar", "requisição", "solicitar compra", "aprovar pedido", "aprovação", "falta"],
          },
          {
            id: "controle-compras",
            rotulo: "Controle de compras",
            aba: "Controle de compras",
            rota: "/financeiro/compras",
            icone: "ShoppingCart",
            acesso: modulo("fin-compras"),
            lugar: "aba",
            palavras: ["compras", "compra", "entrega", "a caminho", "chegou", "nf da compra"],
          },
        ],
      },
      {
        id: "estoque",
        rotulo: "Estoque por setor",
        icone: "Boxes",
        destinos: [
          {
            id: "estoque",
            rotulo: "Estoque por setor",
            rota: "/estoque",
            icone: "Boxes",
            acesso: modulo("estoque"),
            lugar: "menu",
            palavras: ["estoque", "saldo", "contar", "contagem", "validade", "mínimo", "já comprei", "bipar", "kardex", "setor"],
          },
        ],
      },
      {
        id: "aplicacoes",
        rotulo: "Aplicações",
        icone: "Syringe",
        destinos: [
          {
            id: "aplicacoes",
            rotulo: "Aplicações da enfermagem",
            aba: "Aplicações",
            rota: "/estoque/aplicacoes",
            icone: "Syringe",
            acesso: modulo("aplicacoes"),
            lugar: "menu",
            palavras: ["aplicação", "aplicar", "dose", "lote", "injeção", "implante", "pellet", "enfermagem", "ficha de aplicação"],
          },
        ],
      },
    ],
  },
  {
    id: "resultados",
    rotulo: "Resultados",
    icone: "ChartColumn",
    itens: [
      {
        id: "painel",
        rotulo: "Painel do mês",
        icone: "Presentation",
        destinos: [
          {
            id: "painel",
            rotulo: "Painel do mês",
            rota: "/financeiro/painel",
            icone: "Presentation",
            acesso: modulo("fin-gestao"),
            lugar: "menu",
            palavras: ["painel", "reunião", "reunião de líderes", "apresentar", "relatórios", "gestão mensal", "resumo do mês"],
          },
        ],
      },
      {
        id: "lucro",
        rotulo: "Lucro",
        icone: "Sprout",
        destinos: [
          {
            id: "lucro",
            rotulo: "Lucro Inteligente",
            aba: "Lucro",
            rota: "/financeiro/lucro",
            icone: "Sprout",
            acesso: modulo("fin-lucro"),
            lugar: "menu",
            palavras: ["lucro", "envelope", "envelopes", "profit first", "cabe gastar", "transferir", "antecipação"],
          },
        ],
      },
      {
        id: "metas-pdca",
        rotulo: "Metas & PDCA",
        icone: "Goal",
        destinos: [
          { id: "metas", rotulo: "Metas do mês", aba: "Metas", rota: "/financeiro/metas", icone: "Goal", acesso: modulo("fin-metas"), lugar: "menu", palavras: ["meta", "metas", "supermeta", "meta do dia", "faturamento"] },
          { id: "pdca", rotulo: "PDCA do Dr. Daniel", aba: "PDCA", rota: "/financeiro/pdca", icone: "RefreshCw", acesso: modulo("fin-pdca"), lugar: "aba", palavras: ["pdca", "tratamentos", "prescrição"] },
        ],
      },
      {
        id: "p12",
        rotulo: "P12",
        icone: "CircleDollarSign",
        destinos: [
          {
            id: "p12",
            rotulo: "P12 ao vivo",
            aba: "P12",
            rota: "/financeiro/p12",
            icone: "CircleDollarSign",
            acesso: modulo("fin-p12"),
            lugar: "menu",
            palavras: ["p12", "dre", "resultado", "categorias", "despesas do mês", "receitas"],
          },
        ],
      },
      {
        // As 9 seções do 360 viram um seletor dentro da página (as rotas continuam as mesmas).
        id: "inteligencia-360",
        rotulo: "Inteligência 360",
        icone: "BrainCircuit",
        abasComo: "seletor",
        destinos: [
          { id: "i360", rotulo: "Inteligência 360", aba: "Visão geral", rota: "/inteligencia-360", icone: "BrainCircuit", acesso: modulo("inteligencia360"), lugar: "menu", palavras: ["360", "dashboard", "indicadores"] },
          { id: "i360-ticket", rotulo: "Ticket médio", aba: "Ticket médio", rota: "/inteligencia-360/ticket-medio", icone: "Target", acesso: modulo("inteligencia360"), lugar: "aba", palavras: ["ticket"] },
          {
            id: "i360-precificacao",
            rotulo: "Precificação",
            aba: "Precificação",
            rota: "/inteligencia-360/precificacao",
            icone: "Calculator",
            acesso: modulo("inteligencia360"),
            lugar: "aba",
            palavras: ["preço", "taxa hora", "hora sala", "custo da sala"],
          },
          { id: "i360-comercial", rotulo: "Comercial no 360", aba: "Comercial", rota: "/inteligencia-360/comercial", icone: "TrendingUp", acesso: modulo("inteligencia360"), lugar: "aba", palavras: ["conversão", "vendas no 360"] },
          { id: "i360-jornada", rotulo: "Jornada do paciente", aba: "Jornada", rota: "/inteligencia-360/jornada-paciente", icone: "Route", acesso: modulo("inteligencia360"), lugar: "aba", palavras: ["jornada"] },
          { id: "i360-reguas", rotulo: "Réguas de relacionamento", aba: "Réguas", rota: "/inteligencia-360/reguas", icone: "Ruler", acesso: modulo("inteligencia360"), lugar: "aba", palavras: ["régua", "relacionamento"] },
          { id: "i360-retencao", rotulo: "Retenção e resgate", aba: "Retenção", rota: "/inteligencia-360/retencao-resgate", icone: "Repeat", acesso: modulo("inteligencia360"), lugar: "aba", palavras: ["retenção", "churn"] },
          { id: "i360-experiencia", rotulo: "Experiência do paciente", aba: "Experiência", rota: "/inteligencia-360/experiencia", icone: "Smile", acesso: modulo("inteligencia360"), lugar: "aba", palavras: ["experiência"] },
          { id: "i360-recebiveis", rotulo: "Recebíveis", aba: "Recebíveis", rota: "/inteligencia-360/recebiveis", icone: "HandCoins", acesso: modulo("inteligencia360"), lugar: "aba", palavras: ["a receber", "quem deve"] },
          { id: "i360-acoes", rotulo: "Ações do 360", aba: "Ações", rota: "/inteligencia-360/acoes", icone: "ListTodo", acesso: modulo("inteligencia360"), lugar: "aba", palavras: ["ações", "plano de ação"] },
        ],
      },
    ],
  },
  {
    id: "equipe",
    rotulo: "Equipe",
    icone: "UsersRound",
    itens: [
      {
        id: "pops",
        rotulo: "POPs & Fluxos",
        icone: "Workflow",
        destinos: [
          { id: "pops", rotulo: "POPs & Fluxos", rota: "/pops-fluxos", icone: "Workflow", acesso: modulo("pops"), lugar: "menu", palavras: ["pop", "fluxo", "fluxograma", "procedimento", "manual", "processo"] },
        ],
      },
      {
        id: "mural",
        rotulo: "Mural",
        icone: "Newspaper",
        destinos: [{ id: "mural", rotulo: "Mural", rota: "/mural", icone: "Newspaper", acesso: modulo("hoje"), lugar: "menu", palavras: ["comunicados", "recados da coordenação", "mural de avisos"] }],
      },
      {
        id: "almoco",
        rotulo: "Almoço",
        icone: "Utensils",
        destinos: [{ id: "almoco", rotulo: "Almoço", rota: "/almoco", icone: "Utensils", acesso: modulo("hoje"), lugar: "menu", palavras: ["cobertura", "escala do almoço", "intervalo", "refeição"] }],
      },
      {
        id: "estalecas",
        rotulo: "Estalecas",
        icone: "Coins",
        destinos: [
          { id: "estalecas", rotulo: "Estalecas", rota: "/estalecas", icone: "Coins", acesso: modulo("estalecas"), lugar: "menu", palavras: ["carteira", "minhas estalecas", "ranking", "pontos", "recompensa"] },
        ],
      },
    ],
  },
  {
    // Ajustes (08/10/2026): a antiga Administração + Configurações do 360, no
    // rodapé do menu. Nenhuma destas telas tinha módulo de Acessos; seguem a
    // mesma regra de cargo de antes.
    id: "ajustes",
    rotulo: "Ajustes",
    icone: "Settings",
    rodape: true,
    itens: [
      {
        id: "colaboradores",
        rotulo: "Colaboradores",
        icone: "UsersRound",
        destinos: [
          {
            id: "colaboradores",
            rotulo: "Colaboradores",
            rota: "/administracao/colaboradores",
            icone: "UsersRound",
            acesso: soAdministracao,
            lugar: "menu",
            palavras: ["colaborador", "equipe", "funcionários", "cadastro de pessoas", "criar acesso"],
          },
          { id: "colaborador-perfil", rotulo: "Perfil do colaborador", rota: "/administracao/colaboradores/:id", icone: "UserCog", acesso: soAdministracao, lugar: "detalhe", palavras: [], mae: "colaboradores" },
        ],
      },
      {
        id: "acessos",
        rotulo: "Acessos",
        icone: "KeyRound",
        destinos: [
          {
            id: "acessos",
            rotulo: "Acessos",
            rota: "/administracao/acessos",
            icone: "KeyRound",
            acesso: soQuemGerenciaAcessos,
            lugar: "menu",
            palavras: ["acesso", "permissão", "permissões", "liberar tela", "esconder tela", "quem vê"],
          },
        ],
      },
      {
        id: "config-negocio",
        rotulo: "Configurações do negócio",
        icone: "SlidersHorizontal",
        destinos: [
          {
            id: "config-negocio",
            rotulo: "Configurações do negócio",
            rota: "/administracao/configuracoes",
            icone: "SlidersHorizontal",
            acesso: soQuemGerenciaAcessos,
            lugar: "menu",
            palavras: ["configuração", "limite", "regra", "vigência", "alíquota", "parâmetros"],
          },
        ],
      },
      {
        id: "integracoes",
        rotulo: "Integrações",
        icone: "Plug",
        destinos: [
          {
            id: "integracoes",
            rotulo: "Integrações",
            rota: "/administracao/integracoes",
            icone: "Plug",
            acesso: soCoordenacao,
            lugar: "menu",
            palavras: ["integração", "whatsapp oficial", "focus nfe", "push", "feegow", "supersign", "google agenda"],
          },
        ],
      },
      {
        id: "seguranca",
        rotulo: "Segurança",
        icone: "Lock",
        destinos: [{ id: "seguranca", rotulo: "Segurança", rota: "/administracao/seguranca", icone: "Lock", acesso: soAdministracao, lugar: "menu", palavras: ["senha", "senha do gestor", "sessões", "login"] }],
      },
      {
        id: "auditoria",
        rotulo: "Auditoria",
        icone: "History",
        destinos: [{ id: "auditoria", rotulo: "Auditoria", rota: "/administracao/auditoria", icone: "History", acesso: soAdministracao, lugar: "menu", palavras: ["histórico", "log", "quem mexeu", "alterações"] }],
      },
      {
        id: "ia",
        rotulo: "O que a IA fez",
        icone: "Bot",
        destinos: [
          { id: "ia", rotulo: "O que a IA fez", rota: "/administracao/ia", icone: "Bot", acesso: administracaoOuFinanceiro, lugar: "menu", palavras: ["ia", "inteligência artificial", "governança", "robô", "automação"] },
        ],
      },
      {
        id: "compliance",
        rotulo: "Cofre de compliance",
        icone: "Vault",
        destinos: [
          {
            id: "compliance",
            rotulo: "Cofre de compliance",
            rota: "/administracao/compliance",
            icone: "Vault",
            acesso: soCoordenacao,
            lugar: "menu",
            palavras: ["lgpd", "compliance", "dpo", "consentimento", "incidente", "ripd", "privacidade"],
          },
        ],
      },
      {
        id: "portal",
        rotulo: "Portal do paciente",
        icone: "Mic",
        destinos: [
          {
            id: "portal",
            rotulo: "Portal do paciente",
            rota: "/administracao/portal",
            icone: "Mic",
            acesso: soCoordenacao,
            lugar: "menu",
            palavras: ["portal", "meu bratan", "voz do doutor", "gravar áudio", "app do paciente"],
          },
        ],
      },
      {
        id: "estalecas-gestao",
        rotulo: "Gestão de Estalecas",
        icone: "Coins",
        destinos: [
          { id: "estalecas-gestao", rotulo: "Gestão de Estalecas", rota: "/administracao/estalecas", icone: "Coins", acesso: soAdministracao, lugar: "menu", palavras: ["estalecas", "pontuar", "lançar estalecas", "loja"] },
        ],
      },
      {
        // Configurações do 360 sai do grupo do 360 e vem para Ajustes (menu aprovado).
        id: "i360-config",
        rotulo: "Configurações do 360",
        icone: "Settings2",
        destinos: [
          {
            id: "i360-config",
            rotulo: "Configurações do 360",
            rota: "/inteligencia-360/configuracoes",
            icone: "Settings2",
            acesso: soAdministracao,
            lugar: "menu",
            palavras: ["parâmetros do 360", "metas do 360"],
          },
        ],
      },
      {
        // Meu perfil abre pelo avatar no pé do menu; não é um item da lista.
        id: "meu-perfil",
        rotulo: "Meu perfil",
        icone: "UserRound",
        foraDoMenu: true,
        destinos: [{ id: "meu-perfil", rotulo: "Meu perfil", rota: "/meu-perfil", icone: "UserRound", acesso: TODOS, lugar: "detalhe", palavras: ["perfil", "foto", "avatar", "minha conta"] }],
      },
      {
        // Guia visual do redesenho (08/10/2026, etapa da fundação): a vitrine dos
        // componentes Papel & Musgo, sem dado da clínica. Fica fora da lista do
        // menu (é referência de quem refaz tela), mas a busca acha e a barra de
        // caminho sabe onde está. A rota não tem porta de acesso; aqui também não.
        id: "guia-visual",
        rotulo: "Guia visual",
        icone: "Palette",
        foraDoMenu: true,
        destinos: [
          {
            id: "guia-visual",
            rotulo: "Guia visual",
            rota: "/ajustes/guia-visual",
            icone: "Palette",
            acesso: TODOS,
            lugar: "detalhe",
            palavras: ["componentes", "cores", "estilo", "papel e musgo", "design"],
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// O mapa achatado (é o que as telas e os testes leem)
// ---------------------------------------------------------------------------

export const GRUPOS: readonly GrupoDoMapa[] = MAPA.map((grupo) => ({
  id: grupo.id,
  rotulo: grupo.rotulo,
  icone: grupo.icone,
  rodape: Boolean(grupo.rodape),
  contador: grupo.contador ?? null,
  itens: grupo.itens.map((item) => item.id),
}));

export const ITENS: readonly ItemDoMapa[] = MAPA.flatMap((grupo) =>
  grupo.itens.map((item) => ({
    id: item.id,
    rotulo: item.rotulo,
    icone: item.icone,
    grupo: grupo.id,
    rota: item.porta ?? item.destinos[0].rota,
    ehPorta: Boolean(item.porta),
    destinos: item.destinos.map((destino) => destino.id),
    abasComo: item.abasComo ?? "abas",
    novo: Boolean(item.novo),
    foraDoMenu: Boolean(item.foraDoMenu),
    contador: item.contador ?? null,
    palavras: item.palavras ?? [],
  })),
);

export const DESTINOS: readonly Destino[] = MAPA.flatMap((grupo) =>
  grupo.itens.flatMap((item) =>
    item.destinos.map((destino) => ({
      id: destino.id,
      rotulo: destino.rotulo,
      aba: destino.aba ?? (destino.lugar === "detalhe" ? destino.rotulo : item.rotulo),
      rota: destino.rota,
      aliases: destino.aliases ?? [],
      icone: destino.icone,
      grupo: grupo.id,
      item: item.id,
      lugar: destino.lugar,
      acesso: destino.acesso,
      palavras: destino.palavras,
      novo: Boolean(destino.novo),
      buscavel: !destino.rota.includes(":"),
      mae: destino.mae ?? null,
    })),
  ),
);

const GRUPO_POR_ID = new Map(GRUPOS.map((grupo) => [grupo.id, grupo]));
const ITEM_POR_ID = new Map(ITENS.map((item) => [item.id, item]));
const DESTINO_POR_ID = new Map(DESTINOS.map((destino) => [destino.id, destino]));

export function grupoPorId(id: GrupoId): GrupoDoMapa {
  return GRUPO_POR_ID.get(id) as GrupoDoMapa;
}

export function itemPorId(id: string): ItemDoMapa | null {
  return ITEM_POR_ID.get(id) ?? null;
}

export function destinoPorId(id: string): Destino | null {
  return DESTINO_POR_ID.get(id) ?? null;
}

/** Os redirecionamentos de hoje no App.tsx (o caminho resolve para o destino final). */
export const REDIRECIONAMENTOS: Readonly<Record<string, string>> = {
  "/financeiro": "/financeiro/lancar-dia",
  "/financeiro/gestao": "/financeiro/painel",
  "/financeiro/relatorios": "/financeiro/painel",
  "/crm": "/crm/minhas-tarefas",
  "/crm/listas": "/acompanhamento",
  "/crm/canais": "/crm/indicacoes",
  "/administracao": "/administracao/colaboradores",
};

/** Rotas que o redesenho cria (a casca registra no App.tsx): Avisos e as portas Dia, Pagar e Banco. */
export const ROTAS_NOVAS: readonly string[] = [
  ...DESTINOS.filter((destino) => destino.novo).map((destino) => destino.rota),
  ...ITENS.filter((item) => item.ehPorta).map((item) => item.rota),
];

// ---------------------------------------------------------------------------
// Quem vê o quê
// ---------------------------------------------------------------------------

/** A regra do AppLayout de 07/10: módulo → controle de Acessos; sem módulo → cargo. */
export function podeVerDestino(pessoa: PessoaNav, destino: Destino): boolean {
  const acesso = destino.acesso;
  if (acesso.tipo === "todos") return true;
  if (acesso.tipo === "modulo") return canSeeModule(pessoa, acesso.modulo);
  return acesso.pode(pessoa?.cargo);
}

/** As telas do item que a pessoa vê, na ordem das abas (sem os detalhes). */
function telasVisiveis(pessoa: PessoaNav, item: ItemDoMapa): Destino[] {
  return item.destinos
    .map((id) => DESTINO_POR_ID.get(id) as Destino)
    .filter((destino) => destino.lugar !== "detalhe" && podeVerDestino(pessoa, destino));
}

export function itemVisivel(pessoa: PessoaNav, item: ItemDoMapa): boolean {
  return telasVisiveis(pessoa, item).length > 0;
}

/** Para onde o item leva ESTA pessoa: a primeira tela dele que ela vê (porta de hub não tem tela própria). */
export function hrefDoItem(pessoa: PessoaNav, item: ItemDoMapa): string {
  return telasVisiveis(pessoa, item)[0]?.rota ?? item.rota;
}

/** O grupo aparece se sobra ao menos um item do menu (Meu perfil não conta: mora no avatar). */
export function grupoVisivel(pessoa: PessoaNav, grupo: GrupoId): boolean {
  const def = GRUPO_POR_ID.get(grupo);
  if (!def) return false;
  return def.itens.some((id) => {
    const item = ITEM_POR_ID.get(id) as ItemDoMapa;
    return !item.foraDoMenu && itemVisivel(pessoa, item);
  });
}

export function gruposVisiveis(pessoa: PessoaNav): GrupoId[] {
  return GRUPOS.filter((grupo) => grupoVisivel(pessoa, grupo.id)).map((grupo) => grupo.id);
}

// ---------------------------------------------------------------------------
// O menu da pessoa
// ---------------------------------------------------------------------------

export type AbaNoMenu = { id: string; rotulo: string; rotuloCompleto: string; href: string; icone: NomeIcone };

export type ItemNoMenu = {
  id: string;
  rotulo: string;
  icone: NomeIcone;
  grupo: GrupoId;
  /** A porta oficial do item (rota nova do hub ou a primeira tela). */
  rota: string;
  /** Para onde o clique leva esta pessoa (primeira aba que ela vê). */
  href: string;
  /** Só as abas que a pessoa vê. Com uma só, a casca não desenha barra de abas. */
  abas: AbaNoMenu[];
  abasComo: "abas" | "seletor";
  novo: boolean;
  contador: Contador | null;
};

export type GrupoNoMenu = {
  id: GrupoId;
  rotulo: string;
  icone: NomeIcone;
  rodape: boolean;
  contador: Contador | null;
  href: string;
  itens: ItemNoMenu[];
};

function abaDoMenu(destino: Destino): AbaNoMenu {
  return { id: destino.id, rotulo: destino.aba, rotuloCompleto: destino.rotulo, href: destino.rota, icone: destino.icone };
}

/** Os 7 grupos + Ajustes (rodapé), só com o que a pessoa vê. Quem vê tudo tem 29 itens fora do rodapé. */
export function itensDoMenu(pessoa: PessoaNav): GrupoNoMenu[] {
  const saida: GrupoNoMenu[] = [];
  for (const grupo of GRUPOS) {
    const itens: ItemNoMenu[] = [];
    for (const id of grupo.itens) {
      const item = ITEM_POR_ID.get(id) as ItemDoMapa;
      if (item.foraDoMenu) continue;
      const telas = telasVisiveis(pessoa, item);
      if (!telas.length) continue;
      itens.push({
        id: item.id,
        rotulo: item.rotulo,
        icone: item.icone,
        grupo: item.grupo,
        rota: item.rota,
        href: telas[0].rota,
        abas: telas.map(abaDoMenu),
        abasComo: item.abasComo,
        novo: item.novo,
        contador: item.contador,
      });
    }
    if (!itens.length) continue;
    saida.push({ id: grupo.id, rotulo: grupo.rotulo, icone: grupo.icone, rodape: grupo.rodape, contador: grupo.contador, href: itens[0].href, itens });
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Busca (⌘K) e ações rápidas
// ---------------------------------------------------------------------------

/** O que a busca, os fixados e o "Novo" mostram. */
export type Atalho = {
  tipo: "tela" | "porta" | "acao";
  id: string;
  rotulo: string;
  /** "Financeiro › Pagar" — de onde vem o resultado. */
  contexto: string;
  href: string;
  icone: NomeIcone;
};

export type ResultadoDaBusca = Atalho & { pontos: number };

export type AcaoRapida = {
  id: "novo-pedido" | "lancar-dia" | "nova-conta";
  rotulo: string;
  /** Rota e parâmetro que JÁ existem (nada novo nas telas). */
  href: string;
  /** O destino cuja permissão decide se a ação aparece (como o ⌘K de 14/09). */
  destino: string;
  icone: NomeIcone;
  palavras: readonly string[];
  /** Contas a pagar já entende ?valor=1234.56 (⌘K de 14/09) e abre o formulário com o valor. */
  aceitaValor: boolean;
};

// As ações do menu aprovado: Novo pedido de compra · Lançar dia · Nova conta a pagar.
export const ACOES_RAPIDAS: readonly AcaoRapida[] = [
  {
    id: "novo-pedido",
    rotulo: "Novo pedido de compra",
    href: "/compras?novo=1",
    destino: "pedidos",
    icone: "ClipboardCheck",
    palavras: ["pedir", "pedido", "comprar", "requisição", "solicitar compra", "falta"],
    aceitaValor: false,
  },
  {
    id: "lancar-dia",
    rotulo: "Lançar dia",
    href: "/financeiro/lancar-dia",
    destino: "lancar-dia",
    icone: "Banknote",
    palavras: ["comanda", "lançar comanda", "venda", "recebi", "caixa"],
    aceitaValor: false,
  },
  {
    id: "nova-conta",
    rotulo: "Nova conta a pagar",
    href: "/financeiro/contas",
    destino: "contas",
    icone: "Receipt",
    palavras: ["conta", "lançar conta", "boleto", "pagar", "despesa"],
    aceitaValor: true,
  },
];

export function acoesRapidas(pessoa: PessoaNav): AcaoRapida[] {
  return ACOES_RAPIDAS.filter((acao) => {
    const destino = DESTINO_POR_ID.get(acao.destino);
    return Boolean(destino && podeVerDestino(pessoa, destino));
  });
}

/** O link da ação; a conta a pagar já chega com o valor digitado no ⌘K. */
export function hrefDaAcao(acao: AcaoRapida, valor?: number): string {
  if (acao.aceitaValor && typeof valor === "number" && Number.isFinite(valor) && valor > 0) {
    return `${acao.href}${acao.href.includes("?") ? "&" : "?"}valor=${valor.toFixed(2)}`;
  }
  return acao.href;
}

function contextoDe(destino: Destino): string {
  const grupo = GRUPO_POR_ID.get(destino.grupo) as GrupoDoMapa;
  const item = ITEM_POR_ID.get(destino.item) as ItemDoMapa;
  const telas = item.destinos.filter((id) => (DESTINO_POR_ID.get(id) as Destino).lugar !== "detalhe").length;
  return item.rotulo === destino.rotulo || telas === 1 ? grupo.rotulo : `${grupo.rotulo} › ${item.rotulo}`;
}

function atalhoDoDestino(destino: Destino): Atalho {
  return { tipo: "tela", id: destino.id, rotulo: destino.rotulo, contexto: contextoDe(destino), href: destino.rota, icone: destino.icone };
}

/** Tudo o que a pessoa pode achar pelo ⌘K: as telas que ela vê e as portas Dia, Pagar e Banco. */
export function destinosBuscaveis(pessoa: PessoaNav): Atalho[] {
  return buscaveisComTexto(pessoa).map((candidato) => candidato.atalho);
}

type Candidato = { atalho: Atalho; principais: string[]; sinonimos: readonly string[]; contexto: string[] };

function buscaveisComTexto(pessoa: PessoaNav): Candidato[] {
  const saida: Candidato[] = [];
  for (const item of ITENS) {
    const grupo = GRUPO_POR_ID.get(item.grupo) as GrupoDoMapa;
    if (item.ehPorta && itemVisivel(pessoa, item)) {
      saida.push({
        atalho: { tipo: "porta", id: item.id, rotulo: item.rotulo, contexto: grupo.rotulo, href: hrefDoItem(pessoa, item), icone: item.icone },
        principais: [item.rotulo],
        sinonimos: item.palavras,
        contexto: [grupo.rotulo],
      });
    }
    for (const id of item.destinos) {
      const destino = DESTINO_POR_ID.get(id) as Destino;
      if (!destino.buscavel || !podeVerDestino(pessoa, destino)) continue;
      // O nome do item conta como nome da tela quando ela é a porta do item
      // ("Hoje" acha Tarefas do dia; "Coordenação" acha Gestão de vendas).
      const principais = [destino.rotulo, destino.aba];
      if (destino.lugar === "menu") principais.push(item.rotulo);
      saida.push({ atalho: atalhoDoDestino(destino), principais, sinonimos: destino.palavras, contexto: [grupo.rotulo, item.rotulo] });
    }
  }
  return saida;
}

const PALAVRAS_VAZIAS = new Set(["a", "o", "as", "os", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "para", "por", "com", "um", "uma"]);

/** Sem acento, minúsculo, "&" vira "e", só letras e números separados por um espaço. */
export function normalizarBusca(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * 2 = todas as palavras da busca são começo de alguma palavra do texto;
 * 1 = alguma só casou pelo singular, e aí a palavra inteira ("contas" acha
 *     "conta", mas não "contato" nem "contagem");
 * 0 = não casa.
 */
function casamento(tokens: string[], palavras: string[]): 0 | 1 | 2 {
  let resultado: 1 | 2 = 2;
  for (const token of tokens) {
    if (palavras.some((palavra) => palavra.startsWith(token))) continue;
    const singular = token.length >= 4 && token.endsWith("s") ? token.slice(0, -1) : null;
    if (singular && palavras.includes(singular)) {
      resultado = 1;
      continue;
    }
    return 0;
  }
  return resultado;
}

function nota(texto: string, consulta: string, tokens: string[], exato: number, comeco: number, todas: number): number {
  const normal = normalizarBusca(texto);
  if (!normal) return 0;
  if (normal === consulta) return exato;
  if (normal.startsWith(consulta)) return comeco;
  const casa = casamento(tokens, normal.split(" "));
  if (casa === 2) return todas;
  if (casa === 1) return todas - 5;
  return 0;
}

function pontuar(candidato: Candidato, consulta: string, tokens: string[]): number {
  let melhor = 0;
  for (const texto of candidato.principais) melhor = Math.max(melhor, nota(texto, consulta, tokens, 100, 90, 70));
  for (const texto of candidato.sinonimos) melhor = Math.max(melhor, nota(texto, consulta, tokens, 85, 75, 60));
  if (melhor > 0) return melhor;
  // Último recurso: as palavras espalhadas entre o nome, os sinônimos e o grupo ("pagar fatura").
  const todas = [...candidato.principais, ...candidato.sinonimos, ...candidato.contexto].flatMap((texto) => normalizarBusca(texto).split(" "));
  return casamento(tokens, todas) ? 40 : 0;
}

/**
 * A busca do ⌘K: sem acento, por começo de palavra e por sinônimo, só no que a
 * pessoa vê. Ordem: nome exato > começo do nome > sinônimo exato > começo do
 * sinônimo > palavras soltas; no empate vale a ordem do menu, e telas vêm
 * antes das ações. Termo vazio não devolve nada (a casca mostra o menu).
 */
export function buscar(termo: string, pessoa: PessoaNav, limite = 20): ResultadoDaBusca[] {
  const consulta = normalizarBusca(termo);
  if (!consulta) return [];
  const todosTokens = consulta.split(" ");
  const tokens = todosTokens.filter((token) => !PALAVRAS_VAZIAS.has(token));
  const usados = tokens.length ? tokens : todosTokens;

  const candidatos: Candidato[] = [
    ...buscaveisComTexto(pessoa),
    ...acoesRapidas(pessoa).map((acao) => ({
      atalho: { tipo: "acao" as const, id: acao.id, rotulo: acao.rotulo, contexto: "Ação rápida", href: acao.href, icone: acao.icone },
      principais: [acao.rotulo],
      sinonimos: acao.palavras,
      contexto: [],
    })),
  ];

  return candidatos
    .map((candidato, ordem) => ({ candidato, ordem, pontos: pontuar(candidato, consulta, usados) }))
    .filter((achado) => achado.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .slice(0, Math.max(0, limite))
    .map((achado) => ({ ...achado.candidato.atalho, pontos: achado.pontos }));
}

// ---------------------------------------------------------------------------
// Barra de caminho: de que grupo/item/aba é o endereço aberto
// ---------------------------------------------------------------------------

/** Tira ?busca e #âncora e a barra do fim ("/tarefas/" = "/tarefas"). */
export function normalizarRota(pathname: string): string {
  let rota = (pathname || "/").split(/[?#]/)[0].trim();
  if (!rota.startsWith("/")) rota = `/${rota}`;
  while (rota.length > 1 && rota.endsWith("/")) rota = rota.slice(0, -1);
  return rota;
}

function casaPadrao(padrao: string, rota: string): boolean {
  const partesPadrao = padrao.split("/");
  const partesRota = rota.split("/");
  if (partesPadrao.length !== partesRota.length) return false;
  return partesPadrao.every((parte, indice) => (parte.startsWith(":") ? partesRota[indice].length > 0 : parte === partesRota[indice]));
}

/** Acha o destino (ou a porta do hub) de um endereço. Endereço desconhecido → null. */
export function resolverRota(pathname: string): { item: ItemDoMapa; destino: Destino | null } | null {
  const crua = normalizarRota(pathname);
  const rota = REDIRECIONAMENTOS[crua] ?? crua;
  const comItem = (destino: Destino) => ({ item: ITEM_POR_ID.get(destino.item) as ItemDoMapa, destino });

  const exato = DESTINOS.find((destino) => destino.buscavel && (destino.rota === rota || destino.aliases.includes(rota)));
  if (exato) return comItem(exato);

  const porta = ITENS.find((item) => item.ehPorta && item.rota === rota);
  if (porta) return { item: porta, destino: null };

  const detalhe = DESTINOS.find((destino) => !destino.buscavel && casaPadrao(destino.rota, rota));
  if (detalhe) return comItem(detalhe);

  // Subpágina que não está no mapa (ex.: /inteligencia-360/uma-secao-nova): fica com o pai mais longo.
  let pai: Destino | null = null;
  for (const destino of DESTINOS) {
    if (!destino.buscavel || destino.rota === "/") continue;
    if (rota.startsWith(`${destino.rota}/`) && (!pai || destino.rota.length > pai.rota.length)) pai = destino;
  }
  return pai ? comItem(pai) : null;
}

export function grupoDaRota(pathname: string): GrupoId | null {
  return resolverRota(pathname)?.item.grupo ?? null;
}

/** href null = o pedaço vira texto, não link (revisão de 08/10/2026). */
export type Migalha = { rotulo: string; href: string | null };

export type Caminho = {
  /**
   * href null quando a pessoa não vê NENHUM item do grupo (ex.: a limpeza em
   * /meu-perfil, que mora em Ajustes): o link levaria a uma porta trancada.
   */
  grupo: { id: GrupoId; rotulo: string; href: string | null };
  /** href null pelo mesmo motivo: a pessoa abriu pela URL uma tela que não vê. */
  item: { id: string; rotulo: string; href: string | null };
  /** null quando o endereço é a porta de um hub (/financeiro/pagar). */
  destino: Destino | null;
  /** As abas do item (só as que a pessoa vê, quando ela é informada), com a aberta marcada. */
  abas: (AbaNoMenu & { ativa: boolean })[];
  abasComo: "abas" | "seletor";
  /** Grupo › Item, como no desenho aprovado; num detalhe, mais o nome do detalhe. */
  migalhas: Migalha[];
};

/**
 * O caminho do topo da tela. Sem `opcoes.pessoa`, as abas vêm todas e os links
 * são as portas oficiais; com a pessoa, só o que ela vê e os links levam à
 * primeira tela que ela abre.
 */
export function caminhoDaRota(pathname: string, opcoes?: { pessoa: PessoaNav }): Caminho | null {
  const achado = resolverRota(pathname);
  if (!achado) return null;
  const { item, destino } = achado;
  const grupo = GRUPO_POR_ID.get(item.grupo) as GrupoDoMapa;
  const filtrar = opcoes !== undefined;
  const pessoa = opcoes?.pessoa;

  const telas = item.destinos
    .map((id) => DESTINO_POR_ID.get(id) as Destino)
    .filter((tela) => tela.lugar !== "detalhe" && (!filtrar || podeVerDestino(pessoa, tela)));
  const marcada = destino ? (destino.lugar === "detalhe" ? destino.mae : destino.id) : null;
  const abas = telas.map((tela) => ({ ...abaDoMenu(tela), ativa: tela.id === marcada }));

  // Tela trancada aberta pela URL (o Acesso restrito): o item não vira link de volta para ela.
  const hrefItem = filtrar ? (itemVisivel(pessoa, item) ? hrefDoItem(pessoa, item) : null) : item.rota;
  let hrefGrupo: string | null = (ITEM_POR_ID.get(grupo.itens[0]) as ItemDoMapa).rota;
  if (filtrar) {
    const primeiro = grupo.itens.map((id) => ITEM_POR_ID.get(id) as ItemDoMapa).find((candidato) => !candidato.foraDoMenu && itemVisivel(pessoa, candidato));
    // Revisão de 08/10/2026: sem item visível no grupo, o grupo NÃO é link. Antes
    // caía na rota oficial do primeiro item — "Ajustes" levava a limpeza, a
    // recepção, a enfermagem, a nutrição e o marketing (em /meu-perfil e no
    // guia visual) para Colaboradores, que dá "Acesso restrito".
    hrefGrupo = primeiro ? hrefDoItem(pessoa, primeiro) : null;
  }

  const migalhas: Migalha[] = [
    { rotulo: grupo.rotulo, href: hrefGrupo },
    { rotulo: item.rotulo, href: hrefItem },
  ];
  if (destino && destino.lugar === "detalhe" && destino.rotulo !== item.rotulo) migalhas.push({ rotulo: destino.rotulo, href: normalizarRota(pathname) });

  return {
    grupo: { id: grupo.id, rotulo: grupo.rotulo, href: hrefGrupo },
    item: { id: item.id, rotulo: item.rotulo, href: hrefItem },
    destino,
    abas,
    abasComo: item.abasComo,
    migalhas,
  };
}

// ---------------------------------------------------------------------------
// Fixados: cada pessoa prende até 5 atalhos (menu aprovado)
// ---------------------------------------------------------------------------

export const LIMITE_FIXADOS = 5;

/** O mínimo de um Storage (o localStorage serve; os testes passam um falso). */
export type ArmazenamentoSimples = { getItem(chave: string): string | null; setItem(chave: string, valor: string): void };

function armazenamentoPadrao(): ArmazenamentoSimples | null {
  // Aba anônima, dado do site bloqueado ou captura de miniatura: o acesso pode
  // lançar erro. Sem armazenamento, os fixados só não são lembrados.
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function chaveDosFixados(pessoa: PessoaNav): string | null {
  return pessoa?.id ? `bratan:fixados:${pessoa.id}` : null;
}

/** Só ids conhecidos, que dá para fixar e que a pessoa vê; sem repetir; no máximo 5. */
function fixaveis(pessoa: PessoaNav, ids: readonly unknown[]): string[] {
  const saida: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || saida.includes(id)) continue;
    const destino = DESTINO_POR_ID.get(id);
    if (!destino || !destino.buscavel || !podeVerDestino(pessoa, destino)) continue;
    saida.push(id);
    if (saida.length === LIMITE_FIXADOS) break;
  }
  return saida;
}

/**
 * Os fixados da pessoa, na ordem em que ela prendeu. Tela que ela deixou de ver
 * (Acessos mudou) some da lista, mas continua guardada: volta se o acesso voltar.
 */
export function lerFixados(pessoa: PessoaNav, armazenamento: ArmazenamentoSimples | null = armazenamentoPadrao()): Atalho[] {
  const chave = chaveDosFixados(pessoa);
  if (!chave || !armazenamento) return [];
  let guardados: unknown;
  try {
    guardados = JSON.parse(armazenamento.getItem(chave) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(guardados)) return [];
  return fixaveis(pessoa, guardados).map((id) => atalhoDoDestino(DESTINO_POR_ID.get(id) as Destino));
}

/** Grava a lista (já limpa e cortada em 5) e devolve o que ficou gravado. */
export function salvarFixados(pessoa: PessoaNav, ids: readonly string[], armazenamento: ArmazenamentoSimples | null = armazenamentoPadrao()): string[] {
  const limpos = fixaveis(pessoa, ids);
  const chave = chaveDosFixados(pessoa);
  if (chave && armazenamento) {
    try {
      armazenamento.setItem(chave, JSON.stringify(limpos));
    } catch {
      // Armazenamento cheio ou bloqueado: a tela segue, só não lembra.
    }
  }
  return limpos;
}

/** Prende ou solta um destino. Com 5 presos, não troca nenhum sozinho: devolve cheio = true. */
export function alternarFixado(pessoa: PessoaNav, id: string, armazenamento: ArmazenamentoSimples | null = armazenamentoPadrao()): { ids: string[]; cheio: boolean } {
  const atuais = lerFixados(pessoa, armazenamento).map((atalho) => atalho.id);
  if (atuais.includes(id)) return { ids: salvarFixados(pessoa, atuais.filter((atual) => atual !== id), armazenamento), cheio: false };
  if (atuais.length >= LIMITE_FIXADOS) return { ids: atuais, cheio: true };
  return { ids: salvarFixados(pessoa, [...atuais, id], armazenamento), cheio: false };
}

// ---------------------------------------------------------------------------
// Barra do celular: 5 itens, todos com nome (menu aprovado)
// ---------------------------------------------------------------------------

export type ItemDaBarra = {
  id: "inicio" | "buscar" | "novo" | "menu" | GrupoId;
  rotulo: string;
  icone: NomeIcone;
  /** ir = navegar para href; buscar = abre o ⌘K; novo = abre as ações rápidas; menu = abre o menu. */
  acao: "ir" | "buscar" | "novo" | "menu";
  href: string | null;
  contador: Contador | null;
};

// Quem não vê o Financeiro ganha, no lugar dele, o primeiro destes grupos que
// vê. Comercial vem primeiro porque guarda as tarefas do CRM — o atalho que
// todo cargo tinha na barra antiga (Início · Hoje · CRM · Carteira · Docs · Menu).
const ORDEM_DO_QUARTO_ITEM: readonly GrupoId[] = ["financeiro", "comercial", "pacientes", "compras-estoque", "equipe", "resultados"];

/**
 * Para onde o 4º item leva. Revisão de 08/10/2026: com Comercial no lugar do
 * Financeiro, o toque vai a Minhas tarefas (/crm/minhas-tarefas), como o botão
 * "CRM" da barra antiga — e não ao Kanban, que é só o primeiro item do grupo.
 * Quem não vê Minhas tarefas cai na primeira tela do grupo que vê.
 */
function hrefDoQuartoItem(grupo: GrupoNoMenu): string {
  if (grupo.id === "comercial") return grupo.itens.find((item) => item.id === "minhas-tarefas")?.href ?? grupo.href;
  return grupo.href;
}

/**
 * Início · Buscar · Novo · Financeiro · Menu. Sem Financeiro, o 4º item vira o
 * primeiro grupo que a pessoa vê (ORDEM_DO_QUARTO_ITEM). "Novo" só aparece se
 * a pessoa tem alguma ação rápida.
 */
export function itensDaBarraDoCelular(pessoa: PessoaNav): ItemDaBarra[] {
  const menu = itensDoMenu(pessoa);
  const barra: ItemDaBarra[] = [
    { id: "inicio", rotulo: "Início", icone: "House", acao: "ir", href: "/", contador: "decisoes" },
    { id: "buscar", rotulo: "Buscar", icone: "Search", acao: "buscar", href: null, contador: null },
  ];
  if (acoesRapidas(pessoa).length) barra.push({ id: "novo", rotulo: "Novo", icone: "Plus", acao: "novo", href: null, contador: null });
  const quarto = ORDEM_DO_QUARTO_ITEM.map((id) => menu.find((grupo) => grupo.id === id)).find((grupo): grupo is GrupoNoMenu => Boolean(grupo));
  if (quarto) barra.push({ id: quarto.id, rotulo: quarto.rotulo, icone: quarto.icone, acao: "ir", href: hrefDoQuartoItem(quarto), contador: null });
  barra.push({ id: "menu", rotulo: "Menu", icone: "Menu", acao: "menu", href: null, contador: null });
  return barra;
}
