// NOTA FISCAL DA CONTA A PAGAR (12/08/2026, pedido do Lucas).
//
// Um clique anexa a nota do fornecedor, o arquivo sobe para o storage privado e
// entra na MESMA fila do SharePoint do comprovante — pasta
// "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS RECEBIDAS/ano/mês", com o nome da
// conta na frente do arquivo para quem abrir a pasta entender do que é.
//
// Mesma escolha do comprovante da comanda: nunca obriga. "Falta a nota" é o
// padrão, e dois atalhos resolvem os casos que não geram arquivo — assim o aviso
// aponta só o que realmente falta.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Botao } from "@/components/ui/fundacao";
import {
  deleteRemoteExpenseNota,
  getRemoteExpenseNotaUrl,
  setRemoteExpenseNotaStatus,
  uploadRemoteExpenseNota,
  type FinExpenseNotaRecord,
} from "@/lib/remoteData";
import { finNotaStatusLabels, type FinExpense, type FinNotaStatus } from "./financeiroData";
import { confirmar } from "@/components/ui/avisos";
import { Etiqueta, type TomEtiqueta } from "./pecasDiaPagar";

export function NotaDaContaCell({
  expense,
  notas,
  pessoaId,
  readOnly,
  habilitado,
}: {
  expense: FinExpense;
  notas: FinExpenseNotaRecord[];
  pessoaId: string | null;
  readOnly: boolean;
  /** Sem login (modo preview) o upload não acontece — some o botão em vez de falhar. */
  habilitado: boolean;
}) {
  const queryClient = useQueryClient();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState("");
  const daConta = notas.filter((nota) => nota.expenseRef === expense.id);
  const status: FinNotaStatus = daConta.length ? "ANEXADA" : (expense.notaStatus ?? "PENDENTE");

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ["fin-expense-notas"] });
    void queryClient.invalidateQueries({ queryKey: ["fin-expenses"] });
  };

  const anexar = useMutation({
    mutationFn: (file: File) =>
      uploadRemoteExpenseNota({
        expenseRef: expense.id,
        expenseDescription: expense.description,
        file,
        pessoaId,
        emitente: expense.supplier ?? "",
        valor: expense.amount,
        emitidaEm: expense.dueDate || null,
        vencimento: expense.dueDate || null,
      }),
    onSuccess: recarregar,
    onError: (falha: Error) => setErro(falha.message),
  });

  const marcar = useMutation({
    mutationFn: (novo: FinNotaStatus) => setRemoteExpenseNotaStatus(expense.id, novo as "PENDENTE" | "AGUARDANDO" | "SEM_NOTA"),
    onSuccess: recarregar,
    onError: (falha: Error) => setErro(falha.message),
  });

  const apagar = useMutation({
    mutationFn: (clientRef: string) => deleteRemoteExpenseNota(clientRef),
    onSuccess: recarregar,
    onError: (falha: Error) => setErro(falha.message),
  });

  async function abrir(nota: FinExpenseNotaRecord) {
    if (!nota.storagePath) {
      setErro("O arquivo desta nota ainda não chegou da SEFAZ — a busca das notas recebidas baixa sozinha quando liberar.");
      return;
    }
    try {
      const url = await getRemoteExpenseNotaUrl(nota.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (falha) {
      setErro((falha as Error).message);
    }
  }

  // Papel & Musgo (08/10/2026): o estado vira etiqueta com tom de token (ok ·
  // neutro · ouro · atenção) e os atalhos viram botões pequenos de contorno.
  const tom: TomEtiqueta = status === "ANEXADA" ? "ok" : status === "SEM_NOTA" ? "neutro" : status === "AGUARDANDO" ? "ouro" : "atencao";

  return (
    <div className="flex flex-col gap-1.5">
      {daConta.length ? (
        daConta.map((nota) => (
          <span key={nota.clientRef} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void abrir(nota)}
              title={`Abrir ${nota.fileName}`}
              className="inline-flex h-6 max-w-[10rem] items-center gap-1 truncate rounded-controle bg-ok-claro px-2 text-xs font-bold text-ok hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{nota.fileName}</span>
            </button>
            {!readOnly && habilitado ? (
              <button
                type="button"
                aria-label={`Remover a nota ${nota.fileName}`}
                title="Remover esta nota"
                onClick={async () => {
                  if (!(await confirmar(`Remover a nota "${nota.fileName}" desta conta?`, { destrutivo: true, confirmar: "Remover" }))) return;
                  apagar.mutate(nota.clientRef);
                }}
                className="grid h-6 w-6 place-items-center rounded-controle text-tinta-2 hover:bg-erro-claro hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))
      ) : (
        <Etiqueta tom={tom}>{finNotaStatusLabels[status]}</Etiqueta>
      )}

      {!readOnly && habilitado ? (
        <>
          <input
            ref={inputArquivo}
            type="file"
            accept=".pdf,.xml,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(event) => {
              const arquivo = event.target.files?.[0];
              setErro("");
              if (arquivo) anexar.mutate(arquivo);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-1">
            <Botao
              variante="secundario"
              tamanho="pq"
              className="h-7 px-2 text-xs"
              disabled={anexar.isPending}
              icone={anexar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => inputArquivo.current?.click()}
            >
              {daConta.length ? "Outra nota" : "Anexar nota"}
            </Botao>
            {status === "PENDENTE" ? (
              <>
                <Botao variante="fantasma" tamanho="pq" className="h-7 px-2 text-xs" onClick={() => marcar.mutate("AGUARDANDO")}>
                  vai mandar
                </Botao>
                <Botao variante="fantasma" tamanho="pq" className="h-7 px-2 text-xs" onClick={() => marcar.mutate("SEM_NOTA")}>
                  não gera nota
                </Botao>
              </>
            ) : null}
            {status === "AGUARDANDO" || status === "SEM_NOTA" ? (
              <button
                type="button"
                onClick={() => marcar.mutate("PENDENTE")}
                className="rounded-sm text-xs font-bold text-musgo underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
              >
                desfazer
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {erro ? <span className="text-xs font-bold text-erro">{erro}</span> : null}
    </div>
  );
}
