// PAINEL NARRADO (1.5) e PERGUNTAR AO 360 (1.4) — 15/09/2026. A IA recebe só os
// agregados que a tela já calculou; nunca calcula, e cada número vem com a fonte.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/avisos";
import { prefetchRoute } from "@/lib/routePreload";
import { invocarIntegracao, ultimoRemoteIaEvento } from "@/lib/remoteData";
import { cn } from "@/lib/utils";

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
    <Card className="border-brand-dourado/40 bg-brand-creme/30 shadow-none backdrop-blur print:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
          Resumo do mês escrito pela IA
          <InfoTip title="Como funciona">
            A IA recebe os números que este Painel já calculou (KPIs, pontos da reunião, ponte dos 3 lucros, momento do mês, semana em 8 números) e
            escreve o que aconteceu, por quê e o que fazer — citando de qual bloco cada número saiu. Ela não calcula nada e respeita a regra da
            casa: mês parcial não se compara com mês fechado. É rascunho: você lê, corrige e apresenta. Fica registrado em "O que a IA fez".
          </InfoTip>
          {geradaEm ? <Badge variant="muted">escrito em {geradaEm.slice(8, 10)}/{geradaEm.slice(5, 7)} {geradaEm.slice(11, 16)}</Badge> : null}
          {podeGerar ? (
            <Button type="button" size="sm" variant="outline" className="ml-auto h-8" disabled={gerando} onClick={() => void gerar()}>
              {gerando ? "Escrevendo…" : narrativa ? "Escrever de novo" : "Escrever o resumo"}
            </Button>
          ) : null}
        </CardTitle>
      </CardHeader>
      {narrativa ? (
        <CardContent className="grid gap-3 text-sm">
          <p className={cn("font-semibold text-brand-musgo", apresentando ? "text-2xl" : "text-lg")}>{narrativa.titulo}</p>
          <p className={cn("leading-relaxed text-brand-tinta", apresentando && "text-lg")}>{narrativa.resumo}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["O que aconteceu", narrativa.oQueAconteceu],
              ["Por quê", narrativa.porQue],
              ["O que fazer", narrativa.oQueFazer],
            ].map(([titulo, itens]) => (
              <div key={titulo as string} className="rounded-md border border-brand-oliva/15 bg-white/70 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-oliva">{titulo as string}</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-brand-tinta">
                  {(itens as string[]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {narrativa.alerta ? <p className="text-xs text-amber-900">Aviso da IA: {narrativa.alerta}</p> : null}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Números citados e suas fontes ({narrativa.numerosCitados.length})</summary>
            <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
              {narrativa.numerosCitados.map((n, i) => (
                <li key={`${n.valor}-${i}`}>
                  <span className="tabular-nums text-brand-tinta">{n.valor}</span> · {n.fonte}
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      ) : (
        <CardContent className="text-sm text-muted-foreground">{podeGerar ? "Ainda não há resumo para este mês. Clique em “Escrever o resumo” antes da reunião." : "O financeiro ainda não escreveu o resumo deste mês."}</CardContent>
      )}
    </Card>
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
    <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur print:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
          Perguntar ao 360
          <InfoTip title="Como funciona">
            Pergunte em português. A resposta usa só os números que esta tela já tem (a IA não calcula); vem como cartões com frase, tabela e
            botões para a tela certa. Quando o app ainda não mede algo, ela diz. Cada pergunta fica registrada em "O que a IA fez".
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void perguntarAgora(pergunta);
          }}
        >
          <Input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="ex.: quanto falta para a supermeta?" className="h-9 flex-1 min-w-[16rem]" />
          <Button type="submit" size="sm" disabled={ocupado || !pergunta.trim()}>
            {ocupado ? "Pensando…" : "Perguntar"}
          </Button>
        </form>
        {!resposta ? (
          <div className="flex flex-wrap gap-1.5">
            {exemplos.map((ex) => (
              <button key={ex} type="button" className="rounded-full border border-brand-oliva/25 bg-brand-papel/60 px-2.5 py-1 text-xs text-brand-tinta hover:border-brand-dourado" onClick={() => { setPergunta(ex); void perguntarAgora(ex); }}>
                {ex}
              </button>
            ))}
          </div>
        ) : null}
        {resposta ? (
          <div className="grid gap-3">
            <p className={cn("leading-relaxed text-brand-tinta", resposta.naoSei && "text-amber-900")}>{resposta.respostaCurta}</p>
            {resposta.cartoes.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {resposta.cartoes.map((c) => (
                  <div key={c.rotulo} className="rounded-md border border-brand-oliva/15 bg-brand-papel/50 p-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-brand-oliva">{c.rotulo}</p>
                    <p className="text-xl font-bold tabular-nums text-brand-tinta">{c.valor}</p>
                    <p className="text-xs text-muted-foreground">{c.frase}</p>
                    <p className="text-[10px] text-muted-foreground">fonte: {c.fonte}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {resposta.tabela.linhas.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      {resposta.tabela.colunas.map((c) => (
                        <th key={c} className="py-1 pr-3 font-medium">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resposta.tabela.linhas.map((linha, i) => (
                      <tr key={i} className="border-t border-brand-oliva/10">
                        {linha.map((cel, j) => (
                          <td key={j} className="py-1 pr-3 tabular-nums text-brand-tinta">{cel}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {resposta.acoes.length ? (
              <div className="flex flex-wrap gap-1.5">
                {resposta.acoes.map((a) => (
                  <Button key={a.href + a.rotulo} asChild size="sm" variant="outline" onPointerEnter={() => prefetchRoute(a.href)}>
                    <a href={a.href}>{a.rotulo}</a>
                  </Button>
                ))}
              </div>
            ) : null}
            <button type="button" className="w-fit text-xs text-muted-foreground underline" onClick={() => { setResposta(null); setPergunta(""); }}>
              outra pergunta
            </button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
