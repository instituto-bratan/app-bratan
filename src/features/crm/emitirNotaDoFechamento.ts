// EMITIR A NOTA NO FECHAMENTO (21/09/2026)
//
// Pedido do Lucas: *"agora faz o botão de emitir na tela do fechamento"* — e,
// lá em 17/09, *"para um toque já fazer tudo isso"*.
//
// O plano de notas pode ter TRÊS notas (consulta, bioimpedância e tratamento),
// e a Focus emite uma por chamada. Este módulo é quem sabe disso: recebe o
// plano pronto e devolve o que aconteceu com cada nota, em ordem.
//
// TRÊS COISAS QUE ELE RESOLVE E QUE A TELA NÃO DEVERIA SABER:
//
// 1. A COMANDA PRECISA EXISTIR NO BANCO. A Edge Function procura a comanda por
//    `client_ref` para pegar paciente, data e itens. O fechamento grava a
//    comanda de forma assíncrona, então emitir no mesmo instante às vezes bate
//    numa comanda que ainda não chegou. Por isso o emissor ESPERA a gravação
//    antes de mandar a primeira nota — e não fica tentando às cegas.
//
// 2. O TEXTO DA NOTA É O DA CASA. A discriminação vem montada da tela
//    (notaNoFechamento.ts), conferida caractere a caractere nas notas 6203,
//    6204 e 6205. Antes a função escrevia uma frase genérica própria.
//
// 3. UMA NOTA QUE FALHA NÃO DERRUBA AS OUTRAS. Se a de consulta sai e a de
//    tratamento é recusada, quem fechou precisa saber exatamente isso — e não
//    "deu erro". Cada nota volta com o seu resultado.
import type { EscolhaDaNota, NaturezaDaNota, NotaParaEmitir } from "./notaNoFechamento";

/** O tipo que a Edge Function e a tabela `nfse_emissao` entendem. */
export type TipoDaNotaFiscal = "CONSULTA" | "BIOIMPEDANCIA" | "TRATAMENTO" | "UNIFICADA";

/**
 * A unificada é uma nota de TRATAMENTO no imposto, mas registrar "TRATAMENTO"
 * apagaria a informação de que o paciente escolheu juntar tudo. O banco aceita
 * os quatro valores, então o registro fica fiel à escolha.
 */
export function tipoDaNota(escolha: EscolhaDaNota, natureza: NaturezaDaNota): TipoDaNotaFiscal {
  return escolha === "UNIFICADA" ? "UNIFICADA" : natureza;
}

export type ResultadoDeUmaNota = {
  /** O número da prefeitura, quando ela respondeu a tempo. */
  numero: string;
  /** A nota já foi para o e-mail do paciente. */
  emailEnviado: boolean;
  tipo: TipoDaNotaFiscal;
  valor: number;
  /** true quando a Focus aceitou o pedido (a prefeitura ainda pode recusar depois). */
  aceita: boolean;
  /** Já existia nota deste tipo nesta comanda — não é erro, é proteção. */
  jaExistia: boolean;
  ref: string;
  status: string;
  erro: string;
};

export type ResultadoDaEmissao = {
  notas: ResultadoDeUmaNota[];
  /** A frase para mostrar a quem fechou. Sempre preenchida. */
  recado: string;
  /** true quando toda nota do plano foi aceita. */
  tudoCerto: boolean;
};

type Resposta = {
  ok?: boolean;
  ref?: string;
  status?: string;
  error?: string;
  jaEmitida?: boolean;
  dados?: { numero?: string; status?: string };
  /** 22/09/2026: a função espera a prefeitura alguns segundos e já manda o e-mail. */
  numero?: string | null;
  emailEnviado?: boolean;
};

/** O que a tela precisa passar. Nada aqui vem de estado do React. */
export type PedidoDeEmissao = {
  saleRef: string;
  escolha: EscolhaDaNota;
  notas: NotaParaEmitir[];
  pacienteNome: string;
  cpf: string;
  /** E-mail do paciente: é para onde a nota vai (22/09/2026). Vazio = a função tenta a ficha. */
  email?: string;
  solicitadoPor: string | null;
  /** Resolve quando a comanda terminou de gravar no servidor. */
  comandaGravada: Promise<boolean>;
  invocar: (slug: string, body: Record<string, unknown>) => Promise<Resposta>;
};

function so(texto: unknown) {
  return String(texto ?? "").trim();
}

/**
 * Emite, em ordem, todas as notas do plano.
 *
 * Em ordem de propósito: quando a consulta e o tratamento saem da mesma
 * comanda, a sequência das notas na prefeitura acompanha a sequência do
 * atendimento — e quem for conferir depois lê a mesma história.
 */
export async function emitirNotasDoFechamento(pedido: PedidoDeEmissao): Promise<ResultadoDaEmissao> {
  if (!pedido.notas.length) {
    return { notas: [], recado: "", tudoCerto: true };
  }
  // A comanda é a chave do pedido: sem ela gravada, a Focus devolve "comanda
  // não encontrada" e a pessoa acha que a nota falhou quando só chegou cedo.
  const gravou = await pedido.comandaGravada.catch(() => false);
  if (!gravou) {
    return {
      notas: [],
      tudoCerto: false,
      recado: "A comanda não terminou de gravar, então não pedi a nota. Emita pela aba Impostos & NF quando ela aparecer.",
    };
  }

  const resultados: ResultadoDeUmaNota[] = [];
  for (const nota of pedido.notas) {
    const tipo = tipoDaNota(pedido.escolha, nota.natureza);
    try {
      const resposta = await pedido.invocar("focus-nfse", {
        acao: "emitir",
        saleRef: pedido.saleRef,
        tipo,
        valor: nota.valor,
        discriminacao: nota.discriminacao,
        tomador: {
          nome: pedido.pacienteNome,
          ...(pedido.cpf.trim() ? { cpf: pedido.cpf.trim() } : {}),
          ...((pedido.email ?? "").trim() ? { email: (pedido.email ?? "").trim() } : {}),
        },
        solicitadoPor: pedido.solicitadoPor,
      });
      resultados.push({
        tipo,
        valor: nota.valor,
        aceita: resposta.ok === true,
        jaExistia: resposta.jaEmitida === true,
        ref: so(resposta.ref),
        status: so(resposta.dados?.status ?? resposta.status).toUpperCase(),
        numero: so(resposta.numero ?? resposta.dados?.numero),
        emailEnviado: resposta.emailEnviado === true,
        erro: resposta.ok === true ? "" : so(resposta.error) || `a Focus recusou (${so(resposta.status) || "sem detalhe"})`,
      });
    } catch (falha) {
      // Rede caindo no meio não pode virar silêncio: a comanda já está salva e
      // alguém precisa emitir esta nota depois.
      resultados.push({
        tipo,
        valor: nota.valor,
        aceita: false,
        jaExistia: false,
        ref: "",
        status: "ERRO",
        numero: "",
        emailEnviado: false,
        erro: (falha as Error)?.message ?? "não consegui falar com a prefeitura",
      });
    }
  }

  return { notas: resultados, recado: recadoDaEmissao(resultados), tudoCerto: resultados.every((r) => r.aceita) };
}

const NOME_DO_TIPO: Record<TipoDaNotaFiscal, string> = {
  CONSULTA: "consulta",
  BIOIMPEDANCIA: "bioimpedância",
  TRATAMENTO: "tratamento",
  UNIFICADA: "unificada",
};

/**
 * A frase que a pessoa lê depois de fechar.
 *
 * Ela diz o que foi pedido e o que não foi — nunca "erro ao emitir". Quem está
 * no balcão precisa saber se ainda tem trabalho pela frente, e qual.
 */
export function recadoDaEmissao(notas: ResultadoDeUmaNota[]): string {
  if (!notas.length) return "";
  const aceitas = notas.filter((nota) => nota.aceita && !nota.jaExistia);
  const repetidas = notas.filter((nota) => nota.jaExistia);
  const falhas = notas.filter((nota) => !nota.aceita);
  const partes: string[] = [];

  const autorizadas = aceitas.filter((nota) => nota.numero);
  if (aceitas.length) {
    const quais = aceitas.map((nota) => NOME_DO_TIPO[nota.tipo]).join(" e ");
    if (autorizadas.length === aceitas.length) {
      // A prefeitura respondeu a tempo: diz o número, que é o que a pessoa quer ler.
      const numeros = autorizadas.map((nota) => `nº ${nota.numero}`).join(" e ");
      partes.push(aceitas.length === 1 ? `Nota de ${quais} autorizada, ${numeros}.` : `${aceitas.length} notas autorizadas (${quais}): ${numeros}.`);
    } else {
      partes.push(
        aceitas.length === 1
          ? `Nota de ${quais} pedida à prefeitura.`
          : `${aceitas.length} notas pedidas à prefeitura (${quais}).`,
      );
    }
    const porEmail = aceitas.filter((nota) => nota.emailEnviado).length;
    if (porEmail) partes.push(porEmail === aceitas.length ? "Enviada por e-mail ao paciente." : `${porEmail} de ${aceitas.length} enviadas por e-mail ao paciente.`);
  }
  if (repetidas.length) {
    partes.push(`${repetidas.length === 1 ? "Uma nota já existia" : `${repetidas.length} notas já existiam`} nesta comanda e não foram pedidas de novo.`);
  }
  if (falhas.length) {
    const detalhe = falhas.map((nota) => `${NOME_DO_TIPO[nota.tipo]}: ${nota.erro}`).join(" · ");
    partes.push(`Ficou faltando — ${detalhe}. Emita pela aba Impostos & NF.`);
  }
  if (aceitas.length && !falhas.length && autorizadas.length < aceitas.length) {
    partes.push("O número sai em alguns segundos; consulte em Impostos & NF.");
  }
  return partes.join(" ");
}
