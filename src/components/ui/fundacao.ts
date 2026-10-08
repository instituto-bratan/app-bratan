// PORTA ÚNICA DA FUNDAÇÃO VISUAL "PAPEL & MUSGO" (08/10/2026).
//
// A casca e as telas redesenhadas importam daqui:
//   import { Cabecalho, Abas, Selo, Contador } from "@/components/ui/fundacao";
// Guia vivo de tudo isto: /ajustes/guia-visual.
export { Abas, type AbasProps, type ItemAba } from "./abas";
export { BlocoFolha, BlocoSaber, type BlocoFolhaProps, type BlocoProps } from "./blocos";
export { Botao, Giro, LinkSeta, botaoClasses, type BotaoProps, type LinkSetaProps, type TamanhoBotao, type VarianteBotao } from "./botao";
export { BarraDecisao, BotaoDecisao, type BarraDecisaoProps, type BotaoDecisaoProps, type TipoDecisao } from "./botao-decisao";
export { Cabecalho, FraseDoFluxo, type CabecalhoProps, type FraseDoFluxoProps } from "./cabecalho";
export { CampoBusca, type CampoBuscaProps } from "./campo-busca";
export { Contador, type ContadorProps, type TomContador } from "./contador";
export { FioDoMes, type FioDoMesProps } from "./fio-do-mes";
export { MarcasDeEtapa, Selo, type SeloProps } from "./selo";
export {
  ESTADOS_DO_SELO,
  SELOS,
  TOKENS_DE_COR,
  abaAtivaPorRota,
  fioDoMes,
  formatarReais,
  indiceDaTecla,
  marcasDoSelo,
  textoDoContador,
  type EntalheDoFio,
  type EstadoSelo,
  type FioCalculado,
  type MarcaDeEtapa,
} from "./papel-musgo";
