// CONFIGURAÇÕES DO NEGÓCIO (14/09/2026, proposta 7.3 do estudo de evolução).
// As constantes que antes exigiam deploy — grade de salas, dias de
// transferência, limite de aprovação, SLA de lead, voucher — viram chaves com
// histórico e data de vigência. Só quem gerencia acessos (Lucas, Dr. Daniel,
// CEO) edita; todo mundo lê. Nunca se apaga o passado: salvar cria uma linha
// nova que passa a valer a partir da data escolhida.
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { History, Save, SlidersHorizontal } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { canManageAcessos } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { DEFINICOES_CONFIG, configAtual, historicoDaChave, textoDoValor, validarValorConfig, valorDoTexto, type DefinicaoConfig } from "@/lib/configNegocio";
import { useConfigNegocio } from "@/lib/useConfigNegocio";
import { cn } from "@/lib/utils";

function diaBr(iso: string) {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

function ChaveCard({ definicao, linhasTodas, podeEditar, onSalvar, salvando }: { definicao: DefinicaoConfig; linhasTodas: ReturnType<typeof historicoDaChave>; podeEditar: boolean; onSalvar: (valor: unknown, vigenteDe: string, observacao: string) => Promise<void>; salvando: boolean }) {
  const hoje = todayISO();
  const historico = historicoDaChave(definicao.chave, linhasTodas);
  const vigente = configAtual(definicao.chave, hoje, linhasTodas);
  const linhaVigente = linhasTodas.find((l) => l.chave === definicao.chave && l.vigenteDe <= hoje) ?? null;
  const futuras = historico.filter((l) => l.vigenteDe > hoje);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(textoDoValor(definicao, vigente));
  const [vigenteDe, setVigenteDe] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");

  async function salvar() {
    const valor = valorDoTexto(definicao, texto);
    const problema = validarValorConfig(definicao, valor);
    if (problema) {
      setErro(problema);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenteDe)) {
      setErro("Informe a data a partir da qual o valor vale.");
      return;
    }
    setErro("");
    await onSalvar(valor, vigenteDe, observacao);
    setEditando(false);
    setObservacao("");
  }

  return (
    <div className="rounded-lg border border-brand-oliva/15 bg-white/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-brand-tinta">{definicao.titulo}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{definicao.explicacao}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold tabular-nums text-brand-musgo">
            {textoDoValor(definicao, vigente)}
            {definicao.unidade ? <span className="ml-1 text-xs font-normal text-muted-foreground">{definicao.unidade}</span> : null}
          </p>
          <p className="text-[11px] text-muted-foreground">{linhaVigente ? `vale desde ${diaBr(linhaVigente.vigenteDe)}${linhaVigente.criadoPorNome ? ` · ${linhaVigente.criadoPorNome}` : ""}` : "padrão do código"}</p>
        </div>
      </div>
      {futuras.length ? <p className="mt-1 text-[11px] text-amber-800">Agendado: {futuras.map((f) => `${textoDoValor(definicao, f.valor)} a partir de ${diaBr(f.vigenteDe)}`).join(" · ")}</p> : null}
      {podeEditar ? (
        editando ? (
          <div className="mt-2 grid gap-2 rounded-md border border-brand-oliva/20 bg-brand-creme/30 p-2 sm:grid-cols-[1.4fr_auto_1fr_auto]">
            {definicao.tipo === "escolha" ? (
              <select value={texto} onChange={(e) => setTexto(e.target.value)} className="h-9 rounded-md border border-input bg-white px-2 text-sm">
                {definicao.opcoes?.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            ) : (
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} className="h-9 font-mono text-sm" aria-label={`Novo valor de ${definicao.titulo}`} />
            )}
            <Input type="date" value={vigenteDe} onChange={(e) => setVigenteDe(e.target.value)} className="h-9" aria-label="Vale a partir de" />
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Por quê (opcional)" className="h-9" aria-label="Observação" />
            <div className="flex gap-1">
              <Button type="button" size="sm" onClick={() => void salvar()} disabled={salvando}>
                <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Salvar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
            {erro ? <p className="text-xs font-semibold text-red-700 sm:col-span-4">{erro}</p> : null}
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" className="mt-2 h-7 px-2 text-xs" onClick={() => { setTexto(textoDoValor(definicao, vigente)); setEditando(true); }}>
            Alterar a partir de uma data
          </Button>
        )
      ) : null}
      {historico.length ? (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="flex cursor-pointer items-center gap-1">
            <History className="h-3.5 w-3.5" aria-hidden="true" /> Histórico ({historico.length})
          </summary>
          <ul className="mt-1 grid gap-0.5">
            {historico.map((l, i) => (
              <li key={`${l.criadoEm}-${i}`}>
                {diaBr(l.vigenteDe)} → {textoDoValor(definicao, l.valor)}
                {l.observacao ? ` · ${l.observacao}` : ""}
                {l.criadoPorNome ? ` · ${l.criadoPorNome}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function ConfiguracoesNegocioPage() {
  const { pessoa } = useAuth();
  const podeEditar = canManageAcessos(pessoa?.cargo);
  const { linhas, carregando, salvar, remoto } = useConfigNegocio();
  const grupos = useMemo(() => {
    const ordem = ["Salas e agenda", "Lucro Inteligente", "Contas a pagar", "CRM e indicações", "Rotinas"] as const;
    return ordem.map((grupo) => ({ grupo, itens: DEFINICOES_CONFIG.filter((d) => d.grupo === grupo) })).filter((g) => g.itens.length);
  }, []);

  return (
    <AccessGate allowed={() => true} label="Administração · Configurações do negócio">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Administração</Badge>
            <Badge variant="muted">{remoto ? "Supabase" : "Somente local"}</Badge>
            {carregando ? <Badge variant="outline">carregando…</Badge> : null}
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
            <SlidersHorizontal className="h-7 w-7" aria-hidden="true" />
            Configurações do negócio
            <InfoTip title="Como funciona">
              Cada regra tem um valor que vale hoje e um histórico. Alterar cria uma linha nova com a data a partir da qual passa a valer —
              o passado não muda, então relatórios antigos continuam batendo. Só Lucas, Dr. Daniel e CEO alteram; todo mundo lê. As taxas
              da Rede, as alíquotas e a tabela de preços continuam no código por enquanto (mudam por contrato e passam por conferência).
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {podeEditar ? "Você pode alterar qualquer regra abaixo a partir de uma data." : "Você vê as regras vigentes; a alteração é do Lucas, do Dr. Daniel ou da CEO."}
          </p>
        </motion.section>

        {grupos.map((g) => (
          <Card key={g.grupo} className={cn("border-brand-oliva/20 bg-white/70")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{g.grupo}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {g.itens.map((d) => (
                <ChaveCard
                  key={d.chave}
                  definicao={d}
                  linhasTodas={linhas}
                  podeEditar={podeEditar && remoto}
                  salvando={salvar.isPending}
                  onSalvar={async (valor, vigenteDe, observacao) => {
                    try {
                      await salvar.mutateAsync({ chave: d.chave, valor, vigenteDe, observacao });
                      toast(`${d.titulo}: novo valor vale a partir de ${diaBr(vigenteDe)}.`, { tom: "ok" });
                    } catch (error) {
                      toast(`Não consegui salvar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
                    }
                  }}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </AccessGate>
  );
}
