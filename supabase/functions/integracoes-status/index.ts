// integracoes-status (15/09/2026): diz, para cada integração, quais segredos já
// existem nas variáveis das Edge Functions — só verdadeiro/falso, nunca o valor.
// A tela Administração → Integrações usa isto para mostrar "o que falta".
import { json, segredosFaltando } from "../_shared/integracoes.ts";

export const SEGREDOS: Record<string, string[]> = {
  whatsapp: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"],
  focus_nfse: ["FOCUS_NFE_TOKEN"],
  supersign: ["SUPERSIGN_TOKEN"],
  feegow: ["FEEGOW_TOKEN"],
  outlook: ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET"],
  push: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
  itau: ["ITAU_CLIENT_ID", "ITAU_CLIENT_SECRET", "ITAU_CERT_PEM"],
  rede: ["REDE_PV", "REDE_TOKEN"],
};

Deno.serve((request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  const status: Record<string, { exigidos: string[]; faltam: string[]; prontos: boolean }> = {};
  for (const [chave, nomes] of Object.entries(SEGREDOS)) {
    const faltam = segredosFaltando(nomes);
    status[chave] = { exigidos: nomes, faltam, prontos: faltam.length === 0 };
  }
  return json({ ok: true, status });
});
