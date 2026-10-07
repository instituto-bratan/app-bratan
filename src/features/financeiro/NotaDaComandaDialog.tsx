// EMITIR A NOTA DE UMA COMANDA JÁ LANÇADA (23/09/2026).
//
// O fechamento do Kanban pode sair sem nota ("não emitir agora", sinal, ou
// simplesmente quem fechou não emitiu). Quando a comanda aparece no Lançar Dia
// sem nota, este diálogo abre o MESMO cartão do fechamento — unificada ou
// repartida, texto à vista, CPF e e-mail — e emite pela Focus na hora. É o
// "se não emitiu no Kanban, emite na comanda diária" que o Lucas pediu.
//
// 07/10/2026: só emite quem tem a permissão "Emitir nota fiscal"
// (podeEmitirNota — por padrão, só o Estevão). Quem não tem vê o cartão, mas
// no lugar do botão lê quem emite; a comanda continua na fila de notas.
//
// 07/10/2026 (CPF na lista do dia): o "Guardar CPF e emitir" da linha abre
// este diálogo já com o CPF (cpfInicial). E a TRAVA da ficha de outra pessoa
// (nota no nome de X, comanda ligada à ficha de Y — caso Simone × Murilo): o
// CPF digitado NÃO vai para a ficha, o da ficha NÃO é usado, e a nota só sai
// com o CPF digitado aqui.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { avisoQuemEmiteNota, podeEmitirNota } from "@/lib/access";
import { cpfDigitos, cpfEnquantoDigita, cpfValido } from "@/lib/cpf";
import { invocarIntegracao, lerRemoteCpfDoContato, salvarRemoteCpfDoContato } from "@/lib/remoteData";
import { NotaNoFechamentoCard } from "@/features/crm/NotaNoFechamentoCard";
import { emitirNotasDoFechamento } from "@/features/crm/emitirNotaDoFechamento";
import { notaDoFechamentoVazia, planoDeNotas, travaDoFechamento, type NotaDoFechamento } from "@/features/crm/notaNoFechamento";
import { moneyFin, type FinSale } from "./financeiroData";
import { divisaoDosItens, ehSoSinal, parcelasDaComanda, valorFaturavel } from "./notaNaComandaDoDia";
import { fichaDeOutraPessoa } from "./cpfDaNota";

export function NotaDaComandaDialog({
  sale,
  emailInicial,
  cpfInicial = "",
  nomeDaFicha = null,
  onFechar,
  onEmitida,
  onEmailConfirmado,
}: {
  sale: FinSale;
  emailInicial: string;
  /** O CPF que a pessoa já digitou na linha (07/10/2026). */
  cpfInicial?: string;
  /** O nome da ficha ligada à comanda — para a trava de outra pessoa. */
  nomeDaFicha?: string | null;
  onFechar: () => void;
  onEmitida: () => void;
  onEmailConfirmado?: (email: string) => void;
}) {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const [nota, setNota] = useState<NotaDoFechamento>({ ...notaDoFechamentoVazia, divisao: divisaoDosItens(sale.items) });
  const [email, setEmail] = useState(emailInicial);
  const [cpfRascunho, setCpfRascunho] = useState(() => cpfEnquantoDigita(cpfInicial));
  const [emitindo, setEmitindo] = useState(false);
  useEffect(() => setEmail(emailInicial), [emailInicial]);
  useEffect(() => setCpfRascunho(cpfEnquantoDigita(cpfInicial)), [cpfInicial]);
  const outraPessoa = fichaDeOutraPessoa(sale.patientName, nomeDaFicha);

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
  const temPermissao = podeEmitirNota(pessoa);
  // Ficha de outra pessoa: só sai com o CPF digitado aqui (o da ficha seria o de outra pessoa).
  const travaDaFicha =
    outraPessoa && nota.escolha !== "SEM_NOTA" && !cpfValido(cpfRascunho)
      ? `Esta nota sai no nome de ${sale.patientName}, mas a comanda está ligada à ficha de ${nomeDaFicha}. Digite o CPF de ${sale.patientName}: ele vale só para esta nota e não vai para a ficha.`
      : "";
  const podeEmitir = temPermissao && !sinal && nota.escolha !== "SEM_NOTA" && valor > 0 && plano.notas.length > 0 && !trava && !travaDaFicha && !emitindo;

  async function emitir() {
    if (!podeEmitir) return;
    setEmitindo(true);
    try {
      const cpfDigitado = cpfValido(cpfRascunho) ? cpfDigitos(cpfRascunho) : "";
      if (cpfDigitado && !cpfNaFicha.data?.cpf && sale.crmContactRef && !outraPessoa) {
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
        podeEmitir: temPermissao,
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
            tomador={{ nome: sale.patientName, cpf: cpfNaFicha.data?.cpf && !outraPessoa ? "na ficha" : "", email }}
            onEmailChange={setEmail}
            cpfRascunho={cpfRascunho}
            onCpfChange={setCpfRascunho}
          />
        </div>
        {trava ? <p className="mt-2 text-sm font-semibold text-amber-700">{trava}</p> : null}
        {travaDaFicha ? <p className="mt-2 text-sm font-semibold text-amber-700">{travaDaFicha}</p> : null}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={emitindo}>{temPermissao ? "Agora não" : "Fechar"}</Button>
          {temPermissao ? (
            <LiquidButton type="button" size="sm" className="h-10 px-4" disabled={!podeEmitir} onClick={() => void emitir()}>
              {emitindo ? "Emitindo na prefeitura…" : plano.notas.length > 1 ? `Emitir ${plano.notas.length} notas` : "Emitir a nota"}
            </LiquidButton>
          ) : (
            <p className="text-sm text-muted-foreground">{avisoQuemEmiteNota}</p>
          )}
        </div>
      </div>
    </div>
  );
}
