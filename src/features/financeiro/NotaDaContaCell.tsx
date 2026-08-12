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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteRemoteExpenseNota,
  getRemoteExpenseNotaUrl,
  setRemoteExpenseNotaStatus,
  uploadRemoteExpenseNota,
  type FinExpenseNotaRecord,
} from "@/lib/remoteData";
import { finNotaStatusLabels, type FinExpense, type FinNotaStatus } from "./financeiroData";

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
    try {
      const url = await getRemoteExpenseNotaUrl(nota.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (falha) {
      setErro((falha as Error).message);
    }
  }

  const cor =
    status === "ANEXADA"
      ? "bg-emerald-100 text-emerald-800"
      : status === "SEM_NOTA"
        ? "bg-brand-creme text-brand-tinta"
        : status === "AGUARDANDO"
          ? "bg-amber-100 text-amber-900"
          : "bg-red-50 text-red-800";

  return (
    <div className="flex flex-col gap-1">
      {daConta.length ? (
        daConta.map((nota) => (
          <span key={nota.clientRef} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void abrir(nota)}
              title={`Abrir ${nota.fileName}`}
              className="inline-flex max-w-[10rem] items-center gap-1 truncate rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:border-emerald-400"
            >
              <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{nota.fileName}</span>
            </button>
            {!readOnly && habilitado ? (
              <button
                type="button"
                aria-label={`Remover a nota ${nota.fileName}`}
                title="Remover esta nota"
                onClick={() => {
                  if (!window.confirm(`Remover a nota "${nota.fileName}" desta conta?`)) return;
                  apagar.mutate(nota.clientRef);
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))
      ) : (
        <Badge className={cn("w-fit", cor)}>{finNotaStatusLabels[status]}</Badge>
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px]"
              disabled={anexar.isPending}
              onClick={() => inputArquivo.current?.click()}
            >
              {anexar.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Paperclip className="h-3 w-3" aria-hidden="true" />
              )}
              {daConta.length ? "Outra nota" : "Anexar nota"}
            </Button>
            {status === "PENDENTE" ? (
              <>
                <button
                  type="button"
                  onClick={() => marcar.mutate("AGUARDANDO")}
                  className="rounded-full border border-brand-oliva/30 px-2 py-0.5 text-[10px] font-semibold text-brand-tinta hover:border-brand-musgo"
                >
                  vai mandar
                </button>
                <button
                  type="button"
                  onClick={() => marcar.mutate("SEM_NOTA")}
                  className="rounded-full border border-brand-oliva/30 px-2 py-0.5 text-[10px] font-semibold text-brand-tinta hover:border-brand-musgo"
                >
                  não gera nota
                </button>
              </>
            ) : null}
            {status === "AGUARDANDO" || status === "SEM_NOTA" ? (
              <button
                type="button"
                onClick={() => marcar.mutate("PENDENTE")}
                className="text-[10px] font-semibold text-brand-oliva underline underline-offset-2"
              >
                desfazer
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {erro ? <span className="text-[10px] font-semibold text-red-700">{erro}</span> : null}
    </div>
  );
}
