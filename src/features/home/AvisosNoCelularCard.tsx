// AVISOS NO CELULAR (15/09/2026, proposta 4.5): quem instalou o app ativa aqui
// e recebe a Fila do dia às 7h (Web Push). Só aparece com a integração "push"
// ligada e a chave pública configurada; a assinatura fica em push_assinatura.
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="border-brand-dourado/40 bg-brand-creme/40 shadow-none backdrop-blur">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
            <BellRing className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-brand-tinta">Avisos no celular às 7h</p>
            <p className="text-sm text-muted-foreground">{assinado ? "Este aparelho recebe a Fila do dia toda manhã." : "Receba a Fila do dia neste aparelho toda manhã, sem abrir o app."}</p>
          </div>
        </div>
        <Button type="button" size="sm" variant={assinado ? "outline" : "default"} disabled={ocupado || assinado === null} onClick={() => void (assinado ? desativar() : ativar())}>
          {assinado ? "Desativar aqui" : "Ativar neste aparelho"}
        </Button>
      </CardContent>
    </Card>
  );
}
