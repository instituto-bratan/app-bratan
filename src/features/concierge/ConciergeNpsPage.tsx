// NPS DA CONCIERGE — v2 (21/08/2026, segunda rodada do Lucas: "ainda está muito
// difícil de entender, preciso que deixe mais fácil ainda, e tudo conectado").
//
// A mudança de desenho: a Aline NÃO monta lista — o app monta. Quem passou na
// clínica está nas comandas; a fila mostra quem veio e ainda não recebeu o
// contato. Cada linha tem o botão do WhatsApp (mensagem pronta) e as duas
// carinhas: um toque registra. O resto da tela (mês, dores, PDCA) fica dobrado
// até o dia 5 — no dia a dia ela só vê a fila e as pendências.
//
// PAPEL & MUSGO (08/10/2026, redesenho etapa 4): um cabeçalho só, com a fila
// explicada em frase ("Quatro pessoas para contatar…"); a fila e as
// reclamações sem resolução moram em folhas (é onde se decide); o placar do mês
// vira a faixa "para saber"; os contatos do mês ficam no saber. "Foi bem" é a
// decisão na linha (musgo suave) e "Reclamou" fica na ponta, em vermelho de
// texto, longe dela. Sem vidro, sem emoji, sem verde/rosa genéricos.
// O que a tela FAZ não mudou: mesma fila, mesmos registros, mesma impressão do
// dia 5 e a mesma permissão (concierge-nps).
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ChevronDown, Frown, MessageCircle, Printer, Smile } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, FraseDoFluxo, botaoClasses } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canSeeModule, canEditModule } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  deleteRemoteNpsContato,
  getRemoteNpsMes,
  listRemoteNpsContatos,
  listRemoteNpsRespostas,
  upsertRemoteNpsContato,
  upsertRemoteNpsMes,
} from "@/lib/remoteData";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { PatientPicker, type PatientPickerValue } from "@/features/crm/PatientPicker";
import { useCrmState } from "@/features/crm/useCrmState";
import { CAMPO, Etiqueta, Indicadores, classeDaEscolha } from "@/features/crm/comercialVisual";
import { AvisoDaTela, Campo, TituloDoBloco } from "@/features/financeiro/pecasDiaPagar";
import { fraseDoNps, percentualBR } from "@/features/pacientes/frasesPacientes";
import {
  canalLabels,
  filaDeContatos,
  limparListaTop5,
  linkWhatsApp,
  npsMesVazio,
  problemaDoContato,
  resumoDoMes,
  totemDoMes,
  type DorOuElogio,
  type ItemDaFila,
  type NpsCanal,
  type NpsContato,
  type NpsMes,
  type NpsResultado,
} from "./npsData";
import { confirmar, toast } from "@/components/ui/avisos";

const contatosKey = "app-bratan-concierge-nps-contatos";
const mesKey = (monthKey: string) => `app-bratan-concierge-nps-mes-${monthKey}`;
const diaBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const novoId = () => `npsc-${crypto.randomUUID()}`;

/** O título de bloco que abre e fecha (o botão mora dentro do h2, não o contrário). */
const TITULO_QUE_ABRE =
  "flex w-full items-center gap-2 rounded-controle text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";

function quandoVeio(diasDesde: number) {
  if (diasDesde === 0) return "veio HOJE";
  if (diasDesde === 1) return "veio ontem";
  return `veio há ${diasDesde} dias`;
}

export function ConciergeNpsPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const podeEditar = canEditModule(pessoa, "concierge-nps");
  const queryClient = useQueryClient();
  const { state: crmState } = useCrmState();
  const financeiro = useFinanceiro(Number(todayISO().slice(0, 4)));
  const hoje = todayISO();
  const [monthKey, setMonthKey] = useState(hoje.slice(0, 7));
  const [feedback, setFeedback] = useState("");
  const [erro, setErro] = useState("");

  // ---------------- dados ----------------
  const contatosQuery = useQuery({ queryKey: ["concierge-nps-contatos"], queryFn: listRemoteNpsContatos, enabled: useRemote, staleTime: 30_000 });
  const mesQuery = useQuery({ queryKey: ["concierge-nps-mes", monthKey], queryFn: () => getRemoteNpsMes(monthKey), enabled: useRemote, staleTime: 30_000 });
  const totemQuery = useQuery({ queryKey: ["nps-totem"], queryFn: listRemoteNpsRespostas, enabled: useRemote, staleTime: 60_000 });
  const [localContatos, setLocalContatos] = useState<NpsContato[]>(() => readLocalValue<NpsContato[]>(contatosKey, []));
  const contatos = useRemote ? (contatosQuery.data ?? []) : localContatos;

  const salvarContatoMutation = useMutation({
    mutationFn: (contato: NpsContato) => upsertRemoteNpsContato(contato, pessoa?.id ?? null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["concierge-nps-contatos"] }),
  });
  const apagarContato = useMutation({
    mutationFn: deleteRemoteNpsContato,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["concierge-nps-contatos"] }),
  });
  const salvarMesMutation = useMutation({
    mutationFn: (mes: NpsMes) => upsertRemoteNpsMes(mes, pessoa?.id ?? null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["concierge-nps-mes", monthKey] }),
  });

  async function persistContato(contato: NpsContato) {
    if (useRemote) {
      await salvarContatoMutation.mutateAsync(contato);
      return;
    }
    setLocalContatos((prev) => {
      const next = prev.some((existing) => existing.id === contato.id)
        ? prev.map((existing) => (existing.id === contato.id ? contato : existing))
        : [contato, ...prev];
      writeLocalValue(contatosKey, next);
      return next;
    });
  }

  // ---------------- A FILA (tudo conectado) ----------------
  const fila = useMemo(
    () => filaDeContatos(crmState.contacts, financeiro.sales, contatos, hoje),
    [crmState.contacts, financeiro.sales, contatos, hoje],
  );
  // Quem teve o WhatsApp aberto agora há pouco (para o canal sair certo).
  const [waAbertos, setWaAbertos] = useState<Record<string, boolean>>({});
  const [triste, setTriste] = useState<Record<string, string>>({}); // contactRef -> texto da insatisfação

  async function registrarDaFila(item: ItemDaFila, resultado: NpsResultado) {
    setErro("");
    const descricao = (triste[item.contactRef] ?? "").trim();
    if (resultado === "INSATISFATORIA" && !descricao) {
      setErro(`Escreva em uma linha o que a(o) ${item.nome.split(" ")[0]} relatou — é isso que vira dor do mês.`);
      return;
    }
    await persistContato({
      id: novoId(),
      contatoDate: hoje,
      pacienteNome: item.nome,
      crmContactRef: item.contactRef,
      canal: waAbertos[item.contactRef] ? "WHATSAPP" : item.telefone ? "WHATSAPP" : "PRESENCIAL",
      resultado,
      descricao: resultado === "INSATISFATORIA" ? descricao : "",
      resolucao: "",
      createdAt: new Date().toISOString(),
    });
    setTriste((prev) => ({ ...prev, [item.contactRef]: "" }));
    setFeedback(
      resultado === "SATISFATORIA"
        ? `${item.nome}: contato registrado. Próximo da fila!`
        : `${item.nome}: insatisfação registrada — ela entra nas pendências até você escrever a resolução.`,
    );
  }

  // ---------------- registro manual (fora da fila) ----------------
  const [manualAberto, setManualAberto] = useState(false);
  const [paciente, setPaciente] = useState<PatientPickerValue>({ ref: "", name: "" });
  const [canal, setCanal] = useState<NpsCanal>("WHATSAPP");
  const [resultado, setResultado] = useState<NpsResultado>("SATISFATORIA");
  const [descricao, setDescricao] = useState("");
  const [resolucao, setResolucao] = useState("");
  const [dataContato, setDataContato] = useState(hoje);

  async function registrarManual(event: FormEvent) {
    event.preventDefault();
    setErro("");
    const problema = problemaDoContato({ pacienteNome: paciente.name, resultado, descricao });
    if (problema) {
      setErro(problema);
      return;
    }
    await persistContato({
      id: novoId(),
      contatoDate: dataContato,
      pacienteNome: paciente.name.trim(),
      crmContactRef: paciente.ref || null,
      canal,
      resultado,
      descricao: resultado === "INSATISFATORIA" ? descricao.trim() : "",
      resolucao: resultado === "INSATISFATORIA" ? resolucao.trim() : "",
      createdAt: new Date().toISOString(),
    });
    setFeedback(`Contato com ${paciente.name.trim()} registrado.`);
    setPaciente({ ref: "", name: "" });
    setResultado("SATISFATORIA");
    setDescricao("");
    setResolucao("");
    setDataContato(hoje);
    setManualAberto(false);
  }

  // ---------------- resoluções pendentes ----------------
  const [resolucaoDraft, setResolucaoDraft] = useState<Record<string, string>>({});
  async function registrarResolucao(contato: NpsContato) {
    const texto = (resolucaoDraft[contato.id] ?? "").trim();
    if (!texto) return;
    await persistContato({ ...contato, resolucao: texto });
    setResolucaoDraft((prev) => ({ ...prev, [contato.id]: "" }));
    setFeedback(`Resolução registrada para ${contato.pacienteNome}.`);
  }

  // ---------------- mês (dores/elogios/pdca) ----------------
  const [mes, setMes] = useState<NpsMes>(() => (useRemote ? npsMesVazio(hoje.slice(0, 7)) : readLocalValue<NpsMes>(mesKey(hoje.slice(0, 7)), npsMesVazio(hoje.slice(0, 7)))));
  useEffect(() => {
    if (useRemote) setMes(mesQuery.data ?? npsMesVazio(monthKey));
    else setMes(readLocalValue<NpsMes>(mesKey(monthKey), npsMesVazio(monthKey)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesQuery.data, monthKey, useRemote]);

  async function salvarMesAgora() {
    const limpo: NpsMes = { ...mes, monthKey, dores: limparListaTop5(mes.dores), elogios: limparListaTop5(mes.elogios) };
    if (useRemote) await salvarMesMutation.mutateAsync(limpo);
    else writeLocalValue(mesKey(monthKey), limpo);
    setMes(limpo);
    setFeedback("Fechamento do mês salvo — pronto para imprimir no dia 5.");
  }

  function editarLista(tipo: "dores" | "elogios", indice: number, campo: keyof DorOuElogio, valor: string) {
    setMes((atual) => {
      const lista = [...atual[tipo]];
      while (lista.length <= indice) lista.push({ texto: "", acao: "" });
      lista[indice] = { ...lista[indice], [campo]: valor };
      return { ...atual, [tipo]: lista };
    });
  }

  // ---------------- derivados ----------------
  const resumo = useMemo(() => resumoDoMes(contatos, monthKey), [contatos, monthKey]);
  const totem = useMemo(() => totemDoMes(totemQuery.data ?? [], monthKey), [totemQuery.data, monthKey]);
  const contatosDoMes = useMemo(() => contatos.filter((contato) => contato.contatoDate.startsWith(monthKey)), [contatos, monthKey]);
  const pendencias = contatosDoMes.filter((contato) => contato.resultado === "INSATISFATORIA" && !contato.resolucao.trim());
  const monthLabel = monthKey.split("-").reverse().join("/");
  const [listaAberta, setListaAberta] = useState(false);
  const [mesAberto, setMesAberto] = useState(false);

  // ---------------- impressão ----------------
  function imprimir() {
    const linhaTop5 = (lista: DorOuElogio[], vazio: string) =>
      lista.length
        ? lista.map((item, indice) => `<tr><td>${indice + 1}</td><td>${item.texto}</td><td>${item.acao || "—"}</td></tr>`).join("")
        : `<tr><td colspan="3" class="mut">${vazio}</td></tr>`;
    const insatisfacoes = contatosDoMes
      .filter((contato) => contato.resultado === "INSATISFATORIA")
      .map(
        (contato) =>
          `<tr><td>${diaBR(contato.contatoDate)}</td><td>${contato.pacienteNome}</td><td>${contato.descricao}</td><td>${contato.resolucao || "<strong>EM ABERTO</strong>"}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>NPS Concierge — ${monthLabel}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,sans-serif;color:#2B2E24;margin:30px}
        h1{font-size:20px;margin:0} h2{font-size:14px;margin:18px 0 6px;color:#4D563B;text-transform:uppercase;letter-spacing:.04em}
        p.meta{color:#666;font-size:12px;margin:4px 0 14px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
        th,td{border-bottom:1px solid #ddd;text-align:left;padding:6px 8px;vertical-align:top}
        th{font-size:10px;text-transform:uppercase;color:#4D563B}
        .kpis{display:flex;gap:18px;font-size:13px;margin:10px 0}
        .kpis strong{font-size:19px;display:block}
        .mut{color:#888}
      </style></head><body>
      <h1>Gestão da Concierge — NPS / Experiência do Paciente</h1>
      <p class="meta">Instituto Bratan · mês ${monthLabel} · Reunião de Líderes (dia 5) · gerado em ${diaBR(hoje)}</p>
      <div class="kpis">
        <span><strong>${resumo.total}</strong>contatos</span>
        <span><strong>${resumo.percentualSatisfacao === null ? "—" : `${String(resumo.percentualSatisfacao).replace(".", ",")}%`}</strong>satisfação</span>
        <span><strong>${resumo.insatisfatorias}</strong>insatisfações</span>
        <span><strong>${resumo.resolvidas}</strong>resolvidas</span>
        <span><strong>${totem.respostas ? `${String(totem.media).replace(".", ",")}` : "—"}</strong>nota do totem (${totem.respostas} resp.)</span>
      </div>
      <h2>5 principais dores</h2>
      <table><thead><tr><th>#</th><th>Dor</th><th>Ação proposta</th></tr></thead><tbody>${linhaTop5(mes.dores, "Sem dores registradas no mês.")}</tbody></table>
      <h2>5 principais elogios</h2>
      <table><thead><tr><th>#</th><th>Elogio</th><th>Como reforçar</th></tr></thead><tbody>${linhaTop5(mes.elogios, "Sem elogios registrados no mês.")}</tbody></table>
      <h2>Insatisfações do mês e resoluções</h2>
      <table><thead><tr><th>Data</th><th>Paciente</th><th>O que houve</th><th>Resolução</th></tr></thead><tbody>${insatisfacoes || '<tr><td colspan="4" class="mut">Nenhuma insatisfação no mês. 🎉</td></tr>'}</tbody></table>
      <h2>PDCA — Experiência do paciente</h2>
      <table><tbody>
        <tr><th>Plan</th><td>${mes.pdca.plan || "—"}</td></tr>
        <tr><th>Do</th><td>${mes.pdca.do || "—"}</td></tr>
        <tr><th>Check</th><td>${mes.pdca.check || "—"}</td></tr>
        <tr><th>Act</th><td>${mes.pdca.act || "—"}</td></tr>
      </tbody></table>
      <script>window.print()</script></body></html>`;
    const janela = window.open("", "_blank", "width=940,height=720");
    if (!janela) return;
    janela.document.write(html);
    janela.document.close();
  }

  // CABEÇALHO (08/10/2026): a fila e as reclamações em aberto numa frase só.
  const frase = fraseDoNps({ fila: fila.length, pendencias: podeEditar ? pendencias.length : 0 });

  return (
    <AccessGate allowed={(c) => canSeeModule({ cargo: c }, "concierge-nps")} label="NPS da Concierge" module="concierge-nps">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 font-sans text-tinta max-md:gap-4">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Pacientes · Experiência do paciente"
          titulo="NPS da Concierge"
          frase={
            <>
              <strong>{frase.destaque}</strong>
              {frase.resto}
              {frase.alerta ? <span className="alerta">{frase.alerta}</span> : null}
            </>
          }
          acoes={
            <>
              <label className="flex items-center">
                <span className="sr-only">Mês</span>
                <input
                  type="month"
                  value={monthKey}
                  onChange={(event) => setMonthKey(event.target.value)}
                  onBlur={() => {
                    if (!monthKey) setMonthKey(hoje.slice(0, 7));
                  }}
                  className={cn(CAMPO, "w-[176px] tabular-nums")}
                  aria-label="Mês"
                />
              </label>
              <Botao variante="secundario" icone={<Printer className="h-4 w-4" aria-hidden="true" />} onClick={imprimir}>
                Imprimir (dia 5)
              </Botao>
            </>
          }
          rodape={
            <FraseDoFluxo>
              A fila abaixo já é quem passou na clínica e falta contatar. Toque no WhatsApp, converse, e registre com uma carinha. Só isso.
            </FraseDoFluxo>
          }
        />

        {feedback ? <AvisoDaTela tom="ok" onFechar={() => setFeedback("")}>{feedback}</AvisoDaTela> : null}
        {erro ? <AvisoDaTela tom="erro" onFechar={() => setErro("")}>{erro}</AvisoDaTela> : null}

        {/* ================= 1. A FILA ================= */}
        <BlocoFolha as="section" aria-labelledby="titulo-fila-nps" className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-fio px-5 py-4 max-md:px-4">
            <TituloDoBloco id="titulo-fila-nps" detalhe={fila.length ? `${fila.length} ${fila.length === 1 ? "pessoa" : "pessoas"}` : undefined}>
              Para contatar
            </TituloDoBloco>
            <InfoTip title="De onde vem esta lista">
              De quem passou na clínica: toda comanda dos últimos 14 dias entra aqui até você registrar o contato.
              Quem veio ontem aparece primeiro (o contato D+1 é o mais quente); quem veio hoje fica para amanhã, no fim
              da lista.
            </InfoTip>
          </div>
          {fila.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm font-medium text-tinta-2 max-md:px-4">
              Fila em dia: todo mundo que passou na clínica já recebeu o seu contato.
            </p>
          ) : (
            <ul>
              {fila.map((item) => {
                const wa = linkWhatsApp(item.telefone, item.nome);
                const tristeAberto = (triste[item.contactRef] ?? "") !== "" || triste[item.contactRef] === "";
                const expandiu = Object.prototype.hasOwnProperty.call(triste, item.contactRef);
                return (
                  <li key={item.contactRef} className={cn("border-b border-fio px-5 py-3 last:border-b-0 max-md:px-4", expandiu && "bg-saber")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="truncate text-sm font-bold leading-5 text-tinta">{item.nome}</p>
                        <p className={cn("text-[13px] leading-5 tabular-nums", item.diasDesde === 1 ? "font-bold text-tinta" : "font-medium text-tinta-2")}>
                          {quandoVeio(item.diasDesde)} ({diaBR(item.ultimaVisita)})
                        </p>
                      </div>
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setWaAbertos((prev) => ({ ...prev, [item.contactRef]: true }))}
                          className={cn(botaoClasses({ variante: "secundario", tamanho: "pq" }))}
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
                        </a>
                      ) : (
                        <span className="text-[13px] font-medium text-tinta-2">sem telefone — ligar/presencial</span>
                      )}
                      {podeEditar ? (
                        <>
                          <Botao
                            tamanho="pq"
                            variante="suave"
                            icone={<Smile className="h-4 w-4" aria-hidden="true" />}
                            onClick={() => void registrarDaFila(item, "SATISFATORIA")}
                            title="Conversa satisfatória — registra e sai da fila"
                          >
                            Foi bem
                          </Botao>
                          <Botao
                            tamanho="pq"
                            variante="perigo"
                            icone={<Frown className="h-4 w-4" aria-hidden="true" />}
                            aria-expanded={expandiu}
                            className={cn(expandiu && "bg-erro-claro")}
                            onClick={() => setTriste((prev) => (Object.prototype.hasOwnProperty.call(prev, item.contactRef) ? (() => { const next = { ...prev }; delete next[item.contactRef]; return next; })() : { ...prev, [item.contactRef]: "" }))}
                            title="Teve reclamação — abre o campo para anotar"
                          >
                            Reclamou
                          </Botao>
                        </>
                      ) : null}
                    </div>
                    {expandiu && tristeAberto ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input
                          value={triste[item.contactRef] ?? ""}
                          onChange={(event) => setTriste((prev) => ({ ...prev, [item.contactRef]: event.target.value }))}
                          placeholder="O que houve? (uma linha — vira dor do mês)"
                          aria-label={`O que ${item.nome} relatou`}
                          className={cn(CAMPO, "min-w-0 flex-1 basis-64")}
                          autoFocus
                        />
                        <Botao variante="primario" onClick={() => void registrarDaFila(item, "INSATISFATORIA")}>
                          Registrar reclamação
                        </Botao>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {podeEditar ? (
            <div className="border-t border-fio px-5 py-3 max-md:px-4">
              {/* 13/10/2026: rótulo longo quebra em duas linhas no celular (antes saía cortado nos dois lados). */}
              <Botao
                tamanho="pq"
                variante="fantasma"
                aria-expanded={manualAberto}
                className="-ml-3 h-auto min-h-8 justify-start whitespace-normal py-1.5 text-left leading-5 max-md:min-h-11"
                onClick={() => setManualAberto((valor) => !valor)}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-150 ease-papel", manualAberto ? "rotate-180" : "-rotate-90")} aria-hidden="true" />
                {manualAberto ? "Fechar" : "Registrar alguém fora da lista (contato antigo, indicação…)"}
              </Botao>
            </div>
          ) : null}
          {manualAberto && podeEditar ? (
            <form className="grid gap-4 border-t border-fio bg-saber px-5 py-4 max-md:px-4" onSubmit={registrarManual}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_auto]">
                <Campo rotulo="Com quem foi?" htmlFor="nps-paciente">
                  <PatientPicker contacts={crmState.contacts} value={paciente} onChange={setPaciente} id="nps-paciente" />
                </Campo>
                <Campo rotulo="Quando" htmlFor="nps-quando">
                  <input id="nps-quando" type="date" value={dataContato} onChange={(event) => setDataContato(event.target.value)} className={cn(CAMPO, "w-[176px] tabular-nums")} />
                </Campo>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <fieldset className="grid gap-2">
                  <legend className="mb-2 font-sans text-[13px] font-bold leading-5 text-tinta">Por onde</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(canalLabels) as NpsCanal[]).map((chave) => (
                      <button key={chave} type="button" aria-pressed={canal === chave} onClick={() => setCanal(chave)} className={cn(classeDaEscolha(canal === chave), "py-1.5 text-sm font-semibold")}>
                        {canalLabels[chave]}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="grid gap-2">
                  <legend className="mb-2 font-sans text-[13px] font-bold leading-5 text-tinta">Como foi</legend>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" aria-pressed={resultado === "SATISFATORIA"} onClick={() => setResultado("SATISFATORIA")} className={cn(classeDaEscolha(resultado === "SATISFATORIA"), "flex items-center gap-1.5 py-1.5 text-sm font-semibold")}>
                      <Smile className="h-4 w-4" aria-hidden="true" /> Foi bem
                    </button>
                    <button
                      type="button"
                      aria-pressed={resultado === "INSATISFATORIA"}
                      onClick={() => setResultado("INSATISFATORIA")}
                      className={cn(
                        classeDaEscolha(false),
                        "flex items-center gap-1.5 py-1.5 text-sm font-semibold",
                        resultado === "INSATISFATORIA" && "border-erro bg-erro-claro text-erro shadow-[inset_0_0_0_1px_rgb(var(--erro-rgb))]",
                      )}
                    >
                      <Frown className="h-4 w-4" aria-hidden="true" /> Reclamou
                    </button>
                  </div>
                </fieldset>
              </div>
              {resultado === "INSATISFATORIA" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={descricao} onChange={(event) => setDescricao(event.target.value)} placeholder="O que houve?" aria-label="O que houve?" className={CAMPO} />
                  <input value={resolucao} onChange={(event) => setResolucao(event.target.value)} placeholder="O que foi feito? (pode deixar para depois)" aria-label="O que foi feito?" className={CAMPO} />
                </div>
              ) : null}
              <div>
                <Botao type="submit" variante="primario">
                  Registrar
                </Botao>
              </div>
            </form>
          ) : null}
        </BlocoFolha>

        {/* ================= 2. PENDÊNCIAS ================= */}
        {pendencias.length && podeEditar ? (
          <BlocoFolha as="section" aria-labelledby="titulo-pendencias-nps" className="overflow-hidden border-atencao/60">
            <div className="border-b border-fio px-5 py-4 max-md:px-4">
              <TituloDoBloco id="titulo-pendencias-nps" icone={<AlertTriangle className="h-4 w-4 text-atencao" aria-hidden="true" />} detalhe={`${pendencias.length} sem resolução`}>
                Reclamações esperando a resolução
              </TituloDoBloco>
              <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">Resolveu com o paciente? Escreva aqui o que foi feito — é isso que fecha o ciclo.</p>
            </div>
            <ul>
              {pendencias.map((contato) => (
                <li key={contato.id} className="grid gap-2 border-b border-fio px-5 py-3 last:border-b-0 max-md:px-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
                  <div className="min-w-0 text-sm">
                    <p className="font-bold text-tinta">{contato.pacienteNome}</p>
                    <p className="text-[13px] font-medium text-tinta-2">
                      <span className="tabular-nums">{diaBR(contato.contatoDate)}</span> · {contato.descricao}
                    </p>
                  </div>
                  <input
                    value={resolucaoDraft[contato.id] ?? ""}
                    onChange={(event) => setResolucaoDraft((prev) => ({ ...prev, [contato.id]: event.target.value }))}
                    placeholder="O que foi feito para resolver?"
                    aria-label={`Resolução para ${contato.pacienteNome}`}
                    className={CAMPO}
                  />
                  <Botao variante="suave" onClick={() => void registrarResolucao(contato)} disabled={!(resolucaoDraft[contato.id] ?? "").trim()}>
                    Resolvido ✓
                  </Botao>
                </li>
              ))}
            </ul>
          </BlocoFolha>
        ) : null}

        {/* ================= 3. PLACAR (para saber) ================= */}
        <Indicadores
          rotulo={`O NPS de ${monthLabel} em números`}
          colunas={4}
          itens={[
            { rotulo: "Contatos no mês", valor: resumo.total, frase: `registrados em ${monthLabel}` },
            { rotulo: "Satisfação", valor: percentualBR(resumo.percentualSatisfacao), frase: resumo.percentualSatisfacao === null ? "sem contato no mês ainda" : "dos contatos foram bem" },
            {
              rotulo: "Reclamações",
              valor: resumo.insatisfatorias,
              frase: resumo.semResolucao ? `${resumo.semResolucao} sem resolução` : "todas resolvidas",
              tom: resumo.semResolucao > 0 ? "atencao" : undefined,
            },
            { rotulo: "Nota do totem", valor: totem.media === null ? "—" : String(totem.media).replace(".", ","), frase: `${totem.respostas} resposta(s)` },
          ]}
        />

        {/* ================= 4. DOBRADO: contatos do mês ================= */}
        <BlocoSaber as="section" aria-labelledby="titulo-contatos-do-mes" className="py-4 max-md:py-4">
          <h2 id="titulo-contatos-do-mes" className="font-sans text-base font-bold leading-6 text-tinta">
            <button type="button" aria-expanded={listaAberta} className={TITULO_QUE_ABRE} onClick={() => setListaAberta((valor) => !valor)}>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-tinta-2 transition-transform duration-150 ease-papel", !listaAberta && "-rotate-90")} aria-hidden="true" />
              Todos os contatos de {monthLabel}
              <span className="text-sm font-semibold tabular-nums text-tinta-2">{contatosDoMes.length}</span>
            </button>
          </h2>
          {listaAberta ? (
            <div className="mt-3">
              {contatosDoMes.length === 0 ? (
                <p className="text-[13px] font-medium text-tinta-2">Nenhum contato registrado neste mês ainda.</p>
              ) : (
                <ul>
                  {contatosDoMes.map((contato) => (
                    <li key={contato.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-fio py-2.5 text-sm last:border-b-0">
                      <span
                        role="img"
                        aria-label={contato.resultado === "SATISFATORIA" ? "Foi bem" : "Reclamou"}
                        className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", contato.resultado === "SATISFATORIA" ? "bg-ok-claro text-ok" : "bg-erro-claro text-erro")}
                      >
                        {contato.resultado === "SATISFATORIA" ? <Smile className="h-4 w-4" aria-hidden="true" /> : <Frown className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <span className="font-bold text-tinta">{contato.pacienteNome}</span>
                      <span className="text-[13px] font-medium tabular-nums text-tinta-2">
                        {diaBR(contato.contatoDate)} · {canalLabels[contato.canal]}
                      </span>
                      {contato.descricao ? <span className="text-[13px] font-semibold text-erro">{contato.descricao}</span> : null}
                      {contato.resolucao ? <span className="text-[13px] font-semibold text-ok">✓ {contato.resolucao}</span> : null}
                      {podeEditar ? (
                        <Botao
                          tamanho="pq"
                          variante="perigo"
                          className="ml-auto"
                          onClick={async () => {
                            if (!(await confirmar(`Apagar o contato com ${contato.pacienteNome}?`, { destrutivo: true, confirmar: "Apagar" }))) return;
                            if (useRemote) void apagarContato.mutateAsync(contato.id).catch(() => toast("Não deu para apagar o contato. Tente de novo.", { tom: "erro" }));
                            else {
                              setLocalContatos((prev) => {
                                const next = prev.filter((existing) => existing.id !== contato.id);
                                writeLocalValue(contatosKey, next);
                                return next;
                              });
                            }
                          }}
                        >
                          apagar
                        </Botao>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </BlocoSaber>

        {/* ================= 5. DOBRADO: fechar o mês (dia 5) ================= */}
        <BlocoFolha as="section" aria-labelledby="titulo-fechar-mes-nps" respiro className="py-4 max-md:py-4">
          <h2 id="titulo-fechar-mes-nps" className="font-sans text-base font-bold leading-6 text-tinta">
            <button type="button" aria-expanded={mesAberto} className={TITULO_QUE_ABRE} onClick={() => setMesAberto((valor) => !valor)}>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-tinta-2 transition-transform duration-150 ease-papel", !mesAberto && "-rotate-90")} aria-hidden="true" />
              Fechar o mês para a reunião do dia 5 (dores, elogios e PDCA)
            </button>
          </h2>
          {!mesAberto ? <p className="pl-6 text-[13px] font-medium text-tinta-2">Só precisa abrir aqui uma vez por mês, antes da Reunião de Líderes.</p> : null}
          {mesAberto ? (
            <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="grid content-start gap-5">
                {(["dores", "elogios"] as const).map((tipo) => (
                  <div key={tipo}>
                    <p className="mb-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
                      {tipo === "dores" ? "Principais dores → ação proposta" : "Principais elogios → como reforçar"}
                    </p>
                    <div className="grid gap-2">
                      {[0, 1, 2, 3, 4].map((indice) => (
                        <div key={indice} className="grid gap-2 sm:grid-cols-2">
                          <input
                            value={mes[tipo][indice]?.texto ?? ""}
                            onChange={(event) => editarLista(tipo, indice, "texto", event.target.value)}
                            placeholder={`${indice + 1}. ${tipo === "dores" ? "dor" : "elogio"}`}
                            aria-label={`${tipo === "dores" ? "Dor" : "Elogio"} ${indice + 1}`}
                            disabled={!podeEditar}
                            className={CAMPO}
                          />
                          <input
                            value={mes[tipo][indice]?.acao ?? ""}
                            onChange={(event) => editarLista(tipo, indice, "acao", event.target.value)}
                            placeholder={tipo === "dores" ? "ação proposta" : "como padronizar"}
                            aria-label={`${tipo === "dores" ? "Ação proposta para a dor" : "Como padronizar o elogio"} ${indice + 1}`}
                            disabled={!podeEditar}
                            className={CAMPO}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">PDCA — experiência do paciente</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ["plan", "PLAN — o que vamos melhorar"],
                        ["do", "DO — o que foi feito"],
                        ["check", "CHECK — o que os números dizem"],
                        ["act", "ACT — o que vira padrão"],
                      ] as const
                    ).map(([chave, rotulo]) => (
                      <input
                        key={chave}
                        value={mes.pdca[chave]}
                        onChange={(event) => setMes((atual) => ({ ...atual, pdca: { ...atual.pdca, [chave]: event.target.value } }))}
                        placeholder={rotulo}
                        aria-label={rotulo}
                        disabled={!podeEditar}
                        className={CAMPO}
                      />
                    ))}
                  </div>
                </div>
                {podeEditar ? (
                  <div className="flex flex-wrap gap-2">
                    <Botao variante="primario" onClick={() => void salvarMesAgora()}>
                      Salvar mês
                    </Botao>
                    <Botao variante="secundario" icone={<Printer className="h-4 w-4" aria-hidden="true" />} onClick={imprimir}>
                      Imprimir
                    </Botao>
                  </div>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Comentários do totem em {monthLabel} (matéria-prima)</p>
                <div className="max-h-96 overflow-y-auto rounded-bloco bg-saber px-4 py-1">
                  {totem.comentarios.length === 0 ? (
                    <p className="py-3 text-[13px] font-medium text-tinta-2">Nenhum comentário no totem neste mês.</p>
                  ) : (
                    totem.comentarios.map((comentario, indice) => (
                      <p key={indice} className="flex items-start gap-2 border-b border-fio py-2.5 text-sm font-medium leading-5 text-tinta last:border-b-0">
                        <Etiqueta tom={comentario.nota >= 9 ? "ok" : comentario.nota <= 6 ? "erro" : "atencao"} className="mt-px">
                          {comentario.nota}
                        </Etiqueta>
                        <span className="min-w-0">{comentario.comentario}</span>
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </BlocoFolha>
      </div>
    </AccessGate>
  );
}
