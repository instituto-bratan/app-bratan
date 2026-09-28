// BIBLIOTECA INICIAL DA DRA. GÉSSICA (enviada em 28/09/2026).
//
// Texto exatamente como ela mandou, sem ajuste de redação nem de quantidade.
// Entra como conteúdo editável: cada plano recebe uma CÓPIA (plano.ts,
// blocoDaBiblioteca), então editar aqui não muda plano já feito, e editar a
// cópia não muda o modelo.
import type { BlocoBiblioteca, IdentificacaoProfissional } from "./tipos";

const ENVIADO_EM = "2026-09-28T00:00:00.000Z";

export const BLOCOS_INICIAIS: BlocoBiblioteca[] = [
  {
    id: "bib-frutas",
    titulo: "Frutas (Lista de Possibilidades)",
    itens: [
      "Maçã, kiwi, pera, laranja, mexerica, pêssego: 1 unidade.",
      "Mamão: Formosa (1 fatia grande (120g)) ou Papaia (½ unidade (120g)).",
      "Banana: 1 unidade pequena a média (80g).",
      "Manga, pitaya, caqui: 1 unidade pequena ou ½ grande (120g).",
      "Abacaxi: 1 rodela (100g).",
      "Uva: Cerca de 20 unidades (100g).",
      "Melancia: 1 pedaço grande (160g).",
      "Melão: 1 pedaço grande (160g).",
      "Frutas secas pequenas (ex.: uva passa): 1 colher de sopa (20g).",
      "Frutas secas maiores (ex.: tâmaras): 4 unidades (20g).",
      "Abacate: 2 colheres de sopa (80g).",
      "Morango: Pode ser consumido adicionalmente (a gosto).",
    ],
    texto: "",
    versao: 1,
    fonte: "Dra. Géssica Barbara",
    atualizadoEm: ENVIADO_EM,
  },
  {
    id: "bib-legumes",
    titulo: "Legumes e Verduras de Consumo Livre",
    itens: [
      "Verdes: Abobrinha, brócolis, folhas, pepino, pimentão, quiabo, jiló.",
      "Vermelhos e Roxos: Tomate, molho de tomate, pimentão, repolho roxo, beterraba.",
      "Brancos e Neutros: Couve-flor, palmito, cogumelos, rabanete, yakon.",
      "Amarelos e Alaranjados: Abóbora, cenoura, pimentão amarelo.",
      "Não fazem parte dessa lista: Batatas, mandioca, inhame, mandioquinha.",
      "Diferencial: Vegetais orgânicos (recomendado, mas não obrigatório).",
      "Se crus: Sanitizar com hipoclorito ou água sanitária, conforme rótulos.",
    ],
    texto: "",
    versao: 1,
    fonte: "Dra. Géssica Barbara",
    atualizadoEm: ENVIADO_EM,
  },
];

/** "Coloque essa informação de assinatura ao final do documento." Texto, não assinatura digital. */
export const IDENTIFICACAO_PADRAO: IdentificacaoProfissional = {
  linhas: [
    "Dra. Géssica Barbara",
    "Nutricionista e Assistente do Dr. Daniel Bratan",
    "CRN3 63653",
    "@gessicabarbara.nutri",
    "(11) 2092-6388 (WhatsApp)",
  ],
  versao: 1,
};
