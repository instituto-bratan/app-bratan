// O QUE A IA FEZ (14/09/2026, propostas 1.6, 6.2 e 6.5 do estudo de evolução).
//
// Uma tela só para três obrigações: (1) ver cada ação da IA do dia — o que leu,
// o que propôs, quanto custou, quem aprovou; (2) o INVENTÁRIO dos sistemas de IA
// com a classe de risco do Anexo II da Resolução CFM 2.454/2026, que quem
// contrata IA precisa manter; (3) o REGIME DE DADOS combinado em 14/09: o que
// cada fluxo pode usar e o que nunca passa por modelo nenhum.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BrainCircuit, CheckCircle2, ShieldCheck, ThumbsDown, ThumbsUp, Wrench } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, canFinanceiroFull } from "@/lib/access";
import { listRemoteIaEventos, revisarRemoteIaEvento, type IaEventoRecord } from "@/lib/remoteData";
import { cn } from "@/lib/utils";

/** Inventário dos sistemas de IA do app (CFM 2.454/2026, Anexo II e art. 14). Atualizar aqui quando nascer uma função nova. */
export const INVENTARIO_IA = [
  {
    funcao: "inbox-ler-documento",
    nome: "Leitura de documentos da Caixa de entrada",
    finalidade: "Ler boleto, nota fiscal, comprovante PIX e fatura para propor a conta a pagar.",
    dados: "Documentos financeiros de fornecedores. Sem dados de paciente.",
    modelo: "claude-sonnet-5 (Messages API)",
    classe: "BAIXO" as const,
    humano: "A pessoa confere e clica em “Virar conta”; nada é gravado sem clique.",
    validacao: "Dígitos verificadores da linha digitável e do CNPJ, valor e vencimento da linha prevalecem sobre a leitura.",
  },
  {
    funcao: "marketing-briefing-parse",
    nome: "Plano de conteúdo a partir do briefing de marketing",
    finalidade: "Transformar a foto ou PDF do briefing do mês em calendário de peças.",
    dados: "Briefing interno de marketing. Sem dados de paciente.",
    modelo: "claude-opus-4-8 (Messages API)",
    classe: "BAIXO" as const,
    humano: "O time de marketing edita cada peça antes de publicar.",
    validacao: "Esquema JSON fechado; nada é postado automaticamente.",
  },
  {
    funcao: "painel-narrar",
    nome: "Resumo do Painel do Mês para a reunião",
    finalidade: "Escrever o resumo de fechamento a partir dos números já calculados pelo app.",
    dados: "Agregados financeiros do mês. Sem dados de paciente.",
    modelo: "claude-opus-5 (Messages API, saída estruturada)",
    classe: "BAIXO" as const,
    humano: "O gestor lê e edita antes de apresentar; a IA não calcula números.",
    validacao: "Cada número do texto vem de uma tabela do Painel e é citado.",
  },
  {
    funcao: "perguntar-360",
    nome: "Perguntar ao 360 (caixa de pergunta do Painel)",
    finalidade: "Responder perguntas do gestor escolhendo cartões, tabela e ações a partir dos números da tela.",
    dados: "Agregados da tela (KPIs, metas, ocupação, semana). Sem dados de paciente.",
    modelo: "claude-sonnet-5 (Messages API, catálogo fechado de componentes)",
    classe: "BAIXO" as const,
    humano: "Resposta é leitura; ações só levam a telas do app. Quando falta o número, a IA diz que o app não mede.",
    validacao: "Rotas das ações filtradas por lista fixa; nenhuma escrita.",
  },
  {
    funcao: "mcp-360",
    nome: "Servidor MCP do Sistema 360 (beta)",
    finalidade: "Deixar um assistente autorizado (Claude Desktop/Code) ler a fila, contas e achados e propor lançamentos com confirmação.",
    dados: "Dados financeiros e do CRM conforme o cargo de quem conecta (JWT do colaborador).",
    modelo: "Não chama IA; é a porta de ferramentas (JSON-RPC).",
    classe: "MEDIO" as const,
    humano: "Toda escrita devolve prévia e só grava com confirmar=true; piloto só com Lucas e Dr. Daniel.",
    validacao: "Permissões por cargo em cada ferramenta; registro em integracao_evento a caminho.",
  },
];

export const REGIME_DE_DADOS = [
  { fluxo: "Financeiro (boletos, notas, extrato, comprovantes)", pode: "Claude Sonnet 5 ou Haiku 4.5 pela Messages API, sem nome de paciente nos documentos.", nunca: "Comandas com nome de paciente não são enviadas; só valores agregados." },
  { fluxo: "Clínico (prontuário, transcrição, resumo ao paciente)", pode: "Só recursos elegíveis a retenção zero e BAA (Messages, PDF inline, saída estruturada), em organização separada, com RIPD e aviso ao paciente (CFM 2.454, art. 5º).", nunca: "Managed Agents, Files API, lote, execução de código; nunca Claude Fable 5.1 (exige retenção de 30 dias). Ainda não há fluxo clínico ligado." },
  { fluxo: "Marketing", pode: "Briefings e textos internos com qualquer modelo aprovado.", nunca: "Antes e depois, depoimentos e imagens de pacientes." },
  { fluxo: "Onde os dados ficam", pode: "Provedor sem residência no Brasil: a transferência internacional consta no RIPD e no contrato (DPA).", nunca: "Chaves de API só em segredos do Supabase, nunca no app." },
];

const decisaoLabel: Record<NonNullable<IaEventoRecord["decisao"]>, string> = { ACEITO: "aceito", AJUSTADO: "ajustado", RECUSADO: "recusado" };
const classeTom: Record<IaEventoRecord["classeRisco"], string> = { BAIXO: "bg-emerald-100 text-emerald-800", MEDIO: "bg-amber-100 text-amber-800", ALTO: "bg-red-100 text-red-800" };

function dataHora(iso: string) {
  return iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
}

export function GovernancaIaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<"todos" | "revisar" | "erros">("todos");
  const eventosQuery = useQuery({ queryKey: ["ia-eventos"], queryFn: () => listRemoteIaEventos(300), enabled: useRemote, staleTime: 30_000 });
  const eventos = eventosQuery.data ?? [];
  const revisar = useMutation({
    mutationFn: ({ id, decisao }: { id: string; decisao: "ACEITO" | "AJUSTADO" | "RECUSADO" }) => revisarRemoteIaEvento(id, decisao, pessoa?.id ?? null),
    onSuccess: (_r, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["ia-eventos"] });
      toast(`Marcado como ${decisaoLabel[vars.decisao]}.`, { tom: "ok" });
    },
    onError: (error: Error) => toast(`Não consegui gravar: ${error.message}`, { tom: "erro" }),
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const mes = hoje.slice(0, 7);
  const resumo = useMemo(() => {
    const doMes = eventos.filter((e) => e.createdAt.slice(0, 7) === mes);
    const doDia = eventos.filter((e) => e.createdAt.slice(0, 10) === hoje);
    const custoMes = doMes.reduce((s, e) => s + e.custoUsd, 0);
    const semRevisao = eventos.filter((e) => e.permissao === "PROPOSTA" && !e.decisao).length;
    const erros = doMes.filter((e) => e.permissao === "ERRO").length;
    const aceitos = doMes.filter((e) => e.decisao === "ACEITO").length;
    const revisados = doMes.filter((e) => e.decisao).length;
    return { doDia: doDia.length, doMes: doMes.length, custoMes, semRevisao, erros, aceitos, revisados };
  }, [eventos, hoje, mes]);

  const visiveis = eventos.filter((e) => (filtro === "revisar" ? e.permissao === "PROPOSTA" && !e.decisao : filtro === "erros" ? e.permissao === "ERRO" : true));

  return (
    <AccessGate allowed={(cargo) => canAdministracao(cargo) || canFinanceiroFull(cargo)} label="Administração · O que a IA fez">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Governança</Badge>
            <Badge variant="muted">CFM 2.454/2026 · LGPD</Badge>
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
            <BrainCircuit className="h-7 w-7" aria-hidden="true" />
            O que a IA fez
            <InfoTip title="Por que esta tela existe">
              Toda vez que o app usa um modelo de IA (ler um boleto, montar o plano de marketing, escrever um resumo) fica um registro aqui: o que
              leu, o que propôs, quanto custou, com que confiança e quem revisou. A IA só propõe — a pessoa decide. É também o inventário de
              sistemas de IA com classe de risco que a Resolução CFM 2.454/2026 pede de quem contrata IA, e o regime de dados combinado em
              14/09/2026.
            </InfoTip>
          </h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { rotulo: "Hoje", valor: String(resumo.doDia), dica: "ações da IA" },
              { rotulo: "No mês", valor: String(resumo.doMes), dica: `${resumo.erros} com erro` },
              { rotulo: "Custo do mês", valor: `US$ ${resumo.custoMes.toFixed(2)}`, dica: "tokens ao preço público" },
              { rotulo: "Sem revisão", valor: String(resumo.semRevisao), dica: resumo.revisados ? `${resumo.aceitos} de ${resumo.revisados} revisados foram aceitos` : "marque aceito, ajustado ou recusado" },
            ].map((k) => (
              <div key={k.rotulo} className="rounded-lg border border-brand-oliva/15 bg-white/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{k.rotulo}</p>
                <p className="text-2xl font-bold tabular-nums text-brand-tinta">{k.valor}</p>
                <p className="text-xs text-muted-foreground">{k.dica}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <Card className="border-brand-oliva/20 bg-white/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
              Registro de ações
              <div className="flex gap-1.5">
                {(["todos", "revisar", "erros"] as const).map((f) => (
                  <Button key={f} type="button" size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)}>
                    {f === "todos" ? "Todas" : f === "revisar" ? "Sem revisão" : "Com erro"}
                  </Button>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {!useRemote ? <p className="text-sm text-muted-foreground">No modo prévia não há registro remoto.</p> : null}
            {useRemote && !eventosQuery.isLoading && !visiveis.length ? <p className="text-sm text-muted-foreground">Nenhuma ação da IA registrada ainda. A primeira leitura da Caixa de entrada aparece aqui.</p> : null}
            {visiveis.map((e) => (
              <div key={e.id} className={cn("rounded-lg border p-3 text-sm", e.permissao === "ERRO" ? "border-red-200 bg-red-50/60" : "border-brand-oliva/15 bg-white/80")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{dataHora(e.createdAt)}</span>
                  <span className="font-semibold text-brand-tinta">{INVENTARIO_IA.find((i) => i.funcao === e.funcao)?.nome ?? e.funcao}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", classeTom[e.classeRisco])}>risco {e.classeRisco.toLowerCase()}</span>
                  {e.confianca !== null ? <Badge variant={e.confianca >= 85 ? "gold" : "muted"}>confiança {Math.round(e.confianca)}%</Badge> : null}
                  {e.decisao ? <Badge variant="muted">{decisaoLabel[e.decisao]}</Badge> : e.permissao === "PROPOSTA" ? <Badge variant="outline">aguardando revisão</Badge> : null}
                </div>
                <p className="mt-1 text-brand-tinta">{e.resumo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {e.modelo} · {e.tokensEntrada + e.tokensSaida} tokens · US$ {e.custoUsd.toFixed(4)}
                  {e.duracaoMs ? ` · ${(e.duracaoMs / 1000).toFixed(1)} s` : ""}
                  {e.atorNome ? ` · pedido por ${e.atorNome}` : ""}
                </p>
                {Array.isArray((e.resultado as { validacoes?: string[] }).validacoes) && (e.resultado as { validacoes: string[] }).validacoes.length ? (
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {(e.resultado as { validacoes: string[] }).validacoes.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                ) : null}
                {e.permissao === "PROPOSTA" && !e.decisao ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => revisar.mutate({ id: e.id, decisao: "ACEITO" })}>
                      <ThumbsUp className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Aceitei como veio
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => revisar.mutate({ id: e.id, decisao: "AJUSTADO" })}>
                      <Wrench className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Ajustei antes de usar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-700" onClick={() => revisar.mutate({ id: e.id, decisao: "RECUSADO" })}>
                      <ThumbsDown className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Estava errado
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-brand-oliva/20 bg-white/70">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-brand-musgo" aria-hidden="true" /> Inventário dos sistemas de IA
              </CardTitle>
              <p className="text-xs text-muted-foreground">Anexo II da CFM 2.454/2026: agendamento e apoio administrativo são baixo risco; apoio à decisão clínica com supervisão é médio. Nenhum fluxo clínico está ligado hoje.</p>
            </CardHeader>
            <CardContent className="grid gap-2">
              {INVENTARIO_IA.map((i) => (
                <div key={i.funcao} className="rounded-lg border border-brand-oliva/15 bg-white/80 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-brand-tinta">{i.nome}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", classeTom[i.classe])}>risco {i.classe.toLowerCase()}</span>
                    <span className="text-[11px] text-muted-foreground">{i.modelo}</span>
                  </div>
                  <p className="mt-1 text-xs text-brand-tinta">{i.finalidade}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <strong>Dados:</strong> {i.dados} <strong>Humano no circuito:</strong> {i.humano} <strong>Validação:</strong> {i.validacao}
                  </p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Diretor Técnico responsável pela governança de IA: Dr. Daniel Bratan (art. 14). Encarregado de dados (DPO): definido em Administração → Compliance.</p>
            </CardContent>
          </Card>
          <Card className="border-brand-dourado/40 bg-brand-creme/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-brand-musgo" aria-hidden="true" /> Regime de dados (14/09/2026)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {REGIME_DE_DADOS.map((r) => (
                <div key={r.fluxo} className="rounded-lg border border-brand-oliva/15 bg-white/80 p-3 text-sm">
                  <p className="font-semibold text-brand-tinta">{r.fluxo}</p>
                  <p className="mt-0.5 text-xs text-brand-tinta">
                    <strong>Pode:</strong> {r.pode}
                  </p>
                  <p className="mt-0.5 text-xs text-red-800">
                    <strong>Nunca:</strong> {r.nunca}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AccessGate>
  );
}
