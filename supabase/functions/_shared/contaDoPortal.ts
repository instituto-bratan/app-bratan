// CONTA DO PORTAL DO PACIENTE (01/10/2026) — o que a Apple cobra para publicar o
// Meu Bratan na App Store e que vale igual no app instalado pelo navegador:
//  · Diretriz 5.1.1(v): quem cria conta no app tem que conseguir APAGAR a conta
//    dentro do próprio app. Desativar não basta: some o login e o que o próprio
//    paciente mandou. O que a lei manda a clínica guardar fica, e o app diz isso.
//  · Diretriz 2.1: o revisor precisa de uma conta de demonstração que funcione
//    pela tela de entrar de sempre. Ela abre o portal com DADOS DE EXEMPLO e não
//    encosta em paciente nenhum. O login e a senha moram em segredos do servidor
//    (PORTAL_REVISAO_LOGIN e PORTAL_REVISAO_SENHA), nunca no código.
//
// Módulo puro: a função portal-paciente (Deno) e a tela do portal importam daqui,
// para o texto que o paciente lê e o que o servidor apaga nunca desencontrarem.

/** O que sai quando o paciente apaga a conta. */
export const O_QUE_SE_APAGA = [
  "o seu login, a senha e o Face ID de todos os aparelhos",
  "as fotos de evolução, do arquivo e do banco",
  "as pesagens que você mesmo mandou pelo portal",
  "os avisos no celular",
] as const;

/** O que a clínica guarda porque a lei manda, mesmo com a conta apagada. */
export const O_QUE_FICA = [
  "o prontuário e os exames feitos no Instituto, como a bioimpedância, guardados por 20 anos como exige o Conselho Federal de Medicina",
  "as notas fiscais e os pagamentos, guardados por 5 anos como exige a lei fiscal",
  "o registro de acesso ao portal, guardado por 6 meses como exige o Marco Civil da Internet",
] as const;

function normalizarLoginDeRevisao(valor: string) {
  return valor.trim().toLowerCase();
}

/** Compara sem atalho: o tempo da comparação não entrega quantas letras acertaram. */
function iguais(a: string, b: string) {
  const ta = new TextEncoder().encode(a);
  const tb = new TextEncoder().encode(b);
  let diferenca = ta.length ^ tb.length;
  const tamanho = Math.max(ta.length, tb.length);
  for (let i = 0; i < tamanho; i += 1) diferenca |= (ta[i] ?? 0) ^ (tb[i] ?? 0);
  return diferenca === 0;
}

/**
 * A conta do revisor da Apple. Só vale com os DOIS segredos configurados e com
 * uma senha de pelo menos 12 caracteres: sem configuração, ninguém entra por aqui.
 */
export function ehContaDeRevisao(login: string, senha: string, esperado: { login?: string | null; senha?: string | null }) {
  const loginEsperado = normalizarLoginDeRevisao(String(esperado.login ?? ""));
  const senhaEsperada = String(esperado.senha ?? "");
  if (!loginEsperado || senhaEsperada.length < 12) return false;
  const loginOk = iguais(normalizarLoginDeRevisao(login), loginEsperado);
  const senhaOk = iguais(senha, senhaEsperada);
  return loginOk && senhaOk;
}
