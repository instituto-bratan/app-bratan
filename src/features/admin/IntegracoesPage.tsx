// INTEGRAÇÕES — PRONTAS E DESLIGADAS (15/09/2026, lote C do "implemente tudo").
//
// Cada integração externa (WhatsApp oficial, NFS-e, contrato digital, agendas,
// avisos no celular, banco e maquininha) já tem o código publicado nas Edge
// Functions e a tabela no banco. Esta tela mostra, para cada uma: se está
// ligada, quais segredos já existem (só sim/não — o valor nunca passa pelo app),
// o passo a passo do que o Lucas precisa fazer fora do app, a configuração
// (JSON editável pela coordenação) e os últimos eventos. Ligar aqui não dispara
// nada sozinho: só libera os botões nas telas e os crons passam a trabalhar.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed, Plug, RefreshCw, Save, XCircle } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { confirmar, toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { canManageAcessos, isCoordenacao } from "@/lib/access";
import { GUIA_ATIVACAO, definirCacheIntegracoes, type ChaveIntegracao, type IntegracaoRecord } from "@/lib/integracoes";
import { invocarIntegracao, listRemoteIntegracaoEventos, listRemoteIntegracoes, saveRemoteIntegracao, statusSegredosIntegracoes } from "@/lib/remoteData";
import { cn } from "@/lib/utils";

const TESTES: Partial<Record<ChaveIntegracao, { rotulo: string; slug: string; body: (pessoaId: string | null) => Record<string, unknown> }>> = {
  push: { rotulo: "Mandar um aviso de teste para mim", slug: "push-enviar", body: (pessoaId) => ({ pessoaId, teste: true }) },
  feegow: { rotulo: "Sincronizar a agenda agora", slug: "feegow-sync", body: () => ({}) },
  outlook: { rotulo: "Sincronizar o calendário agora", slug: "outlook-agenda", body: () => ({}) },
  google_agenda: { rotulo: "Ler os calendários do Google agora", slug: "google-agenda-sync", body: () => ({}) },
};

function IntegracaoCard({ item, segredos, podeEditar, pessoaId, onMudou }: { item: IntegracaoRecord; segredos?: { exigidos: string[]; faltam: string[]; prontos: boolean }; podeEditar: boolean; pessoaId: string | null; onMudou: () => Promise<void> }) {
  const guia = GUIA_ATIVACAO[item.chave];
  const [configTexto, setConfigTexto] = useState(JSON.stringify(item.config, null, 2));
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const eventosQuery = useQuery({ queryKey: ["integracao-eventos", item.chave], queryFn: () => listRemoteIntegracaoEventos(item.chave, 8), staleTime: 30_000 });
  const teste = TESTES[item.chave];
  const semFuncao = guia.funcoes.length === 0;

  async function alternar() {
    if (!item.ligada) {
      if (segredos && !segredos.prontos) {
        toast(`Faltam segredos: ${segredos.faltam.join(", ")}. Configure pelo script local antes de ligar.`, { tom: "atencao", duracaoMs: 6000 });
        return;
      }
      const ok = await confirmar(`Ligar "${item.nome}"?`, { corpo: "A partir daí os botões desta integração aparecem nas telas e os crons passam a chamar o serviço externo. Você pode desligar a qualquer momento.", confirmar: "Ligar" });
      if (!ok) return;
    }
    setOcupado(true);
    try {
      await saveRemoteIntegracao(item.chave, { ligada: !item.ligada }, pessoaId);
      toast(item.ligada ? `"${item.nome}" desligada.` : `"${item.nome}" ligada.`, { tom: "ok" });
      await onMudou();
    } catch (error) {
      toast(`Não consegui salvar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    } finally {
      setOcupado(false);
    }
  }

  async function salvarConfig() {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configTexto);
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("precisa ser um objeto { ... }");
    } catch (error) {
      toast(`JSON inválido: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
      return;
    }
    setOcupado(true);
    try {
      await saveRemoteIntegracao(item.chave, { config }, pessoaId);
      toast("Configuração salva.", { tom: "ok" });
      setEditando(false);
      await onMudou();
    } catch (error) {
      toast(`Não consegui salvar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    } finally {
      setOcupado(false);
    }
  }

  async function rodarTeste() {
    if (!teste) return;
    setOcupado(true);
    try {
      const r = await invocarIntegracao<{ ok: boolean; error?: string; enviados?: number; gravados?: number; aviso?: string }>(teste.slug, teste.body(pessoaId));
      if (r.ok) toast(r.enviados !== undefined ? `${r.enviados} aviso(s) enviado(s).${r.aviso ? ` ${r.aviso}.` : ""}` : r.gravados !== undefined ? `${r.gravados} item(ns) sincronizado(s).` : "Feito.", { tom: "ok" });
      else toast(r.error ?? "Não deu certo.", { tom: "erro", duracaoMs: 7000 });
      await eventosQuery.refetch();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card className={cn("border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur", item.ligada && "border-emerald-300")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Plug className={cn("h-4 w-4", item.ligada ? "text-emerald-700" : "text-brand-oliva")} aria-hidden="true" />
          {item.nome}
          <Badge className={item.ligada ? "bg-emerald-100 text-emerald-800" : "bg-brand-papel text-brand-oliva"}>{item.ligada ? "ligada" : "desligada"}</Badge>
          {semFuncao ? <Badge variant="outline">aguarda contrato</Badge> : null}
          {podeEditar && !semFuncao ? (
            <Button type="button" size="sm" variant={item.ligada ? "outline" : "default"} className="ml-auto h-8" disabled={ocupado} onClick={() => void alternar()}>
              {item.ligada ? "Desligar" : "Ligar"}
            </Button>
          ) : null}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{item.descricao}</p>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-oliva">Segredos (só o nome; o valor nunca passa pelo app)</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {(segredos?.exigidos ?? guia.segredos).map((nome) => {
              const falta = segredos ? segredos.faltam.includes(nome) : true;
              return (
                <li key={nome} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-mono", falta ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900")}>
                  {falta ? <CircleDashed className="h-3 w-3" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                  {nome}
                </li>
              );
            })}
          </ul>
        </div>
        <details className="rounded-md border border-brand-oliva/15 bg-brand-papel/50 p-2.5">
          <summary className="cursor-pointer text-sm font-semibold text-brand-tinta">O que o Lucas precisa fazer para ligar</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-tinta">
            {guia.passos.map((passo) => (
              <li key={passo}>{passo}</li>
            ))}
          </ol>
          {guia.funcoes.length ? <p className="mt-2 text-xs text-muted-foreground">Funções publicadas: {guia.funcoes.join(", ")}.</p> : null}
        </details>
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-oliva">Configuração</p>
            {podeEditar ? (
              editando ? (
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setConfigTexto(JSON.stringify(item.config, null, 2)); setEditando(false); }}>Cancelar</Button>
                  <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={ocupado} onClick={() => void salvarConfig()}>
                    <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Salvar
                  </Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditando(true)}>Editar</Button>
              )
            ) : null}
          </div>
          {editando ? (
            <textarea value={configTexto} onChange={(event) => setConfigTexto(event.target.value)} rows={8} className="mt-1 w-full rounded-md border border-brand-oliva/25 bg-white p-2 font-mono text-xs" spellCheck={false} />
          ) : (
            <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-brand-papel/70 p-2 font-mono text-[11px] text-brand-tinta">{JSON.stringify(item.config, null, 2)}</pre>
          )}
        </div>
        {teste && item.ligada && podeEditar ? (
          <Button type="button" size="sm" variant="outline" className="w-fit" disabled={ocupado} onClick={() => void rodarTeste()}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", ocupado && "animate-spin")} aria-hidden="true" />
            {teste.rotulo}
          </Button>
        ) : null}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-oliva">Últimos eventos</p>
          {eventosQuery.data?.length ? (
            <ul className="mt-1 grid gap-1">
              {eventosQuery.data.map((evento) => (
                <li key={evento.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground tabular-nums">{evento.criadoEm.slice(8, 10)}/{evento.criadoEm.slice(5, 7)} {evento.criadoEm.slice(11, 16)}</span>
                  <Badge variant="outline" className="text-[10px]">{evento.direcao.toLowerCase()}</Badge>
                  <span className={cn("font-semibold", evento.status.includes("ERRO") ? "text-red-700" : "text-brand-tinta")}>{evento.status}</span>
                  <span className="text-brand-tinta">{evento.resumo}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Nenhum evento ainda.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function IntegracoesPage() {
  const { pessoa } = useAuth();
  const queryClient = useQueryClient();
  const podeEditar = canManageAcessos(pessoa?.cargo);
  const integracoesQuery = useQuery({ queryKey: ["integracoes"], queryFn: listRemoteIntegracoes, staleTime: 60_000 });
  const segredosQuery = useQuery({ queryKey: ["integracoes-segredos"], queryFn: statusSegredosIntegracoes, staleTime: 120_000, retry: false });
  const itens = useMemo(() => integracoesQuery.data ?? [], [integracoesQuery.data]);
  const ligadas = itens.filter((i) => i.ligada).length;

  async function recarregar() {
    await queryClient.invalidateQueries({ queryKey: ["integracoes"] });
    const dados = await listRemoteIntegracoes().catch(() => null);
    if (dados) definirCacheIntegracoes(dados);
  }

  return (
    <AccessGate allowed={(cargo) => isCoordenacao(cargo)} label="Administração · Integrações">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Administração</Badge>
            <Badge variant="muted">{ligadas} de {itens.length} ligadas</Badge>
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-3xl text-brand-musgo">
            <Plug className="h-7 w-7" aria-hidden="true" />
            Integrações
            <InfoTip title="Prontas e desligadas">
              Todo o código destas integrações já está publicado: as funções no Supabase, as tabelas e os botões nas telas. O que falta é o que só
              você pode fazer fora do app — contratos, tokens, cadastros nos provedores. Os segredos são gravados pelo script local
              (supabase secrets set), nunca por aqui; esta tela só mostra se cada um já existe. Enquanto uma integração está desligada,
              nada dela dispara: os crons passam batido e os botões ficam escondidos.
            </InfoTip>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ordem sugerida: avisos no celular (só precisa gerar as chaves) → WhatsApp oficial → NFS-e → contrato digital → agendas. Itaú e Rede
            dependem de contrato com o banco e a adquirente.
          </p>
          {segredosQuery.isError ? <p className="mt-2 text-xs text-amber-800">Não consegui consultar os segredos agora (a função integracoes-status não respondeu). Os passos e a configuração continuam disponíveis.</p> : null}
        </motion.section>
        {integracoesQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        {integracoesQuery.isError ? (
          <p className="flex items-center gap-2 text-sm text-red-700">
            <XCircle className="h-4 w-4" aria-hidden="true" /> Não consegui ler a tabela de integrações.
          </p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {itens.map((item) => (
            <IntegracaoCard key={item.chave} item={item} segredos={segredosQuery.data?.[item.chave]} podeEditar={podeEditar} pessoaId={pessoa?.id ?? null} onMudou={recarregar} />
          ))}
        </div>
      </div>
    </AccessGate>
  );
}
