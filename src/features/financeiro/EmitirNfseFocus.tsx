// EMITIR NFS-e PELA FOCUS (15/09/2026, proposta 3.3). Só aparece com a integração
// focus_nfse ligada. Emite, depois consulta até a prefeitura devolver o número —
// que preenche o campo "Nº" do plano de notas. O CPF do tomador, se digitado,
// vai só no pedido e não é guardado.
import { useEffect, useState } from "react";
import { FileCheck2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/avisos";
import { integracaoLigada } from "@/lib/integracoes";
import { invocarIntegracao, listRemoteNfseDaComanda } from "@/lib/remoteData";
import type { NfseEmissao } from "@/lib/remote/integracoes";
import { emissaoQueCobre, notasFocusVivas } from "./notasEmitidasFocus";
import { rotuloDoTipoDeNota } from "../../../supabase/functions/_shared/notaEmitida";

type Resposta = { ok: boolean; ref?: string; status?: string; error?: string; jaEmitida?: boolean; cobertaPor?: { tipo: string; rotulo: string; numero: string | null }; numero?: string | null; emailEnviado?: boolean; dados?: { numero?: string; url?: string; status?: string } };

/** Status de uma tentativa que não vingou — só depois de uma dessas dá para emitir de novo. */
function emissaoFalhou(status: string) {
  return /ERRO|CANCEL|HTTP_/i.test(status);
}

export function EmitirNfseFocus({ saleRef, tipo, valor, pacienteNome, solicitadoPor, onNumero, emissoes }: { saleRef: string; tipo: "CONSULTA" | "TRATAMENTO"; valor: number; pacienteNome: string; solicitadoPor: string | null; onNumero: (numero: string) => void; /** As emissões da comanda já carregadas pelo cartão (22/09/2026); sem elas, busca aqui. */ emissoes?: NfseEmissao[] }) {
  const [ref, setRef] = useState("");
  const [status, setStatus] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ligada = integracaoLigada("focus_nfse");

  // Ao abrir a tela, recupera o que já foi enviado: sem isso, um F5 no meio do
  // caminho apagava a memória do pedido e o botão voltava a oferecer "Emitir".
  //
  // 22/09/2026: a nota que cobre esta linha pode ser de OUTRO tipo — a
  // UNIFICADA cobre consulta e tratamento; a bioimpedância é da classe do
  // tratamento. Antes só se procurava o tipo igual, e a nota unificada nº 6207
  // passava despercebida.
  const [cobertaPor, setCobertaPor] = useState<NfseEmissao | null>(null);
  useEffect(() => {
    if (!ligada) return;
    let vivo = true;
    const aplicar = (lista: NfseEmissao[]) => {
      if (!vivo) return;
      const cobre = emissaoQueCobre(notasFocusVivas(lista), tipo);
      setCobertaPor(cobre);
      if (!cobre) return;
      setRef(cobre.ref);
      setStatus(cobre.status);
      if (cobre.numero) onNumero(String(cobre.numero));
    };
    if (emissoes) aplicar(emissoes);
    else
      void listRemoteNfseDaComanda(saleRef)
        .then(aplicar)
        .catch(() => {
          /* sem histórico: a trava do servidor ainda impede a nota em dobro */
        });
    return () => {
      vivo = false;
    };
    // onNumero muda a cada render do pai; a busca é por comanda e tipo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligada, saleRef, tipo, emissoes]);

  if (!ligada) return null;

  async function emitir() {
    if (!(valor > 0)) return toast("Valor da nota precisa ser maior que zero.", { tom: "atencao" });
    setOcupado(true);
    try {
      const r = await invocarIntegracao<Resposta>("focus-nfse", { acao: "emitir", saleRef, tipo, valor, tomador: { nome: pacienteNome, ...(cpf.trim() ? { cpf: cpf.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}) }, solicitadoPor });
      if (!r.ok) return toast(r.error ?? `A Focus recusou: ${r.status ?? ""}`, { tom: "erro", duracaoMs: 7000 });
      setRef(r.ref ?? "");
      setStatus(r.status ?? "ENVIADA");
      setCpf("");
      const numero = r.numero ?? r.dados?.numero;
      if (numero) onNumero(String(numero));
      toast(
        r.jaEmitida
          ? r.cobertaPor
            ? `Esta comanda já tem nota ${r.cobertaPor.rotulo}${r.cobertaPor.numero ? ` (nº ${r.cobertaPor.numero})` : ""}, que cobre esta linha. Não sai outra.`
            : "Esta comanda já tem nota deste tipo. Use Consultar para pegar o número."
          : numero
            ? `Nota autorizada: nº ${numero}.${r.emailEnviado ? " Enviada por e-mail ao paciente." : ""}`
            : "Pedido enviado à prefeitura. Consulte em alguns segundos para pegar o número.",
        { tom: r.jaEmitida ? "info" : "ok" },
      );
    } finally {
      setOcupado(false);
    }
  }

  async function consultar() {
    if (!ref) return;
    setOcupado(true);
    try {
      const r = await invocarIntegracao<Resposta>("focus-nfse", { acao: "consultar", ref });
      const st = String(r.dados?.status ?? r.status ?? "").toUpperCase();
      setStatus(st);
      if (r.dados?.numero) {
        onNumero(String(r.dados.numero));
        toast(`Nota autorizada: nº ${r.dados.numero}.`, { tom: "ok" });
      } else toast(st.includes("ERRO") ? "A prefeitura recusou — veja o detalhe em Administração → Integrações." : `Ainda ${st.toLowerCase() || "processando"}…`, { tom: st.includes("ERRO") ? "erro" : "info" });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {!ref ? (
        <>
          <Input value={cpf} onChange={(event) => setCpf(event.target.value)} placeholder="CPF do tomador (opcional, não fica salvo)" className="h-8 w-56 text-xs" inputMode="numeric" />
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail do paciente (a nota vai para ele)" className="h-8 w-60 text-xs" type="email" inputMode="email" />
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={ocupado} onClick={() => void emitir()}>
            <FileCheck2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Emitir na prefeitura (Focus)
          </Button>
        </>
      ) : cobertaPor && cobertaPor.numero && /^autorizad/i.test(cobertaPor.status) ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-brand-musgo/30 bg-brand-musgo/10 px-2 py-1 text-xs font-semibold text-brand-musgo">
          <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
          {cobertaPor.tipo === "UNIFICADA" ? `Coberta pela nota unificada nº ${cobertaPor.numero}` : `Emitida pela Focus: nº ${cobertaPor.numero}`}
          {cobertaPor.urlPdf ? (
            <a href={cobertaPor.urlPdf} target="_blank" rel="noreferrer" className="underline">
              abrir
            </a>
          ) : null}
        </span>
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={ocupado} onClick={() => void consultar()}>
          <RefreshCw className={ocupado ? "mr-1 h-3.5 w-3.5 animate-spin" : "mr-1 h-3.5 w-3.5"} aria-hidden="true" /> Consultar ({cobertaPor && cobertaPor.tipo !== tipo ? `${rotuloDoTipoDeNota(cobertaPor.tipo)} ` : ""}{status.toLowerCase() || "enviada"})
        </Button>
      )}
    </span>
  );
}
