// GESTÃO DO COORDENADOR DE VENDAS (08/09/2026) — a planilha do Lucas dentro do
// app. Aba 1 (Registro de Contatos) e aba 2 (Funil) saem do CRM sozinhas: cada
// lead/negociação do mês é uma linha, e o funil se soma por origem. As abas de
// PDCA (Prescrições, Agendamentos) e o Plano de Ação são digitadas e ficam
// guardadas por mês.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Filter, Plus, Trash2, XCircle } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { loadRemoteCrmCoordenadorMes, saveRemoteCrmCoordenadorMes } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { useCrmState } from "./useCrmState";
import { CrmSyncBanner } from "./CrmSyncBanner";
import {
  coordenadorMesVazio,
  formataPct,
  funilDeContatos,
  normalizaCoordenadorMes,
  origemLabels,
  origens,
  pct,
  registroDeContatos,
  type CoordenadorMes,
  type OrigemContato,
} from "./coordenadorVendasData";

function mesLongo(monthKey: string) {
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function diaCurto(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
function SimNao({ valor }: { valor: boolean }) {
  return valor ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Sim</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-papel px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"><XCircle className="h-3 w-3" aria-hidden="true" /> Não</span>
  );
}

const celula = "px-2 py-1.5 text-right tabular-nums";

export function CrmCoordenadorPage() {
  const { pessoa, session, isPreview } = useAuth();
  const usaRemoto = Boolean(pessoa && session && !isPreview);
  const { state, syncMode, syncFailed, syncErrorDetail, retrySync } = useCrmState();
  const hoje = todayISO();
  const [monthKey, setMonthKey] = useState(hoje.slice(0, 7));
  const financeiro = useFinanceiro(Number(monthKey.slice(0, 4)));
  const [origemFiltro, setOrigemFiltro] = useState<OrigemContato | "TODAS">("TODAS");
  const [busca, setBusca] = useState("");

  const registro = useMemo(() => registroDeContatos(state, financeiro.sales, monthKey), [state, financeiro.sales, monthKey]);
  const funil = useMemo(() => funilDeContatos(registro), [registro]);
  const linhasVisiveis = registro.filter((l) => (origemFiltro === "TODAS" || l.origem === origemFiltro) && (!busca.trim() || l.nome.toLowerCase().includes(busca.trim().toLowerCase())));

  // ---- Abas 3–5, por mês (local até sincronizar) ----
  const [mes, setMes] = useState<CoordenadorMes>(coordenadorMesVazio);
  const carregadoPara = useRef("");
  const mesQuery = useQuery({
    queryKey: ["crm-coordenador-mes", monthKey],
    queryFn: () => loadRemoteCrmCoordenadorMes(monthKey),
    enabled: usaRemoto,
  });
  useEffect(() => {
    if (carregadoPara.current === monthKey && mesQuery.data === undefined) return;
    if (mesQuery.isFetching) return;
    carregadoPara.current = monthKey;
    setMes(normalizaCoordenadorMes(mesQuery.data ?? coordenadorMesVazio));
  }, [mesQuery.data, mesQuery.isFetching, monthKey]);
  const [salvando, setSalvando] = useState<"" | "ok" | "erro">("");
  const salvarTimer = useRef<number | null>(null);
  function atualizaMes(proximo: CoordenadorMes) {
    setMes(proximo);
    if (!usaRemoto) return;
    if (salvarTimer.current) window.clearTimeout(salvarTimer.current);
    salvarTimer.current = window.setTimeout(() => {
      saveRemoteCrmCoordenadorMes(monthKey, proximo as unknown as Record<string, unknown>, session?.user?.id ?? null)
        .then(() => setSalvando("ok"))
        .catch((erro) => {
          console.warn("PDCA do coordenador não sincronizou.", erro);
          setSalvando("erro");
        });
    }, 800);
  }

  const totalPrescricoes = mes.prescricoes.reduce((s, p) => ({ prescritos: s.prescritos + p.prescritos, fechados: s.fechados + p.fechados }), { prescritos: 0, fechados: 0 });

  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Gestão do Coordenador de Vendas" module="crm">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={() => void retrySync()} />
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">CRM Bratan</Badge>
                <Badge variant="muted">{syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Gestão do Coordenador de Vendas
                <InfoTip title="A planilha, sem digitar">
                  As cinco abas da planilha estão aqui. O <strong>Registro de Contatos</strong> e o <strong>Funil</strong> saem do CRM: cada
                  lead ou negociação criada no mês é uma linha — a origem vem do canal do contato (indicação, paciente que já tinha
                  comanda = fidelizado, o resto = redes/páginas/outros) e &quot;agendou / compareceu / fechou&quot; vem da etapa em que o card
                  está no Kanban. O funil soma sozinho, com as mesmas fórmulas da planilha. PDCA de Prescrições, PDCA de Agendamentos e o
                  Plano de Ação são digitados e ficam guardados por mês.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Mês de referência: <strong className="text-brand-tinta">{mesLongo(monthKey)}</strong>. Para uma linha nova no registro, cadastre o lead
                no <Link to="/crm/vendas" className="font-semibold text-brand-oliva underline underline-offset-2">Kanban</Link> — ela aparece aqui na hora.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value)} className="w-44" aria-label="Mês de referência" />
            </div>
          </div>
        </motion.section>

        {/* ABA 2 — FUNIL (em cima, porque é a resposta) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              Funil de Contatos · {mesLongo(monthKey)}
              <InfoTip title="Fórmulas">
                Mensagens recebidas = linhas do registro por origem. % Agendamento = agendaram ÷ mensagens. % Fechamento = fecharam ÷ agendaram
                (sobre agendados, como na planilha). Sem denominador, a célula fica vazia.
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs uppercase text-brand-oliva">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Origem do contato</th>
                    <th className={celula}>Mensagens recebidas</th>
                    <th className={celula}>Agendaram consulta</th>
                    <th className={celula}>% Agendamento</th>
                    <th className={celula}>Compareceram</th>
                    <th className={celula}>Fecharam tratamento</th>
                    <th className={celula}>% Fechamento (sobre agendados)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-oliva/10">
                  {funil.map((linha) => (
                    <tr key={linha.origem} className={cn(linha.origem === "TOTAL" && "bg-brand-creme/50 font-bold text-brand-tinta")}>
                      <td className="px-2 py-2">
                        {linha.origem === "TOTAL" ? (
                          "TOTAL"
                        ) : (
                          <button type="button" className="text-left hover:underline" onClick={() => setOrigemFiltro(origemFiltro === linha.origem ? "TODAS" : (linha.origem as OrigemContato))}>
                            {origemLabels[linha.origem as OrigemContato]}
                          </button>
                        )}
                      </td>
                      <td className={celula}>{linha.mensagens}</td>
                      <td className={celula}>{linha.agendaram}</td>
                      <td className={celula}>{formataPct(linha.pctAgendamento)}</td>
                      <td className={celula}>{linha.compareceram}</td>
                      <td className={celula}>{linha.fecharam}</td>
                      <td className={cn(celula, linha.origem === "TOTAL" && "text-brand-musgo")}>{formataPct(linha.pctFechamento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ABA 1 — REGISTRO */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg">Registro de Contatos · {registro.length} no mês</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  {(["TODAS", ...origens] as const).map((origem) => (
                    <Button key={origem} type="button" size="sm" variant={origemFiltro === origem ? "default" : "outline"} onClick={() => setOrigemFiltro(origem)}>
                      {origem === "TODAS" ? "Todas" : origemLabels[origem].split(" (")[0].split(" /")[0]}
                    </Button>
                  ))}
                </div>
                <label className="relative">
                  <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(event) => setBusca(event.target.value)} className="h-9 w-56 pl-8" placeholder="Buscar nome" />
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="text-xs uppercase text-brand-oliva">
                  <tr>
                    <th className="px-2 py-1.5">Data do contato</th>
                    <th className="px-2 py-1.5">Nome do paciente</th>
                    <th className="px-2 py-1.5">Origem</th>
                    <th className="px-2 py-1.5">Agendou consulta?</th>
                    <th className="px-2 py-1.5">Compareceu?</th>
                    <th className="px-2 py-1.5">Fechou tratamento?</th>
                    <th className="px-2 py-1.5">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-oliva/10">
                  {linhasVisiveis.length ? (
                    linhasVisiveis.map((linha) => (
                      <tr key={linha.dealId}>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums">{diaCurto(linha.data)}</td>
                        <td className="px-2 py-2 font-semibold text-brand-tinta">
                          <Link to={`/crm/contatos/${linha.contactId}`} className="hover:underline">{linha.nome}</Link>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {origemLabels[linha.origem]}
                          {linha.canal !== "Não informado" && linha.origem !== "INDICACAO" ? <span className="block text-[11px] text-muted-foreground">{linha.canal}</span> : null}
                        </td>
                        <td className="px-2 py-2"><SimNao valor={linha.agendou} /></td>
                        <td className="px-2 py-2"><SimNao valor={linha.compareceu} /></td>
                        <td className="px-2 py-2"><SimNao valor={linha.fechou} /></td>
                        <td className="max-w-[320px] truncate px-2 py-2 text-xs text-muted-foreground" title={linha.observacoes}>{linha.observacoes || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                        {registro.length ? "Nenhum contato com esse filtro." : "Nenhum lead ou negociação criada neste mês. Cadastre pelo Kanban (Novo lead / Registrar fechamento)."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ABA 3 — PDCA PRESCRIÇÕES */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                PDCA de Prescrições
                <InfoTip title="Como preencher">Uma linha por profissional prescritor: quantos tratamentos prescreveu no mês, quantos fecharam, e o motivo dos que não fecharam. A % de conversão calcula sozinha.</InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <div className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_auto] gap-1 text-[11px] font-semibold uppercase text-brand-oliva">
                <span>Profissional</span><span className="text-right">Prescritos</span><span className="text-right">Fechados</span><span className="text-right">% Conv.</span><span />
              </div>
              {mes.prescricoes.map((linha, i) => (
                <div key={i} className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_auto] items-center gap-1">
                  <Input value={linha.profissional} onChange={(e) => atualizaMes({ ...mes, prescricoes: mes.prescricoes.map((p, k) => (k === i ? { ...p, profissional: e.target.value } : p)) })} className="h-9" placeholder="Dr. Daniel" />
                  <Input inputMode="numeric" value={String(linha.prescritos)} onChange={(e) => atualizaMes({ ...mes, prescricoes: mes.prescricoes.map((p, k) => (k === i ? { ...p, prescritos: Number(e.target.value.replace(/\D/g, "")) || 0 } : p)) })} className="h-9 text-right" />
                  <Input inputMode="numeric" value={String(linha.fechados)} onChange={(e) => atualizaMes({ ...mes, prescricoes: mes.prescricoes.map((p, k) => (k === i ? { ...p, fechados: Number(e.target.value.replace(/\D/g, "")) || 0 } : p)) })} className="h-9 text-right" />
                  <span className="text-right text-sm font-semibold tabular-nums text-brand-musgo">{formataPct(pct(linha.fechados, linha.prescritos))}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover linha" onClick={() => atualizaMes({ ...mes, prescricoes: mes.prescricoes.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                  <Input value={linha.observacoes} onChange={(e) => atualizaMes({ ...mes, prescricoes: mes.prescricoes.map((p, k) => (k === i ? { ...p, observacoes: e.target.value } : p)) })} className="col-span-5 h-9 text-xs" placeholder="Observações / motivo dos não fechados" />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={() => atualizaMes({ ...mes, prescricoes: [...mes.prescricoes, { profissional: "", prescritos: 0, fechados: 0, observacoes: "" }] })}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Profissional
                </Button>
                <p className="text-sm font-bold text-brand-tinta">
                  TOTAL {totalPrescricoes.prescritos} · {totalPrescricoes.fechados} · <span className="text-brand-musgo">{formataPct(pct(totalPrescricoes.fechados, totalPrescricoes.prescritos))}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ABA 4 — PDCA AGENDAMENTOS */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                PDCA de Agendamentos
                <InfoTip title="Como preencher">Uma linha por pessoa do time de agendamento: meta de agendamentos do mês, quantos realizou e a ação corretiva (PDCA). A % da meta calcula sozinha.</InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <div className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_auto] gap-1 text-[11px] font-semibold uppercase text-brand-oliva">
                <span>Colaborador</span><span className="text-right">Meta</span><span className="text-right">Realizados</span><span className="text-right">% Meta</span><span />
              </div>
              {mes.agendamentos.map((linha, i) => (
                <div key={i} className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_auto] items-center gap-1">
                  <Input value={linha.colaborador} onChange={(e) => atualizaMes({ ...mes, agendamentos: mes.agendamentos.map((a, k) => (k === i ? { ...a, colaborador: e.target.value } : a)) })} className="h-9" placeholder="Nome" />
                  <Input inputMode="numeric" value={String(linha.meta)} onChange={(e) => atualizaMes({ ...mes, agendamentos: mes.agendamentos.map((a, k) => (k === i ? { ...a, meta: Number(e.target.value.replace(/\D/g, "")) || 0 } : a)) })} className="h-9 text-right" />
                  <Input inputMode="numeric" value={String(linha.realizados)} onChange={(e) => atualizaMes({ ...mes, agendamentos: mes.agendamentos.map((a, k) => (k === i ? { ...a, realizados: Number(e.target.value.replace(/\D/g, "")) || 0 } : a)) })} className="h-9 text-right" />
                  <span className={cn("text-right text-sm font-semibold tabular-nums", linha.meta && linha.realizados >= linha.meta ? "text-emerald-700" : "text-brand-musgo")}>{formataPct(pct(linha.realizados, linha.meta))}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover linha" onClick={() => atualizaMes({ ...mes, agendamentos: mes.agendamentos.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                  <Input value={linha.acao} onChange={(e) => atualizaMes({ ...mes, agendamentos: mes.agendamentos.map((a, k) => (k === i ? { ...a, acao: e.target.value } : a)) })} className="col-span-5 h-9 text-xs" placeholder="Ação corretiva / próxima ação (PDCA)" />
                </div>
              ))}
              {!mes.agendamentos.length ? <p className="text-xs text-muted-foreground">Nenhum colaborador ainda — adicione o time de agendamento.</p> : null}
              <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => atualizaMes({ ...mes, agendamentos: [...mes.agendamentos, { colaborador: "", meta: 0, realizados: 0, acao: "" }] })}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Colaborador
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ABA 5 — PLANO DE AÇÃO */}
        <Card className="border-brand-dourado/40 bg-brand-creme/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-brand-musgo" aria-hidden="true" /> Plano de Ação do mês (PDCA)
              {salvando === "ok" ? <span className="text-xs font-normal text-emerald-700">salvo</span> : salvando === "erro" ? <span className="text-xs font-normal text-red-700">não sincronizou — confira a internet</span> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["plan", "PLAN (Planejar)", "O que vamos fazer diferente este mês?"],
                ["do", "DO (Executar)", "O que foi executado?"],
                ["check", "CHECK (Verificar)", "Os números mudaram? O funil acima é a régua."],
                ["act", "ACT (Agir)", "O que vira padrão e o que se corrige?"],
              ] as const
            ).map(([chave, rotulo, dica]) => (
              <label key={chave} className="grid gap-1">
                <span className="text-xs font-bold uppercase tracking-wide text-brand-oliva">{rotulo}</span>
                <textarea
                  value={mes.planoDeAcao[chave]}
                  onChange={(event) => atualizaMes({ ...mes, planoDeAcao: { ...mes.planoDeAcao, [chave]: event.target.value } })}
                  placeholder={dica}
                  className="min-h-[88px] rounded-md border border-input bg-white/80 px-3 py-2 text-sm"
                />
              </label>
            ))}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
