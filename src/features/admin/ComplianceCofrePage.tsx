// COFRE DE COMPLIANCE (15/09/2026, proposta 6.1 do estudo; decisão D12).
//
// Um lugar só, em Administração, com o que a lei já pede da clínica e do app:
// DPO e substituto (LGPD art. 41), RIPD para WhatsApp/IA/Supabase, políticas e
// treinamentos, incidentes com o relógio de 3 dias úteis (ANPD), consentimentos
// por paciente (coletados na ficha do contato) e o inventário de IA (que mora em
// "O que a IA fez"). Textos são rascunhos para o advogado revisar; o app guarda
// datas, responsáveis e evidências — e imprime o relatório que uma fiscalização pede.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileText, Printer, ShieldCheck, Siren } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { perguntar, toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { listRemoteCompliance, listRemoteConsentimentos, saveRemoteCompliance, type ComplianceRegistro, type TipoConsentimento } from "@/lib/remoteData";
import { cn } from "@/lib/utils";

export const TIPOS_CONSENTIMENTO: { tipo: TipoConsentimento; rotulo: string; texto: string }[] = [
  { tipo: "LGPD", rotulo: "Tratamento de dados (LGPD)", texto: "Autorizo o Instituto Bratan a tratar meus dados pessoais e de saúde para o meu atendimento, agendamento, cobrança e obrigações legais, conforme a Política de Privacidade." },
  { tipo: "TRATAMENTO", rotulo: "Termo de consentimento do tratamento", texto: "Fui orientado(a) sobre o tratamento proposto, seus benefícios, riscos e alternativas, e concordo em realizá-lo." },
  { tipo: "IA", rotulo: "Apoio de inteligência artificial (CFM 2.454)", texto: "Fui informado(a) de que ferramentas de IA podem apoiar tarefas administrativas e, quando houver, clínicas — sempre revisadas por profissional. Posso recusar sem prejuízo do atendimento." },
  { tipo: "IMAGEM", rotulo: "Uso de imagem", texto: "Autorizo o uso da minha imagem para fins definidos por escrito (ex.: registro clínico de evolução). Divulgação em redes só com autorização específica." },
  { tipo: "MARKETING", rotulo: "Mensagens de marketing e resgate", texto: "Aceito receber mensagens do Instituto sobre novidades, campanhas e convites de retorno pelo WhatsApp, podendo cancelar a qualquer momento." },
];

const RIPD_ITENS = [
  { chave: "whatsapp", titulo: "WhatsApp (mensagens a pacientes)", pergunta: "Base legal, dados enviados, retenção e como o paciente cancela." },
  { chave: "ia", titulo: "IA (leitura de documentos financeiros; futuro clínico)", pergunta: "Quais dados vão ao provedor, transferência internacional, retenção zero, revisão humana." },
  { chave: "supabase", titulo: "Banco e arquivos (Supabase / SharePoint)", pergunta: "Onde ficam os dados, quem acessa (RLS por cargo), backups, incidentes." },
  { chave: "totem", titulo: "Totem de NPS", pergunta: "Anonimato da resposta; sem vínculo com prontuário." },
  { chave: "prontuario", titulo: "Prontuário (Feegow / iClinic)", pergunta: "Contrato de operador, exportação e portabilidade, prazo de guarda (20 anos)." },
];

function diasUteisDepois(iso: string, dias: number) {
  const data = new Date(iso);
  let restantes = dias;
  while (restantes > 0) {
    data.setDate(data.getDate() + 1);
    const dow = data.getDay();
    if (dow !== 0 && dow !== 6) restantes -= 1;
  }
  return data.toISOString();
}

function Bloco({ titulo, icone: Icone, ok, children, ajuda }: { titulo: string; icone: typeof ShieldCheck; ok: boolean | null; children: React.ReactNode; ajuda?: string }) {
  return (
    <Card className={cn("border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur", ok === false && "border-amber-300")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Icone className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
          {titulo}
          {ok === true ? <Badge className="bg-emerald-100 text-emerald-800">em dia</Badge> : ok === false ? <Badge className="bg-amber-100 text-amber-900">pendente</Badge> : null}
          {ajuda ? <InfoTip title={titulo}>{ajuda}</InfoTip> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">{children}</CardContent>
    </Card>
  );
}

export function ComplianceCofrePage() {
  const { pessoa } = useAuth();
  const queryClient = useQueryClient();
  const podeEditar = isCoordenacao(pessoa?.cargo);
  const registrosQuery = useQuery({ queryKey: ["compliance"], queryFn: listRemoteCompliance, staleTime: 60_000 });
  const consentimentosQuery = useQuery({ queryKey: ["consentimentos-todos"], queryFn: () => listRemoteConsentimentos(), staleTime: 120_000 });
  const registros = registrosQuery.data ?? [];
  const dpo = registros.find((r) => r.tipo === "DPO" && r.status !== "ENCERRADO") ?? null;
  const ripd = registros.filter((r) => r.tipo === "RIPD");
  const incidentes = registros.filter((r) => r.tipo === "INCIDENTE");
  const politicas = registros.filter((r) => r.tipo === "POLITICA" || r.tipo === "TREINAMENTO");
  const [dpoForm, setDpoForm] = useState({ responsavel: "", substituto: "", email: "", vigenteDe: todayISO() });
  const [salvando, setSalvando] = useState(false);

  const consentimentosPorTipo = useMemo(() => {
    const mapa = new Map<TipoConsentimento, { pacientes: Set<string>; aceitos: number; recusados: number }>();
    for (const c of consentimentosQuery.data ?? []) {
      const atual = mapa.get(c.tipo) ?? { pacientes: new Set<string>(), aceitos: 0, recusados: 0 };
      if (!atual.pacientes.has(c.contactRef)) {
        atual.pacientes.add(c.contactRef);
        if (c.aceito && !c.revogadoEm) atual.aceitos += 1;
        else atual.recusados += 1;
      }
      mapa.set(c.tipo, atual);
    }
    return mapa;
  }, [consentimentosQuery.data]);

  async function salvar(registro: Partial<ComplianceRegistro> & { tipo: ComplianceRegistro["tipo"]; titulo: string }) {
    setSalvando(true);
    try {
      await saveRemoteCompliance(registro, pessoa?.id ?? null);
      await queryClient.invalidateQueries({ queryKey: ["compliance"] });
      toast("Registrado no cofre.", { tom: "ok" });
    } catch (error) {
      toast(`Não consegui salvar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    } finally {
      setSalvando(false);
    }
  }

  async function registrarIncidente() {
    const titulo = await perguntar("O que aconteceu?", { placeholder: "ex.: e-mail com lista de pacientes enviado ao destinatário errado", multilinha: true, confirmar: "Abrir incidente" });
    if (!titulo?.trim()) return;
    const agora = new Date().toISOString();
    await salvar({ tipo: "INCIDENTE", titulo: titulo.trim(), status: "ABERTO", prazoEm: diasUteisDepois(agora, 3), detalhe: { abertoEm: agora, passos: ["conter", "avaliar risco aos titulares", "comunicar ANPD e titulares se houver risco relevante", "registrar lições"] }, responsavel: dpo?.responsavel ?? "" });
  }

  async function marcarRipd(item: (typeof RIPD_ITENS)[number]) {
    const existente = ripd.find((r) => (r.detalhe as { chave?: string }).chave === item.chave);
    const nota = await perguntar(`RIPD — ${item.titulo}`, { corpo: item.pergunta, valorInicial: existente ? String((existente.detalhe as { nota?: string }).nota ?? "") : "", multilinha: true, confirmar: existente ? "Atualizar" : "Registrar como revisado" });
    if (nota === null) return;
    await salvar({ id: existente?.id, tipo: "RIPD", titulo: item.titulo, status: "REVISADO", vigenteDe: todayISO(), detalhe: { chave: item.chave, nota, revisadoEm: new Date().toISOString(), por: pessoa?.nome ?? "" } });
  }

  return (
    <AccessGate allowed={(cargo) => isCoordenacao(cargo)} label="Administração · Cofre de compliance">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 print:max-w-none">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Administração</Badge>
            <Badge variant="muted">LGPD · CFM 2.454 · ANPD</Badge>
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-3xl text-brand-musgo">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
            Cofre de compliance
            <InfoTip title="O que fica aqui">
              O que uma fiscalização da ANPD ou do CRM pede para ver: quem é o encarregado (DPO) e o substituto, o relatório de impacto (RIPD)
              revisado por fluxo, os consentimentos de cada paciente com data e canal, o inventário de IA com classe de risco e o registro de
              incidentes com o prazo de 3 dias úteis. Os textos dos termos são rascunhos — passe pelo advogado antes de imprimir na ficha.
            </InfoTip>
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" /> Imprimir relatório
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/administracao/ia">Inventário de IA (O que a IA fez)</Link>
            </Button>
            {podeEditar ? (
              <Button type="button" size="sm" variant="outline" className="border-red-300 text-red-800" onClick={() => void registrarIncidente()}>
                <Siren className="mr-1.5 h-4 w-4" aria-hidden="true" /> Registrar incidente
              </Button>
            ) : null}
          </div>
        </motion.section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Bloco titulo="Encarregado (DPO) e substituto" icone={ShieldCheck} ok={dpo ? true : false} ajuda="A LGPD exige um encarregado nomeado, com contato público e autonomia; a ANPD pede também um substituto. Pode ser alguém de dentro.">
            {dpo ? (
              <div>
                <p className="font-semibold text-brand-tinta">{dpo.responsavel}</p>
                <p className="text-muted-foreground">substituto: {dpo.substituto || "—"} · contato: {String((dpo.detalhe as { email?: string }).email ?? "—")} · desde {dpo.vigenteDe ?? "—"}</p>
              </div>
            ) : (
              <p className="text-amber-900">Ninguém nomeado ainda (decisão D12).</p>
            )}
            {podeEditar ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dpo-resp">Encarregado</Label>
                  <Input id="dpo-resp" className="mt-1" value={dpoForm.responsavel} onChange={(e) => setDpoForm({ ...dpoForm, responsavel: e.target.value })} placeholder="Nome" />
                </div>
                <div>
                  <Label htmlFor="dpo-sub">Substituto</Label>
                  <Input id="dpo-sub" className="mt-1" value={dpoForm.substituto} onChange={(e) => setDpoForm({ ...dpoForm, substituto: e.target.value })} placeholder="Nome" />
                </div>
                <div>
                  <Label htmlFor="dpo-email">Contato público</Label>
                  <Input id="dpo-email" className="mt-1" value={dpoForm.email} onChange={(e) => setDpoForm({ ...dpoForm, email: e.target.value })} placeholder="privacidade@institutobratan.com.br" />
                </div>
                <div>
                  <Label htmlFor="dpo-desde">Vigente desde</Label>
                  <Input id="dpo-desde" type="date" className="mt-1" value={dpoForm.vigenteDe} onChange={(e) => setDpoForm({ ...dpoForm, vigenteDe: e.target.value })} />
                </div>
                <Button type="button" size="sm" className="w-fit" disabled={salvando || !dpoForm.responsavel.trim()} onClick={() => void salvar({ id: dpo?.id, tipo: "DPO", titulo: "Encarregado de dados", responsavel: dpoForm.responsavel.trim(), substituto: dpoForm.substituto.trim(), status: "VIGENTE", vigenteDe: dpoForm.vigenteDe, detalhe: { email: dpoForm.email.trim() } })}>
                  {dpo ? "Atualizar nomeação" : "Nomear"}
                </Button>
              </div>
            ) : null}
          </Bloco>

          <Bloco titulo="RIPD — relatório de impacto por fluxo" icone={FileText} ok={ripd.length >= RIPD_ITENS.length ? true : ripd.length ? null : false} ajuda="Um item por fluxo de dados. Marque como revisado com a nota do que foi analisado; a data e quem revisou ficam gravados.">
            <ul className="grid gap-1.5">
              {RIPD_ITENS.map((item) => {
                const feito = ripd.find((r) => (r.detalhe as { chave?: string }).chave === item.chave);
                return (
                  <li key={item.chave} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-oliva/15 bg-brand-papel/50 px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5">
                      {feito ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />}
                      <span className="font-semibold text-brand-tinta">{item.titulo}</span>
                      {feito ? <span className="text-xs text-muted-foreground">revisado em {feito.vigenteDe}</span> : null}
                    </span>
                    {podeEditar ? (
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void marcarRipd(item)}>
                        {feito ? "Ver / atualizar" : "Revisar"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Bloco>

          <Bloco titulo="Consentimentos dos pacientes" icone={CheckCircle2} ok={null} ajuda="Coletados na ficha do contato (Editar cadastro → Consentimentos) com data, canal e quem coletou. Aqui, a contagem por finalidade.">
            <ul className="grid gap-1">
              {TIPOS_CONSENTIMENTO.map((t) => {
                const c = consentimentosPorTipo.get(t.tipo);
                return (
                  <li key={t.tipo} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-brand-tinta">{t.rotulo}</span>
                    <span className="tabular-nums text-muted-foreground">{c ? `${c.aceitos} aceito${c.aceitos === 1 ? "" : "s"} · ${c.recusados} recusado${c.recusados === 1 ? "" : "s"}` : "nenhum registro"}</span>
                  </li>
                );
              })}
            </ul>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-brand-tinta">Textos dos termos (rascunho para o advogado)</summary>
              <ul className="mt-1 grid gap-1">
                {TIPOS_CONSENTIMENTO.map((t) => (
                  <li key={t.tipo}>
                    <strong>{t.rotulo}:</strong> {t.texto}
                  </li>
                ))}
              </ul>
            </details>
          </Bloco>

          <Bloco titulo="Incidentes (relógio de 3 dias úteis)" icone={Siren} ok={incidentes.some((i) => i.status === "ABERTO") ? false : true} ajuda="A ANPD pede comunicação em 3 dias úteis quando há risco relevante aos titulares. Registrar aqui já calcula o prazo e guarda o passo a passo.">
            {incidentes.length ? (
              <ul className="grid gap-1.5">
                {incidentes.map((i) => {
                  const atrasado = i.status === "ABERTO" && i.prazoEm && i.prazoEm < new Date().toISOString();
                  return (
                    <li key={i.id} className={cn("rounded-md border px-2.5 py-1.5", i.status === "ABERTO" ? (atrasado ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50") : "border-brand-oliva/15 bg-brand-papel/50")}>
                      <p className="font-semibold text-brand-tinta">{i.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        aberto {i.criadoEm.slice(0, 10)} · prazo {i.prazoEm ? new Date(i.prazoEm).toLocaleString("pt-BR") : "—"} · {i.status.toLowerCase()}
                        {podeEditar && i.status === "ABERTO" ? (
                          <button type="button" className="ml-2 font-semibold underline" onClick={() => void salvar({ id: i.id, tipo: "INCIDENTE", titulo: i.titulo, status: "ENCERRADO", encerradoEm: new Date().toISOString(), detalhe: i.detalhe })}>
                            encerrar
                          </button>
                        ) : null}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground">Nenhum incidente registrado.</p>
            )}
          </Bloco>

          <Bloco titulo="Políticas e treinamentos" icone={FileText} ok={politicas.length ? true : false} ajuda="Política de privacidade, política de uso de IA, termo de confidencialidade da equipe e a data do último treinamento.">
            {politicas.length ? (
              <ul className="grid gap-1">
                {politicas.map((p) => (
                  <li key={p.id} className="text-sm text-brand-tinta">
                    {p.titulo} <span className="text-xs text-muted-foreground">· {p.tipo.toLowerCase()} · {p.vigenteDe ?? p.criadoEm.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Nada registrado ainda.</p>
            )}
            {podeEditar ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void perguntar("Nome da política", { placeholder: "ex.: Política de uso de IA v1", confirmar: "Registrar" }).then((t) => { if (t?.trim()) void salvar({ tipo: "POLITICA", titulo: t.trim(), status: "VIGENTE", vigenteDe: todayISO() }); })}>
                  Registrar política
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void perguntar("Treinamento realizado", { placeholder: "ex.: LGPD para recepção — 12 pessoas", confirmar: "Registrar" }).then((t) => { if (t?.trim()) void salvar({ tipo: "TREINAMENTO", titulo: t.trim(), status: "REALIZADO", vigenteDe: todayISO() }); })}>
                  Registrar treinamento
                </Button>
              </div>
            ) : null}
          </Bloco>
        </div>
      </div>
    </AccessGate>
  );
}
