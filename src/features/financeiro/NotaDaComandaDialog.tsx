// EMITIR A NOTA DE UMA COMANDA JÁ LANÇADA (23/09/2026).
//
// O fechamento do Kanban pode sair sem nota ("não emitir agora", sinal, ou
// simplesmente quem fechou não emitiu). Quando a comanda aparece no Lançar Dia
// sem nota, este diálogo abre o MESMO cartão do fechamento — unificada ou
// repartida, texto à vista, CPF e e-mail — e emite pela Focus na hora. É o
// "se não emitiu no Kanban, emite na comanda diária" que o Lucas pediu.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { cpfDigitos, cpfValido } from "@/lib/cpf";
import { invocarIntegracao, lerRemoteCpfDoContato, salvarRemoteCpfDoContato } from "@/lib/remoteData";
import { NotaNoFechamentoCard } from "@/features/crm/NotaNoFechamentoCard";
import { emitirNotasDoFechamento } from "@/features/crm/emitirNotaDoFechamento";
import { notaDoFechamentoVazia, planoDeNotas, travaDoFechamento, type NotaDoFechamento } from "@/features/crm/notaNoFechamento";
import { moneyFin, type FinSale } from "./financeiroData";
import { divisaoDosItens, ehSoSinal, parcelasDaComanda, valorFaturavel } from "./notaNaComandaDoDia";

export function NotaDaComandaDialog({ sale, emailInicial, onFechar, onEmitida, onEmailConfirmado }: { sale: FinSale; emailInicial: string; onFechar: () => void; onEmitida: () => void; onEmailConfirmado?: (email: string) => void }) {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const [nota, setNota] = useState<NotaDoFechamento>({ ...notaDoFechamentoVazia, divisao: divisaoDosItens(sale.items) });
  const [email, setEmail] = useState(emailInicial);
  const [cpfRascunho, setCpfRascunho] = useState("");
  const [emitindo, setEmitindo] = useState(false);
  useEffect(() => setEmail(emailInicial), [emailInicial]);

  const cpfNaFicha = useQuery({
    queryKey: ["contato-cpf", sale.crmContactRef],
    queryFn: () => lerRemoteCpfDoContato(sale.crmContactRef).catch(() => null),
    enabled: Boolean(sale.crmContactRef) && Boolean(session) && !isPreview,
    staleTime: 60_000,
  });
  const valor = valorFaturavel(sale.items);
  const sinal = ehSoSinal(sale.items);
  const parcelas = parcelasDaComanda(sale.payments);
  const plano = planoDeNotas({ escolha: nota.escolha, valorRecebido: valor, divisao: nota.divisao, diaISO: sale.saleDate, parcelas });
  const trava = travaDoFechamento({ nota, valorRecebido: valor, ehSinal: sinal, plano });
  const podeEmitir = !sinal && nota.escolha !== "SEM_NOTA" && valor > 0 && plano.notas.length > 0 && !trava && !emitindo;

  async function emitir() {
    if (!podeEmitir) return;
    setEmitindo(true);
    try {
      const cpfDigitado = cpfValido(cpfRascunho) ? cpfDigitos(cpfRascunho) : "";
      if (cpfDigitado && !cpfNaFicha.data?.cpf && sale.crmContactRef) {
        try {
          await salvarRemoteCpfDoContato(sale.crmContactRef, cpfDigitado, pessoa?.id ?? null);
          void queryClient.invalidateQueries({ queryKey: ["contato-cpf", sale.crmContactRef] });
        } catch {
          /* sem permissão para a ficha: o CPF vai só nesta nota */
        }
      }
      const emissao = await emitirNotasDoFechamento({
        saleRef: sale.id,
        escolha: nota.escolha,
        notas: plano.notas,
        pacienteNome: sale.patientName,
        cpf: cpfDigitado,
        email,
        solicitadoPor: pessoa?.id ?? null,
        comandaGravada: Promise.resolve(true),
        invocar: (slug, body) => invocarIntegracao(slug, body),
      });
      if (emissao.recado) toast(emissao.recado, { tom: emissao.tudoCerto ? "ok" : "atencao", duracaoMs: emissao.tudoCerto ? 6000 : 12000 });
      const emailLimpo = email.trim().toLowerCase();
      if (emailLimpo && emailLimpo !== emailInicial.trim().toLowerCase()) onEmailConfirmado?.(emailLimpo);
      onEmitida();
      if (emissao.tudoCerto) onFechar();
    } finally {
      setEmitindo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-brand-tinta/30 px-4 py-6 backdrop-blur-sm" onClick={onFechar}>
      <div className="max-h-[88dvh] w-[min(36rem,94vw)] overflow-y-auto rounded-2xl border border-brand-oliva/18 bg-brand-papel p-5 shadow-[0_32px_80px_rgba(43,46,36,0.28)]" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={`Emitir a nota de ${sale.patientName}`}>
        <h2 className="text-xl text-brand-musgo">Nota fiscal de {sale.patientName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Comanda de {sale.saleDate.split("-").reverse().join("/")} · {moneyFin(valor)} a faturar
          {sale.notaInstrucao?.trim() ? <> · combinado no fechamento: <strong className="text-brand-tinta">{sale.notaInstrucao.trim()}</strong></> : null}
        </p>
        <div className="mt-4">
          <NotaNoFechamentoCard
            nota={nota}
            onNotaChange={setNota}
            valorRecebido={valor}
            diaISO={sale.saleDate}
            parcelas={parcelas}
            ehSinal={sinal}
            tomador={{ nome: sale.patientName, cpf: cpfNaFicha.data?.cpf ? "na ficha" : "", email }}
            onEmailChange={setEmail}
            cpfRascunho={cpfRascunho}
            onCpfChange={setCpfRascunho}
          />
        </div>
        {trava ? <p className="mt-2 text-sm font-semibold text-amber-700">{trava}</p> : null}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={emitindo}>Agora não</Button>
          <LiquidButton type="button" size="sm" className="h-10 px-4" disabled={!podeEmitir} onClick={() => void emitir()}>
            {emitindo ? "Emitindo na prefeitura…" : plano.notas.length > 1 ? `Emitir ${plano.notas.length} notas` : "Emitir a nota"}
          </LiquidButton>
        </div>
      </div>
    </div>
  );
}
