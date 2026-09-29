// AS DUAS TRAVAS NOVAS DO FECHAMENTO (29/09/2026)
//
// 1. "FECHOU" SEM COMANDA E SEM COBRANÇA. Casos reais de 22 e 23/09: o card
//    virou FECHOU_COMPLETO, a jornada ligou, e nenhuma comanda nem lembrete
//    nasceu — porque "Quanto entrou" ficou vazio (o paciente ia pagar depois).
//    O dinheiro combinado existia só na cabeça de quem fechou. Agora a
//    diferença entre o vendido e o que entrou tem que virar um Lembrete de
//    pagamento, com valor e data, no mesmo clique. É exatamente como a equipe
//    já trabalha ("o resto já está no lembrete") — a trava só tira a
//    possibilidade de esquecer.
//
// 2. DADOS DA NOTA FISCAL. Lucas: "tem que ser tudo emitido certinho... me
//    ajude a travar para não conseguir fazer o fechamento enquanto não
//    preencher todas as informações". Sem CPF a nota não sai (a Edge Function
//    também recusa desde 29/09) e sem e-mail ela não chega ao paciente. Então,
//    quando vai existir nota — agora ou quando o resto for pago —, CPF e e-mail
//    são obrigatórios. "Não emitir agora" com motivo escrito continua sendo a
//    saída registrada para a exceção.
//
// Tudo aqui é puro: a tela, o teste e a revisão falam da mesma regra.
import { cpfValido } from "@/lib/cpf";

export type ResultadoParaTrava = "NAO_FECHOU" | string;

const centavos = (valor: number) => Math.round((valor || 0) * 100) / 100;

/** Quanto falta pagar do que foi vendido (nunca negativo). */
export function aReceberSugerido(vendido: number, recebido: number) {
  return Math.max(0, centavos(vendido - recebido));
}

/** O fechamento deixa dinheiro para depois? (tolerância de R$ 0,50 de arredondamento) */
export function fechamentoTemSaldo(entrada: { resultado: ResultadoParaTrava; vendido: number; recebido: number }) {
  if (entrada.resultado === "NAO_FECHOU") return false;
  return aReceberSugerido(entrada.vendido, entrada.recebido) > 0.5;
}

/**
 * O que impede salvar por causa do saldo a receber. `null` = pode salvar.
 *
 * Regra: recebido + a receber tem que cobrir o vendido. Se o paciente ganhou
 * desconto, o valor vendido é que muda — assim o contrato no CRM e a cobrança
 * falam do mesmo número.
 */
export function travaDoAReceber(entrada: {
  resultado: ResultadoParaTrava;
  vendido: number;
  recebido: number;
  aReceberValor: number;
  aReceberData: string;
  hojeISO: string;
}): string | null {
  if (!fechamentoTemSaldo(entrada)) return null;
  const falta = aReceberSugerido(entrada.vendido, entrada.recebido);
  if (!(entrada.aReceberValor > 0)) {
    return `Faltam ${reais(falta)} para completar o vendido. Diga quanto o paciente vai pagar depois e quando — vira um Lembrete de pagamento.`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.aReceberData || "")) {
    return "Informe a data em que o paciente combinou de pagar o restante.";
  }
  if (entrada.aReceberData < entrada.hojeISO) {
    return "A data do pagamento combinado já passou. Use hoje ou uma data futura.";
  }
  const cobre = centavos(entrada.recebido + entrada.aReceberValor);
  if (cobre + 0.5 < entrada.vendido) {
    return `Recebido + a receber dá ${reais(cobre)}, mas o vendido é ${reais(entrada.vendido)}. Se houve desconto, corrija o valor vendido.`;
  }
  if (cobre > entrada.vendido + 0.5) {
    return `Recebido + a receber (${reais(cobre)}) passa do vendido (${reais(entrada.vendido)}). Confira os valores.`;
  }
  return null;
}

/**
 * Este fechamento vai gerar nota fiscal — agora ou quando o resto for pago?
 *
 * Não geram: sinal de consulta (a nota sai somada na consulta), "não fechou"
 * sem dinheiro, e "Não emitir agora" (exceção com motivo escrito).
 */
export function fechamentoVaiTerNota(entrada: {
  resultado: ResultadoParaTrava;
  recebido: number;
  ehSinal: boolean;
  semNota: boolean;
}) {
  if (entrada.ehSinal || entrada.semNota) return false;
  if (entrada.resultado === "NAO_FECHOU") return entrada.recebido > 0;
  return true;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailConfere(email: string) {
  return EMAIL.test((email || "").trim());
}

/** O que falta na ficha para a nota sair. Vazio = nada falta. */
export function faltaParaANota(entrada: { temCpfNaFicha: boolean; cpfDigitado: string; email: string }) {
  const falta: string[] = [];
  if (!entrada.temCpfNaFicha && !cpfValido(entrada.cpfDigitado)) falta.push("CPF");
  if (!emailConfere(entrada.email)) falta.push("e-mail");
  return falta;
}

/** A frase da trava dos dados da nota. `null` = pode salvar. */
export function travaDosDadosDaNota(entrada: {
  vaiTerNota: boolean;
  temCpfNaFicha: boolean;
  cpfDigitado: string;
  email: string;
}): string | null {
  if (!entrada.vaiTerNota) return null;
  const falta = faltaParaANota(entrada);
  if (!falta.length) return null;
  const cpfDigitadoErrado = !entrada.temCpfNaFicha && entrada.cpfDigitado.trim() && !cpfValido(entrada.cpfDigitado);
  if (cpfDigitadoErrado) return "Esse CPF não confere. Confira os números — sem CPF válido a nota não sai.";
  return `Para a nota fiscal sair falta ${falta.join(" e ")} do paciente. Preencha aqui — ou escolha "Não emitir agora" e escreva o motivo.`;
}

function reais(valor: number) {
  return `R$ ${centavos(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
