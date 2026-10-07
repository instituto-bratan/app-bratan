// O CPF DA NOTA NA PRÓPRIA LINHA (07/10/2026).
//
// Pedido do Lucas: "colocar/editar o CPF direto no Lote de notas conferido
// (Impostos & NFs) e emitir numa tela só, sem ir na aba Pacientes. E em Lançar
// Dia também: colocar o CPF e já emitir de lá."
//
// UM componente, usado nas duas telas (lote e lista do dia do Lançar Dia):
//  · sem CPF na ficha → "CPF de <nome>" com máscara + "Guardar CPF"; para quem
//    emite, "Guardar CPF e emitir" (guarda e segue para a emissão daquela
//    nota — no lote emite, no Lançar Dia abre a confirmação da nota);
//  · com CPF → "CPF guardado 123.***.***-45" + "Trocar";
//  · TRAVA: nota no nome de X com a comanda ligada à ficha de Y → o CPF NÃO
//    vai para a ficha de Y; quem emite pode mandar o CPF só nesta nota;
//  · quem não grava CPF (RLS de contato_documento) não vê o campo;
//  · o número nunca vai para console nem para recado de erro (semCpfNoTexto).
// As regras são puras, em cpfDaNota.ts.
import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { podeEmitirNota, podeGravarCpf, podeVerCpf } from "@/lib/access";
import { cpfDigitos, cpfEnquantoDigita, cpfMascarado, cpfValido } from "@/lib/cpf";
import { lerRemoteCpfDoContato, salvarRemoteCpfDoContato } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { acoesDoCpfDaNota, avisoDoCpfDaNota, fichaDeOutraPessoa, rotuloDaAcao, semCpfNoTexto, situacaoDoCpfDaNota, type AcaoDoCpfDaNota } from "./cpfDaNota";

export function CpfDaNotaInline({
  contactRef,
  nomeDaNota,
  nomeDaFicha,
  emitir,
  onGuardado,
  desabilitado = false,
  className,
}: {
  /** A ficha ligada à comanda (é nela que o CPF fica). */
  contactRef: string | null | undefined;
  /** Em nome de quem a nota sai. */
  nomeDaNota: string;
  /** O nome da ficha ligada (crm_contacts.full_name); vazio = não sei, não trava. */
  nomeDaFicha: string | null | undefined;
  /** Segue para a emissão DESTA nota com o CPF. A tela só passa para quem emite. */
  emitir?: (pedido: { cpf: string }) => Promise<unknown> | void;
  /** Depois de guardar na ficha (o lote recarrega a prontidão). */
  onGuardado?: () => void;
  desabilitado?: boolean;
  className?: string;
}) {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  // Emitir é de quem podeEmitirNota — e só quando a tela deu o caminho.
  const podeEmitir = podeEmitirNota(pessoa) && Boolean(emitir);
  const gravaCpf = podeGravarCpf(pessoa);
  const veCpf = podeVerCpf(pessoa);
  const [rascunho, setRascunho] = useState("");
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const campoId = useId();

  // Mesma chave do cartão da ficha e do diálogo da nota: guardou aqui, todos veem.
  // Ficha de outra pessoa: nem lê o CPF dela (não é dela a nota).
  const consultaLigada = Boolean(contactRef) && Boolean(session) && !isPreview && veCpf && !fichaDeOutraPessoa(nomeDaNota, nomeDaFicha);
  const guardado = useQuery({
    queryKey: ["contato-cpf", contactRef],
    queryFn: () => lerRemoteCpfDoContato(String(contactRef)),
    enabled: consultaLigada,
    staleTime: 60_000,
  });
  const temCpf = !consultaLigada ? false : guardado.isSuccess ? Boolean(guardado.data?.cpf) : guardado.isError ? false : undefined;
  const situacao = situacaoDoCpfDaNota({ contactRef, nomeDaNota, nomeDaFicha, temCpf });
  const { mostraCampo, acoes } = acoesDoCpfDaNota({ situacao, podeGravarCpf: gravaCpf, podeEmitir, editando });
  const aviso = avisoDoCpfDaNota(situacao, { nomeDaNota, nomeDaFicha });

  // Recepção e quem não cuida de nota: nada aqui (nem o sim/não do CPF).
  if (!veCpf && !podeEmitir) return null;

  const valido = cpfValido(rascunho);
  const travado = desabilitado || ocupado;

  async function executar(acao: AcaoDoCpfDaNota) {
    if (!valido) {
      toast("Esse CPF não confere. Confira os números.", { tom: "atencao" });
      return;
    }
    const cpf = cpfDigitos(rascunho);
    setOcupado(true);
    try {
      if (acao !== "SO_NESTA_NOTA") {
        // A trava de novo, aqui embaixo: nunca grava na ficha de outra pessoa.
        if (!contactRef || situacao === "OUTRA_PESSOA" || situacao === "SEM_FICHA" || !gravaCpf) return;
        try {
          await salvarRemoteCpfDoContato(contactRef, cpf, pessoa?.id ?? null);
        } catch (erro) {
          const motivo = semCpfNoTexto(erro instanceof Error ? erro.message : String(erro));
          toast(`Não deu para guardar o CPF de ${nomeDaNota}: ${motivo}`, { tom: "erro", duracaoMs: 9000 });
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["contato-cpf", contactRef] });
        onGuardado?.();
        setEditando(false);
        setRascunho("");
        if (acao === "GUARDAR") {
          toast(`CPF de ${nomeDaNota} guardado na ficha.`, { tom: "ok" });
          return;
        }
      }
      if (!podeEmitir || !emitir) return;
      await emitir({ cpf });
      if (acao === "SO_NESTA_NOTA") setRascunho("");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className={cn("grid min-w-0 gap-1.5 text-xs", className)}>
      {aviso ? <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 font-semibold text-amber-900 whitespace-normal">{aviso}</p> : null}

      {situacao === "CARREGANDO" ? <span className="text-muted-foreground">CPF: conferindo a ficha…</span> : null}

      {situacao === "COM_CPF" && !editando ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-brand-musgo">
            <IdCard className="h-3.5 w-3.5" aria-hidden="true" />
            CPF guardado <span className="font-mono">{cpfMascarado(guardado.data?.cpf ?? "")}</span>
          </span>
          {gravaCpf ? (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={travado} onClick={() => { setEditando(true); setRascunho(""); }}>
              Trocar
            </Button>
          ) : null}
        </div>
      ) : null}

      {situacao === "SEM_CPF" && !mostraCampo ? <span className="font-semibold text-amber-700">Sem CPF na ficha</span> : null}

      {mostraCampo ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="w-full text-[11px] font-semibold text-brand-oliva whitespace-normal" htmlFor={campoId}>
            {situacao === "OUTRA_PESSOA" || situacao === "SEM_FICHA" ? `CPF de ${nomeDaNota} (só nesta nota)` : `CPF de ${nomeDaNota}`}
          </label>
          <Input
            id={campoId}
            value={rascunho}
            onChange={(evento) => setRascunho(cpfEnquantoDigita(evento.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            autoComplete="off"
            className="h-8 w-[9.5rem] text-xs"
            disabled={travado}
          />
          {acoes.map((acao, indice) => (
            <Button
              key={acao}
              type="button"
              size="sm"
              variant={indice === 0 ? "default" : "ghost"}
              className="h-8 px-2.5 text-xs"
              disabled={travado || !valido}
              onClick={() => void executar(acao)}
            >
              {ocupado && indice === 0 ? "Um instante…" : rotuloDaAcao(acao, acoes)}
            </Button>
          ))}
          {editando ? (
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={ocupado} onClick={() => { setEditando(false); setRascunho(""); }}>
              Cancelar
            </Button>
          ) : null}
          {rascunho && !valido ? <span className="w-full text-red-700">Esse CPF não confere. Confira os números.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
