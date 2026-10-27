// O WHATSAPP LIGADO AO BANCO (27/10/2026): lê a integração e grava o histórico.
// As decisões estão em whatsappRegras.ts e o envio em whatsappEnvio.ts (os dois
// testados no Node); aqui só se liga o Supabase e o fetch de verdade.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { lerIntegracao, registrarEvento } from "./integracoes.ts";
import { enviarWhatsApp, type PedidoDeEnvio, type ResultadoDoEnvio } from "./whatsappEnvio.ts";
import { lerConfigWhatsapp, mascararTelefone, type ConfigWhatsapp } from "./whatsappRegras.ts";

export type ContextoDoWhatsapp = { ligada: boolean; config: ConfigWhatsapp; token: string; phoneNumberId: string };

export const SEGREDOS_DO_WHATSAPP = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];

export async function contextoDoWhatsapp(client: SupabaseClient): Promise<ContextoDoWhatsapp> {
  const integracao = await lerIntegracao(client, "whatsapp");
  return {
    ligada: integracao.ligada,
    config: lerConfigWhatsapp(integracao.config),
    token: (Deno.env.get("WHATSAPP_TOKEN") ?? "").trim(),
    phoneNumberId: (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "").trim(),
  };
}

/** Manda UMA mensagem pelo caminho único (trava do modo teste + registro + Meta). */
export async function enviar(client: SupabaseClient, contexto: ContextoDoWhatsapp, pedido: PedidoDeEnvio): Promise<ResultadoDoEnvio> {
  return enviarWhatsApp(pedido, {
    ...contexto,
    gravar: async (linha) => {
      const { data, error } = await client.from("mensagem_whatsapp").insert(linha).select("id").single();
      if (error || !data?.id) return { erro: error?.message ?? "o banco não devolveu o registro" };
      return { id: String(data.id) };
    },
    atualizar: async (id, mudanca) => {
      await client.from("mensagem_whatsapp").update(mudanca).eq("id", id);
    },
    fetch: (url, init) => fetch(url, init),
  });
}

/** Linha no histórico de integrações, sem o número inteiro. */
export async function registrarEnvio(client: SupabaseClient, origem: string, telefone: string, resultado: ResultadoDoEnvio) {
  await registrarEvento(client, {
    chave: "whatsapp",
    direcao: "SAIDA",
    entidade: "mensagem_whatsapp",
    entityRef: "id" in resultado ? resultado.id : undefined,
    status: resultado.ok ? "ENVIADA" : resultado.bloqueado ? "BLOQUEADA_MODO_TESTE" : "ERRO",
    resumo: resultado.ok ? `${origem}: mensagem para ${mascararTelefone(telefone)}` : `${origem}: não saiu para ${mascararTelefone(telefone)} — ${resultado.motivo}`,
  });
}
