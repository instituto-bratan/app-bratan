// PEDIDOS DE COMPRA POR SETOR (06/10/2026).
// Leitura direta das tabelas (RLS compra_pode_ver_pedido) e gravação SÓ pelas
// funções compra_pedido_enviar / _decidir / _cancelar / _receber, que conferem
// quem está agindo e gravam a mudança e o histórico numa transação
// (supabase/migrations/202610060001_pedidos_de_compra.sql). O passo COMPRAR
// não passa por aqui: é a compra gravada em fin_purchases com pedido_ref (o
// gatilho do banco muda o pedido para COMPRADO).
//
// As frases de erro do banco já vêm em português ("Só quem aprova pedidos de
// compra pode decidir."): a tela mostra a mensagem como chegou.
import {
  pedidoDoBanco,
  rascunhoParaBanco,
  recebimentoParaBanco,
  type PedidoCompra,
  type RascunhoPedido,
  type Recebimento,
} from "@/features/compras/comprasData";
import { requireSupabase, safeWriteRemoteAuditEvent } from "./base";

// Os nomes de quem pediu e de quem decidiu vêm copiados nas linhas
// (solicitante_nome, por_nome): a recepção não lê a tabela de colaboradores.
const colunas = "*, itens:compra_pedido_item(*), eventos:compra_pedido_evento(*)";

/** Os pedidos que a pessoa pode ver (a RLS filtra), do mais recente para o mais antigo. */
export async function listRemotePedidosDeCompra(): Promise<PedidoCompra[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("compra_pedido").select(colunas).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(pedidoDoBanco);
}

function erroDaFuncao(error: { message?: string } | null, padrao: string) {
  return new Error(error?.message || padrao);
}

function pedidoDaResposta(data: unknown, padrao: string): PedidoCompra {
  if (!data || typeof data !== "object") throw new Error(padrao);
  return pedidoDoBanco(data as Record<string, unknown>);
}

/** Envia um pedido novo ou reenvia um devolvido (mesmo id). */
export async function enviarRemotePedidoDeCompra(id: string, rascunho: RascunhoPedido): Promise<PedidoCompra> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("compra_pedido_enviar", { _pedido: rascunhoParaBanco(id, rascunho) });
  if (error) throw erroDaFuncao(error, "O servidor não aceitou o pedido.");
  const pedido = pedidoDaResposta(data, "O servidor não devolveu o pedido gravado.");
  await safeWriteRemoteAuditEvent({
    action: "compras.pedido.enviar",
    entity: "compra_pedido",
    entityId: id,
    metadata: { setor: pedido.setor, numero: pedido.numero, itens: pedido.itens.length, valorEstimado: pedido.valorEstimado },
  });
  return pedido;
}

export type DecisaoDoPedido = "APROVAR" | "DEVOLVER" | "RECUSAR";

export async function decidirRemotePedidoDeCompra(id: string, decisao: DecisaoDoPedido, nota: string): Promise<PedidoCompra> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("compra_pedido_decidir", { _client_ref: id, _decisao: decisao, _nota: nota });
  if (error) throw erroDaFuncao(error, "O servidor não aceitou a decisão.");
  const pedido = pedidoDaResposta(data, "O servidor não devolveu o pedido decidido.");
  await safeWriteRemoteAuditEvent({
    action: "compras.pedido.decidir",
    entity: "compra_pedido",
    entityId: id,
    metadata: { decisao, numero: pedido.numero, status: pedido.status },
  });
  return pedido;
}

/**
 * A mesma decisão, mas que sobrevive à aba fechando (07/10/2026). O "Desfazer"
 * de 5 s da aprovação deixa a gravação para depois; se a pessoa fecha a aba ou
 * aperta F5 nesse meio-tempo, o pagehide dispara a gravação — e o navegador
 * pode cancelar um fetch comum quando a página é descarregada (o Lucas via
 * "aprovado" e o pedido continuava aguardando). Com keepalive o pedido HTTP
 * segue até o PostgREST mesmo depois de a página sumir. Vai direto ao
 * endpoint da função, com o token da sessão (não dá para esperar o supabase-js
 * buscar a sessão durante o descarregamento). Sem o evento de auditoria: a
 * decisão já fica na linha do tempo do pedido (compra_pedido_evento).
 */
export async function decidirRemotePedidoDeCompraAoSair(id: string, decisao: DecisaoDoPedido, nota: string, accessToken: string): Promise<void> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !chave || !accessToken) throw new Error("Supabase ainda não está configurado.");
  const resposta = await fetch(`${url}/rest/v1/rpc/compra_pedido_decidir`, {
    method: "POST",
    keepalive: true,
    headers: { apikey: chave, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ _client_ref: id, _decisao: decisao, _nota: nota }),
  });
  if (!resposta.ok) {
    let mensagem = "";
    try {
      const corpo = (await resposta.json()) as { message?: unknown };
      mensagem = String(corpo?.message ?? "");
    } catch {
      /* corpo não era JSON */
    }
    throw new Error(mensagem || "O servidor não aceitou a decisão.");
  }
}

export async function cancelarRemotePedidoDeCompra(id: string, nota: string): Promise<PedidoCompra> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("compra_pedido_cancelar", { _client_ref: id, _nota: nota });
  if (error) throw erroDaFuncao(error, "O servidor não aceitou o cancelamento.");
  const pedido = pedidoDaResposta(data, "O servidor não devolveu o pedido cancelado.");
  await safeWriteRemoteAuditEvent({ action: "compras.pedido.cancelar", entity: "compra_pedido", entityId: id, metadata: { numero: pedido.numero } });
  return pedido;
}

/** Confirma a chegada: grava o que chegou e dá a entrada no estoque do setor (na mesma transação). */
export async function receberRemotePedidoDeCompra(id: string, recebimento: Recebimento): Promise<PedidoCompra> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("compra_pedido_receber", {
    _client_ref: id,
    _itens: recebimentoParaBanco(recebimento),
    _divergencia: recebimento.divergencia ?? "",
  });
  if (error) throw erroDaFuncao(error, "O servidor não aceitou o recebimento.");
  const pedido = pedidoDaResposta(data, "O servidor não devolveu o pedido recebido.");
  await safeWriteRemoteAuditEvent({
    action: "compras.pedido.receber",
    entity: "compra_pedido",
    entityId: id,
    metadata: { numero: pedido.numero, setor: pedido.setor, comDivergencia: Boolean(pedido.divergencia) },
  });
  return pedido;
}

/**
 * Tempo real: a caixa de aprovação e "Meus pedidos" atualizam sozinhos quando
 * alguém pede, decide ou recebe (a publicação foi ligada na migração; o
 * Supabase respeita a RLS de cada pessoa). Devolve a função de desligar.
 */
export function subscribeRemotePedidosDeCompra(onChange: () => void): () => void {
  const client = requireSupabase();
  const channel = client
    .channel("compras-pedidos")
    .on("postgres_changes", { event: "*", schema: "public", table: "compra_pedido" }, onChange)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
