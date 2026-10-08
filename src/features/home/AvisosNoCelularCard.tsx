// AVISOS NO CELULAR (15/09/2026, proposta 4.5): quem instalou o app ativa aqui
// e recebe a Fila do dia às 7h (Web Push). Só aparece com a integração "push"
// ligada e a chave pública configurada; a assinatura fica em push_assinatura.
//
// Redesenho etapa 2 (08/10/2026): o cartão saiu do Início e foi para Avisos
// (é sobre avisos), com a forma nova — uma linha de folha, botão secundário.
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { BlocoFolha } from "@/components/ui/blocos";
import { Botao } from "@/components/ui/botao";
import { toast } from "@/components/ui/avisos";
import { configIntegracao, integracaoLigada } from "@/lib/integracoes";
import { removerPushAssinatura, salvarPushAssinatura } from "@/lib/remoteData";

function base64ParaUint8(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function AvisosNoCelularCard({ pessoaId }: { pessoaId: string }) {
  const ligada = integracaoLigada("push");
  const chavePublica = String(configIntegracao<{ vapidPublicKey?: string }>("push").vapidPublicKey ?? "");
  const suportado = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [assinado, setAssinado] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!suportado) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setAssinado(Boolean(sub)))
      .catch(() => setAssinado(false));
  }, [suportado]);

  if (!ligada || !chavePublica || !suportado) return null;

  async function ativar() {
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        toast("O navegador não deu permissão para avisos. Libere nas configurações do site.", { tom: "atencao" });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaUint8(chavePublica) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await salvarPushAssinatura(pessoaId, json, navigator.userAgent.slice(0, 120));
      setAssinado(true);
      toast("Avisos ativados. Às 7h a sua Fila do dia chega aqui.", { tom: "ok" });
    } catch (error) {
      toast(`Não consegui ativar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removerPushAssinatura(sub.endpoint).catch(() => undefined);
        await sub.unsubscribe();
      }
      setAssinado(false);
      toast("Avisos desativados neste aparelho.", { tom: "ok" });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <BlocoFolha as="section" aria-labelledby="avisos-no-celular" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 max-md:px-4">
      <div className="flex min-w-0 items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-tinta-2" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="avisos-no-celular" className="text-sm font-bold leading-5 text-tinta">
            Avisos no celular às 7h
          </h2>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            {assinado ? "Este aparelho recebe a Fila do dia toda manhã." : "Receba a Fila do dia neste aparelho toda manhã, sem abrir o app."}
          </p>
        </div>
      </div>
      <Botao variante={assinado ? "fantasma" : "secundario"} tamanho="pq" carregando={ocupado} disabled={assinado === null} onClick={() => void (assinado ? desativar() : ativar())}>
        {assinado ? "Desativar aqui" : "Ativar neste aparelho"}
      </Botao>
    </BlocoFolha>
  );
}
