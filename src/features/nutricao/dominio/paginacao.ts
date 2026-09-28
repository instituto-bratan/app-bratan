// PAGINAÇÃO DO PLANO ALIMENTAR EM A4 (28/09/2026).
//
// Pedido da Dra. Géssica: "o bloco da refeição tem que estar sempre junto".
// Nenhum bloco é partido entre páginas, a página não fica com grandes vazios
// sem motivo e a identificação da profissional sai inteira no fim.
//
// A tela mede a altura de cada bloco no DOM, na largura exata da página, e
// esta função só distribui os blocos medidos. O mesmo resultado alimenta a
// prévia na tela e o PDF, para os dois saírem iguais. Aqui não há DOM: é conta.

export type TipoBloco = "cabecalho" | "refeicao" | "lista" | "texto" | "identificacao";

export type BlocoMedido = { id: string; tipo: TipoBloco; altura: number };

export type Pagina = { blocos: string[]; alturaUsada: number; sobra: number };

export type AvisoPaginacao = { blocoId: string; tipo: "maior_que_pagina" | "cabecalho_sozinho" };

export type ResultadoPaginacao = {
  paginas: Pagina[];
  avisos: AvisoPaginacao[];
  /** Maior fração em branco (sobra / alturaUtil) entre as páginas, fora a última; 0 se há uma página só. */
  sobraMaxima: number;
};

/**
 * Folga para o erro de soma do ponto flutuante: 400.1 + 12 + 300.3 dá
 * 712.4000000000001 e o bloco tem que caber em 712.4. É muito menor que um
 * pixel, então nunca deixa um bloco transbordar de verdade.
 */
const FOLGA = 1e-6;

/**
 * Distribui os blocos em páginas, na ordem, enchendo cada página até o próximo
 * bloco não caber (guloso). O espaço entre blocos só entra entre dois blocos da
 * mesma página. Bloco mais alto que a página vai sozinho numa página própria.
 */
export function paginar(blocos: BlocoMedido[], alturaUtil: number, espacoEntreBlocos: number): ResultadoPaginacao {
  const paginas: Pagina[] = [];
  const avisos: AvisoPaginacao[] = [];
  let atual: BlocoMedido[] = [];
  let alturaAtual = 0;

  const fecharPagina = (porqueOProximoNaoCoube: boolean) => {
    if (atual.length === 0) return;
    if (porqueOProximoNaoCoube && atual.length === 1 && atual[0].tipo === "cabecalho") {
      avisos.push({ blocoId: atual[0].id, tipo: "cabecalho_sozinho" });
    }
    paginas.push({
      blocos: atual.map((b) => b.id),
      alturaUsada: alturaAtual,
      sobra: Math.max(0, alturaUtil - alturaAtual),
    });
    atual = [];
    alturaAtual = 0;
  };

  for (const bloco of blocos) {
    if (bloco.altura > alturaUtil + FOLGA) {
      fecharPagina(true);
      paginas.push({ blocos: [bloco.id], alturaUsada: bloco.altura, sobra: 0 });
      avisos.push({ blocoId: bloco.id, tipo: "maior_que_pagina" });
      continue;
    }
    const alturaComEste = atual.length === 0 ? bloco.altura : alturaAtual + espacoEntreBlocos + bloco.altura;
    if (alturaComEste > alturaUtil + FOLGA) {
      fecharPagina(true);
      atual = [bloco];
      alturaAtual = bloco.altura;
    } else {
      atual.push(bloco);
      alturaAtual = alturaComEste;
    }
  }
  fecharPagina(false);

  if (paginas.length === 0) paginas.push({ blocos: [], alturaUsada: 0, sobra: alturaUtil });

  let sobraMaxima = 0;
  if (alturaUtil > 0) {
    for (let i = 0; i < paginas.length - 1; i += 1) {
      sobraMaxima = Math.max(sobraMaxima, paginas[i].sobra / alturaUtil);
    }
  }

  return { paginas, avisos, sobraMaxima };
}

export type Densidade = "normal" | "compacta";

/**
 * Pagina cada opção (os mesmos blocos medidos em cada densidade) e fica com a
 * de menos páginas. No empate vale a normal, que é mais fácil de ler; sem a
 * normal entre as empatadas, a primeira delas.
 */
export function escolherDensidade(
  opcoes: { densidade: Densidade; blocos: BlocoMedido[] }[],
  alturaUtil: number,
  espacoEntreBlocos: number,
): { densidade: Densidade; resultado: ResultadoPaginacao } {
  if (opcoes.length === 0) throw new Error("escolherDensidade precisa de pelo menos uma opção de densidade");
  const paginadas = opcoes.map((opcao) => ({
    densidade: opcao.densidade,
    resultado: paginar(opcao.blocos, alturaUtil, espacoEntreBlocos),
  }));
  const menosPaginas = Math.min(...paginadas.map((p) => p.resultado.paginas.length));
  const empatadas = paginadas.filter((p) => p.resultado.paginas.length === menosPaginas);
  return empatadas.find((p) => p.densidade === "normal") ?? empatadas[0];
}
