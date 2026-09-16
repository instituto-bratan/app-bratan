// O LADO DA EQUIPE do portal (15/09/2026): na ficha do paciente. Gera o link de
// acesso (o token aparece uma vez; só o hash vai ao banco), registra a próxima
// consulta enquanto a agenda espelhada não estiver ligada, e lança as medições
// da bioimpedância que viram a curva do paciente e alimentam o semáforo.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, Scale, CalendarPlus, ShieldOff, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmar, toast } from "@/components/ui/avisos";
import { todayISO } from "@/lib/localStore";
import { isCoordenacao } from "@/lib/access";
import {
  createRemotePacienteConsulta,
  createRemotePacienteMedicao,
  criarRemotePacienteAcesso,
  deleteRemotePacienteMedicao,
  listRemotePacienteAcessos,
  listRemotePacienteConsultas,
  listRemotePacienteMedicoes,
  listRemotePacientePortalEventos,
  revogarRemotePacienteAcesso,
  updateRemotePacienteConsultaStatus,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type { Cargo } from "@/types/database";
import { gerarTokenPortal, sha256Hex } from "./portalToken";
import { montarLinkPortal } from "./portalPaciente";

const DIAS_LINK = 7;
const ACAO_LABEL: Record<string, string> = { ENTRADA: "entrou pelo link", LEITURA: "abriu o portal", PESAGEM: "mandou pesagem", RESPOSTA_CONSULTA: "respondeu à consulta", SAIDA: "saiu", ENTRADA_RECUSADA: "link recusado" };

function parseNum(texto: string) {
  const v = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function PortalDoPacienteCard({ contactRef, nomePaciente, telefone, temPlanoAtivo, pessoaId, cargo }: { contactRef: string; nomePaciente: string; telefone: string; temPlanoAtivo: boolean; pessoaId: string | null; cargo: Cargo | null | undefined }) {
  const queryClient = useQueryClient();
  const acessos = useQuery({ queryKey: ["portal-acessos", contactRef], queryFn: () => listRemotePacienteAcessos(contactRef), staleTime: 30_000 });
  const consultas = useQuery({ queryKey: ["portal-consultas", contactRef], queryFn: () => listRemotePacienteConsultas(contactRef), staleTime: 30_000 });
  const medicoes = useQuery({ queryKey: ["portal-medicoes", contactRef], queryFn: () => listRemotePacienteMedicoes(contactRef), staleTime: 30_000 });
  const eventos = useQuery({ queryKey: ["portal-eventos", contactRef], queryFn: () => listRemotePacientePortalEventos(contactRef), staleTime: 30_000, enabled: isCoordenacao(cargo) });
  const [link, setLink] = useState("");
  const [gerando, setGerando] = useState(false);
  const [consulta, setConsulta] = useState({ dia: "", hora: "14:00", profissional: "Dr. Daniel", tipo: "Consulta de acompanhamento" });
  const [medicao, setMedicao] = useState({ dia: todayISO(), peso: "", gordura: "", massaMagra: "", cintura: "", obs: "" });
  const [salvando, setSalvando] = useState(false);
  const invalidar = (chave: string) => queryClient.invalidateQueries({ queryKey: [chave, contactRef] });

  async function gerarLink() {
    setGerando(true);
    try {
      const token = gerarTokenPortal();
      await criarRemotePacienteAcesso(contactRef, await sha256Hex(token), DIAS_LINK, pessoaId);
      setLink(montarLinkPortal(window.location.origin, token));
      await invalidar("portal-acessos");
      toast(`Link gerado. Ele vale ${DIAS_LINK} dias e só aparece agora: copie e mande.`, { tom: "ok", duracaoMs: 6000 });
    } catch (error) {
      toast(`Não consegui gerar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    } finally {
      setGerando(false);
    }
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copiado.", { tom: "ok" });
    } catch {
      toast("Não consegui copiar; selecione o link e copie.", { tom: "atencao" });
    }
  }
  const mensagemWhatsApp = `Oi, ${nomePaciente.split(" ")[0]}! Este é o seu espaço no Instituto Bratan: próxima consulta, sua evolução e seu plano. É só abrir: ${link}`;
  const telefoneDigitos = telefone.replace(/\D/g, "");

  async function salvarConsulta() {
    if (!consulta.dia || !consulta.hora) return toast("Informe dia e hora.", { tom: "atencao" });
    setSalvando(true);
    try {
      await createRemotePacienteConsulta({ contactRef, em: new Date(`${consulta.dia}T${consulta.hora}:00`).toISOString(), profissional: consulta.profissional, tipo: consulta.tipo, local: "Instituto Bratan" }, pessoaId);
      setConsulta({ ...consulta, dia: "" });
      await invalidar("portal-consultas");
      toast("Consulta registrada. Já aparece no portal do paciente.", { tom: "ok" });
    } catch (error) {
      toast(`Não consegui salvar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    } finally {
      setSalvando(false);
    }
  }

  async function salvarMedicao() {
    const peso = parseNum(medicao.peso);
    if (!medicao.dia || (!peso && !parseNum(medicao.gordura) && !parseNum(medicao.massaMagra))) return toast("Informe pelo menos o peso.", { tom: "atencao" });
    setSalvando(true);
    try {
      await createRemotePacienteMedicao({ contactRef, dia: medicao.dia, pesoKg: peso, gorduraPct: parseNum(medicao.gordura), massaMagraKg: parseNum(medicao.massaMagra), cinturaCm: parseNum(medicao.cintura), observacao: medicao.obs.trim() }, pessoaId);
      setMedicao({ dia: todayISO(), peso: "", gordura: "", massaMagra: "", cintura: "", obs: "" });
      await invalidar("portal-medicoes");
      toast("Medição lançada. A curva do paciente já atualizou.", { tom: "ok" });
    } catch (error) {
      toast(`Não consegui salvar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    } finally {
      setSalvando(false);
    }
  }

  const acessoAtivo = (acessos.data ?? []).find((a) => !a.revogadoEm && a.expiraEm > new Date().toISOString());
  const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");

  return (
    <Card className="border-brand-dourado/40 bg-brand-creme/30 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Smartphone className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
          Portal do paciente
          <InfoTip title="Meu Bratan">
            O paciente entra por um link, sem senha, e vê a próxima consulta, a curva de evolução, a trilha do plano, o que fechou e pagou, e manda a
            pesagem da semana. O link vale {DIAS_LINK} dias e fica preso ao aparelho em que ele abriu; dá para revogar aqui. Ele só lê os próprios dados,
            por uma função do servidor, nunca direto do banco. Cada acesso fica registrado.
          </InfoTip>
          {acessoAtivo ? <Badge className="bg-emerald-100 text-emerald-800">acesso ativo{acessoAtivo.ultimoAcessoEm ? ` · abriu ${fmt(acessoAtivo.ultimoAcessoEm)}` : " · ainda não abriu"}</Badge> : <Badge variant="muted">sem acesso</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {/* ---- link ---- */}
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={gerando || !temPlanoAtivo} onClick={() => void gerarLink()} title={temPlanoAtivo ? "" : "Por enquanto o portal é só para quem está em plano ativo"}>
              <Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> {acessoAtivo ? "Gerar novo link" : "Gerar link de acesso"}
            </Button>
            {!temPlanoAtivo ? <span className="text-xs text-muted-foreground">Só para pacientes em plano ativo (decisão do Lucas, 15/09).</span> : null}
            {acessoAtivo ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-red-700"
                onClick={async () => {
                  if (!(await confirmar("Revogar o acesso deste paciente?", { corpo: "O link e a sessão no aparelho dele param de funcionar na hora.", destrutivo: true, confirmar: "Revogar" }))) return;
                  await revogarRemotePacienteAcesso(acessoAtivo.id);
                  setLink("");
                  await invalidar("portal-acessos");
                  toast("Acesso revogado.", { tom: "ok" });
                }}
              >
                <ShieldOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Revogar
              </Button>
            ) : null}
          </div>
          {link ? (
            <div className="rounded-md border border-brand-oliva/20 bg-white/80 p-2.5">
              <p className="break-all font-mono text-[11px] text-brand-tinta">{link}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void copiar()}>
                  <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Copiar link
                </Button>
                {telefoneDigitos ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={`https://wa.me/55${telefoneDigitos.replace(/^55/, "")}?text=${encodeURIComponent(mensagemWhatsApp)}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Abrir WhatsApp com a mensagem
                    </a>
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Este link só aparece agora. Se fechar sem copiar, gere outro.</p>
            </div>
          ) : null}
          {isCoordenacao(cargo) && eventos.data?.length ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Últimos acessos do paciente ({eventos.data.length})</summary>
              <ul className="mt-1 grid gap-0.5">
                {eventos.data.map((e) => (
                  <li key={e.id}>
                    {fmt(e.criadoEm)} · {ACAO_LABEL[e.acao] ?? e.acao.toLowerCase()}
                    {e.detalhe?.pesoKg ? ` (${String(e.detalhe.pesoKg).replace(".", ",")} kg)` : ""}
                    {e.detalhe?.resposta ? ` (${String(e.detalhe.resposta).toLowerCase()})` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        {/* ---- próxima consulta ---- */}
        <div className="grid gap-2 border-t border-brand-oliva/15 pt-3">
          <p className="flex items-center gap-1.5 font-semibold text-brand-tinta">
            <CalendarPlus className="h-4 w-4 text-brand-oliva" aria-hidden="true" /> Próxima consulta
            <InfoTip title="Enquanto a agenda não está espelhada">Digite aqui a data marcada no Feegow ou iClinic. O paciente vê no portal e confirma com um toque; se pedir para remarcar, cai na Fila do dia da recepção. Quando a agenda espelhada for ligada, isto passa a vir sozinho.</InfoTip>
          </p>
          <div className="grid gap-2 sm:grid-cols-[9.5rem_6rem_1fr_auto]">
            <Input type="date" value={consulta.dia} onChange={(e) => setConsulta({ ...consulta, dia: e.target.value })} aria-label="Dia" className="h-9" />
            <Input type="time" value={consulta.hora} onChange={(e) => setConsulta({ ...consulta, hora: e.target.value })} aria-label="Hora" className="h-9" />
            <select value={consulta.profissional} onChange={(e) => setConsulta({ ...consulta, profissional: e.target.value })} className="h-9 rounded-md border border-brand-oliva/25 bg-white px-2 text-sm" aria-label="Profissional">
              {["Dr. Daniel", "Enfermagem", "Nutrição", "Barbara", "Gessica", "Juliana"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" className="h-9" disabled={salvando} onClick={() => void salvarConsulta()}>
              Registrar
            </Button>
          </div>
          {consultas.data?.length ? (
            <ul className="grid gap-1">
              {consultas.data.slice(0, 5).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 px-2.5 py-1.5">
                  <span>
                    {fmt(c.em)} · {c.profissional}
                    <Badge variant="outline" className={cn("ml-2 text-[10px]", c.status === "CONFIRMADA" && "border-emerald-300 text-emerald-800", c.status === "REMARCAR" && "border-amber-300 text-amber-800")}>
                      {c.status.toLowerCase()}
                    </Badge>
                  </span>
                  {c.status === "AGENDADA" || c.status === "CONFIRMADA" || c.status === "REMARCAR" ? (
                    <span className="flex gap-1">
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void updateRemotePacienteConsultaStatus(c.id, "REALIZADA")
                          .then(() => invalidar("portal-consultas"))
                          .catch(() => toast("Não deu para marcar a consulta como realizada. Tente de novo.", { tom: "erro" }))}>
                        realizada
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-700" onClick={() => void updateRemotePacienteConsultaStatus(c.id, "CANCELADA")
                          .then(() => invalidar("portal-consultas"))
                          .catch(() => toast("Não deu para marcar a consulta como cancelada. Tente de novo.", { tom: "erro" }))}>
                        cancelar
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* ---- medições ---- */}
        <div className="grid gap-2 border-t border-brand-oliva/15 pt-3">
          <p className="flex items-center gap-1.5 font-semibold text-brand-tinta">
            <Scale className="h-4 w-4 text-brand-oliva" aria-hidden="true" /> Bioimpedância e peso
            <InfoTip title="A curva do paciente">Lance aqui o resultado de cada bioimpedância. Vira a curva no portal e alimenta o semáforo de adesão. Vírgula para decimais.</InfoTip>
          </p>
          <div className="grid gap-2 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Label htmlFor={`med-dia-${contactRef}`} className="text-xs">Dia</Label>
              <Input id={`med-dia-${contactRef}`} type="date" value={medicao.dia} onChange={(e) => setMedicao({ ...medicao, dia: e.target.value })} className="mt-1 h-9" />
            </div>
            {(
              [
                ["peso", "Peso (kg)"],
                ["gordura", "Gordura (%)"],
                ["massaMagra", "Massa magra (kg)"],
                ["cintura", "Cintura (cm)"],
              ] as const
            ).map(([campo, rotulo]) => (
              <div key={campo}>
                <Label htmlFor={`med-${campo}-${contactRef}`} className="text-xs">{rotulo}</Label>
                <Input id={`med-${campo}-${contactRef}`} inputMode="decimal" value={medicao[campo]} onChange={(e) => setMedicao({ ...medicao, [campo]: e.target.value })} className="mt-1 h-9" placeholder="—" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={medicao.obs} onChange={(e) => setMedicao({ ...medicao, obs: e.target.value })} placeholder="Observação (opcional)" className="h-9 flex-1 min-w-[12rem]" />
            <Button type="button" size="sm" className="h-9" disabled={salvando} onClick={() => void salvarMedicao()}>
              Lançar medição
            </Button>
          </div>
          {medicoes.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Dia</th>
                    <th className="py-1 pr-3 text-right font-medium">Peso</th>
                    <th className="py-1 pr-3 text-right font-medium">Gordura</th>
                    <th className="py-1 pr-3 text-right font-medium">M. magra</th>
                    <th className="py-1 pr-3 text-right font-medium">Cintura</th>
                    <th className="py-1 pr-3 font-medium">Origem</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {medicoes.data.map((m) => (
                    <tr key={m.id} className="border-t border-brand-oliva/10">
                      <td className="py-1 pr-3 tabular-nums">{m.dia.slice(8, 10)}/{m.dia.slice(5, 7)}/{m.dia.slice(0, 4)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{m.pesoKg?.toLocaleString("pt-BR") ?? "—"}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{m.gorduraPct?.toLocaleString("pt-BR") ?? "—"}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{m.massaMagraKg?.toLocaleString("pt-BR") ?? "—"}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{m.cinturaCm?.toLocaleString("pt-BR") ?? "—"}</td>
                      <td className="py-1 pr-3">{m.origem === "PACIENTE" ? "paciente" : m.origem.toLowerCase()}</td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-red-700"
                          onClick={async () => {
                            if (!(await confirmar("Apagar esta medição?", { destrutivo: true, confirmar: "Apagar" }))) return;
                            await deleteRemotePacienteMedicao(m.id);
                            await invalidar("portal-medicoes");
                          }}
                        >
                          apagar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma medição ainda. A curva do portal nasce na primeira.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
