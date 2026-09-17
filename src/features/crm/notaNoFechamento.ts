// A NOTA FISCAL DENTRO DO FECHAMENTO (17/09/2026)
//
// Pedido do Lucas: *"quando a pessoa vai registrar um fechamento lá, na mesma
// tela, vai ser emitida a nota fiscal... para um toque já fazer tudo isso. E aí
// que vai ter opção: se a nota vai ser unificada, que vai ser tudo tratamento,
// ou se vai ser repartida. Vai repartir como? Uma de consulta, quantos reais?
// Uma de bio, quantos reais? Uma de tratamento, quantos reais?"*
//
// POR QUE ISSO É MELHOR DO QUE O QUE EXISTIA. A tela de Impostos & NFs sugeria
// a divisão sozinha — e, quando a comanda não tinha bioimpedância, ela recortava
// R$ 200 da consulta e chamava aquilo de bio, só para pagar 7,93% em vez de
// 13,33%. Enquanto era classificação interna, passava. Virando texto na nota
// ("EXAME DE BIOIMPEDÂNCIA REALIZADO NO DIA..."), seria o app afirmando por
// escrito, em documento fiscal, um exame que não houve. Aqui quem reparte é
// gente, digitando o valor de cada nota: o app não inventa nada.
//
// Os códigos e os textos são os que a clínica já usa — conferidos nas três notas
// de 01/09/2026 (nº 6203, 6204 e 6205) que o Lucas mandou.
import { moneyFin, type FinPaymentMethod } from "@/features/financeiro/financeiroData";

/** A natureza da nota. É ela que decide código e texto — nunca a classe de imposto. */
export type NaturezaDaNota = "CONSULTA" | "BIOIMPEDANCIA" | "TRATAMENTO";

/** Como o paciente quis a nota. Fica gravado: é escolha dele, não do operador. */
export type EscolhaDaNota = "UNIFICADA" | "REPARTIDA" | "SEM_NOTA";

export const escolhaDaNotaLabels: Record<EscolhaDaNota, string> = {
  UNIFICADA: "Uma nota só (tratamento)",
  REPARTIDA: "Notas separadas",
  SEM_NOTA: "Não emitir agora",
};

/**
 * Código do serviço da Prefeitura de São Paulo, por natureza.
 *
 * Conferido nas notas reais: 6205 (consulta) traz 04197; 6204 (bio) e 6203
 * (tratamento) trazem 04030. A unificada É uma nota de tratamento — é
 * exatamente por isso que ela sai mais barata —, então usa 04030.
 *
 * Vai como 5 dígitos, com o zero à esquerda e sem ponto: é o formato próprio de
 * São Paulo, não o item da LC 116.
 */
export const CODIGO_DO_SERVICO: Record<NaturezaDaNota, string> = {
  CONSULTA: "04197", // Clínicas e casas de saúde
  BIOIMPEDANCIA: "04030", // Medicina e biomedicina
  TRATAMENTO: "04030", // Medicina e biomedicina
};

export const naturezaLabels: Record<NaturezaDaNota, string> = {
  CONSULTA: "Consulta",
  BIOIMPEDANCIA: "Bioimpedância",
  TRATAMENTO: "Tratamento",
};

/** ISS de São Paulo para estes serviços: 2% nas três notas reais. */
export const ALIQUOTA_ISS = 0.02;

/**
 * Carga total por natureza, da planilha CONTROLE DE IMPOSTOS (confirmada pelo
 * Lucas em 17/09): consulta 13,33% (ISS 2 + PIS 0,65 + COFINS 3 + IRPJ 4,8 +
 * CSLL 2,88) e procedimento 7,93% (ISS 2 + PIS 0,65 + COFINS 3 + IRPJ 1,2 +
 * CSLL 1,08). Serve para MOSTRAR na tela o que cada escolha custa — o que vai
 * na nota é só o ISS.
 */
export const CARGA_TOTAL: Record<NaturezaDaNota, number> = {
  CONSULTA: 0.1333,
  BIOIMPEDANCIA: 0.0793,
  TRATAMENTO: 0.0793,
};

const MEDICO = "DANIEL BRATAN DE OLIVEIRA";
const MEDICO_PRESCRICAO = "DANIEL CARLOS BRATAN DE OLIVEIRA";
const CRM = "168.649";

/** dd/mm/aaaa a partir de uma data ISO, sem escorregar de dia por fuso. */
export function dataBR(diaISO: string) {
  const [ano, mes, dia] = (diaISO || "").slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : "";
}

/**
 * Como a nota de tratamento descreve o pagamento.
 *
 * O modelo do Lucas termina em "FORAM PAGOS EM CARTÃO DE CRÉDITO EM X VEZES OU
 * PIX" — ou seja, o texto muda com a forma. Quando o fechamento tem mais de uma
 * forma (PIX + cartão é comum), as duas entram, porque a nota tem que descrever
 * o que aconteceu de verdade.
 */
export function comoFoiPago(parcelas: { forma: FinPaymentMethod; parcelas?: number }[]) {
  const pedacos: string[] = [];
  const POR_EXTENSO: Partial<Record<FinPaymentMethod, string>> = {
    PIX: "PIX",
    CARTAO_DEBITO: "CARTÃO DE DÉBITO",
    DINHEIRO: "DINHEIRO",
    TRANSFERENCIA: "TRANSFERÊNCIA",
    CHEQUE: "CHEQUE",
    BOLETO: "BOLETO",
    DEBITO_CONTA: "DÉBITO EM CONTA",
  };
  for (const parcela of parcelas) {
    if (parcela.forma === "CARTAO_CREDITO") {
      const vezes = Math.max(1, Math.round(parcela.parcelas ?? 1));
      pedacos.push(vezes > 1 ? `CARTÃO DE CRÉDITO EM ${vezes} VEZES` : "CARTÃO DE CRÉDITO");
      continue;
    }
    const texto = POR_EXTENSO[parcela.forma];
    if (texto) pedacos.push(texto);
  }
  const unicos = [...new Set(pedacos)];
  if (!unicos.length) return "";
  if (unicos.length === 1) return unicos[0];
  return `${unicos.slice(0, -1).join(", ")} E ${unicos[unicos.length - 1]}`;
}

/**
 * O texto que vai na nota, por natureza — reproduzindo o que a clínica escreve
 * hoje à mão. Foi conferido caractere a caractere nas notas 6203, 6204 e 6205.
 */
export function discriminacao(natureza: NaturezaDaNota, diaISO: string, pagamento: string) {
  const dia = dataBR(diaISO);
  if (natureza === "CONSULTA") {
    return `CONSULTA MÉDICA REALIZADA NO DIA ${dia}, SOLICITADO PELO MÉDICO\n${MEDICO},CRM/SP:${CRM}`;
  }
  if (natureza === "BIOIMPEDANCIA") {
    return `EXAME DE BIOIMPEDÂNCIA REALIZADO NO DIA ${dia}, SOLICITADO PELO MÉDICO ${MEDICO}, CRM/SP: ${CRM}.`;
  }
  // TRATAMENTO — e também a UNIFICADA, que é uma nota de tratamento.
  const comoPagou = pagamento ? `\nOS PROCEDIMENTOS MÉDICOS REFERIDOS FORAM PAGOS EM ${pagamento}.` : "";
  return (
    `REALIZAÇÃO DE PROCEDIMENTOS MÉDICOS PERMITIDOS EM CONSULTÓRIO, PAGOS NO DIA ${dia.replace(/\//g, ".")}.\n` +
    `PROFISSIONAL RESPONSÁVEL PELA PRESCRIÇÃO DR. ${MEDICO_PRESCRICAO} - CRM/SP: ${CRM}.${comoPagou}`
  );
}

/** Uma nota a emitir, já pronta para virar pedido à Focus. */
export type NotaParaEmitir = {
  natureza: NaturezaDaNota;
  valor: number;
  codigoServico: string;
  discriminacao: string;
  /** Carga total estimada — para a tela mostrar, não vai na nota. */
  impostoEstimado: number;
};

export type DivisaoDaNota = { consulta: number; bioimpedancia: number; tratamento: number };

export const divisaoVazia: DivisaoDaNota = { consulta: 0, bioimpedancia: 0, tratamento: 0 };

export type PlanoDeNotas = {
  notas: NotaParaEmitir[];
  /** Soma do que foi repartido. */
  somaDasNotas: number;
  /** Quanto falta (positivo) ou passou (negativo) para fechar com o recebido. */
  diferenca: number;
  /** Carga total somada — é o número que justifica escolher unificada. */
  impostoTotal: number;
  /** Vazio quando dá para emitir; senão, a frase que explica o que impede. */
  impedimento: string;
};

/**
 * Monta as notas de um fechamento.
 *
 * A regra de ouro é a soma: o que for repartido tem que fechar com o valor
 * recebido, ao centavo. Nota a mais ou a menos é imposto errado, e ninguém
 * percebe olhando a tela — por isso o impedimento é explícito e bloqueia.
 */
export function planoDeNotas(entrada: {
  escolha: EscolhaDaNota;
  valorRecebido: number;
  divisao: DivisaoDaNota;
  diaISO: string;
  parcelas: { forma: FinPaymentMethod; parcelas?: number }[];
}): PlanoDeNotas {
  const { escolha, valorRecebido, divisao, diaISO } = entrada;
  const pagamento = comoFoiPago(entrada.parcelas ?? []);
  const centavos = (n: number) => Math.round((n || 0) * 100) / 100;

  const monta = (natureza: NaturezaDaNota, valor: number): NotaParaEmitir => ({
    natureza,
    valor: centavos(valor),
    codigoServico: CODIGO_DO_SERVICO[natureza],
    discriminacao: discriminacao(natureza, diaISO, pagamento),
    impostoEstimado: centavos(valor * CARGA_TOTAL[natureza]),
  });

  if (escolha === "SEM_NOTA") {
    return { notas: [], somaDasNotas: 0, diferenca: 0, impostoTotal: 0, impedimento: "" };
  }

  if (escolha === "UNIFICADA") {
    if (!(valorRecebido > 0)) {
      return { notas: [], somaDasNotas: 0, diferenca: 0, impostoTotal: 0, impedimento: "Informe o valor recebido para emitir a nota." };
    }
    const nota = monta("TRATAMENTO", valorRecebido);
    return { notas: [nota], somaDasNotas: nota.valor, diferenca: 0, impostoTotal: nota.impostoEstimado, impedimento: "" };
  }

  const notas = [
    divisao.consulta > 0 ? monta("CONSULTA", divisao.consulta) : null,
    divisao.bioimpedancia > 0 ? monta("BIOIMPEDANCIA", divisao.bioimpedancia) : null,
    divisao.tratamento > 0 ? monta("TRATAMENTO", divisao.tratamento) : null,
  ].filter((nota): nota is NotaParaEmitir => nota !== null);

  const somaDasNotas = centavos(notas.reduce((soma, nota) => soma + nota.valor, 0));
  const diferenca = centavos(valorRecebido - somaDasNotas);
  const impostoTotal = centavos(notas.reduce((soma, nota) => soma + nota.impostoEstimado, 0));

  let impedimento = "";
  if (!(valorRecebido > 0)) impedimento = "Informe o valor recebido para emitir a nota.";
  else if (!notas.length) impedimento = "Diga quanto vai em cada nota.";
  else if (diferenca > 0) impedimento = `Faltam ${moneyFin(diferenca)} para fechar com o valor recebido.`;
  else if (diferenca < 0) impedimento = `As notas passam ${moneyFin(Math.abs(diferenca))} do valor recebido.`;

  return { notas, somaDasNotas, diferenca, impostoTotal, impedimento };
}

/**
 * Quanto a unificada economiza em relação à divisão digitada.
 *
 * É o número que faz a escolha ser uma escolha — sem ele a pessoa decide no
 * escuro. Zero ou negativo quando não há vantagem (por exemplo, quando tudo já
 * é tratamento).
 */
export function economiaDaUnificada(valorRecebido: number, divisao: DivisaoDaNota) {
  const repartido = divisao.consulta * CARGA_TOTAL.CONSULTA + divisao.bioimpedancia * CARGA_TOTAL.BIOIMPEDANCIA + divisao.tratamento * CARGA_TOTAL.TRATAMENTO;
  const unificado = valorRecebido * CARGA_TOTAL.TRATAMENTO;
  return Math.round((repartido - unificado) * 100) / 100;
}

/** O que ainda falta na ficha para a nota sair identificada. */
export function pendenciasDoTomador(tomador: { nome: string; cpf: string; email: string }) {
  const faltando: string[] = [];
  if (!tomador.nome.trim()) faltando.push("nome");
  if (!tomador.cpf.trim()) faltando.push("CPF");
  if (!tomador.email.trim()) faltando.push("e-mail");
  return faltando;
}
