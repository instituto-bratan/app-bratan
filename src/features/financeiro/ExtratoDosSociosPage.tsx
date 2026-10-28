// EXTRATO DE CADA UM (28/10/2026): o Lucro Inteligente de cada pessoa numa
// conta só — salário de sócio e parte de médico juntos, como o Lucas pediu
// ("não separe as coisas"). A conta é a do motor; esta tela só lê
// (extratoDosSocios.ts).
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { toast } from "@/components/ui/avisos";
import { BlocoFolha } from "@/components/ui/blocos";
import { Botao } from "@/components/ui/botao";
import { Cabecalho } from "@/components/ui/cabecalho";
import { canFinanceiroView } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { useVersaoDoMotor } from "@/lib/useConfigDoMotor";
import { cn } from "@/lib/utils";
import { extratoDaPessoa, fraseDaConta, nomeDoMesDoExtrato, PESSOAS_DO_EXTRATO, textoDoExtrato, type LancamentoDoExtrato, type PessoaDoExtrato } from "./extratoDosSocios";
import { mesSeguinte } from "./motorLucroInteligente";
import { useFinanceiro } from "./useFinanceiro";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (valor: number) => moeda.format(Math.round((valor || 0) * 100) / 100);
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diaLongo = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function fraseDoSaldoDaLinha(saldo: number) {
  if (saldo > 0.005) return `falta ${brl(saldo)}`;
  if (saldo < -0.005) return `${brl(-saldo)} a mais`;
  return "em dia";
}

export function ExtratoDosSociosPage() {
  const hoje = todayISO();
  const [pessoa, setPessoa] = useState<PessoaDoExtrato>("daniel");
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const ano = Number(mes.slice(0, 4));
  // O ano anterior vem junto: em janeiro ainda vence a 2ª parcela de dezembro.
  const financeiro = useFinanceiro(ano, { comAnoAnterior: true });
  const versaoDoMotor = useVersaoDoMotor();

  const extrato = useMemo(
    () => extratoDaPessoa({ pessoa, sales: financeiro.sales, expenses: financeiro.expenses, mes, hoje, desde: `${ano - 1}-01` }),
    // versaoDoMotor: a régua chega do servidor depois da primeira pintura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pessoa, financeiro.sales, financeiro.expenses, mes, hoje, ano, versaoDoMotor],
  );

  const porMes = useMemo(() => {
    const grupos: Array<{ mes: string; linhas: LancamentoDoExtrato[] }> = [];
    for (const linha of extrato.lancamentos) {
      const chave = linha.dia.slice(0, 7);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.mes === chave) ultimo.linhas.push(linha);
      else grupos.push({ mes: chave, linhas: [linha] });
    }
    return grupos.reverse();
  }, [extrato.lancamentos]);

  const nomeDoMes = nomeDoMesDoExtrato(mes);
  const tomDoSaldo = extrato.falta > 0.005 ? "falta" : extrato.adiantado > 0.005 ? "adiantado" : "emDia";
  const textoParaCopiar = useRef<HTMLDetailsElement>(null);

  async function copiar() {
    const texto = textoDoExtrato(extrato);
    try {
      await navigator.clipboard.writeText(texto);
      toast(`Extrato de ${extrato.nome} copiado. É só colar no WhatsApp ou no e-mail.`, { tom: "ok" });
    } catch {
      // Sem permissão de copiar: abre o texto no fim da tela para copiar à mão.
      if (textoParaCopiar.current) {
        textoParaCopiar.current.open = true;
        textoParaCopiar.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      toast("Não consegui copiar sozinho. O texto abriu no fim da tela: selecione e copie.", { tom: "atencao", duracaoMs: 7000 });
    }
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Extrato de cada um" module="fin-lucro">
      <Cabecalho
        sobrancelha="Financeiro · Lucro Inteligente"
        titulo="Extrato de cada um"
        frase="Salário de sócio e parte de médico numa conta só: o que venceu, o que foi pago e de onde veio o dinheiro, e quanto falta. É a mesma conta do Lucro Inteligente, só que sem separar."
        acoes={
          <Botao variante="primario" icone={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={copiar} disabled={financeiro.isSyncing && !financeiro.sales.length}>
            Copiar extrato
          </Botao>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="De quem é o extrato" className="flex flex-wrap gap-2">
          {PESSOAS_DO_EXTRATO.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pessoa === p.id}
              onClick={() => setPessoa(p.id)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                pessoa === p.id ? "border-musgo bg-musgo text-white" : "border-fio bg-folha text-tinta hover:border-musgo",
              )}
            >
              {p.nome}
              <span className={cn("ml-2 text-xs font-medium", pessoa === p.id ? "text-white/80" : "text-tinta-2")}>{p.papel}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2" aria-label="Mês do extrato">
          <Botao variante="fantasma" tamanho="pq" aria-label="Mês anterior" onClick={() => setMes(mesSeguinte(mes, -1))} icone={<ChevronLeft className="h-4 w-4" aria-hidden="true" />} />
          <span className="min-w-[9rem] text-center text-sm font-semibold text-tinta">
            {nomeDoMes} de {mes.slice(0, 4)}
          </span>
          <Botao
            variante="fantasma"
            tamanho="pq"
            aria-label="Mês seguinte"
            onClick={() => setMes(mesSeguinte(mes))}
            disabled={mes >= hoje.slice(0, 7)}
            icone={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
          />
        </div>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <BlocoFolha as="section" respiro aria-label="Saldo">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-tinta-2">
            {tomDoSaldo === "falta" ? `Falta pagar até ${diaCurto(extrato.ate)}` : tomDoSaldo === "adiantado" ? "Pago a mais" : "Saldo"}
          </p>
          <p className={cn("mt-1 font-serifa text-[34px] leading-tight tabular-nums", tomDoSaldo === "falta" ? "text-atencao" : "text-musgo")}>
            {tomDoSaldo === "emDia" ? "Em dia" : brl(tomDoSaldo === "falta" ? extrato.falta : extrato.adiantado)}
          </p>
          <p className="mt-2 text-sm text-tinta-2">{fraseDaConta(extrato)}</p>
        </BlocoFolha>
        <BlocoFolha as="section" respiro aria-label="Venceu no mês">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-tinta-2">Venceu em {nomeDoMes}</p>
          <p className="mt-1 font-serifa text-[28px] leading-tight tabular-nums text-tinta">{brl(extrato.doMes.devido)}</p>
          <p className="mt-2 text-sm text-tinta-2">Salário do mês e as parcelas da parte de médico que vencem nele.</p>
        </BlocoFolha>
        <BlocoFolha as="section" respiro aria-label="Pago no mês">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-tinta-2">Pago em {nomeDoMes}</p>
          <p className="mt-1 font-serifa text-[28px] leading-tight tabular-nums text-tinta">{brl(extrato.doMes.pago)}</p>
          <p className="mt-2 text-sm text-tinta-2">Tudo o que chegou a {extrato.nome === "Andrya" ? "ela" : "ele"}: transferência da clínica ou Pix de paciente na conta pessoal.</p>
        </BlocoFolha>
      </div>

      {financeiro.isSyncing && !financeiro.sales.length ? (
        <p className="text-sm text-tinta-2">Carregando os lançamentos…</p>
      ) : extrato.lancamentos.length === 0 ? (
        <BlocoFolha respiro>
          <p className="text-sm text-tinta-2">Nenhum lançamento até {diaLongo(extrato.ate)}. O Lucro Inteligente vale a partir de setembro de 2026.</p>
        </BlocoFolha>
      ) : (
        <BlocoFolha as="section" aria-label="Lançamentos" className="p-0">
          {/* Celular: uma linha por lançamento, como no app do banco; o saldo fica à vista sem rolar de lado. */}
          <ul className="md:hidden">
            {porMes.map((grupo) => (
              <li key={grupo.mes}>
                <p className="bg-saber px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-musgo">
                  {nomeDoMesDoExtrato(grupo.mes)} de {grupo.mes.slice(0, 4)}
                </p>
                <ul>
                  {[...grupo.linhas].reverse().map((linha) => (
                    <li key={`${linha.tipo}-${linha.id}`} className="flex items-start justify-between gap-3 border-b border-fio px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-tinta">
                          <span className="mr-2 font-normal tabular-nums text-tinta-2">{diaCurto(linha.dia)}</span>
                          {linha.titulo}
                        </p>
                        <p className="mt-0.5 text-xs text-tinta-2">{linha.detalhe}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("font-semibold tabular-nums", linha.tipo === "PAGO" ? "text-musgo" : "text-tinta")}>
                          {linha.tipo === "PAGO" ? `pago ${brl(linha.valor)}` : `venceu ${brl(linha.valor)}`}
                        </p>
                        <p className={cn("mt-0.5 text-xs tabular-nums", linha.saldo > 0.005 ? "text-atencao" : "text-tinta-2")}>{fraseDoSaldoDaLinha(linha.saldo)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-fio text-left text-xs font-bold uppercase tracking-[0.06em] text-tinta-2">
                  <th className="px-4 py-3">Dia</th>
                  <th className="px-4 py-3">O quê</th>
                  <th className="px-4 py-3 text-right">Venceu</th>
                  <th className="px-4 py-3 text-right">Pago</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {porMes.map((grupo) => (
                  <FragmentoDoMes key={grupo.mes} mes={grupo.mes} linhas={[...grupo.linhas].reverse()} />
                ))}
              </tbody>
            </table>
          </div>
        </BlocoFolha>
      )}

      {extrato.proximos.length ? (
        <section className="mt-8" aria-label="Próximos vencimentos">
          <h2 className="mb-3 text-xl font-bold text-tinta">Próximos</h2>
          <ul className="grid gap-2">
            {extrato.proximos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-fio py-2 text-sm">
                <span>
                  <span className="font-semibold text-tinta">{p.titulo}</span>
                  <span className="ml-2 text-tinta-2">vence {diaLongo(p.dia)}</span>
                </span>
                <span className="tabular-nums font-semibold text-tinta">{brl(p.valor)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-tinta-2">A parcela do mês que está correndo ainda cresce com as comandas até o último dia.</p>
        </section>
      ) : null}

      <p className="mt-8 max-w-[70ch] text-xs text-tinta-2">
        Como ler: o que venceu soma, o que foi pago abate, e o saldo corre. Saldo positivo é o que ainda falta pagar; negativo é o que já foi pago a mais. Os valores e
        vencimentos são os do Lucro Inteligente — o salário de sócio vence no último dia útil do mês; a parte de médico do Dr. Daniel vence metade no último dia útil do
        próprio mês e metade no do mês seguinte; a do Dr. Moisés, em três parcelas no dia 20.
      </p>

      <details ref={textoParaCopiar} className="mt-6 max-w-[70ch]">
        <summary className="cursor-pointer text-sm font-semibold text-tinta">Ver o texto que vai no WhatsApp</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-fio bg-folha p-4 font-sans text-xs leading-relaxed text-tinta">{textoDoExtrato(extrato)}</pre>
      </details>
    </AccessGate>
  );
}

function FragmentoDoMes({ mes, linhas }: { mes: string; linhas: LancamentoDoExtrato[] }) {
  return (
    <>
      <tr className="bg-saber">
        <td colSpan={5} className="px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-musgo">
          {nomeDoMesDoExtrato(mes)} de {mes.slice(0, 4)}
        </td>
      </tr>
      {linhas.map((linha) => (
        <tr key={`${linha.tipo}-${linha.id}`} className="border-b border-fio align-top">
          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-tinta-2">{diaCurto(linha.dia)}</td>
          <td className="px-4 py-3">
            <p className="font-semibold text-tinta">{linha.titulo}</p>
            <p className="mt-0.5 text-xs text-tinta-2">{linha.detalhe}</p>
          </td>
          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-tinta">{linha.tipo === "DEVIDO" ? brl(linha.valor) : ""}</td>
          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-musgo">{linha.tipo === "PAGO" ? brl(linha.valor) : ""}</td>
          <td className={cn("whitespace-nowrap px-4 py-3 text-right tabular-nums", linha.saldo > 0.005 ? "text-atencao" : "text-tinta-2")}>
            {fraseDoSaldoDaLinha(linha.saldo)}
          </td>
        </tr>
      ))}
    </>
  );
}
