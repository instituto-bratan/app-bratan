// EMITIR NFS-e PELA FOCUS (15/09/2026, proposta 3.3). Só aparece com a integração
// focus_nfse ligada. Emite, depois consulta até a prefeitura devolver o número —
// que preenche o campo "Nº" do plano de notas. O CPF do tomador, se digitado,
// vai só no pedido e não é guardado.
//
// 07/10/2026: o botão de emitir só aparece para quem tem a permissão "Emitir
// nota fiscal" (podeEmitirNota — por padrão, só o Estevão). Depende dela, e não
// do "só vê" de Impostos & NFs: o Estevão só VÊ a tela e é quem emite. Quem não
// pode lê, no lugar do botão, quem emite e onde isso se libera.
//
// REDESENHO (08/10/2026, Papel & Musgo): só a forma — campos e botões da
// fundação; "Cancelar nota" em perigo, longe do Emitir. A lógica é a mesma.
import { useEffect, useState } from "react";
import { FileCheck2, RefreshCw, XCircle } from "lucide-react";
import { Botao } from "@/components/ui/fundacao";
import { toast } from "@/components/ui/avisos";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { avisoQuemEmiteNota, podeEmitirNota } from "@/lib/access";
import { integracaoLigada } from "@/lib/integracoes";
import { invocarIntegracao, listRemoteNfseDaComanda } from "@/lib/remoteData";
import type { NfseEmissao } from "@/lib/remote/integracoes";
import { emissaoQueCobre, notasFocusVivas } from "./notasEmitidasFocus";
import { rotuloDoTipoDeNota } from "../../../supabase/functions/_shared/notaEmitida";
import { classeDoCampo } from "./pecasBancoFechamento";

/** O campo do guia, 32 px de altura para caber na linha da nota (08/10/2026). */
const CAMPO = cn(classeDoCampo, "h-8 text-[13px]");

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
  // CANCELAR A NOTA (29/09/2026, pedido do Lucas). Motivo obrigatório: vai para
  // a prefeitura e fica no controle de impostos, que tira a nota do mês.
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const ligada = integracaoLigada("focus_nfse");
  const { pessoa } = useAuth();
  const podeEmitir = podeEmitirNota(pessoa);

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
    if (!podeEmitir) return toast(avisoQuemEmiteNota, { tom: "atencao" });
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

  async function cancelar() {
    if (!ref) return;
    const motivo = motivoCancelamento.trim();
    if (motivo.length < 15) return toast("Escreva o motivo do cancelamento (pelo menos 15 letras).", { tom: "atencao" });
    setOcupado(true);
    try {
      const r = await invocarIntegracao<Resposta & { baixadas?: number }>("focus-nfse", { acao: "cancelar", ref, justificativa: motivo });
      const st = String(r.dados?.status ?? r.status ?? "").toUpperCase();
      if (/^CANCELAD/.test(st)) {
        setStatus(st);
        setCobertaPor((antes) => (antes ? { ...antes, status: st } : antes));
        setCancelando(false);
        setMotivoCancelamento("");
        toast(`Nota cancelada na prefeitura.${r.baixadas ? " Saiu do controle de impostos do mês." : ""}`, { tom: "ok", duracaoMs: 7000 });
      } else {
        toast(r.error ?? `A prefeitura não cancelou (${st.toLowerCase() || "sem resposta"}). Veja o detalhe em Administração → Integrações.`, { tom: "erro", duracaoMs: 9000 });
      }
    } finally {
      setOcupado(false);
    }
  }

  const autorizada = Boolean(cobertaPor && cobertaPor.numero && /^autorizad/i.test(cobertaPor.status));

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {!ref && !podeEmitir ? (
        <span className="text-[13px] font-medium leading-5 text-tinta-2">{avisoQuemEmiteNota}</span>
      ) : !ref ? (
        <>
          <input
            value={cpf}
            onChange={(event) => setCpf(event.target.value)}
            placeholder="CPF do tomador (obrigatório se a ficha não tiver)"
            aria-label="CPF do tomador"
            className={cn(CAMPO, "w-60")}
            inputMode="numeric"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-mail do paciente (a nota vai para ele)"
            aria-label="E-mail do paciente"
            className={cn(CAMPO, "w-64")}
            type="email"
            inputMode="email"
          />
          <Botao variante="secundario" tamanho="pq" carregando={ocupado} disabled={ocupado} icone={<FileCheck2 className="h-4 w-4" aria-hidden="true" />} onClick={() => void emitir()}>
            Emitir na prefeitura (Focus)
          </Botao>
        </>
      ) : cobertaPor && cobertaPor.numero && /^autorizad/i.test(cobertaPor.status) ? (
        <span className="inline-flex flex-wrap items-center gap-1.5 rounded-controle bg-ok-claro px-2.5 py-1 text-[13px] font-semibold leading-5 text-tinta">
          <FileCheck2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
          {cobertaPor.tipo === "UNIFICADA" ? `Coberta pela nota unificada nº ${cobertaPor.numero}` : `Emitida pela Focus: nº ${cobertaPor.numero}`}
          {cobertaPor.urlPdf ? (
            <a href={cobertaPor.urlPdf} target="_blank" rel="noreferrer" className="font-bold text-musgo underline underline-offset-2">
              abrir
            </a>
          ) : null}
        </span>
      ) : cobertaPor && /^cancelad/i.test(cobertaPor.status) ? (
        <span className="inline-flex items-center gap-1.5 rounded-controle bg-erro-claro px-2.5 py-1 text-[13px] font-semibold leading-5 text-tinta">
          <XCircle className="h-4 w-4 shrink-0 text-erro" aria-hidden="true" />
          Nota {cobertaPor.numero ? `nº ${cobertaPor.numero} ` : ""}cancelada
        </span>
      ) : (
        <Botao
          variante="secundario"
          tamanho="pq"
          disabled={ocupado}
          icone={<RefreshCw className={ocupado ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />}
          onClick={() => void consultar()}
        >
          Consultar ({cobertaPor && cobertaPor.tipo !== tipo ? `${rotuloDoTipoDeNota(cobertaPor.tipo)} ` : ""}{status.toLowerCase() || "enviada"})
        </Botao>
      )}
      {autorizada && !cancelando ? (
        <Botao variante="perigo" tamanho="pq" disabled={ocupado} icone={<XCircle className="h-4 w-4" aria-hidden="true" />} onClick={() => setCancelando(true)}>
          Cancelar nota
        </Botao>
      ) : null}
      {autorizada && cancelando ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <input
            value={motivoCancelamento}
            onChange={(event) => setMotivoCancelamento(event.target.value)}
            placeholder="Motivo (vai para a prefeitura)"
            aria-label="Motivo do cancelamento da nota"
            className={cn(CAMPO, "w-64")}
          />
          <Botao variante="perigo-cheio" tamanho="pq" carregando={ocupado} disabled={ocupado || motivoCancelamento.trim().length < 15} onClick={() => void cancelar()}>
            {ocupado ? "Cancelando…" : "Confirmar cancelamento"}
          </Botao>
          <Botao variante="fantasma" tamanho="pq" disabled={ocupado} onClick={() => { setCancelando(false); setMotivoCancelamento(""); }}>
            Voltar
          </Botao>
        </span>
      ) : null}
    </span>
  );
}
