// CPF — validação, formatação e máscara (17/09/2026).
//
// Nasceu para a emissão automática da nota fiscal: a Focus exige CPF ou CNPJ do
// tomador, e sem o CPF o paciente perde o bilhete do sorteio da Nota do Milhão.
// Decisão do Lucas: guardar o CPF na ficha.
//
// Por isso este módulo existe separado e é puro: CPF errado não vira nota
// rejeitada depois, vira erro na hora de digitar. E a máscara é a forma padrão
// de mostrar o número na tela — o completo só aparece para quem precisa dele.

/** Só os dígitos, que é como o CPF viaja para a prefeitura. */
export function cpfDigitos(bruto: string) {
  return (bruto ?? "").replace(/\D/g, "").slice(0, 11);
}

/**
 * Confere os dois dígitos verificadores.
 *
 * Também recusa as sequências repetidas (111.111.111-11 e as outras dez), que
 * passam na conta dos dígitos mas não são CPF de ninguém — e são justamente o
 * que alguém digita para "preencher o campo".
 */
export function cpfValido(bruto: string) {
  // Conta os dígitos ANTES de cortar: quem digitou 12 números errou, e cortar em
  // silêncio aceitaria um CPF que a pessoa não quis digitar.
  if ((bruto ?? "").replace(/\D/g, "").length !== 11) return false;
  const d = cpfDigitos(bruto);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (const posicao of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < posicao; i += 1) soma += Number(d[i]) * (posicao + 1 - i);
    const resto = (soma * 10) % 11;
    const digito = resto === 10 ? 0 : resto;
    if (digito !== Number(d[posicao])) return false;
  }
  return true;
}

/** 123.456.789-09 — como a pessoa lê e confere. */
export function cpfFormatado(bruto: string) {
  const d = cpfDigitos(bruto);
  if (d.length !== 11) return bruto ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * 123.***.***-09 — o padrão para mostrar na tela.
 *
 * Deixa à mostra o começo e o fim, que é o bastante para alguém conferir que a
 * ficha é da pessoa certa, sem exibir o documento inteiro para quem passa perto
 * do balcão.
 */
export function cpfMascarado(bruto: string) {
  const d = cpfDigitos(bruto);
  if (d.length !== 11) return "";
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

/** Vai formatando enquanto a pessoa digita, sem atrapalhar o apagar. */
export function cpfEnquantoDigita(bruto: string) {
  const d = cpfDigitos(bruto);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
