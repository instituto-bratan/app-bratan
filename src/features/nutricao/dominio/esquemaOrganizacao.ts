// FORMATO FECHADO DA RESPOSTA DA IA AO ORGANIZAR UMA CONSULTA (28/09/2026).
//
// A estação local manda este JSON Schema para a API (saída estruturada) e o
// navegador confere a resposta com `extracao.ts`. Regra central: todo valor
// traz o trecho da transcrição que o sustenta; valor sem trecho é descartado.
// Prescrição nunca vem daqui: a IA só diz como a pessoa relatou o uso.
//
// Sem imports de propósito (a estação, em Node, lê este arquivo direto).

export const CAMPOS_ORGANIZAVEIS = [
  "bio",
  "treino",
  "sono",
  "intestino",
  "hidratacao",
  "cafe",
  "alcool",
  "refrigerante",
  "suco",
  "disposicao",
  "ansiedade",
  "melhorou",
  "dificuldade",
  "finsDeSemana",
] as const;

export type EvidenciaIA = { segmento: number; trecho: string; quem: "pessoa" | "profissional" | "incerto" };

export type RespostaOrganizacao = {
  campos: {
    campo: (typeof CAMPOS_ORGANIZAVEIS)[number];
    texto: string;
    evidencias: EvidenciaIA[];
    incerto: boolean;
    motivoIncerteza: string;
  }[];
  bio: { pesoKg: number | null; pgc: number | null; visceral: number | null; evidencias: EvidenciaIA[] };
  suplementos: {
    nome: string;
    itemId: string | null;
    usoRelatado: string;
    adesao: "ok" | "divergente" | "nao_usa" | "nao_informado";
    orientacao: string;
    evidencias: EvidenciaIA[];
    incerto: boolean;
  }[];
  conduta: { texto: string; evidencias: EvidenciaIA[] } | null;
  acordosPlano: { refeicao: string; acordo: string; evidencias: EvidenciaIA[] }[];
  naoClassificados: { texto: string; evidencias: EvidenciaIA[] }[];
};

const evidencia = {
  type: "object",
  additionalProperties: false,
  required: ["segmento", "trecho", "quem"],
  properties: {
    segmento: { type: "integer", description: "Índice do segmento da transcrição (campo i)." },
    trecho: { type: "string", description: "Cópia literal de parte do texto desse segmento." },
    quem: { type: "string", enum: ["pessoa", "profissional", "incerto"] },
  },
} as const;

const evidencias = { type: "array", items: evidencia } as const;
const numeroOuNulo = { anyOf: [{ type: "number" }, { type: "null" }] } as const;

export const ESQUEMA_ORGANIZACAO = {
  type: "object",
  additionalProperties: false,
  required: ["campos", "bio", "suplementos", "conduta", "acordosPlano", "naoClassificados"],
  properties: {
    campos: {
      type: "array",
      description: "Só os temas que foram falados na consulta. Tema não falado fica de fora.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["campo", "texto", "evidencias", "incerto", "motivoIncerteza"],
        properties: {
          campo: { type: "string", enum: [...CAMPOS_ORGANIZAVEIS] },
          texto: { type: "string", description: "Uma linha concisa, sem o rótulo do tema, sem omitir nada do que foi dito." },
          evidencias,
          incerto: { type: "boolean" },
          motivoIncerteza: { type: "string", description: "Vazio quando não há incerteza." },
        },
      },
    },
    bio: {
      type: "object",
      additionalProperties: false,
      required: ["pesoKg", "pgc", "visceral", "evidencias"],
      properties: { pesoKg: numeroOuNulo, pgc: numeroOuNulo, visceral: numeroOuNulo, evidencias },
    },
    suplementos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "itemId", "usoRelatado", "adesao", "orientacao", "evidencias", "incerto"],
        properties: {
          nome: { type: "string" },
          itemId: { anyOf: [{ type: "string" }, { type: "null" }], description: "Id do item da lista registrada, quando for um deles." },
          usoRelatado: { type: "string", description: "Como a pessoa disse que está usando." },
          adesao: { type: "string", enum: ["ok", "divergente", "nao_usa", "nao_informado"] },
          orientacao: { type: "string", description: "Orientação dada pela profissional na consulta. Vazio se não houve." },
          evidencias,
          incerto: { type: "boolean" },
        },
      },
    },
    conduta: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["texto", "evidencias"],
          properties: { texto: { type: "string" }, evidencias },
        },
      ],
    },
    acordosPlano: {
      type: "array",
      description: "Combinados sobre o que vai no plano, por refeição. Sem quantidades que não foram ditas.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["refeicao", "acordo", "evidencias"],
        properties: { refeicao: { type: "string" }, acordo: { type: "string" }, evidencias },
      },
    },
    naoClassificados: {
      type: "array",
      description: "Informação clínica relevante dita na consulta que não cabe em nenhum tema.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["texto", "evidencias"],
        properties: { texto: { type: "string" }, evidencias },
      },
    },
  },
} as const;
