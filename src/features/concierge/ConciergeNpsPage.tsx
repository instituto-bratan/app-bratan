// NPS DA CONCIERGE (21/08/2026, pedido do Lucas): a Planilha_Gestao_Concierge_NPS
// vira tela — "muito mais simples e prática. Nada é um bicho de sete cabeças."
//
// O desenho: registrar um contato são TRÊS toques (paciente, canal, carinha).
// Os campos de insatisfação só aparecem quando precisa. O Resumo do Mês, que a
// planilha mandava calcular na mão, aqui se calcula sozinho. As dores e elogios
// ganham os comentários do totem ao lado — escolher em vez de lembrar. E o
// botão Imprimir entrega a folha pronta da Reunião de Líderes do dia 5.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, HeartHandshake, Printer, Smile, Frown, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
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
import { PatientPicker, type PatientPickerValue } from "@/features/crm/PatientPicker";
import { useCrmState } from "@/features/crm/useCrmState";
import {
  canalLabels,
  limparListaTop5,
  npsMesVazio,
  problemaDoContato,
  resumoDoMes,
  totemDoMes,
  type DorOuElogio,
  type NpsCanal,
  type NpsContato,
  type NpsMes,
  type NpsResultado,
} from "./npsData";

const contatosKey = "app-bratan-concierge-nps-contatos";
const mesKey = (monthKey: string) => `app-bratan-concierge-nps-mes-${monthKey}`;
const diaBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const novoId = () => `npsc-${crypto.randomUUID()}`;

export function ConciergeNpsPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const podeEditar = canEditModule(pessoa, "concierge-nps");
  const queryClient = useQueryClient();
  const { state: crmState } = useCrmState();
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

  const salvarContato = useMutation({
    mutationFn: (contato: NpsContato) => upsertRemoteNpsContato(contato, pessoa?.id ?? null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["concierge-nps-contatos"] }),
  });
  const apagarContato = useMutation({
    mutationFn: deleteRemoteNpsContato,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["concierge-nps-contatos"] }),
  });
  const salvarMes = useMutation({
    mutationFn: (mes: NpsMes) => upsertRemoteNpsMes(mes, pessoa?.id ?? null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["concierge-nps-mes", monthKey] }),
  });

  async function persistContato(contato: NpsContato) {
    if (useRemote) {
      await salvarContato.mutateAsync(contato);
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

  // ---------------- registro rápido ----------------
  const [paciente, setPaciente] = useState<PatientPickerValue>({ ref: "", name: "" });
  const [canal, setCanal] = useState<NpsCanal>("WHATSAPP");
  const [resultado, setResultado] = useState<NpsResultado>("SATISFATORIA");
  const [descricao, setDescricao] = useState("");
  const [resolucao, setResolucao] = useState("");
  const [dataContato, setDataContato] = useState(hoje);

  async function registrar(event: FormEvent) {
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
    setFeedback(
      resultado === "SATISFATORIA"
        ? `Contato com ${paciente.name.trim()} registrado. 😊`
        : resolucao.trim()
          ? `Insatisfação de ${paciente.name.trim()} registrada COM a resolução. 👏`
          : `Insatisfação de ${paciente.name.trim()} registrada — ela fica em aberto até você escrever a resolução.`,
    );
    setPaciente({ ref: "", name: "" });
    setResultado("SATISFATORIA");
    setDescricao("");
    setResolucao("");
    setDataContato(hoje);
  }

  // resolução depois (pendências)
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
    if (useRemote) await salvarMes.mutateAsync(limpo);
    else writeLocalValue(mesKey(monthKey), limpo);
    setMes(limpo);
    setFeedback("Dores, elogios e PDCA do mês salvos.");
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
  const contatosDoMes = useMemo(
    () => contatos.filter((contato) => contato.contatoDate.startsWith(monthKey)),
    [contatos, monthKey],
  );
  const pendencias = contatosDoMes.filter((contato) => contato.resultado === "INSATISFATORIA" && !contato.resolucao.trim());
  const monthLabel = monthKey.split("-").reverse().join("/");

  // ---------------- impressão (a folha da Reunião de Líderes) ----------------
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

  return (
    <AccessGate allowed={(c) => canSeeModule({ cargo: c }, "concierge-nps")} label="NPS da Concierge" module="concierge-nps">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Experiência do Paciente</Badge>
            <Badge variant="muted">{useRemote ? "Supabase" : "Somente local"}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <h1 className="flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
              <HeartHandshake className="h-8 w-8 text-brand-oliva" aria-hidden="true" />
              NPS da Concierge
              <InfoTip title="O que virou o quê">
                A planilha de gestão virou esta tela: registrar um contato são três toques; o Resumo do Mês se calcula
                sozinho; as dores e elogios ficam ao lado dos comentários reais do totem; e o botão Imprimir entrega a
                folha pronta para a Reunião de Líderes do dia 5.
              </InfoTip>
            </h1>
            <span className="flex items-center gap-2">
              <Input type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value || hoje.slice(0, 7))} className="w-40" aria-label="Mês" />
              <Button type="button" variant="outline" onClick={imprimir}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" /> Imprimir (dia 5)
              </Button>
            </span>
          </div>
        </motion.section>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}
        {erro ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50/80 px-4 py-3 text-sm font-semibold text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        ) : null}

        {/* Registro em 3 toques */}
        {podeEditar ? (
          <Card className="border-brand-musgo/25">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Registrar contato</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={registrar}>
                <div className="grid gap-4 md:grid-cols-[1.4fr_auto]">
                  <div>
                    <Label>1 · Com quem foi?</Label>
                    <PatientPicker contacts={crmState.contacts} value={paciente} onChange={setPaciente} id="nps-paciente" />
                  </div>
                  <div>
                    <Label>Quando</Label>
                    <Input type="date" value={dataContato} onChange={(event) => setDataContato(event.target.value)} className="w-40" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>2 · Por onde?</Label>
                    <div className="mt-1 flex gap-1.5">
                      {(Object.keys(canalLabels) as NpsCanal[]).map((chave) => (
                        <button
                          key={chave}
                          type="button"
                          onClick={() => setCanal(chave)}
                          className={cn(
                            "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
                            canal === chave ? "border-brand-musgo bg-brand-musgo text-brand-papel" : "border-brand-oliva/25 bg-white/70 text-brand-oliva hover:text-brand-musgo",
                          )}
                        >
                          {canalLabels[chave]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>3 · Como foi a conversa?</Label>
                    <div className="mt-1 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setResultado("SATISFATORIA")}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition",
                          resultado === "SATISFATORIA" ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-brand-oliva/25 bg-white/70 text-muted-foreground",
                        )}
                      >
                        <Smile className="h-4 w-4" aria-hidden="true" /> Satisfatória
                      </button>
                      <button
                        type="button"
                        onClick={() => setResultado("INSATISFATORIA")}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition",
                          resultado === "INSATISFATORIA" ? "border-rose-400 bg-rose-50 text-rose-800" : "border-brand-oliva/25 bg-white/70 text-muted-foreground",
                        )}
                      >
                        <Frown className="h-4 w-4" aria-hidden="true" /> Insatisfatória
                      </button>
                    </div>
                  </div>
                </div>
                {resultado === "INSATISFATORIA" ? (
                  <div className="grid gap-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3 sm:grid-cols-2">
                    <div>
                      <Label>O que houve? (vira dor do mês)</Label>
                      <Input value={descricao} onChange={(event) => setDescricao(event.target.value)} placeholder="Ex.: esperou 40 min para aplicação" />
                    </div>
                    <div>
                      <Label>O que foi feito? (pode preencher depois)</Label>
                      <Input value={resolucao} onChange={(event) => setResolucao(event.target.value)} placeholder="Ex.: reagendado com prioridade + mimo" />
                    </div>
                  </div>
                ) : null}
                <div>
                  <LiquidButton type="submit" size="default">Registrar contato</LiquidButton>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {/* Resumo derivado (a antiga aba "Resumo do Mês") */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Contatos no mês", value: String(resumo.total), hint: monthLabel },
            { label: "Satisfação", value: resumo.percentualSatisfacao === null ? "—" : `${String(resumo.percentualSatisfacao).replace(".", ",")}%`, hint: `${resumo.satisfatorias} satisfatória(s)` },
            { label: "Insatisfações", value: String(resumo.insatisfatorias), hint: `${resumo.resolvidas} com resolução`, alerta: resumo.insatisfatorias > 0 },
            { label: "Sem resolução", value: String(resumo.semResolucao), hint: "pendência da concierge", alerta: resumo.semResolucao > 0 },
            { label: "Totem (recepção)", value: totem.media === null ? "—" : String(totem.media).replace(".", ","), hint: `${totem.respostas} resposta(s) · ${totem.detratores} detrator(es)` },
          ].map((cardInfo) => (
            <Card key={cardInfo.label} className={cn("shadow-none backdrop-blur", cardInfo.alerta ? "border-amber-300 bg-amber-50/70" : "border-brand-oliva/20 bg-white/70")}>
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{cardInfo.label}</p>
                <p className={cn("mt-1 text-2xl font-bold tabular-nums", cardInfo.alerta ? "text-amber-900" : "text-brand-tinta")}>{cardInfo.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{cardInfo.hint}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Pendências: insatisfação sem resolução */}
        {pendencias.length && podeEditar ? (
          <Card className="border-amber-300 bg-amber-50/50 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" />
                {pendencias.length} insatisfação(ões) sem resolução — escreva o que foi feito
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {pendencias.map((contato) => (
                <div key={contato.id} className="grid gap-2 rounded-lg border border-amber-200 bg-white/80 px-3 py-2.5 md:grid-cols-[1fr_1.2fr_auto] md:items-center">
                  <div className="text-sm">
                    <p className="font-semibold text-brand-tinta">{contato.pacienteNome}</p>
                    <p className="text-xs text-muted-foreground">{diaBR(contato.contatoDate)} · {contato.descricao}</p>
                  </div>
                  <Input
                    value={resolucaoDraft[contato.id] ?? ""}
                    onChange={(event) => setResolucaoDraft((prev) => ({ ...prev, [contato.id]: event.target.value }))}
                    placeholder="O que foi feito para resolver?"
                  />
                  <Button type="button" size="sm" onClick={() => void registrarResolucao(contato)} disabled={!(resolucaoDraft[contato.id] ?? "").trim()}>
                    Salvar resolução
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Contatos do mês */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contatos de {monthLabel} ({contatosDoMes.length})</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {contatosDoMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato registrado neste mês ainda.</p>
            ) : (
              contatosDoMes.map((contato) => (
                <div key={contato.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-oliva/12 bg-white/70 px-3 py-2 text-sm">
                  <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full", contato.resultado === "SATISFATORIA" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                    {contato.resultado === "SATISFATORIA" ? <Smile className="h-4 w-4" aria-hidden="true" /> : <Frown className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className="font-semibold text-brand-tinta">{contato.pacienteNome}</span>
                  <span className="text-xs text-muted-foreground">{diaBR(contato.contatoDate)} · {canalLabels[contato.canal]}</span>
                  {contato.descricao ? <span className="text-xs text-rose-800">{contato.descricao}</span> : null}
                  {contato.resolucao ? <span className="text-xs text-emerald-800">✓ {contato.resolucao}</span> : null}
                  {podeEditar ? (
                    <button
                      type="button"
                      className="ml-auto text-rose-600 hover:text-rose-800"
                      title="Apagar registro"
                      onClick={() => {
                        if (!window.confirm(`Apagar o contato com ${contato.pacienteNome}?`)) return;
                        if (useRemote) void apagarContato.mutateAsync(contato.id);
                        else {
                          setLocalContatos((prev) => {
                            const next = prev.filter((existing) => existing.id !== contato.id);
                            writeLocalValue(contatosKey, next);
                            return next;
                          });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Dores & Elogios + matéria-prima do totem */}
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                5 dores · 5 elogios do mês
                <InfoTip title="De onde tirar">
                  Use as insatisfações registradas acima e os comentários do totem ao lado — é escolher, não lembrar.
                  Máximo de 5 de cada, como na planilha.
                </InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {(["dores", "elogios"] as const).map((tipo) => (
                <div key={tipo}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-oliva">
                    {tipo === "dores" ? "Principais dores → ação proposta" : "Principais elogios → como reforçar"}
                  </p>
                  <div className="grid gap-1.5">
                    {[0, 1, 2, 3, 4].map((indice) => (
                      <div key={indice} className="grid gap-1.5 sm:grid-cols-2">
                        <Input
                          value={mes[tipo][indice]?.texto ?? ""}
                          onChange={(event) => editarLista(tipo, indice, "texto", event.target.value)}
                          placeholder={`${indice + 1}. ${tipo === "dores" ? "dor" : "elogio"}`}
                          disabled={!podeEditar}
                        />
                        <Input
                          value={mes[tipo][indice]?.acao ?? ""}
                          onChange={(event) => editarLista(tipo, indice, "acao", event.target.value)}
                          placeholder={tipo === "dores" ? "ação proposta" : "como padronizar"}
                          disabled={!podeEditar}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {/* PDCA — as 4 caixas da última aba da planilha */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-oliva">PDCA — experiência do paciente</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {(
                    [
                      ["plan", "PLAN — o que vamos melhorar"],
                      ["do", "DO — o que foi feito"],
                      ["check", "CHECK — o que os números dizem"],
                      ["act", "ACT — o que vira padrão"],
                    ] as const
                  ).map(([chave, rotulo]) => (
                    <Input
                      key={chave}
                      value={mes.pdca[chave]}
                      onChange={(event) => setMes((atual) => ({ ...atual, pdca: { ...atual.pdca, [chave]: event.target.value } }))}
                      placeholder={rotulo}
                      disabled={!podeEditar}
                    />
                  ))}
                </div>
              </div>
              {podeEditar ? (
                <div>
                  <LiquidButton type="button" size="default" onClick={() => void salvarMesAgora()}>
                    Salvar mês
                  </LiquidButton>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-brand-oliva/20 bg-brand-creme/25 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Comentários do totem em {monthLabel}</CardTitle>
              <p className="text-xs text-muted-foreground">A matéria-prima das dores e elogios — direto da recepção.</p>
            </CardHeader>
            <CardContent className="grid max-h-96 gap-1.5 overflow-y-auto">
              {totem.comentarios.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum comentário no totem neste mês.</p>
              ) : (
                totem.comentarios.map((comentario, indice) => (
                  <p key={indice} className="rounded-lg border border-brand-oliva/12 bg-white/70 px-3 py-2 text-sm">
                    <span className={cn("mr-2 inline-flex rounded-full border px-1.5 text-xs font-bold", comentario.nota >= 9 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : comentario.nota <= 6 ? "border-rose-300 bg-rose-50 text-rose-800" : "border-amber-300 bg-amber-50 text-amber-800")}>
                      {comentario.nota}
                    </span>
                    {comentario.comentario}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AccessGate>
  );
}
