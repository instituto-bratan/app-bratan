// BIBLIOTECA E AJUSTES DA NUTRIÇÃO (28/09/2026).
//
// Listas dela (cada gravação é uma versão nova; planos já feitos guardam a
// cópia que usaram), alimentos da TACO com a fonte, as medidas caseiras que
// ela valida uma vez e reaproveita, a identificação profissional, as regras
// do cálculo e a cópia de segurança dos dados deste computador.
import { useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule } from "@/lib/access";
import { CONFIG_PADRAO } from "../dominio/config";
import { formatarNumero } from "../dominio/texto";
import type { BlocoBiblioteca, ConfigNutricao, IdentificacaoProfissional } from "../dominio/tipos";
import { buscarAlimentos } from "../plano/BuscaDeAlimento";
import { exportarTudo } from "../store/db";
import { useAlimentos, useAtualizarNutricao, useBiblioteca, useConfig, useIdentificacao, useMedidas, useNutricaoPronta } from "../store/hooks";
import * as repo from "../store/repositorio";
import { baixar } from "../documento/exportar";
import { Abas, CabecalhoDaPagina, Cartao, Carregando, Modulo, NumeroEditavel } from "../ui/basicos";

type Aba = "listas" | "alimentos" | "medidas" | "identificacao" | "ajustes";
type Aviso = { texto: string; erro: boolean };

const naoSalvou = (e: unknown) =>
  e instanceof Error ? `Não salvou: ${e.message} Recarregue a página para ver a versão mais nova.` : "Não salvou. Recarregue a página e tente de novo.";

function EditorDeBloco({ bloco, editavel }: { bloco: BlocoBiblioteca; editavel: boolean }) {
  const [titulo, setTitulo] = useState(bloco.titulo);
  const [itens, setItens] = useState(bloco.itens.join("\n"));
  const [salvo, setSalvo] = useState<Aviso | null>(null);
  const atualizar = useAtualizarNutricao();
  const mudou = titulo !== bloco.titulo || itens !== bloco.itens.join("\n");
  return (
    <Cartao titulo={`${bloco.titulo} · versão ${bloco.versao}`} acoes={<span className="text-[11px] text-muted-foreground">fonte: {bloco.fonte}</span>}>
      <div className="grid gap-2">
        <input value={titulo} disabled={!editavel} onChange={(e) => setTitulo(e.target.value)} aria-label="Título da lista" className="h-9 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 font-semibold" />
        <textarea value={itens} disabled={!editavel} onChange={(e) => setItens(e.target.value)} rows={Math.max(6, bloco.itens.length + 1)} aria-label="Itens, um por linha" className="rounded-xl border border-brand-oliva/20 bg-white/70 p-2 text-sm leading-relaxed" />
        {editavel ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!mudou}
              onClick={async () => {
                try {
                  const salvoAgora = await repo.salvarBloco({ ...bloco, titulo: titulo.trim(), itens: itens.split("\n").map((l) => l.trim()).filter(Boolean) }, bloco.versao);
                  await atualizar();
                  setSalvo({ texto: `Versão ${salvoAgora.versao} salva. Planos já feitos continuam com a cópia que usaram.`, erro: false });
                } catch (e) {
                  setSalvo({ texto: naoSalvou(e), erro: true });
                }
              }}
            >
              Salvar nova versão
            </Button>
            {salvo ? <span className={salvo.erro ? "text-xs font-medium text-red-800" : "text-xs text-emerald-800"} role={salvo.erro ? "alert" : undefined}>{salvo.texto}</span> : <span className="text-xs text-muted-foreground">Um item por linha. Editar aqui não muda nenhum plano já feito.</span>}
          </div>
        ) : null}
      </div>
    </Cartao>
  );
}

export function NutricaoBibliotecaPage() {
  const pronto = useNutricaoPronta();
  const { pessoa: usuario } = useAuth();
  const editavel = canEditModule(usuario, "nutricao");
  const [aba, setAba] = useState<Aba>("listas");
  const { data: blocos = [] } = useBiblioteca();
  const { data: alimentos = [] } = useAlimentos();
  const { data: medidas = [] } = useMedidas();
  const { data: identificacao } = useIdentificacao();
  const { data: config = CONFIG_PADRAO } = useConfig();
  const atualizar = useAtualizarNutricao();
  const [busca, setBusca] = useState("");
  const [novaMedida, setNovaMedida] = useState<{ alimentoId: string; texto: string; gramas: string }>({ alimentoId: "", texto: "", gramas: "" });
  const [linhasId, setLinhasId] = useState<string[] | null>(null);
  const [versaoIdLida, setVersaoIdLida] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState<ConfigNutricao | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [baseAjustes, setBaseAjustes] = useState<ConfigNutricao | null>(null);
  const [feriadosTexto, setFeriadosTexto] = useState<string | null>(null);

  const encontrados = useMemo(() => (busca.trim() ? buscarAlimentos(alimentos, busca, 30) : []), [alimentos, busca]);
  const porId = useMemo(() => new Map(alimentos.map((a) => [a.id, a])), [alimentos]);

  if (pronto.isLoading) return <Carregando />;

  const ident: IdentificacaoProfissional = identificacao ?? { linhas: [], versao: 0 };
  const linhas = linhasId ?? ident.linhas;
  // A versão é a do começo da edição: se outra aba salvar no meio, o salvar daqui avisa.
  const mudarLinhas = (novas: string[]) => {
    if (!linhasId) setVersaoIdLida(ident.versao);
    setLinhasId(novas);
  };
  const cfg = ajustes ?? config;
  // Guarda os ajustes como estavam ao começar a mexer, para não gravar por cima de outra aba.
  const mudarAjustes = (novo: ConfigNutricao) => {
    if (!ajustes) setBaseAjustes(config);
    setAjustes(novo);
  };

  return (
    <Modulo className="max-w-5xl">
      <CabecalhoDaPagina sobretitulo="Nutrição" titulo="Biblioteca" detalhe="Listas, alimentos, medidas caseiras, identificação e ajustes" />
      <div className="mb-5">
        <Abas
          rotulo="Seções da biblioteca"
          atual={aba}
          aoMudar={setAba}
          abas={[
            { id: "listas", rotulo: "Listas" },
            { id: "alimentos", rotulo: "Alimentos (TACO)" },
            { id: "medidas", rotulo: `Medidas caseiras (${medidas.length})` },
            { id: "identificacao", rotulo: "Identificação" },
            { id: "ajustes", rotulo: "Ajustes" },
          ]}
        />
      </div>
      {aviso ? (
        <p className={aviso.erro ? "mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800" : "mb-3 rounded-xl bg-brand-creme/50 px-3 py-2 text-sm"} role={aviso.erro ? "alert" : "status"}>
          {aviso.texto}
        </p>
      ) : null}

      {aba === "listas" ? (
        <div className="grid gap-4">
          {blocos.map((b) => (
            <EditorDeBloco key={`${b.id}-${b.versao}`} bloco={b} editavel={editavel} />
          ))}
          {editavel ? (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start gap-1.5"
              onClick={async () => {
                await repo.salvarBloco({ id: repo.novoId(), titulo: "Nova lista de orientações", itens: [], texto: "", versao: 0, fonte: "Dra. Géssica Barbara", atualizadoEm: repo.agora() }, null);
                await atualizar();
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Lista nova
            </Button>
          ) : null}
        </div>
      ) : null}

      {aba === "alimentos" ? (
        <Cartao titulo="TACO 4ª edição · NEPA/Unicamp, 2011 · 597 alimentos">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar alimento, por exemplo: arroz, frango, banana"
            aria-label="Buscar alimento"
            className="mb-3 h-10 w-full rounded-xl border border-brand-oliva/20 bg-white/70 px-3 text-sm"
          />
          {encontrados.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left">Alimento (por 100 g)</th>
                    <th className="py-1 text-right">kcal</th>
                    <th className="py-1 text-right">Carb.</th>
                    <th className="py-1 text-right">Prot.</th>
                    <th className="py-1 text-right">Gord.</th>
                    <th className="py-1 text-right">Fibra</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {encontrados.map((a) => (
                    <tr key={a.id} className="border-t border-brand-oliva/10">
                      <td className="py-1.5 pr-2 font-sans">
                        {a.nome}
                        <span className="block text-[11px] text-muted-foreground">
                          {a.grupo} · {a.fonte.referencia}
                        </span>
                      </td>
                      {(["kcal", "cho", "ptn", "lip", "fibra"] as const).map((n) => (
                        <td key={n} className="py-1.5 text-right">
                          {a.por100g[n] === null ? <span title="Análise em reavaliação na TACO">*</span> : a.tracos.includes(n) ? "Tr" : formatarNumero(a.por100g[n] as number, n === "kcal" ? 0 : 1)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Os valores vêm só da tabela; nada é digitado à mão nem estimado. “Tr” é traço; “*” é valor em reavaliação na própria TACO.</p>
          )}
        </Cartao>
      ) : null}

      {aba === "medidas" ? (
        <Cartao titulo="Medidas caseiras validadas por você">
          <p className="mb-3 text-sm text-muted-foreground">Registre uma vez quanto pesa a medida (por exemplo, “4 colheres de sopa” de arroz = 100 g). Ela aparece como atalho ao vincular o alimento no plano.</p>
          {editavel ? (
            <form
              className="mb-4 flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const gramas = Number(novaMedida.gramas.replace(",", "."));
                if (!novaMedida.alimentoId || !novaMedida.texto.trim() || !(gramas > 0)) return;
                await repo.salvarMedida({ id: repo.novoId(), alimentoId: novaMedida.alimentoId, texto: novaMedida.texto.trim(), gramas, validadaEm: repo.hoje() });
                await atualizar();
                setNovaMedida({ alimentoId: novaMedida.alimentoId, texto: "", gramas: "" });
              }}
            >
              <label className="grid gap-0.5 text-xs">
                <span className="font-semibold text-muted-foreground">Alimento</span>
                <input list="alimentos-taco" onChange={(e) => {
                  const a = alimentos.find((x) => x.nome === e.target.value);
                  setNovaMedida((m) => ({ ...m, alimentoId: a ? a.id : "" }));
                }} placeholder="comece a digitar" className="h-9 w-72 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm" />
                <datalist id="alimentos-taco">
                  {alimentos.map((a) => (
                    <option key={a.id} value={a.nome} />
                  ))}
                </datalist>
              </label>
              <label className="grid gap-0.5 text-xs">
                <span className="font-semibold text-muted-foreground">Medida (como vai no plano)</span>
                <input value={novaMedida.texto} onChange={(e) => setNovaMedida((m) => ({ ...m, texto: e.target.value }))} placeholder="4 colheres de sopa" className="h-9 w-48 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm" />
              </label>
              <label className="grid gap-0.5 text-xs">
                <span className="font-semibold text-muted-foreground">Gramas</span>
                <input value={novaMedida.gramas} onChange={(e) => setNovaMedida((m) => ({ ...m, gramas: e.target.value }))} inputMode="decimal" className="h-9 w-20 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-right text-sm" />
              </label>
              <Button type="submit" size="sm" disabled={!novaMedida.alimentoId}>
                Guardar medida
              </Button>
            </form>
          ) : null}
          <ul className="grid gap-1 text-sm">
            {medidas.length === 0 ? <li className="italic text-muted-foreground">nenhuma medida registrada ainda</li> : null}
            {medidas.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 border-t border-brand-oliva/10 py-1.5">
                <span>
                  <strong>{m.texto}</strong> = {m.gramas} g · {m.alimentoId ? porId.get(m.alimentoId)?.nome ?? m.alimentoId : "sem alimento"}
                </span>
                {editavel ? (
                  <button type="button" className="rounded p-1 text-muted-foreground hover:text-red-800" onClick={async () => { await repo.apagarMedida(m.id); await atualizar(); }} aria-label={`Apagar ${m.texto}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Cartao>
      ) : null}

      {aba === "identificacao" ? (
        <Cartao titulo="Identificação no fim do plano">
          <p className="mb-3 text-sm text-muted-foreground">Texto de identificação, sem valor de assinatura digital. Sai inteiro, na última página.</p>
          <div className="grid gap-2">
            {linhas.map((l, i) => (
              <input key={i} value={l} disabled={!editavel} onChange={(e) => mudarLinhas(linhas.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Linha ${i + 1}`} className="h-9 rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-sm" />
            ))}
            {editavel ? (
              <Button
                type="button"
                size="sm"
                className="justify-self-start"
                disabled={!linhasId}
                onClick={async () => {
                  try {
                    await repo.salvarIdentificacao({ linhas: linhas.map((l) => l.trim()), versao: versaoIdLida ?? ident.versao });
                    await atualizar();
                    setLinhasId(null);
                    setVersaoIdLida(null);
                    setAviso({ texto: "Identificação salva. Vale para os próximos planos; os finalizados mantêm a que usaram.", erro: false });
                  } catch (e) {
                    setAviso({ texto: naoSalvou(e), erro: true });
                  }
                }}
              >
                Salvar identificação
              </Button>
            ) : null}
          </div>
        </Cartao>
      ) : null}

      {aba === "ajustes" ? (
        <div className="grid gap-4">
          <Cartao titulo="Regras do cálculo e do prontuário">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <label className="grid gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground">Azeite de preparo no almoço e no jantar com legumes (g)</span>
                <NumeroEditavel disabled={!editavel} valor={cfg.azeiteGramas} aoMudar={(n) => mudarAjustes({ ...cfg, azeiteGramas: n !== null && n >= 0 ? n : 0 })} className="h-9 w-24 rounded-lg border border-brand-oliva/20 bg-white/70 px-2" />
              </label>
              <label className="grid gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground">Prazo do plano (dias úteis para “72 horas úteis”)</span>
                <input inputMode="numeric" disabled={!editavel} value={cfg.diasUteisPrazoPlano} onChange={(e) => mudarAjustes({ ...cfg, diasUteisPrazoPlano: Number(e.target.value) || 3 })} className="h-9 w-24 rounded-lg border border-brand-oliva/20 bg-white/70 px-2" />
              </label>
              <label className="grid gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground">Sigla da gordura visceral</span>
                <input disabled={!editavel} value={cfg.siglaVisceral} onChange={(e) => mudarAjustes({ ...cfg, siglaVisceral: e.target.value })} className="h-9 w-24 rounded-lg border border-brand-oliva/20 bg-white/70 px-2" />
              </label>
              <label className="grid gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground">Calorias do total</span>
                <select disabled={!editavel} value={cfg.caloriasPor} onChange={(e) => mudarAjustes({ ...cfg, caloriasPor: e.target.value as ConfigNutricao["caloriasPor"] })} className="h-9 rounded-lg border border-brand-oliva/20 bg-white/70 px-2">
                  <option value="macros">pelos fatores 4, 4 e 9 (percentuais fecham 100)</option>
                  <option value="tabela">pela caloria da tabela</option>
                </select>
              </label>
              <label className="grid gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground">Guardar o áudio da consulta por (dias)</span>
                <input inputMode="numeric" disabled={!editavel} value={cfg.diasRetencaoAudio} onChange={(e) => mudarAjustes({ ...cfg, diasRetencaoAudio: Number(e.target.value) || 7 })} className="h-9 w-24 rounded-lg border border-brand-oliva/20 bg-white/70 px-2" />
              </label>
              <label className="grid gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground">Feriados locais (um por linha, AAAA-MM-DD)</span>
                <textarea
                  disabled={!editavel}
                  rows={3}
                  value={feriadosTexto ?? cfg.feriados.join("\n")}
                  onChange={(e) => {
                    setFeriadosTexto(e.target.value);
                    mudarAjustes({ ...cfg, feriados: e.target.value.split("\n").map((l) => l.trim()).filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l)) });
                  }}
                  className="rounded-lg border border-brand-oliva/20 bg-white/70 p-2 font-mono text-xs"
                />
              </label>
            </div>
            {editavel ? (
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={!ajustes}
                onClick={async () => {
                  if (!ajustes) return;
                  try {
                    await repo.salvarConfig(ajustes, baseAjustes ?? config);
                    await atualizar();
                    setAjustes(null);
                    setBaseAjustes(null);
                    setFeriadosTexto(null);
                    setAviso({ texto: "Ajustes salvos.", erro: false });
                  } catch (e) {
                    setAviso({ texto: naoSalvou(e), erro: true });
                  }
                }}
              >
                Salvar ajustes
              </Button>
            ) : null}
          </Cartao>
          <Cartao titulo="Cópia de segurança">
            <p className="mb-3 text-sm text-muted-foreground">No piloto, os dados ficam neste computador (no navegador). Baixe uma cópia com frequência e guarde em local protegido: ela tem dados de saúde.</p>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={async () => {
                const dados = await exportarTudo();
                baixar(new Blob([JSON.stringify({ exportadoEm: repo.agora(), dados }, null, 2)], { type: "application/json" }), `nutricao-copia-${repo.hoje()}.json`);
              }}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Baixar cópia de segurança
            </Button>
          </Cartao>
        </div>
      ) : null}
    </Modulo>
  );
}
