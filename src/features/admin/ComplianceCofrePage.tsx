// COFRE DE COMPLIANCE (15/09/2026, proposta 6.1 do estudo; decisão D12).
//
// Um lugar só, em Administração, com o que a lei já pede da clínica e do app:
// DPO e substituto (LGPD art. 41), RIPD para WhatsApp/IA/Supabase, políticas e
// treinamentos, incidentes com o relógio de 3 dias úteis (ANPD), consentimentos
// por paciente (coletados na ficha do contato) e o inventário de IA (que mora em
// "O que a IA fez"). Textos são rascunhos para o advogado revisar; o app guarda
// datas, responsáveis e evidências — e imprime o relatório que uma fiscalização pede.
//
// Redesenho Papel & Musgo, etapa 4 (08/10/2026): cabeçalho com a frase de
// quantos itens estão pendentes, cada item numa folha com a situação em palavra
// (em dia · pendente) e as listas em linhas. Consentimentos, que é só leitura,
// fica num bloco de leitura (saber). Os mesmos registros, botões e o imprimir.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Printer, ShieldCheck, Siren } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, LinkSeta } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { perguntar, toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { listRemoteCompliance, listRemoteConsentimentos, saveRemoteCompliance, type ComplianceRegistro, type TipoConsentimento } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { contagem, diaCompleto, pendentesDoCofre } from "./frasesAjustes";
import { BOTAO_TEXTO, Campo, CampoTexto, Detalhes, Etiqueta, IconeDaSituacao, TituloDoSaber, TituloComDica } from "./pecasAjustes";

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
/** Um item do cofre numa folha: título, situação (em dia · pendente) e a dica. */
function Bloco({ titulo, icone: Icone, ok, children, ajuda, className }: { titulo: string; icone: typeof ShieldCheck; ok: boolean | null; children: React.ReactNode; ajuda?: string; className?: string }) {
  return (
    <BlocoFolha as="section" className={cn("min-w-0 break-inside-avoid", ok === false && "border-atencao/60", className)}>
      <div className="flex flex-wrap items-center gap-2 px-6 pb-2 pt-4 max-md:px-4">
        <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-base font-bold leading-6 text-tinta">
          <Icone className="h-4 w-4 stroke-oliva" aria-hidden="true" />
          {titulo}
        </h2>
        {ok === true ? <Etiqueta tom="ok">em dia</Etiqueta> : ok === false ? <Etiqueta tom="atencao">pendente</Etiqueta> : null}
        {ajuda ? <InfoTip title={titulo}>{ajuda}</InfoTip> : null}
      </div>
      <div className="grid gap-3 px-6 pb-5 text-sm max-md:px-4 max-md:pb-4">{children}</div>
    </BlocoFolha>
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

  const dpoEmDia = dpo ? true : false;
  const ripdEmDia = ripd.length >= RIPD_ITENS.length ? true : ripd.length ? null : false;
  const incidentesEmDia = incidentes.some((i) => i.status === "ABERTO") ? false : true;
  const politicasEmDia = politicas.length ? true : false;
  const pendentes = pendentesDoCofre([dpoEmDia, ripdEmDia, incidentesEmDia, politicasEmDia]);

  const fraseDoTopo = (
    <>
      {pendentes ? (
        <span className="alerta">{contagem(pendentes, "item pendente", "itens pendentes")}.</span>
      ) : (
        <strong>Os itens do cofre estão em dia.</strong>
      )}{" "}
      O que uma fiscalização da ANPD ou do CRM pede para ver, com data, responsável e evidência.
    </>
  );

  return (
    <AccessGate allowed={(cargo) => isCoordenacao(cargo)} label="Administração · Cofre de compliance">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6 print:max-w-none">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Ajustes · LGPD · CFM 2.454 · ANPD"
          titulo={
            <TituloComDica
              texto="Cofre de compliance"
              tituloDaDica="O que fica aqui"
              dica={
                <>
                  O que uma fiscalização da ANPD ou do CRM pede para ver: quem é o encarregado (DPO) e o substituto, o relatório de impacto (RIPD)
                  revisado por fluxo, os consentimentos de cada paciente com data e canal, o inventário de IA com classe de risco e o registro de
                  incidentes com o prazo de 3 dias úteis. Os textos dos termos são rascunhos — passe pelo advogado antes de imprimir na ficha.
                </>
              }
            />
          }
          frase={fraseDoTopo}
          acoes={
            <>
              {podeEditar ? (
                <Botao variante="perigo" className="print:hidden" icone={<Siren className="h-4 w-4" aria-hidden="true" />} onClick={() => void registrarIncidente()}>
                  Registrar incidente
                </Botao>
              ) : null}
              <Botao variante="secundario" className="print:hidden" icone={<Printer className="h-4 w-4" aria-hidden="true" />} onClick={() => window.print()}>
                Imprimir relatório
              </Botao>
            </>
          }
          rodape={
            <p className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-fio pt-4 text-sm font-medium leading-5 text-tinta-2 print:hidden">
              <span>O inventário de IA com a classe de risco mora em outra tela.</span>
              <LinkSeta to="/administracao/ia">Inventário de IA (O que a IA fez)</LinkSeta>
            </p>
          }
        />

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Bloco titulo="Encarregado (DPO) e substituto" icone={ShieldCheck} ok={dpoEmDia} ajuda="A LGPD exige um encarregado nomeado, com contato público e autonomia; a ANPD pede também um substituto. Pode ser alguém de dentro.">
            {dpo ? (
              <div className="rounded-bloco bg-saber px-4 py-3">
                <p className="text-[15px] font-bold leading-6 text-tinta">{dpo.responsavel}</p>
                <p className="text-[13px] font-medium leading-5 text-tinta-2">
                  substituto: {dpo.substituto || "—"} · contato: {String((dpo.detalhe as { email?: string }).email ?? "—")} · desde{" "}
                  <span className="tabular-nums">{diaCompleto(dpo.vigenteDe)}</span>
                </p>
              </div>
            ) : (
              <p className="flex items-center gap-2 font-semibold text-atencao">
                <IconeDaSituacao ok={false} />
                Ninguém nomeado ainda (decisão D12).
              </p>
            )}
            {podeEditar ? (
              <div className="grid gap-3 sm:grid-cols-2 print:hidden">
                <Campo id="dpo-resp" rotulo="Encarregado">
                  <CampoTexto id="dpo-resp" value={dpoForm.responsavel} onChange={(e) => setDpoForm({ ...dpoForm, responsavel: e.target.value })} placeholder="Nome" />
                </Campo>
                <Campo id="dpo-sub" rotulo="Substituto">
                  <CampoTexto id="dpo-sub" value={dpoForm.substituto} onChange={(e) => setDpoForm({ ...dpoForm, substituto: e.target.value })} placeholder="Nome" />
                </Campo>
                <Campo id="dpo-email" rotulo="Contato público">
                  <CampoTexto id="dpo-email" value={dpoForm.email} onChange={(e) => setDpoForm({ ...dpoForm, email: e.target.value })} placeholder="privacidade@institutobratan.com.br" />
                </Campo>
                <Campo id="dpo-desde" rotulo="Vigente desde">
                  <CampoTexto id="dpo-desde" type="date" value={dpoForm.vigenteDe} onChange={(e) => setDpoForm({ ...dpoForm, vigenteDe: e.target.value })} />
                </Campo>
                <Botao
                  variante="primario"
                  className="w-fit max-md:h-11"
                  disabled={salvando || !dpoForm.responsavel.trim()}
                  onClick={() => void salvar({ id: dpo?.id, tipo: "DPO", titulo: "Encarregado de dados", responsavel: dpoForm.responsavel.trim(), substituto: dpoForm.substituto.trim(), status: "VIGENTE", vigenteDe: dpoForm.vigenteDe, detalhe: { email: dpoForm.email.trim() } })}
                >
                  {dpo ? "Atualizar nomeação" : "Nomear"}
                </Botao>
              </div>
            ) : null}
          </Bloco>

          <Bloco titulo="RIPD — relatório de impacto por fluxo" icone={FileText} ok={ripdEmDia} ajuda="Um item por fluxo de dados. Marque como revisado com a nota do que foi analisado; a data e quem revisou ficam gravados.">
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              <span className="font-bold tabular-nums text-tinta">
                {Math.min(ripd.length, RIPD_ITENS.length)} de {RIPD_ITENS.length}
              </span>{" "}
              fluxos revisados.
            </p>
            <ul className="-mx-6 max-md:-mx-4">
              {RIPD_ITENS.map((item) => {
                const feito = ripd.find((r) => (r.detalhe as { chave?: string }).chave === item.chave);
                return (
                  <li key={item.chave} className="flex flex-wrap items-center justify-between gap-2 border-t border-fio px-6 py-2.5 max-md:px-4">
                    <span className="flex min-w-0 items-start gap-2">
                      <IconeDaSituacao ok={Boolean(feito)} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block font-semibold leading-5 text-tinta">{item.titulo}</span>
                        {feito ? <span className="block text-xs font-semibold leading-4 tabular-nums text-tinta-2">revisado em {diaCompleto(feito.vigenteDe)}</span> : null}
                      </span>
                    </span>
                    {podeEditar ? (
                      <Botao tamanho="pq" variante={feito ? "fantasma" : "suave"} className="print:hidden max-md:h-10" onClick={() => void marcarRipd(item)}>
                        {feito ? "Ver / atualizar" : "Revisar"}
                      </Botao>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Bloco>

          <BlocoSaber as="section" aria-labelledby="cofre-consentimentos" className="grid min-w-0 gap-3 break-inside-avoid">
            <TituloDoSaber id="cofre-consentimentos" className="mb-0">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                Consentimentos dos pacientes
                <InfoTip title="Consentimentos dos pacientes">Coletados na ficha do contato (Editar cadastro → Consentimentos) com data, canal e quem coletou. Aqui, a contagem por finalidade.</InfoTip>
              </span>
            </TituloDoSaber>
            <ul className="grid">
              {TIPOS_CONSENTIMENTO.map((t) => {
                const c = consentimentosPorTipo.get(t.tipo);
                return (
                  <li key={t.tipo} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-fio py-2.5 text-sm first:border-t-0 first:pt-0">
                    <span className="font-semibold text-tinta">{t.rotulo}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-tinta-2">{c ? `${c.aceitos} aceito${c.aceitos === 1 ? "" : "s"} · ${c.recusados} recusado${c.recusados === 1 ? "" : "s"}` : "nenhum registro"}</span>
                  </li>
                );
              })}
            </ul>
            <Detalhes resumo="Textos dos termos (rascunho para o advogado)">
              <ul className="grid gap-1.5">
                {TIPOS_CONSENTIMENTO.map((t) => (
                  <li key={t.tipo}>
                    <strong className="font-bold text-tinta">{t.rotulo}:</strong> {t.texto}
                  </li>
                ))}
              </ul>
            </Detalhes>
          </BlocoSaber>

          <Bloco titulo="Incidentes (relógio de 3 dias úteis)" icone={Siren} ok={incidentesEmDia} ajuda="A ANPD pede comunicação em 3 dias úteis quando há risco relevante aos titulares. Registrar aqui já calcula o prazo e guarda o passo a passo.">
            {incidentes.length ? (
              <ul className="-mx-6 max-md:-mx-4">
                {incidentes.map((i) => {
                  const atrasado = i.status === "ABERTO" && i.prazoEm && i.prazoEm < new Date().toISOString();
                  return (
                    <li
                      key={i.id}
                      className={cn(
                        "border-t border-fio px-6 py-2.5 max-md:px-4",
                        i.status === "ABERTO" && (atrasado ? "bg-erro-claro" : "bg-atencao-claro"),
                      )}
                    >
                      <p className="flex flex-wrap items-center gap-2 font-bold leading-5 text-tinta">
                        {i.titulo}
                        {i.status === "ABERTO" ? <Etiqueta tom={atrasado ? "erro" : "atencao"}>{atrasado ? "prazo vencido" : "aberto"}</Etiqueta> : <Etiqueta>{i.status.toLowerCase()}</Etiqueta>}
                      </p>
                      <p className="mt-0.5 text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                        aberto {diaCompleto(i.criadoEm)} · prazo {i.prazoEm ? new Date(i.prazoEm).toLocaleString("pt-BR") : "—"}
                        {podeEditar && i.status === "ABERTO" ? (
                          <button type="button" className={cn(BOTAO_TEXTO, "ml-3 print:hidden")} onClick={() => void salvar({ id: i.id, tipo: "INCIDENTE", titulo: i.titulo, status: "ENCERRADO", encerradoEm: new Date().toISOString(), detalhe: i.detalhe })}>
                            encerrar
                          </button>
                        ) : null}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="font-medium text-tinta-2">Nenhum incidente registrado.</p>
            )}
          </Bloco>

          <Bloco titulo="Políticas e treinamentos" icone={FileText} ok={politicasEmDia} ajuda="Política de privacidade, política de uso de IA, termo de confidencialidade da equipe e a data do último treinamento." className="lg:col-span-2">
            {politicas.length ? (
              <ul className="-mx-6 max-md:-mx-4">
                {politicas.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-fio px-6 py-2.5 max-md:px-4">
                    <span className="font-semibold text-tinta">{p.titulo}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-tinta-2">
                      {p.tipo.toLowerCase()} · {diaCompleto(p.vigenteDe ?? p.criadoEm)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-medium text-tinta-2">Nada registrado ainda.</p>
            )}
            {podeEditar ? (
              <div className="flex flex-wrap gap-2 print:hidden">
                <Botao tamanho="pq" variante="secundario" className="max-md:h-10" onClick={() => void perguntar("Nome da política", { placeholder: "ex.: Política de uso de IA v1", confirmar: "Registrar" }).then((t) => { if (t?.trim()) void salvar({ tipo: "POLITICA", titulo: t.trim(), status: "VIGENTE", vigenteDe: todayISO() }); })}>
                  Registrar política
                </Botao>
                <Botao tamanho="pq" variante="secundario" className="max-md:h-10" onClick={() => void perguntar("Treinamento realizado", { placeholder: "ex.: LGPD para recepção — 12 pessoas", confirmar: "Registrar" }).then((t) => { if (t?.trim()) void salvar({ tipo: "TREINAMENTO", titulo: t.trim(), status: "REALIZADO", vigenteDe: todayISO() }); })}>
                  Registrar treinamento
                </Botao>
              </div>
            ) : null}
          </Bloco>
        </div>
      </div>
    </AccessGate>
  );
}
