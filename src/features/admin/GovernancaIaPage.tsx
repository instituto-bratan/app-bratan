// O QUE A IA FEZ (14/09/2026, propostas 1.6, 6.2 e 6.5 do estudo de evolução).
//
// Uma tela só para três obrigações: (1) ver cada ação da IA do dia — o que leu,
// o que propôs, quanto custou, quem aprovou; (2) o INVENTÁRIO dos sistemas de IA
// com a classe de risco do Anexo II da Resolução CFM 2.454/2026, que quem
// contrata IA precisa manter; (3) o REGIME DE DADOS combinado em 14/09: o que
// cada fluxo pode usar e o que nunca passa por modelo nenhum.
//
// Redesenho Papel & Musgo, etapa 4 (08/10/2026): cabeçalho com a frase do dia,
// os quatro números numa faixa de leitura (saber), o registro de ações numa
// folha (é onde se decide: aceitei · ajustei · estava errado, este na ponta) e o
// inventário e o regime de dados em blocos de leitura. Mesmos dados e botões.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, CheckCircle2, ShieldCheck, ThumbsDown, ThumbsUp, Wrench } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, canFinanceiroFull } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { listRemoteIaEventos, revisarRemoteIaEvento, type IaEventoRecord } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { contagem } from "./frasesAjustes";
import { CabecaDaFolha, Etiqueta, FaixaDeNumeros, Leitura, NumeroComFrase, TituloDoSaber, Vazio, type TomEtiqueta, TituloComDica } from "./pecasAjustes";

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
// A classe de risco ganha o tom da situação — sempre com a palavra "risco …" ao lado.
const classeTom: Record<IaEventoRecord["classeRisco"], TomEtiqueta> = { BAIXO: "ok", MEDIO: "atencao", ALTO: "erro" };

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

  // dia LOCAL (29/09/2026, auditoria B7): toISOString() é UTC e depois das 21h em São Paulo já é "amanhã"; o
  // carimbo do evento também é convertido para o dia local antes de comparar.
  const hoje = todayISO();
  const mes = hoje.slice(0, 7);
  const resumo = useMemo(() => {
    const diaLocal = (carimbo: string) => {
      const d = new Date(carimbo);
      if (Number.isNaN(d.getTime())) return carimbo.slice(0, 10);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const doMes = eventos.filter((e) => diaLocal(e.createdAt).slice(0, 7) === mes);
    const doDia = eventos.filter((e) => diaLocal(e.createdAt) === hoje);
    const custoMes = doMes.reduce((s, e) => s + e.custoUsd, 0);
    const semRevisao = eventos.filter((e) => e.permissao === "PROPOSTA" && !e.decisao).length;
    const erros = doMes.filter((e) => e.permissao === "ERRO").length;
    const aceitos = doMes.filter((e) => e.decisao === "ACEITO").length;
    const revisados = doMes.filter((e) => e.decisao).length;
    return { doDia: doDia.length, doMes: doMes.length, custoMes, semRevisao, erros, aceitos, revisados };
  }, [eventos, hoje, mes]);

  const visiveis = eventos.filter((e) => (filtro === "revisar" ? e.permissao === "PROPOSTA" && !e.decisao : filtro === "erros" ? e.permissao === "ERRO" : true));

  const contagemPorFiltro = {
    todos: eventos.length,
    revisar: eventos.filter((e) => e.permissao === "PROPOSTA" && !e.decisao).length,
    erros: eventos.filter((e) => e.permissao === "ERRO").length,
  };

  const fraseDoTopo = (
    <>
      Hoje a IA fez <strong>{contagem(resumo.doDia, "ação", "ações")}</strong>; no mês, {resumo.doMes} ({resumo.erros} com erro).{" "}
      {resumo.semRevisao ? (
        <span className="alerta">{contagem(resumo.semRevisao, "proposta espera", "propostas esperam")} a sua revisão.</span>
      ) : (
        <>A IA só propõe; quem decide é a pessoa.</>
      )}
    </>
  );

  return (
    <AccessGate allowed={(cargo) => canAdministracao(cargo) || canFinanceiroFull(cargo)} label="Administração · O que a IA fez">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Ajustes · CFM 2.454/2026 · LGPD"
          titulo={
            <TituloComDica
              texto="O que a IA fez"
              tituloDaDica="Por que esta tela existe"
              dica={
                <>
                  Toda vez que o app usa um modelo de IA (ler um boleto, montar o plano de marketing, escrever um resumo) fica um registro aqui: o que
                  leu, o que propôs, quanto custou, com que confiança e quem revisou. A IA só propõe — a pessoa decide. É também o inventário de
                  sistemas de IA com classe de risco que a Resolução CFM 2.454/2026 pede de quem contrata IA, e o regime de dados combinado em
                  14/09/2026.
                </>
              }
            />
          }
          frase={fraseDoTopo}
        />

        <FaixaDeNumeros rotulo="A IA em números">
          <NumeroComFrase rotulo="Hoje" numero={resumo.doDia} frase="ações da IA" />
          <NumeroComFrase rotulo="No mês" numero={resumo.doMes} frase={`${resumo.erros} com erro`} />
          <NumeroComFrase rotulo="Custo do mês" numero={`US$ ${resumo.custoMes.toFixed(2)}`} frase="tokens ao preço público" />
          <NumeroComFrase
            rotulo="Sem revisão"
            numero={resumo.semRevisao}
            tom={resumo.semRevisao ? "atencao" : undefined}
            frase={resumo.revisados ? `${resumo.aceitos} de ${resumo.revisados} revisados foram aceitos` : "marque aceito, ajustado ou recusado"}
          />
        </FaixaDeNumeros>

        <BlocoFolha as="section" aria-labelledby="registro-ia" className="min-w-0 overflow-hidden">
          <CabecaDaFolha
            id="registro-ia"
            icone={<BrainCircuit />}
            titulo="Registro de ações"
            acoes={
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {(["todos", "revisar", "erros"] as const).map((f) => (
                  <Leitura
                    key={f}
                    ativa={filtro === f}
                    rotulo={f === "todos" ? "Todas" : f === "revisar" ? "Sem revisão" : "Com erro"}
                    numero={useRemote ? contagemPorFiltro[f] : undefined}
                    onClick={() => setFiltro(f)}
                  />
                ))}
              </div>
            }
          />
          {!useRemote ? (
            <Vazio icone={<BrainCircuit />} titulo="No modo prévia não há registro remoto." className="border-t border-fio">
              Com o app conectado, cada leitura e cada proposta da IA aparecem aqui.
            </Vazio>
          ) : null}
          {useRemote && !eventosQuery.isLoading && !visiveis.length ? (
            <Vazio icone={<BrainCircuit />} titulo="Nenhuma ação da IA registrada ainda." className="border-t border-fio">
              A primeira leitura da Caixa de entrada aparece aqui.
            </Vazio>
          ) : null}
          {visiveis.length ? (
            <ul>
              {visiveis.map((e) => (
                <li key={e.id} className={cn("grid gap-2 border-t border-fio px-6 py-4 max-md:px-4", e.permissao === "ERRO" && "bg-erro-claro/50")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold leading-4 tabular-nums text-tinta-2">{dataHora(e.createdAt)}</span>
                    <span className="text-[15px] font-bold leading-6 text-tinta">{INVENTARIO_IA.find((i) => i.funcao === e.funcao)?.nome ?? e.funcao}</span>
                    <Etiqueta tom={classeTom[e.classeRisco]}>risco {e.classeRisco.toLowerCase()}</Etiqueta>
                    {e.confianca !== null ? <Etiqueta tom={e.confianca >= 85 ? "ok" : "neutro"}>confiança {Math.round(e.confianca)}%</Etiqueta> : null}
                    {e.decisao ? <Etiqueta tom="musgo">{decisaoLabel[e.decisao]}</Etiqueta> : e.permissao === "PROPOSTA" ? <Etiqueta tom="atencao">aguardando revisão</Etiqueta> : null}
                    {e.permissao === "ERRO" ? <Etiqueta tom="erro">erro</Etiqueta> : null}
                  </div>
                  <p className="text-sm font-medium leading-[22px] text-tinta">{e.resumo}</p>
                  <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                    {e.modelo} · {e.tokensEntrada + e.tokensSaida} tokens · US$ {e.custoUsd.toFixed(4)}
                    {e.duracaoMs ? ` · ${(e.duracaoMs / 1000).toFixed(1)} s` : ""}
                    {e.atorNome ? ` · pedido por ${e.atorNome}` : ""}
                  </p>
                  {Array.isArray((e.resultado as { validacoes?: string[] }).validacoes) && (e.resultado as { validacoes: string[] }).validacoes.length ? (
                    <ul className="list-disc pl-5 text-[13px] font-medium leading-5 text-tinta-2">
                      {(e.resultado as { validacoes: string[] }).validacoes.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  ) : null}
                  {e.permissao === "PROPOSTA" && !e.decisao ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Botao tamanho="pq" variante="suave" className="max-md:h-10" icone={<ThumbsUp className="h-4 w-4" aria-hidden="true" />} onClick={() => revisar.mutate({ id: e.id, decisao: "ACEITO" })}>
                        Aceitei como veio
                      </Botao>
                      <Botao tamanho="pq" variante="secundario" className="max-md:h-10" icone={<Wrench className="h-4 w-4" aria-hidden="true" />} onClick={() => revisar.mutate({ id: e.id, decisao: "AJUSTADO" })}>
                        Ajustei antes de usar
                      </Botao>
                      {/* O "estava errado" mora na ponta oposta, longe do aceitar (regra do guia). */}
                      <Botao tamanho="pq" variante="perigo" className="max-md:h-10 sm:ml-auto" icone={<ThumbsDown className="h-4 w-4" aria-hidden="true" />} onClick={() => revisar.mutate({ id: e.id, decisao: "RECUSADO" })}>
                        Estava errado
                      </Botao>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </BlocoFolha>

        <div className="grid items-start gap-8 max-md:gap-6 lg:grid-cols-2">
          <BlocoSaber as="section" aria-labelledby="inventario-ia">
            <TituloDoSaber id="inventario-ia" resumo={contagem(INVENTARIO_IA.length, "sistema", "sistemas")}>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Inventário dos sistemas de IA
              </span>
            </TituloDoSaber>
            <p className="mb-4 text-[13px] font-medium leading-5 text-tinta-2">
              Anexo II da CFM 2.454/2026: agendamento e apoio administrativo são baixo risco; apoio à decisão clínica com supervisão é médio. Nenhum fluxo clínico está ligado hoje.
            </p>
            <ul className="grid">
              {INVENTARIO_IA.map((i) => (
                <li key={i.funcao} className="grid gap-1 border-t border-fio py-3.5 first:border-t-0 first:pt-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold leading-5 text-tinta">{i.nome}</span>
                    <Etiqueta tom={classeTom[i.classe]}>risco {i.classe.toLowerCase()}</Etiqueta>
                  </p>
                  <p className="text-xs font-semibold leading-4 text-tinta-2">{i.modelo}</p>
                  <p className="text-[13px] font-medium leading-5 text-tinta">{i.finalidade}</p>
                  <p className="text-[13px] font-medium leading-5 text-tinta-2 [&_strong]:font-bold [&_strong]:text-tinta">
                    <strong>Dados:</strong> {i.dados} <strong>Humano no circuito:</strong> {i.humano} <strong>Validação:</strong> {i.validacao}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-fio pt-3 text-[13px] font-medium leading-5 text-tinta-2">
              Diretor Técnico responsável pela governança de IA: Dr. Daniel Bratan (art. 14). Encarregado de dados (DPO): definido em Administração → Compliance.
            </p>
          </BlocoSaber>
          <BlocoSaber as="section" aria-labelledby="regime-dados">
            <TituloDoSaber id="regime-dados">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Regime de dados (14/09/2026)
              </span>
            </TituloDoSaber>
            <ul className="grid">
              {REGIME_DE_DADOS.map((r) => (
                <li key={r.fluxo} className="grid gap-1.5 border-t border-fio py-3.5 first:border-t-0 first:pt-0">
                  <p className="text-sm font-bold leading-5 text-tinta">{r.fluxo}</p>
                  <p className="text-[13px] font-medium leading-5 text-tinta">
                    <strong className="font-bold text-ok">Pode:</strong> {r.pode}
                  </p>
                  <p className="text-[13px] font-medium leading-5 text-tinta">
                    <strong className="font-bold text-erro">Nunca:</strong> {r.nunca}
                  </p>
                </li>
              ))}
            </ul>
          </BlocoSaber>
        </div>
      </div>
    </AccessGate>
  );
}
