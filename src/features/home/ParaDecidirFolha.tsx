// PARA DECIDIR — a folha do Início (redesenho "Papel & Musgo", etapa 2, 08/10/2026).
//
// Imagem 01 aprovada: uma folha só, em grupos — Pedidos de compra (Aprovar, e
// "Aprovar os N" sem teto de valor), Pagar hoje (Paguei) e Conferir (o
// fechamento de ontem). As contas acima do limite, quando a aprovação está
// ligada, entram num grupo próprio que leva a Contas a pagar. No pé, o que é
// AVISO e não decisão: as notas fiscais esperando o CPF (elas não entram na
// conta das decisões; o lugar delas é Avisos).
//
// Os números saem de montarParaDecidir (paraDecidir.ts), a MESMA conta do
// contador do Início na casca.
import { Link } from "react-router-dom";
import { Bell, Check, ChevronRight, Undo2 } from "lucide-react";
import { BlocoFolha } from "@/components/ui/blocos";
import { Botao, LinkSeta } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { formatarReais } from "@/components/ui/papel-musgo";
import { nomeDoSetor, numeroDoPedido, type PedidoCompra } from "@/features/compras/comprasData";
import { linkDoPedido } from "@/features/compras/estoquePedidos";
import type { ItemFila } from "@/features/financeiro/filaFinanceira";
import { CabecaDoGrupo, EtiquetaUrgente, LinhaDeDecisao, ListaDeDecisoes, RelogioDoPrazo, Sep } from "./pecasDoInicio";
import { loteDoInicio, prazoDoPedido, quandoFoiOFechamento, type ParaDecidir } from "./paraDecidir";

const diaCurto = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O botão de ir ao detalhe (a seta no fim da linha). */
function Ir({ to, rotulo }: { to: string; rotulo: string }) {
  return (
    <Link
      to={to}
      aria-label={rotulo}
      className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export type ParaDecidirFolhaProps = {
  pd: ParaDecidir;
  hoje: string;
  /** Ainda buscando pedidos, contas ou o fechamento. */
  carregando: boolean;
  /** Pedidos na janela do "Desfazer". */
  aprovando: ReadonlySet<string>;
  onAprovar: (pedidos: PedidoCompra[]) => void;
  onDesfazer: (ids: string[]) => void;
  /** Contas gravando a baixa agora. */
  pagando: ReadonlySet<string>;
  onPagar: (item: ItemFila) => void;
  /** O pé "Em Avisos: … esperam o CPF do paciente." (null = não mostra). */
  avisoDasNotas: { destaque: string; resto: string; href: string } | null;
};

export function ParaDecidirFolha({ pd, hoje, carregando, aprovando, onAprovar, onDesfazer, pagando, onPagar, avisoDasNotas }: ParaDecidirFolhaProps) {
  const lote = loteDoInicio(pd.pedidos, aprovando);
  const grupos: ("pedidos" | "contas" | "aprovar" | "fechamento")[] = [];
  if (pd.pedidos.length) grupos.push("pedidos");
  if (pd.contas.length) grupos.push("contas");
  if (pd.contasParaAprovar.length) grupos.push("aprovar");
  if (pd.fechamento) grupos.push("fechamento");
  const seguinte = (grupo: (typeof grupos)[number]) => grupos.indexOf(grupo) > 0;

  return (
    <BlocoFolha as="section" aria-label="Para decidir" className="flex flex-col overflow-hidden">
      {grupos.length ? (
        <ListaDeDecisoes>
          {/* ---------------- Pedidos de compra: urgente e mais antigo primeiro ---------------- */}
          {pd.pedidos.length ? (
            <>
              <CabecaDoGrupo
                titulo="Pedidos de compra"
                soma={`${plural(pd.pedidos.length, "pedido", "pedidos")} · ${formatarReais(pd.valorPedidos)}`}
                direita={
                  lote.pedidos.length > 1 ? (
                    <Botao
                      variante="fantasma"
                      tamanho="pq"
                      icone={<Check className="h-4 w-4" aria-hidden="true" />}
                      aria-label={`Aprovar os ${lote.pedidos.length} pedidos de uma vez, somando ${formatarReais(lote.valor)}`}
                      onClick={() => onAprovar(lote.pedidos)}
                    >
                      Aprovar os {lote.pedidos.length}
                    </Botao>
                  ) : null
                }
              />
              {pd.pedidos.map((pedido) => {
                const prazo = prazoDoPedido(pedido, hoje);
                const naJanela = aprovando.has(pedido.id);
                const rotulo = `o pedido ${numeroDoPedido(pedido.numero)}`;
                return (
                  <LinhaDeDecisao
                    key={pedido.id}
                    apagada={naJanela}
                    acoesNoCelular={false}
                    titulo={
                      <>
                        {pedido.urgencia === "URGENTE" ? <EtiquetaUrgente /> : null}
                        <Link to={linkDoPedido(pedido.id)} className="rounded-sm underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco">
                          {pedido.titulo || `Pedido ${numeroDoPedido(pedido.numero)}`}
                        </Link>
                      </>
                    }
                    meta={
                      naJanela ? (
                        <Selo estado="aprovado">Aprovado · grava em instantes</Selo>
                      ) : (
                        <>
                          <span>{nomeDoSetor(pedido.setor)}</span>
                          {pedido.solicitanteNome ? (
                            <>
                              <Sep />
                              <span>{pedido.solicitanteNome}</span>
                            </>
                          ) : null}
                          {/* O prazo ganha linha própria: nunca sobra um "·" pendurado no fim da linha. */}
                          <span className="basis-full">
                            <RelogioDoPrazo texto={prazo.texto} gasto={prazo.gasto} vencido={prazo.vencido} />
                          </span>
                        </>
                      )
                    }
                    valor={pedido.valorEstimado > 0 ? formatarReais(pedido.valorEstimado) : <span className="font-medium text-tinta-2">sem preço</span>}
                    acoes={
                      <>
                        {naJanela ? (
                          <Botao variante="secundario" tamanho="pq" icone={<Undo2 className="h-4 w-4" aria-hidden="true" />} onClick={() => onDesfazer([pedido.id])} aria-label={`Desfazer a aprovação d${rotulo}`}>
                            Desfazer
                          </Botao>
                        ) : (
                          <Botao variante="suave" tamanho="pq" onClick={() => onAprovar([pedido])} aria-label={`Aprovar ${rotulo}, ${formatarReais(pedido.valorEstimado || 0)}`}>
                            Aprovar
                          </Botao>
                        )}
                        <Ir to={linkDoPedido(pedido.id)} rotulo={`Abrir ${rotulo}`} />
                      </>
                    }
                  />
                );
              })}
            </>
          ) : null}

          {/* ---------------- Pagar hoje: as do dia de pagar e as que passaram dele ---------------- */}
          {pd.contas.length ? (
            <>
              <CabecaDoGrupo
                seguinte={seguinte("contas")}
                titulo="Pagar hoje"
                soma={`${plural(pd.contas.length, "conta", "contas")} · ${formatarReais(pd.valorContas)}`}
                direita={
                  pd.vencidas ? (
                    <span className="mr-3 whitespace-nowrap text-[13px] font-bold leading-5 text-atencao">
                      {pd.vencidas === 1 ? "1 passou do dia de pagar" : `${pd.vencidas} passaram do dia de pagar`}
                    </span>
                  ) : (
                    <span className="mr-3 whitespace-nowrap text-[13px] font-medium leading-5 text-tinta-2">nenhuma vencida</span>
                  )
                }
              />
              {pd.contas.map((item) => {
                const venceu = item.pagarEm < hoje;
                const provisao = Boolean(item.expense?.id.startsWith("fexp-prov-"));
                return (
                  <LinhaDeDecisao
                    key={item.chave}
                    titulo={item.titulo}
                    meta={
                      <>
                        {venceu ? (
                          <span className="font-bold text-atencao">
                            {item.pagaAntes ? `era para pagar ${diaCurto(item.pagarEm)} · ${item.pagaAntes}` : `venceu ${diaCurto(item.data)}`}
                          </span>
                        ) : item.pagaAntes ? (
                          <span className="font-semibold text-tinta">{item.pagaAntes} · pagar hoje</span>
                        ) : null}
                        {(venceu || item.pagaAntes) && item.detalhe ? <Sep /> : null}
                        {item.detalhe ? <span>{item.detalhe}</span> : null}
                        {/* Abaixo de 1440 px o aviso ganha linha própria e o "·" antes dele some (a regra do prazo, na proposta). */}
                        {item.alerta === "SEM_ARQUIVO" ? (
                          <>
                            <span className="max-[1439px]:hidden">
                              <Sep />
                            </span>
                            <span className="max-[1439px]:basis-full">sem boleto anexado</span>
                          </>
                        ) : null}
                        {item.aguardaAprovacao ? (
                          <>
                            <span className="max-[1439px]:hidden">
                              <Sep />
                            </span>
                            <span className="font-bold text-atencao max-[1439px]:basis-full">acima do limite: falta aprovar</span>
                          </>
                        ) : null}
                      </>
                    }
                    valor={formatarReais(item.valor)}
                    acoes={
                      <>
                        {item.aguardaAprovacao || provisao ? (
                          <LinkSeta to="/financeiro/contas" className="pr-3 text-[13px]">
                            Abrir
                          </LinkSeta>
                        ) : (
                          <Botao
                            variante="suave"
                            tamanho="pq"
                            carregando={pagando.has(item.expense?.id ?? "")}
                            onClick={() => onPagar(item)}
                            aria-label={`Marcar a conta ${item.titulo} como paga hoje`}
                          >
                            Paguei
                          </Botao>
                        )}
                        <Ir to="/financeiro/contas" rotulo={`Abrir a conta ${item.titulo} em Contas a pagar`} />
                      </>
                    }
                  />
                );
              })}
            </>
          ) : null}

          {/* ---------------- Acima do limite (só com a aprovação ligada) ---------------- */}
          {pd.contasParaAprovar.length ? (
            <>
              <CabecaDoGrupo
                seguinte={seguinte("aprovar")}
                titulo="Aprovar contas"
                soma={`${plural(pd.contasParaAprovar.length, "conta acima do limite", "contas acima do limite")} · ${formatarReais(pd.contasParaAprovar.reduce((soma, item) => soma + item.valor, 0))}`}
              />
              {pd.contasParaAprovar.map((item) => (
                <LinhaDeDecisao
                  key={item.chave}
                  titulo={item.titulo}
                  meta={
                    <>
                      <span>{item.pagaAntes ? `${item.pagaAntes} · pagar ${diaCurto(item.pagarEm)}` : `vence ${diaCurto(item.data)}`}</span>
                      {item.detalhe ? (
                        <>
                          <Sep />
                          <span>{item.detalhe}</span>
                        </>
                      ) : null}
                    </>
                  }
                  valor={formatarReais(item.valor)}
                  acoes={
                    <LinkSeta to="/financeiro/contas" className="pr-3 text-[13px]">
                      Decidir
                    </LinkSeta>
                  }
                />
              ))}
            </>
          ) : null}

          {/* ---------------- Conferir: o fechamento de ontem ---------------- */}
          {pd.fechamento ? (
            <>
              <CabecaDoGrupo seguinte={seguinte("fechamento")} titulo="Conferir" soma={`1 fechamento · ${formatarReais(pd.fechamento.total)}`} />
              <LinhaDeDecisao
                titulo={`Fechamento de ${quandoFoiOFechamento(pd.fechamento.dia, hoje)}`}
                meta={<span>comandas esperando a conferência com a maquininha</span>}
                valor={formatarReais(pd.fechamento.total)}
                acoes={
                  <LinkSeta to="/financeiro/fechamento" className="pr-3">
                    Conferir
                  </LinkSeta>
                }
              />
            </>
          ) : null}
        </ListaDeDecisoes>
      ) : (
        <div className="px-4 py-6">
          <p className="text-sm font-bold leading-5 text-tinta">{carregando ? "Conferindo pedidos, contas e o fechamento de ontem…" : "Nada para decidir agora."}</p>
          {carregando ? null : (
            <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
              Pedido de compra para aprovar, conta do dia e o fechamento de ontem aparecem aqui assim que chegarem.
            </p>
          )}
        </div>
      )}

      {/* Aviso, não decisão: fica fora da conta (o lugar dele é Avisos). */}
      {avisoDasNotas ? (
        <div className="mt-auto flex items-center gap-2 border-t border-fio-2 px-4 py-3 text-[13px] font-medium leading-5 text-tinta-2">
          <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            Em Avisos: <strong className="font-bold text-tinta">{avisoDasNotas.destaque}</strong>
            {avisoDasNotas.resto}
          </p>
          <LinkSeta to={avisoDasNotas.href} className="text-[13px] md:pr-3">
            Completar
          </LinkSeta>
        </div>
      ) : null}
    </BlocoFolha>
  );
}
