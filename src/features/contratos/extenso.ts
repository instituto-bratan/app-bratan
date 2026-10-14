// NÚMEROS POR EXTENSO PARA O CONTRATO (14/10/2026).
//
// O contrato de medicação escreve tudo em maiúsculas e por extenso:
// "R$ 6.102,00 (SEIS MIL CENTO E DOIS REAIS)", "02 (DUAS) SESSÕES",
// "02 de SETEMBRO de 2026". Só importa relativo: os testes carregam direto.

type Genero = "m" | "f";

const UNIDADES_M = ["ZERO", "UM", "DOIS", "TRÊS", "QUATRO", "CINCO", "SEIS", "SETE", "OITO", "NOVE", "DEZ", "ONZE", "DOZE", "TREZE", "QUATORZE", "QUINZE", "DEZESSEIS", "DEZESSETE", "DEZOITO", "DEZENOVE"];
const DEZENAS = ["", "", "VINTE", "TRINTA", "QUARENTA", "CINQUENTA", "SESSENTA", "SETENTA", "OITENTA", "NOVENTA"];
const CENTENAS_M = ["", "CENTO", "DUZENTOS", "TREZENTOS", "QUATROCENTOS", "QUINHENTOS", "SEISCENTOS", "SETECENTOS", "OITOCENTOS", "NOVECENTOS"];

function unidade(n: number, genero: Genero) {
  if (genero === "f" && n === 1) return "UMA";
  if (genero === "f" && n === 2) return "DUAS";
  return UNIDADES_M[n];
}

/** 1 a 999. */
function ate999(n: number, genero: Genero): string {
  if (n === 100) return "CEM";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(genero === "f" && c > 1 ? CENTENAS_M[c].replace(/OS$/, "AS") : CENTENAS_M[c]);
  if (resto > 0) {
    if (resto < 20) partes.push(unidade(resto, genero));
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} E ${unidade(u, genero)}` : DEZENAS[d]);
    }
  }
  return partes.join(" E ");
}

/** Inteiro por extenso, em maiúsculas ("SEIS MIL CENTO E DOIS"). */
export function numeroPorExtenso(n: number, genero: Genero = "m"): string {
  const inteiro = Math.floor(Math.abs(n));
  if (inteiro === 0) return "ZERO";
  const milhoes = Math.floor(inteiro / 1_000_000);
  const milhares = Math.floor((inteiro % 1_000_000) / 1000);
  const resto = inteiro % 1000;
  const grupos: string[] = [];
  if (milhoes) grupos.push(milhoes === 1 ? "UM MILHÃO" : `${ate999(milhoes, "m")} MILHÕES`);
  if (milhares) grupos.push(milhares === 1 ? "MIL" : `${ate999(milhares, genero)} MIL`);
  if (resto) {
    // "MIL E DUZENTOS", "MIL E CINQUENTA", mas "SEIS MIL CENTO E DOIS".
    const usaE = grupos.length > 0 && (resto < 100 || resto % 100 === 0);
    grupos.push(`${usaE ? "E " : ""}${ate999(resto, genero)}`);
  }
  return grupos.join(" ").replace(/ {2,}/g, " ");
}

/** "SEIS MIL CENTO E DOIS REAIS", "OITOCENTOS REAIS E TRINTA E TRÊS CENTAVOS". */
export function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partes: string[] = [];
  if (reais > 0) {
    const exatoMilhao = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(`${numeroPorExtenso(reais)}${exatoMilhao ? " DE" : ""} ${reais === 1 ? "REAL" : "REAIS"}`);
  }
  if (centavos > 0) partes.push(`${numeroPorExtenso(centavos)} ${centavos === 1 ? "CENTAVO" : "CENTAVOS"}`);
  return partes.length ? partes.join(" E ") : "ZERO REAIS";
}

/** "R$ 6.102,00". */
export function moedaDoContrato(valor: number): string {
  const [inteiro, dec] = Math.abs(valor).toFixed(2).split(".");
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

/** "R$ 6.102,00 (SEIS MIL CENTO E DOIS REAIS)". */
export function valorComExtenso(valor: number): string {
  return `${moedaDoContrato(valor)} (${valorPorExtenso(valor)})`;
}

/** "02 (DUAS)" — quantidade com dois dígitos, como o contrato escreve. */
export function quantidadeComExtenso(n: number, genero: Genero = "f"): string {
  return `${String(n).padStart(2, "0")} (${numeroPorExtenso(n, genero)})`;
}

const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

/** "2026-09-02" → "02 de SETEMBRO de 2026". */
export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d} de ${MESES[Number(m) - 1]} de ${a}`;
}

/** "2026-09-02" → "02/09/2026". */
export function dataCurta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}
