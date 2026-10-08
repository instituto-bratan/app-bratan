// ---------------------------------------------------------------------------
// CASCA NOVA — as regras sem React (08/10/2026, redesenho "Papel & Musgo").
//
// O que a casca mostra em cada endereço sai do mapa (src/lib/navegacao.ts); aqui
// ficam só as regras pequenas da própria casca, puras, para os testes de node:
// o título do topo do celular, se a tela ganha a barra de abas, a data em
// itálico do topo e o rótulo dos números para o leitor de tela.
// ---------------------------------------------------------------------------
import type { Caminho, Contador } from "@/lib/navegacao";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "quinta, 8 de outubro" — a data do topo (Fraunces itálico), igual à imagem 03. */
export function dataPorExtenso(data: Date): string {
  return `${DIAS[data.getDay()]}, ${data.getDate()} de ${MESES[data.getMonth()]}`;
}

/** "Lucas Daniel" → "LD"; "Recepção Bratan" → "RB"; um nome só → as duas primeiras letras. */
export function iniciais(nome: string | null | undefined): string {
  const partes = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter((parte) => parte && !/^(de|da|do|das|dos|e)$/i.test(parte));
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

/** A aba aberta do caminho (null quando o endereço é a porta de um hub). */
export function abaAtiva(caminho: Caminho | null) {
  return caminho?.abas.find((aba) => aba.ativa) ?? null;
}

/**
 * A casca desenha a barra de abas do item quando ele tem MAIS de uma aba que a
 * pessoa vê e as abas são "abas" (o 360 usa um seletor no caminho). Com uma
 * aba só, não tem barra — a tela é o item.
 */
export function mostraBarraDeAbas(caminho: Caminho | null): boolean {
  return Boolean(caminho && caminho.abasComo === "abas" && caminho.abas.length > 1);
}

/** O 360 troca de seção pelo seletor no fim do caminho (menu aprovado: "as 9 seções num seletor"). */
export function mostraSeletorNoCaminho(caminho: Caminho | null): boolean {
  return Boolean(caminho && caminho.abasComo === "seletor" && caminho.abas.length > 1);
}

/**
 * A seção aberta do item, quando ela não aparece em outro lugar: o nome do
 * detalhe (Ficha do paciente) ou a seção do 360 (que troca pelo seletor).
 */
function pedacoDaSecao(caminho: Caminho): string | null {
  const destino = caminho.destino;
  if (destino && destino.lugar === "detalhe" && destino.rotulo !== caminho.item.rotulo) return destino.rotulo;
  const aba = abaAtiva(caminho);
  if (aba && caminho.abas.length > 1 && aba.rotulo !== caminho.item.rotulo) return aba.rotulo;
  return null;
}

/**
 * O caminho do topo: Grupo › Item, como no desenho aprovado (imagem 03:
 * "Financeiro › Pagar" com a aba Contas aberta). Revisão de 08/10/2026: a aba
 * deixou de virar 3º pedaço onde há barra de abas — ela já aparece logo abaixo,
 * e o pedaço a mais só repetia e gastava a largura que faltava entre 768 e
 * 1280 px. O 3º pedaço fica onde não há barra: num detalhe (o nome do detalhe)
 * e no 360 (a seção, que o topo troca pelo seletor). Pedaço sem href é texto;
 * o último é onde a pessoa está (aria-current).
 */
export function pedacosDoCaminho(caminho: Caminho | null): { rotulo: string; href: string | null }[] {
  if (!caminho) return [];
  const pedacos: { rotulo: string; href: string | null }[] = [
    { rotulo: caminho.grupo.rotulo, href: caminho.grupo.href },
    { rotulo: caminho.item.rotulo, href: caminho.item.href },
  ];
  const destino = caminho.destino;
  const ehDetalhe = Boolean(destino && destino.lugar === "detalhe");
  const secao = ehDetalhe || mostraSeletorNoCaminho(caminho) ? pedacoDaSecao(caminho) : null;
  if (secao) pedacos.push({ rotulo: secao, href: null });
  pedacos[pedacos.length - 1] = { ...pedacos[pedacos.length - 1], href: null };
  return pedacos;
}

/**
 * Quantas peças do caminho cabem no topo (revisão de 08/10/2026). Entre 768 e
 * 1280 px as palavras se sobrepunham; agora a casca MEDE a largura natural de
 * cada peça e tira primeiro o que menos importa:
 *   0 = todas (Grupo › Item › Seção);
 *   1 = sem o grupo (o menu já mostra o grupo aberto como folha);
 *   2 = só a última (o lugar atual, ou o seletor do 360).
 * `larguras` é a largura natural de cada peça, já com a seta das que não são a
 * primeira (seta de 14 px + 8 de vão = `seta`); entre as peças vai `vao`.
 */
export function nivelDoCaminho(larguras: readonly number[], disponivel: number, medidas: { vao?: number; seta?: number } = {}): 0 | 1 | 2 {
  const vao = medidas.vao ?? 8;
  const seta = medidas.seta ?? 22;
  const soma = (lista: readonly number[]) => lista.reduce((total, largura) => total + largura, 0) + vao * Math.max(0, lista.length - 1);
  if (larguras.length <= 1 || soma(larguras) <= disponivel) return 0;
  // Sem o grupo, a peça que vira a primeira perde a seta.
  if (larguras.length === 2 || soma(larguras.slice(1)) - seta <= disponivel) return 1;
  return 2;
}

/**
 * O nome da tela no topo do celular (imagem 05: "Para decidir"). No celular não
 * há caminho, então o título é o mais exato: o detalhe ou a aba aberta
 * ("Fatura do cartão"); sem eles, o item.
 */
export function tituloDaTela(caminho: Caminho | null): string {
  if (!caminho) return "Instituto Bratan";
  return pedacoDaSecao(caminho) ?? caminho.item.rotulo;
}

/** O que o número quer dizer, para o leitor de tela. */
export function rotuloDoContador(contador: Contador, valor: number): string {
  if (contador === "decisoes") return valor === 1 ? "1 decisão pendente" : `${valor} decisões pendentes`;
  if (contador === "pedidos-para-aprovar") return valor === 1 ? "1 pedido espera aprovação" : `${valor} pedidos esperam aprovação`;
  return valor === 1 ? "1 aviso" : `${valor} avisos`;
}
