// PAINEL NARRADO (1.5) e PERGUNTAR AO 360 (1.4) — 15/09/2026. A IA recebe só os
// agregados que a tela já calculou; nunca calcula, e cada número vem com a fonte.
//
// REDESENHO (08/10/2026, Papel & Musgo): o resumo é leitura (bloco "saber"); a
// pergunta é ação (bloco "folha", com o campo e os exemplos como escolhas). A
// chamada da IA, o registro e as respostas são os mesmos.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Sparkles } from "lucide-react";
import { BlocoFolha, BlocoSaber, Botao, botaoClasses } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
import { prefetchRoute } from "@/lib/routePreload";
import { invocarIntegracao, ultimoRemoteIaEvento } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { classeDoCampo, tabela } from "./pecasBancoFechamento";
import { Etiqueta, Numero, Rubrica } from "./pecasResultados";

type Narrativa = { titulo: string; resumo: string; oQueAconteceu: string[]; porQue: string[]; oQueFazer: string[]; numerosCitados: { valor: string; fonte: string }[]; alerta: string };

export function NarrativaDoMesCard({ monthKey, agregados, podeGerar, apresentando }: { monthKey: string; agregados: Record<string, unknown>; podeGerar: boolean; apresentando: boolean }) {
  const queryClient = useQueryClient();
  const salva = useQuery({ queryKey: ["narrativa", monthKey], queryFn: () => ultimoRemoteIaEvento("painel-narrar", monthKey), staleTime: 60_000 });
  const [gerando, setGerando] = useState(false);
  const narrativa = (salva.data?.resultado as Narrativa | undefined) ?? null;
  const geradaEm = salva.data?.createdAt ?? null;

  async function gerar() {
    setGerando(true);
    try {
      const r = await invocarIntegracao<{ ok: boolean; error?: string; narrativa?: Narrativa }>("painel-narrar", { monthKey, agregados });
      if (!r.ok) return toast(r.error ?? "A IA não respondeu.", { tom: "erro", duracaoMs: 7000 });
      toast("Resumo escrito. Leia e ajuste antes de apresentar.", { tom: "ok" });
      await queryClient.invalidateQueries({ queryKey: ["narrativa", monthKey] });
    } finally {
      setGerando(false);
    }
  }

  return (
    <BlocoSaber as="section" aria-labelledby={`narrativa-${monthKey}`} className="grid gap-4 print:hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Sparkles className="h-5 w-5 stroke-oliva" aria-hidden="true" />
        <h2 id={`narrativa-${monthKey}`} className="min-w-0 text-base font-bold leading-6 text-tinta">
          Resumo do mês escrito pela IA{" "}
          <InfoTip className="align-middle" title="Como funciona">
            A IA recebe os números que este Painel já calculou (KPIs, pontos da reunião, ponte dos 3 lucros, momento do mês, semana em 8 números) e
            escreve o que aconteceu, por quê e o que fazer — citando de qual bloco cada número saiu. Ela não calcula nada e respeita a regra da
            casa: mês parcial não se compara com mês fechado. É rascunho: você lê, corrige e apresenta. Fica registrado em "O que a IA fez".
          </InfoTip>
        </h2>
        {geradaEm ? <Etiqueta>escrito em {geradaEm.slice(8, 10)}/{geradaEm.slice(5, 7)} {geradaEm.slice(11, 16)}</Etiqueta> : null}
        {podeGerar ? (
          <Botao tamanho="pq" className="ml-auto" carregando={gerando} disabled={gerando} onClick={() => void gerar()}>
            {gerando ? "Escrevendo…" : narrativa ? "Escrever de novo" : "Escrever o resumo"}
          </Botao>
        ) : null}
      </div>
      {narrativa ? (
        <div className="grid gap-4">
          <p className={cn("font-bold text-tinta", apresentando ? "text-2xl leading-8" : "text-lg leading-7")}>{narrativa.titulo}</p>
          <p className={cn("max-w-[80ch] font-medium text-tinta", apresentando ? "text-lg leading-7" : "text-sm leading-6")}>{narrativa.resumo}</p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["O que aconteceu", narrativa.oQueAconteceu],
              ["Por quê", narrativa.porQue],
              ["O que fazer", narrativa.oQueFazer],
            ].map(([titulo, itens]) => (
              <div key={titulo as string} className="grid content-start gap-2 border-t border-fio-2 pt-3">
                <Rubrica as="h3">{titulo as string}</Rubrica>
                <ul className="grid list-disc gap-1 pl-4 text-sm font-medium leading-5 text-tinta marker:text-tinta-2">
                  {(itens as string[]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {narrativa.alerta ? <p className="text-[13px] font-bold leading-5 text-atencao">Aviso da IA: {narrativa.alerta}</p> : null}
          <details className="text-[13px] font-medium leading-5 text-tinta-2">
            <summary className="w-fit cursor-pointer rounded-controle font-bold text-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco">
              Números citados e suas fontes ({narrativa.numerosCitados.length})
            </summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {narrativa.numerosCitados.map((n, i) => (
                <li key={`${n.valor}-${i}`}>
                  <span className="font-bold tabular-nums text-tinta">{n.valor}</span> · {n.fonte}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        <p className="text-sm font-medium leading-5 text-tinta-2">
          {podeGerar ? "Ainda não há resumo para este mês. Clique em “Escrever o resumo” antes da reunião." : "O financeiro ainda não escreveu o resumo deste mês."}
        </p>
      )}
    </BlocoSaber>
  );
}

type Resposta360 = { respostaCurta: string; cartoes: { rotulo: string; valor: string; frase: string; fonte: string }[]; tabela: { colunas: string[]; linhas: string[][] }; acoes: { rotulo: string; href: string }[]; naoSei: boolean };

export function PerguntarAo360Card({ contexto, tela }: { contexto: Record<string, unknown>; tela: string }) {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<Resposta360 | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const exemplos = ["Quanto falta para a supermeta?", "Quais contas vencem esta semana?", "Como está a ocupação de sala?", "O que a semana mostra de diferente?"];

  async function perguntarAgora(texto: string) {
    const p = texto.trim();
    if (!p) return;
    setOcupado(true);
    try {
      const r = await invocarIntegracao<{ ok: boolean; error?: string; resposta?: Resposta360 }>("perguntar-360", { pergunta: p, contexto, tela });
      if (!r.ok || !r.resposta) return toast(r.error ?? "A IA não respondeu.", { tom: "erro", duracaoMs: 7000 });
      setResposta(r.resposta);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <BlocoFolha as="section" respiro aria-labelledby="perguntar-360" className="grid gap-4 print:hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MessageSquareText className="h-5 w-5 stroke-oliva" aria-hidden="true" />
        <h2 id="perguntar-360" className="min-w-0 text-base font-bold leading-6 text-tinta">
          Perguntar ao 360{" "}
          <InfoTip className="align-middle" title="Como funciona">
            Pergunte em português. A resposta usa só os números que esta tela já tem (a IA não calcula); vem como cartões com frase, tabela e
            botões para a tela certa. Quando o app ainda não mede algo, ela diz. Cada pergunta fica registrada em "O que a IA fez".
          </InfoTip>
        </h2>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void perguntarAgora(pergunta);
        }}
      >
        <input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="ex.: quanto falta para a supermeta?"
          aria-label="Sua pergunta ao 360"
          className={cn(classeDoCampo, "w-auto min-w-[16rem] flex-1")}
        />
        <Botao type="submit" variante="suave" carregando={ocupado} disabled={ocupado || !pergunta.trim()}>
          {ocupado ? "Pensando…" : "Perguntar"}
        </Botao>
      </form>
      {!resposta ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Perguntas de exemplo">
          {exemplos.map((ex) => (
            <button
              key={ex}
              type="button"
              className={cn(
                "min-h-[32px] rounded-controle border border-fio-2 px-3 py-1 text-left text-[13px] font-semibold leading-5 text-tinta-2 transition-colors duration-150 ease-papel",
                "hover:border-borda-campo hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
              )}
              onClick={() => {
                setPergunta(ex);
                void perguntarAgora(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      ) : null}
      {resposta ? (
        <div className="grid gap-4">
          <p className={cn("max-w-[80ch] text-sm font-medium leading-6", resposta.naoSei ? "font-bold text-atencao" : "text-tinta")}>{resposta.respostaCurta}</p>
          {resposta.cartoes.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {resposta.cartoes.map((c) => (
                <div key={c.rotulo} className="grid content-start gap-2 rounded-bloco bg-saber p-4">
                  <Rubrica>{c.rotulo}</Rubrica>
                  <Numero texto={c.valor} tamanho="pequeno" />
                  <p className="text-[13px] font-medium leading-5 text-tinta-2">{c.frase}</p>
                  <p className="text-xs font-medium leading-4 text-tinta-2">fonte: {c.fonte}</p>
                </div>
              ))}
            </div>
          ) : null}
          {resposta.tabela.linhas.length ? (
            <div className="overflow-x-auto">
              <table className={tabela.tabela}>
                <thead>
                  <tr>
                    {resposta.tabela.colunas.map((c) => (
                      <th key={c} className={tabela.th}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resposta.tabela.linhas.map((linha, i) => (
                    <tr key={i} className={tabela.linha}>
                      {linha.map((cel, j) => (
                        <td key={j} className={cn(tabela.td, "tabular-nums")}>
                          {cel}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {resposta.acoes.length ? (
            <div className="flex flex-wrap gap-2">
              {resposta.acoes.map((a) => (
                <a key={a.href + a.rotulo} href={a.href} className={botaoClasses({ variante: "secundario", tamanho: "pq" })} onPointerEnter={() => prefetchRoute(a.href)}>
                  {a.rotulo}
                </a>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="w-fit rounded-sm text-[13px] font-bold leading-5 text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
            onClick={() => {
              setResposta(null);
              setPergunta("");
            }}
          >
            outra pergunta
          </button>
        </div>
      ) : null}
    </BlocoFolha>
  );
}
