// GESTÃO DO COORDENADOR DE VENDAS (08/09/2026; refeita no mesmo dia: "preciso
// que fique fácil de entender, que nem uma planilha").
//
// A tela É a planilha: as mesmas cinco abas, uma por vez, com o mesmo título e
// as mesmas colunas de cada aba. No Registro de Contatos, as linhas do CRM
// entram sozinhas (marcadas "CRM") e você pode digitar linhas à mão, como na
// planilha. O Funil soma as duas coisas, automaticamente.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { AvisoSoVe, avisarSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { loadRemoteCrmCoordenadorMes, saveRemoteCrmCoordenadorMes } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { useCrmState } from "./useCrmState";
import { CrmSyncBanner } from "./CrmSyncBanner";
import { Abas, BlocoFolha, Cabecalho, FraseDoFluxo } from "@/components/ui/fundacao";
import { CAMPO, Etiqueta, NOME_LINK } from "./comercialVisual";
import { contagem, maiuscula, porExtenso } from "./comercialFrases";
import {
  coordenadorMesVazio,
  formataPct,
  funilDeContatos,
  linhaManualComoRegistro,
  normalizaCoordenadorMes,
  origemLabels,
  origens,
  pct,
  registroDeContatos,
  type CoordenadorMes,
  type LinhaManual,
  type OrigemContato,
} from "./coordenadorVendasData";

type Aba = "registro" | "funil" | "prescricoes" | "agendamentos" | "plano";
const abas: { chave: Aba; rotulo: string }[] = [
  { chave: "registro", rotulo: "Registro de Contatos" },
  { chave: "funil", rotulo: "Funil de Contatos" },
  { chave: "prescricoes", rotulo: "PDCA Prescrições" },
  { chave: "agendamentos", rotulo: "PDCA Agendamentos" },
  { chave: "plano", rotulo: "Plano de Ação" },
];

function mesLongo(monthKey: string) {
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function diaBR(iso: string) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
}

// Aparência de planilha (08/10/2026, Papel & Musgo): continua uma grade, como o
// Estevão pediu ("que nem uma planilha"), mas nos fios da marca — cabeçalho em
// saber, rubrica 12/700, números à direita e em tabular-nums. A célula que está
// sendo digitada ganha o anel de foco por dentro (nada de amarelo).
const th = "h-10 border border-fio bg-saber px-3 py-2 text-left align-bottom text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2";
const td = "border border-fio px-3 py-1.5 text-sm font-medium leading-5 text-tinta";
const tdNum = cn(td, "text-right tabular-nums");
const input =
  "h-8 w-full rounded-controle border-0 bg-transparent px-1 font-sans text-sm font-medium text-tinta placeholder:text-tinta-2 focus:bg-folha focus:outline-none focus:shadow-[inset_0_0_0_2px_rgb(var(--foco-rgb))]";
const select =
  "h-8 w-full cursor-pointer rounded-controle border-0 bg-transparent px-0.5 font-sans text-sm font-medium text-tinta focus:bg-folha focus:outline-none focus:shadow-[inset_0_0_0_2px_rgb(var(--foco-rgb))]";
/** Título de cada aba da planilha e a linha que explica a aba. */
const tituloDaAba = "text-base font-bold leading-6 text-tinta";
const notaDaAba = "mb-4 mt-1 text-[13px] font-medium leading-5 text-tinta-2";
/** Botão de texto da planilha ("Adicionar linha à mão"). */
const botaoDeLinha =
  "inline-flex items-center gap-1 rounded-sm text-sm font-bold text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";
const botaoExcluir =
  "inline-grid h-8 w-8 place-items-center rounded-controle text-tinta-2 hover:bg-erro-claro hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco";

export function CrmCoordenadorPage() {
  const { pessoa, session, isPreview } = useAuth();
  const usaRemoto = Boolean(pessoa && session && !isPreview);
  const { state, syncFailed, syncErrorDetail, retrySync } = useCrmState({ modulo: "crm" });
  // "Só vê" (29/09/2026, auditoria B9): toda digitação desta tela passa por grava().
  const telaCrm = useNivelDaTela("crm");
  const hoje = todayISO();
  const [monthKey, setMonthKey] = useState(hoje.slice(0, 7));
  const [aba, setAba] = useState<Aba>("registro");
  const financeiro = useFinanceiro(Number(monthKey.slice(0, 4)));

  // ---- dados digitados do mês (registro manual + PDCA + plano) ----
  const [mes, setMes] = useState<CoordenadorMes>(coordenadorMesVazio);
  const mesQuery = useQuery({ queryKey: ["crm-coordenador-mes", monthKey], queryFn: () => loadRemoteCrmCoordenadorMes(monthKey), enabled: usaRemoto });
  const carregado = useRef("");
  useEffect(() => {
    if (mesQuery.isFetching) return;
    const chave = `${monthKey}:${mesQuery.dataUpdatedAt}`;
    if (carregado.current === chave) return;
    carregado.current = chave;
    setMes(normalizaCoordenadorMes(mesQuery.data ?? coordenadorMesVazio));
  }, [mesQuery.data, mesQuery.isFetching, mesQuery.dataUpdatedAt, monthKey]);
  const [salvo, setSalvo] = useState<"" | "salvando" | "ok" | "erro">("");
  const timer = useRef<number | null>(null);
  function grava(proximo: CoordenadorMes) {
    if (!telaCrm.podeEditar) return avisarSoVe();
    setMes(proximo);
    if (!usaRemoto) return;
    setSalvo("salvando");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveRemoteCrmCoordenadorMes(monthKey, proximo as unknown as Record<string, unknown>, session?.user?.id ?? null)
        .then(() => setSalvo("ok"))
        .catch(() => setSalvo("erro"));
    }, 700);
  }

  const doCrm = useMemo(() => registroDeContatos(state, financeiro.sales, monthKey), [state, financeiro.sales, monthKey]);
  const registro = useMemo(() => [...doCrm, ...mes.registroManual.map(linhaManualComoRegistro)].sort((a, b) => b.data.localeCompare(a.data)), [doCrm, mes.registroManual]);
  const funil = useMemo(() => funilDeContatos(registro), [registro]);

  function novaLinha() {
    const linha: LinhaManual = { id: `man-${Date.now().toString(36)}`, data: hoje, nome: "", origem: "REDES_OUTROS", agendou: false, compareceu: false, fechou: false, observacoes: "" };
    grava({ ...mes, registroManual: [linha, ...mes.registroManual] });
  }
  function mudaLinha(id: string, mudanca: Partial<LinhaManual>) {
    grava({ ...mes, registroManual: mes.registroManual.map((l) => (l.id === id ? { ...l, ...mudanca } : l)) });
  }
  const totalPresc = mes.prescricoes.reduce((s, p) => ({ prescritos: s.prescritos + p.prescritos, fechados: s.fechados + p.fechados }), { prescritos: 0, fechados: 0 });

  // CABEÇALHO (08/10/2026, redesenho etapa 3): o nome da planilha virou o
  // cabeçalho da tela, com o funil do mês numa frase; as cinco abas da planilha
  // ficam logo abaixo, na forma única de abas do app.
  const total = funil.find((linha) => linha.origem === "TOTAL");
  const fraseDoTopo =
    !total || total.mensagens === 0 ? (
      <>
        <strong>Nenhum contato</strong> registrado em {mesLongo(monthKey)} ainda.
      </>
    ) : (
      <>
        <strong>{maiuscula(contagem(total.mensagens, "contato"))}</strong> em {mesLongo(monthKey)}:{" "}
        {porExtenso(total.agendaram)} {total.agendaram === 1 ? "agendou" : "agendaram"} consulta e{" "}
        {porExtenso(total.fecharam)} {total.fecharam === 1 ? "fechou" : "fecharam"} tratamento.
      </>
    );

  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Gestão do Coordenador de Vendas" module="crm">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 font-sans max-md:gap-4">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Comercial · Coordenação"
          titulo="Planilha de Gestão — Coordenador de Vendas"
          frase={fraseDoTopo}
          acoes={
            <div className="flex flex-wrap items-center gap-3">
              <span aria-live="polite" className="text-[13px] font-medium text-tinta-2">
                {salvo === "salvando" ? "salvando…" : salvo === "ok" ? "salvo" : salvo === "erro" ? "não sincronizou — confira a internet" : ""}
              </span>
              <label className="flex items-center gap-2 text-[13px] font-bold text-tinta">
                Mês
                <input type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value)} className={cn(CAMPO, "w-44")} aria-label="Mês de referência" />
              </label>
            </div>
          }
          rodape={
            <FraseDoFluxo>
              Mês de referência: <strong className="font-bold text-tinta">{mesLongo(monthKey)}</strong> · as linhas marcadas{" "}
              <Etiqueta tom="ok">CRM</Etiqueta> entram sozinhas do{" "}
              <Link to="/crm/vendas" className="font-bold text-musgo underline underline-offset-[3px]">Kanban</Link>; as outras você digita como na planilha.
            </FraseDoFluxo>
          }
        />
        <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={() => void retrySync()} />
        <AvisoSoVe soVe={telaCrm.soVe} />

        {/* A planilha: as mesmas cinco abas, uma por vez */}
        <div className="grid gap-4">
          <Abas
            rotulo="Abas da planilha"
            valor={aba}
            onMudar={(id) => setAba(id as Aba)}
            idDoPainel={() => "planilha-do-coordenador"}
            itens={abas.map((item) => ({ id: item.chave, rotulo: item.rotulo, contador: item.chave === "registro" ? registro.length : undefined }))}
          />

          <BlocoFolha id="planilha-do-coordenador" role="tabpanel" className="overflow-x-auto p-5 max-md:p-4">
            {aba === "registro" ? (
              <>
                <h2 className={tituloDaAba}>Registro de contatos — nome e data de cada paciente</h2>
                <p className={notaDaAba}>Lançar aqui CADA paciente que entrou em contato. As colunas Agendou / Compareceu / Fechou alimentam o Funil.</p>
                <table className="w-full min-w-[1080px] border-collapse">
                  <thead>
                    <tr>
                      <th className={cn(th, "w-28")}>Data do contato</th>
                      <th className={th}>Nome do paciente</th>
                      <th className={cn(th, "w-60")}>Origem</th>
                      <th className={cn(th, "w-28")}>Agendou consulta?</th>
                      <th className={cn(th, "w-28")}>Compareceu?</th>
                      <th className={cn(th, "w-32")}>Fechou tratamento?</th>
                      <th className={th}>Observações</th>
                      <th className={cn(th, "w-10")} />
                    </tr>
                  </thead>
                  <tbody>
                    {registro.map((linha) => {
                      const manual = mes.registroManual.find((m) => `manual:${m.id}` === linha.dealId);
                      if (manual) {
                        return (
                          <tr key={linha.dealId}>
                            <td className={td}><input type="date" value={manual.data} onChange={(e) => mudaLinha(manual.id, { data: e.target.value })} className={input} aria-label="Data do contato" /></td>
                            <td className={td}><input value={manual.nome} onChange={(e) => mudaLinha(manual.id, { nome: e.target.value })} className={input} placeholder="Nome do paciente" aria-label="Nome do paciente" /></td>
                            <td className={td}>
                              <select value={manual.origem} onChange={(e) => mudaLinha(manual.id, { origem: e.target.value as OrigemContato })} className={select} aria-label="Origem">
                                {origens.map((o) => <option key={o} value={o}>{origemLabels[o]}</option>)}
                              </select>
                            </td>
                            {(["agendou", "compareceu", "fechou"] as const).map((campo) => (
                              <td key={campo} className={td}>
                                <select value={manual[campo] ? "Sim" : "Não"} onChange={(e) => mudaLinha(manual.id, { [campo]: e.target.value === "Sim" })} className={select} aria-label={campo}>
                                  <option>Não</option>
                                  <option>Sim</option>
                                </select>
                              </td>
                            ))}
                            <td className={td}><input value={manual.observacoes} onChange={(e) => mudaLinha(manual.id, { observacoes: e.target.value })} className={input} placeholder="Observações" aria-label="Observações" /></td>
                            <td className={cn(td, "text-center")}>
                              <button type="button" onClick={() => grava({ ...mes, registroManual: mes.registroManual.filter((m) => m.id !== manual.id) })} className={botaoExcluir} aria-label="Excluir linha"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={linha.dealId}>
                          <td className={cn(td, "whitespace-nowrap tabular-nums")}>{diaBR(linha.data)}</td>
                          <td className={cn(td, "whitespace-nowrap")}>
                            <Link to={`/crm/contatos/${linha.contactId}`} className={NOME_LINK}>{linha.nome}</Link>
                            <Etiqueta tom="ok" className="ml-2" title="Linha do CRM — muda pela etapa do card no Kanban">CRM</Etiqueta>
                          </td>
                          <td className={td}>{origemLabels[linha.origem]}</td>
                          <td className={td}>{linha.agendou ? "Sim" : "Não"}</td>
                          <td className={td}>{linha.compareceu ? "Sim" : "Não"}</td>
                          <td className={td}>{linha.fechou ? "Sim" : "Não"}</td>
                          <td className={cn(td, "max-w-[280px] truncate")} title={linha.observacoes}>{linha.observacoes}</td>
                          <td className={td} />
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={8} className="border border-fio px-3 py-2">
                        <button type="button" onClick={novaLinha} className={botaoDeLinha}>
                          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar linha à mão
                        </button>
                        <span className="ml-3 text-xs font-medium text-tinta-2">Para uma linha que já venha ligada ao paciente, cadastre o lead no Kanban.</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : null}

            {aba === "funil" ? (
              <>
                <h2 className={tituloDaAba}>Funil de contatos</h2>
                <p className={notaDaAba}>Preenchimento AUTOMÁTICO a partir da aba Registro de Contatos ({mesLongo(monthKey)}).</p>
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Origem do contato</th>
                      <th className={cn(th, "text-right")}>Mensagens recebidas</th>
                      <th className={cn(th, "text-right")}>Agendaram consulta</th>
                      <th className={cn(th, "text-right")}>% Agendamento</th>
                      <th className={cn(th, "text-right")}>Compareceram</th>
                      <th className={cn(th, "text-right")}>Fecharam tratamento</th>
                      <th className={cn(th, "text-right")}>% Fechamento (sobre agendados)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funil.map((linha) => (
                      <tr key={linha.origem} className={cn(linha.origem === "TOTAL" && "bg-saber font-bold")}>
                        <td className={td}>{linha.origem === "TOTAL" ? "TOTAL" : origemLabels[linha.origem as OrigemContato]}</td>
                        <td className={tdNum}>{linha.mensagens}</td>
                        <td className={tdNum}>{linha.agendaram}</td>
                        <td className={tdNum}>{formataPct(linha.pctAgendamento)}</td>
                        <td className={tdNum}>{linha.compareceram}</td>
                        <td className={tdNum}>{linha.fecharam}</td>
                        <td className={tdNum}>{formataPct(linha.pctFechamento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}

            {aba === "prescricoes" ? (
              <>
                <h2 className={tituloDaAba}>PDCA de prescrições — tratamentos prescritos × fechados</h2>
                <p className={notaDaAba}>Registrar cada profissional prescritor. A % de conversão calcula sozinha.</p>
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Profissional</th>
                      <th className={cn(th, "w-40 text-right")}>Tratamentos prescritos</th>
                      <th className={cn(th, "w-40 text-right")}>Tratamentos fechados</th>
                      <th className={cn(th, "w-28 text-right")}>% Conversão</th>
                      <th className={th}>Observações / motivo dos não fechados</th>
                      <th className={cn(th, "w-10")} />
                    </tr>
                  </thead>
                  <tbody>
                    {mes.prescricoes.map((p, i) => (
                      <tr key={i}>
                        <td className={td}><input value={p.profissional} onChange={(e) => grava({ ...mes, prescricoes: mes.prescricoes.map((x, k) => (k === i ? { ...x, profissional: e.target.value } : x)) })} className={input} placeholder="Dr. Daniel" aria-label="Profissional" /></td>
                        <td className={td}><input inputMode="numeric" value={String(p.prescritos)} onChange={(e) => grava({ ...mes, prescricoes: mes.prescricoes.map((x, k) => (k === i ? { ...x, prescritos: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)) })} className={cn(input, "text-right")} aria-label="Prescritos" /></td>
                        <td className={td}><input inputMode="numeric" value={String(p.fechados)} onChange={(e) => grava({ ...mes, prescricoes: mes.prescricoes.map((x, k) => (k === i ? { ...x, fechados: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)) })} className={cn(input, "text-right")} aria-label="Fechados" /></td>
                        <td className={tdNum}>{formataPct(pct(p.fechados, p.prescritos))}</td>
                        <td className={td}><input value={p.observacoes} onChange={(e) => grava({ ...mes, prescricoes: mes.prescricoes.map((x, k) => (k === i ? { ...x, observacoes: e.target.value } : x)) })} className={input} aria-label="Observações" /></td>
                        <td className={cn(td, "text-center")}><button type="button" onClick={() => grava({ ...mes, prescricoes: mes.prescricoes.filter((_, k) => k !== i) })} className={botaoExcluir} aria-label="Excluir linha"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                      </tr>
                    ))}
                    <tr className="bg-saber font-bold">
                      <td className={td}>TOTAL</td>
                      <td className={tdNum}>{totalPresc.prescritos}</td>
                      <td className={tdNum}>{totalPresc.fechados}</td>
                      <td className={tdNum}>{formataPct(pct(totalPresc.fechados, totalPresc.prescritos))}</td>
                      <td className={td} colSpan={2}>
                        <button type="button" onClick={() => grava({ ...mes, prescricoes: [...mes.prescricoes, { profissional: "", prescritos: 0, fechados: 0, observacoes: "" }] })} className={botaoDeLinha}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar profissional</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : null}

            {aba === "agendamentos" ? (
              <>
                <h2 className={tituloDaAba}>PDCA de agendamentos — coordenador e time</h2>
                <p className={notaDaAba}>Uma linha por membro do time de agendamento. A % da meta calcula sozinha.</p>
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Colaborador</th>
                      <th className={cn(th, "w-40 text-right")}>Meta de agendamentos</th>
                      <th className={cn(th, "w-44 text-right")}>Agendamentos realizados</th>
                      <th className={cn(th, "w-28 text-right")}>% da meta</th>
                      <th className={th}>Ação corretiva / próxima ação (PDCA)</th>
                      <th className={cn(th, "w-10")} />
                    </tr>
                  </thead>
                  <tbody>
                    {mes.agendamentos.map((a, i) => (
                      <tr key={i}>
                        <td className={td}><input value={a.colaborador} onChange={(e) => grava({ ...mes, agendamentos: mes.agendamentos.map((x, k) => (k === i ? { ...x, colaborador: e.target.value } : x)) })} className={input} placeholder="Nome" aria-label="Colaborador" /></td>
                        <td className={td}><input inputMode="numeric" value={String(a.meta)} onChange={(e) => grava({ ...mes, agendamentos: mes.agendamentos.map((x, k) => (k === i ? { ...x, meta: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)) })} className={cn(input, "text-right")} aria-label="Meta" /></td>
                        <td className={td}><input inputMode="numeric" value={String(a.realizados)} onChange={(e) => grava({ ...mes, agendamentos: mes.agendamentos.map((x, k) => (k === i ? { ...x, realizados: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)) })} className={cn(input, "text-right")} aria-label="Realizados" /></td>
                        <td className={cn(tdNum, a.meta && a.realizados >= a.meta && "text-ok")}>{formataPct(pct(a.realizados, a.meta))}</td>
                        <td className={td}><input value={a.acao} onChange={(e) => grava({ ...mes, agendamentos: mes.agendamentos.map((x, k) => (k === i ? { ...x, acao: e.target.value } : x)) })} className={input} aria-label="Ação corretiva" /></td>
                        <td className={cn(td, "text-center")}><button type="button" onClick={() => grava({ ...mes, agendamentos: mes.agendamentos.filter((_, k) => k !== i) })} className={botaoExcluir} aria-label="Excluir linha"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={6} className="border border-fio px-3 py-2">
                        <button type="button" onClick={() => grava({ ...mes, agendamentos: [...mes.agendamentos, { colaborador: "", meta: 0, realizados: 0, acao: "" }] })} className={botaoDeLinha}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar colaborador</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : null}

            {aba === "plano" ? (
              <>
                <h2 className={tituloDaAba}>Plano de ação do mês (PDCA)</h2>
                <p className={notaDaAba}>O Funil é a régua: o CHECK compara os números deste mês com o anterior.</p>
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr>
                      <th className={cn(th, "w-48")}>Etapa</th>
                      <th className={th}>Descrição (preencher)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["plan", "PLAN (Planejar)"],
                        ["do", "DO (Executar)"],
                        ["check", "CHECK (Verificar)"],
                        ["act", "ACT (Agir)"],
                      ] as const
                    ).map(([chave, rotulo]) => (
                      <tr key={chave}>
                        <td className={cn(td, "font-bold")}>{rotulo}</td>
                        <td className={cn(td, "p-0")}>
                          <textarea value={mes.planoDeAcao[chave]} onChange={(e) => grava({ ...mes, planoDeAcao: { ...mes.planoDeAcao, [chave]: e.target.value } })} className="min-h-[72px] w-full resize-y rounded-controle border-0 bg-transparent px-3 py-2 font-sans text-sm font-medium text-tinta focus:bg-folha focus:outline-none focus:shadow-[inset_0_0_0_2px_rgb(var(--foco-rgb))]" aria-label={rotulo} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </BlocoFolha>
        </div>
      </div>
    </AccessGate>
  );
}
