// INTEGRAÇÕES — PRONTAS E DESLIGADAS (15/09/2026, lote C do "implemente tudo").
//
// Cada integração externa (WhatsApp oficial, NFS-e, contrato digital, agendas,
// avisos no celular, banco e maquininha) já tem o código publicado nas Edge
// Functions e a tabela no banco. Esta tela mostra, para cada uma: se está
// ligada, quais segredos já existem (só sim/não — o valor nunca passa pelo app),
// o passo a passo do que o Lucas precisa fazer fora do app, a configuração
// (JSON editável pela coordenação) e os últimos eventos. Ligar aqui não dispara
// nada sozinho: só libera os botões nas telas e os crons passam a trabalhar.
//
// Redesenho Papel & Musgo, etapa 4 (08/10/2026): as integrações viraram uma
// lista numa folha (itens do mesmo tipo em lista, não em cartões), com a
// situação em palavra + cor, os segredos como etiquetas e o passo a passo e a
// configuração em "detalhes". A ordem sugerida desceu para a faixa do fluxo,
// embaixo do cabeçalho. Ligar, desligar, salvar e testar fazem o mesmo de antes.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Plug, RefreshCw } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, Botao, Cabecalho, FraseDoFluxo } from "@/components/ui/fundacao";
import { confirmar, toast } from "@/components/ui/avisos";
import { PainelDoWhatsapp } from "@/features/atendimento/PainelDoWhatsapp";
import { useAuth } from "@/hooks/useAuth";
import { canManageAcessos, isCoordenacao } from "@/lib/access";
import { GUIA_ATIVACAO, definirCacheIntegracoes, type ChaveIntegracao, type IntegracaoRecord } from "@/lib/integracoes";
import { invocarIntegracao, listRemoteIntegracaoEventos, listRemoteIntegracoes, saveRemoteIntegracao, statusSegredosIntegracoes } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { contagem } from "./frasesAjustes";
import { BOTAO_TEXTO, CAMPO_AREA, CabecaDaFolha, Detalhes, Etiqueta, RUBRICA, Recado, Vazio, TituloComDica } from "./pecasAjustes";

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
    <li className={cn("grid gap-4 border-t border-fio px-6 py-5 max-md:px-4", item.ligada && "shadow-[inset_3px_0_0_rgb(var(--ok-rgb))]")}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-bold leading-6 text-tinta">
            <Plug className={cn("h-4 w-4", item.ligada ? "text-ok" : "stroke-oliva")} aria-hidden="true" />
            {item.nome}
            <Etiqueta tom={item.ligada ? "ok" : "neutro"}>{item.ligada ? "ligada" : "desligada"}</Etiqueta>
            {semFuncao ? <Etiqueta>aguarda contrato</Etiqueta> : null}
          </h3>
          <p className="mt-1 text-sm font-medium leading-[22px] text-tinta-2">{item.descricao}</p>
        </div>
        {podeEditar && !semFuncao ? (
          <Botao variante={item.ligada ? "secundario" : "primario"} tamanho="pq" className="max-md:h-10" disabled={ocupado} onClick={() => void alternar()}>
            {item.ligada ? "Desligar" : "Ligar"}
          </Botao>
        ) : null}
      </div>

      <div>
        <p className={RUBRICA}>Segredos (só o nome; o valor nunca passa pelo app)</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {(segredos?.exigidos ?? guia.segredos).map((nome) => {
            const falta = segredos ? segredos.faltam.includes(nome) : true;
            return (
              <li key={nome}>
                <Etiqueta tom={falta ? "atencao" : "ok"} className="font-mono font-semibold" title={falta ? "falta configurar" : "já existe"}>
                  {falta ? <CircleDashed aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                  {nome}
                  <span className="sr-only">{falta ? " — falta" : " — pronto"}</span>
                </Etiqueta>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-6">
        <Detalhes resumo="O que o Lucas precisa fazer para ligar">
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-[22px] text-tinta">
            {guia.passos.map((passo) => (
              <li key={passo}>{passo}</li>
            ))}
          </ol>
          {guia.funcoes.length ? <p className="mt-2">Funções publicadas: {guia.funcoes.join(", ")}.</p> : null}
        </Detalhes>
        <Detalhes resumo={editando ? "Configuração (editando)" : "Configuração"}>
          {podeEditar ? (
            <div className="mb-2 flex justify-end gap-3">
              {editando ? (
                <>
                  <button
                    type="button"
                    className={BOTAO_TEXTO}
                    onClick={() => {
                      setConfigTexto(JSON.stringify(item.config, null, 2));
                      setEditando(false);
                    }}
                  >
                    Cancelar
                  </button>
                  <Botao variante="primario" tamanho="pq" carregando={ocupado} onClick={() => void salvarConfig()}>
                    Salvar
                  </Botao>
                </>
              ) : (
                <button
                  type="button"
                  className={BOTAO_TEXTO}
                  onClick={() => {
                    // Parte da config muda por fora do JSON (o painel do WhatsApp, 27/10/2026): abre com a versão atual.
                    setConfigTexto(JSON.stringify(item.config, null, 2));
                    setEditando(true);
                  }}
                >
                  Editar
                </button>
              )}
            </div>
          ) : null}
          {editando ? (
            <textarea
              value={configTexto}
              onChange={(event) => setConfigTexto(event.target.value)}
              rows={8}
              aria-label={`Configuração de ${item.nome} (JSON)`}
              className={cn(CAMPO_AREA, "font-mono text-[13px]")}
              spellCheck={false}
            />
          ) : (
            <pre className="max-h-40 overflow-auto rounded-controle bg-saber p-3 font-mono text-xs leading-5 text-tinta">{JSON.stringify(item.config, null, 2)}</pre>
          )}
        </Detalhes>
      </div>

      {/* WhatsApp oficial (27/10/2026): modo teste, números da lista, teste e rodar agora. */}
      {item.chave === "whatsapp" ? <PainelDoWhatsapp ligada={item.ligada} podeEditar={podeEditar} pessoaId={pessoaId} onMudou={onMudou} /> : null}

      {teste && item.ligada && podeEditar ? (
        <Botao
          variante="secundario"
          tamanho="pq"
          className="w-fit max-md:h-10"
          disabled={ocupado}
          icone={<RefreshCw className={cn("h-4 w-4", ocupado && "animate-spin")} aria-hidden="true" />}
          onClick={() => void rodarTeste()}
        >
          {teste.rotulo}
        </Botao>
      ) : null}

      <div>
        <p className={RUBRICA}>Últimos eventos</p>
        {eventosQuery.data?.length ? (
          <ul className="mt-2 grid gap-1">
            {eventosQuery.data.map((evento) => (
              <li key={evento.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium leading-5">
                <span className="tabular-nums text-tinta-2">
                  {evento.criadoEm.slice(8, 10)}/{evento.criadoEm.slice(5, 7)} {evento.criadoEm.slice(11, 16)}
                </span>
                <Etiqueta>{evento.direcao.toLowerCase()}</Etiqueta>
                <span className={cn("font-bold", evento.status.includes("ERRO") ? "text-erro" : "text-tinta")}>{evento.status}</span>
                <span className="min-w-0 text-tinta [overflow-wrap:anywhere]">{evento.resumo}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] font-medium leading-5 text-tinta-2">Nenhum evento ainda.</p>
        )}
      </div>
    </li>
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

  const fraseDoTopo = itens.length ? (
    <>
      <strong>
        {ligadas} de {contagem(itens.length, "integração", "integrações")}
      </strong>{" "}
      {ligadas === 1 ? "está ligada" : "estão ligadas"}. As outras já estão prontas no código e esperam o que só você faz fora do app.
    </>
  ) : (
    <>Cada integração já tem o código publicado; o que falta é o que só você faz fora do app.</>
  );

  return (
    <AccessGate allowed={(cargo) => isCoordenacao(cargo)} label="Administração · Integrações">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Ajustes"
          titulo={
            <TituloComDica
              texto="Integrações"
              tituloDaDica="Prontas e desligadas"
              dica={
                <>
                  Todo o código destas integrações já está publicado: as funções no Supabase, as tabelas e os botões nas telas. O que falta é o que só
                  você pode fazer fora do app — contratos, tokens, cadastros nos provedores. Os segredos são gravados pelo script local
                  (supabase secrets set), nunca por aqui; esta tela só mostra se cada um já existe. Enquanto uma integração está desligada,
                  nada dela dispara: os crons passam batido e os botões ficam escondidos.
                </>
              }
            />
          }
          frase={fraseDoTopo}
          rodape={
            <FraseDoFluxo>
              Ordem sugerida: avisos no celular (só precisa gerar as chaves) → WhatsApp oficial → NFS-e → contrato digital → agendas. Itaú e Rede
              dependem de contrato com o banco e a adquirente.
            </FraseDoFluxo>
          }
        />

        {segredosQuery.isError ? (
          <Recado tom="atencao">
            Não consegui consultar os segredos agora (a função integracoes-status não respondeu). Os passos e a configuração continuam disponíveis.
          </Recado>
        ) : null}
        {integracoesQuery.isError ? <Recado tom="erro">Não consegui ler a tabela de integrações.</Recado> : null}

        <BlocoFolha as="section" aria-labelledby="integracoes-lista" className="min-w-0 overflow-hidden">
          <CabecaDaFolha id="integracoes-lista" icone={<Plug />} titulo="Integrações do app" resumo={itens.length ? `${ligadas} ligadas · ${itens.length - ligadas} desligadas` : undefined} />
          {integracoesQuery.isLoading ? (
            <p role="status" className="border-t border-fio px-6 py-6 text-sm font-semibold text-tinta-2 max-md:px-4">
              Carregando…
            </p>
          ) : itens.length ? (
            <ul>
              {itens.map((item) => (
                <IntegracaoCard key={item.chave} item={item} segredos={segredosQuery.data?.[item.chave]} podeEditar={podeEditar} pessoaId={pessoa?.id ?? null} onMudou={recarregar} />
              ))}
            </ul>
          ) : !integracoesQuery.isError ? (
            <Vazio icone={<Plug />} titulo="Nenhuma integração cadastrada." className="border-t border-fio">
              A lista vem da tabela de integrações do banco.
            </Vazio>
          ) : null}
        </BlocoFolha>
      </div>
    </AccessGate>
  );
}
