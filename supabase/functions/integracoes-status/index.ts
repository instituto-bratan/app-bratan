// integracoes-status (15/09/2026): diz, para cada integração, quais segredos já
// existem nas variáveis das Edge Functions — só verdadeiro/falso, nunca o valor.
// A tela Administração → Integrações usa isto para mostrar "o que falta".
import { json, segredosFaltando } from "../_shared/integracoes.ts";
import { COORDENACAO, exigirAcesso } from "../_shared/guarda.ts";

export const SEGREDOS: Record<string, string[]> = {
  // WHATSAPP_APP_SECRET virou obrigatório em 29/09/2026 (o webhook recusa sem ele).
  whatsapp: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"],
  focus_nfse: ["FOCUS_NFE_TOKEN"],
  supersign: ["SUPERSIGN_TOKEN"],
  feegow: ["FEEGOW_TOKEN"],
  outlook: ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET"],
  google_agenda: ["GOOGLE_AGENDA_ICS"],
  push: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
  itau: ["ITAU_CLIENT_ID", "ITAU_CLIENT_SECRET", "ITAU_CERT_PEM"],
  rede: ["REDE_PV", "REDE_TOKEN"],
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  // Quem pode chamar (29/09/2026, auditoria S1): só a coordenação (a tela Integrações é da coordenação): a resposta diz QUAIS segredos faltam, o que ajuda um atacante; por isso deixou de ser aberta.
  // A chave anônima do site NÃO basta mais — ver _shared/guarda.ts.
  const acesso = await exigirAcesso(request, { cargos: COORDENACAO });
  if (!acesso.ok) return acesso.resposta;
  const status: Record<string, { exigidos: string[]; faltam: string[]; prontos: boolean }> = {};
  for (const [chave, nomes] of Object.entries(SEGREDOS)) {
    const faltam = segredosFaltando(nomes);
    status[chave] = { exigidos: nomes, faltam, prontos: faltam.length === 0 };
  }
  return json({ ok: true, status });
});
