// CONFIGURAÇÕES DO NEGÓCIO (14/09/2026, proposta 7.3 do estudo de evolução).
// As constantes que antes exigiam deploy — grade de salas, dias de
// transferência, limite de aprovação, SLA de lead, voucher — viram chaves com
// histórico e data de vigência. Só quem gerencia acessos (Lucas, Dr. Daniel,
// CEO) edita e, desde 29/09/2026, também só eles abrem a tela. Nunca se apaga o passado: salvar cria uma linha
// nova que passa a valer a partir da data escolhida.
//
// Redesenho Papel & Musgo, etapa 4 (08/10/2026): um cabeçalho com a frase das
// regras, cada grupo numa folha com as regras em lista (valor à direita, em
// número tabular) e o "Alterar a partir de uma data →" abrindo o formulário no
// lugar. O selo técnico "Supabase / Somente local" virou frase: sem banco, a
// tela diz que mostra os valores do código e que não dá para alterar agora.
import { useMemo, useState } from "react";
import { History, SlidersHorizontal } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, Botao, Cabecalho } from "@/components/ui/fundacao";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { canManageAcessos } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { DEFINICOES_CONFIG, configAtual, historicoDaChave, textoDoValor, validarValorConfig, valorDoTexto, type DefinicaoConfig } from "@/lib/configNegocio";
import { useConfigNegocio } from "@/lib/useConfigNegocio";
import { cn } from "@/lib/utils";
import { contagem } from "./frasesAjustes";
import { AcaoSeta, CabecaDaFolha, CampoSelecao, CampoTexto, Detalhes, Etiqueta, Recado, TituloComDica } from "./pecasAjustes";

/** id sem espaço nem acento ("Salas e agenda" → "grupo-salas-e-agenda"), para o aria-labelledby. */
function idDoGrupo(grupo: string) {
  return `grupo-${grupo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

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
  const idValor = `config-${definicao.chave}`;
  // Valor composto (lista, faixa em JSON) vai embaixo, em letra de código, sem o peso do número.
  const textoVigente = textoDoValor(definicao, vigente);
  const valorLongo = textoVigente.length > 24 || /^[[{]/.test(textoVigente);

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
    <li className="grid gap-3 border-t border-fio px-6 py-4 max-md:px-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-[15px] font-bold leading-6 text-tinta">{definicao.titulo}</p>
          <p className="mt-0.5 text-[13px] font-medium leading-5 text-tinta-2">{definicao.explicacao}</p>
        </div>
        <div className={cn("min-w-0 text-right max-sm:text-left", valorLongo && "basis-full text-left")}>
          <p className={cn("tabular-nums text-tinta", valorLongo ? "font-mono text-[13px] font-semibold leading-5 [overflow-wrap:anywhere]" : "text-base font-extrabold leading-6")}>
            {textoDoValor(definicao, vigente)}
            {definicao.unidade ? <span className="ml-1 text-[13px] font-semibold text-tinta-2">{definicao.unidade}</span> : null}
          </p>
          <p className="text-xs font-semibold leading-4 tabular-nums text-tinta-2">
            {linhaVigente ? `vale desde ${diaBr(linhaVigente.vigenteDe)}${linhaVigente.criadoPorNome ? ` · ${linhaVigente.criadoPorNome}` : ""}` : "padrão do código"}
          </p>
        </div>
      </div>
      {futuras.length ? (
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold leading-5 tabular-nums text-tinta">
          <Etiqueta tom="atencao">Agendado</Etiqueta>
          {futuras.map((f) => `${textoDoValor(definicao, f.valor)} a partir de ${diaBr(f.vigenteDe)}`).join(" · ")}
        </p>
      ) : null}
      {podeEditar ? (
        editando ? (
          <div className="grid gap-3 rounded-bloco bg-saber p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.2fr)_180px_minmax(0,1fr)_auto] lg:items-end">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-bold leading-5 text-tinta">Novo valor</span>
              {definicao.tipo === "escolha" ? (
                <CampoSelecao id={idValor} value={texto} onChange={(e) => setTexto(e.target.value)}>
                  {definicao.opcoes?.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </CampoSelecao>
              ) : (
                <CampoTexto id={idValor} value={texto} onChange={(e) => setTexto(e.target.value)} className="tabular-nums" aria-label={`Novo valor de ${definicao.titulo}`} />
              )}
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-bold leading-5 text-tinta">Vale a partir de</span>
              <CampoTexto type="date" value={vigenteDe} onChange={(e) => setVigenteDe(e.target.value)} aria-label="Vale a partir de" />
            </label>
            <label className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
              <span className="text-[13px] font-bold leading-5 text-tinta">Observação</span>
              <CampoTexto value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Por quê (opcional)" aria-label="Observação" />
            </label>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
              <Botao variante="primario" carregando={salvando} onClick={() => void salvar()} className="max-md:h-11 max-md:flex-1">
                Salvar
              </Botao>
              <Botao variante="fantasma" onClick={() => setEditando(false)} className="max-md:h-11">
                Cancelar
              </Botao>
            </div>
            {erro ? (
              <p role="alert" className="text-[13px] font-bold leading-5 text-erro sm:col-span-2 lg:col-span-4">
                {erro}
              </p>
            ) : null}
          </div>
        ) : (
          <AcaoSeta
            className="w-fit"
            onClick={() => {
              setTexto(textoDoValor(definicao, vigente));
              setEditando(true);
            }}
          >
            Alterar a partir de uma data
          </AcaoSeta>
        )
      ) : null}
      {historico.length ? (
        <Detalhes
          resumo={
            <span className="inline-flex items-center gap-1">
              <History className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Histórico ({historico.length})
            </span>
          }
        >
          <ul className="grid gap-1 tabular-nums">
            {historico.map((l, i) => (
              <li key={`${l.criadoEm}-${i}`}>
                <span className="font-bold text-tinta">{diaBr(l.vigenteDe)}</span> → {textoDoValor(definicao, l.valor)}
                {l.observacao ? ` · ${l.observacao}` : ""}
                {l.criadoPorNome ? ` · ${l.criadoPorNome}` : ""}
              </li>
            ))}
          </ul>
        </Detalhes>
      ) : null}
    </li>
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
  const totalDeRegras = grupos.reduce((soma, g) => soma + g.itens.length, 0);
  const hoje = todayISO();
  const agendadas = useMemo(() => new Set(linhas.filter((l) => l.vigenteDe > hoje).map((l) => l.chave)).size, [linhas, hoje]);

  const fraseDoTopo = (
    <>
      <strong>{contagem(totalDeRegras, "regra")}</strong> em {contagem(grupos.length, "grupo")}
      {agendadas ? (
        <>
          ; <span className="alerta">{contagem(agendadas, "tem mudança agendada", "têm mudança agendada")}</span>
        </>
      ) : null}
      .{" "}
      {podeEditar
        ? remoto
          ? "Você pode alterar qualquer regra abaixo a partir de uma data."
          : null
        : "Você vê as regras vigentes; a alteração é do Lucas, do Dr. Daniel ou da CEO."}
    </>
  );

  return (
    // Porta fechada (29/09/2026, auditoria B9): era allowed={() => true} — qualquer
    // pessoa logada abria pela URL. Agora é a mesma regra do menu: quem gerencia
    // acessos (Lucas, Dr. Daniel, CEO).
    <AccessGate allowed={canManageAcessos} label="Administração · Configurações do negócio">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Ajustes"
          titulo={
            <TituloComDica
              texto="Configurações do negócio"
              tituloDaDica="Como funciona"
              dica={
                <>
                  Cada regra tem um valor que vale hoje e um histórico. Alterar cria uma linha nova com a data a partir da qual passa a valer —
                  o passado não muda, então relatórios antigos continuam batendo. Só Lucas, Dr. Daniel e CEO alteram; todo mundo lê. As taxas
                  da Rede, as alíquotas e a tabela de preços continuam no código por enquanto (mudam por contrato e passam por conferência).
                </>
              }
            />
          }
          frase={fraseDoTopo}
        />

        {carregando ? (
          <p role="status" className="text-sm font-semibold text-tinta-2">
            Carregando as regras…
          </p>
        ) : null}
        {!remoto && !carregando ? (
          <Recado tom="info">
            <strong>Sem conexão com o banco:</strong> os valores abaixo são os do código e não dá para alterar agora.
          </Recado>
        ) : null}

        {grupos.map((g) => (
          <BlocoFolha key={g.grupo} as="section" aria-labelledby={idDoGrupo(g.grupo)} className="min-w-0 overflow-hidden">
            <CabecaDaFolha id={idDoGrupo(g.grupo)} icone={<SlidersHorizontal />} titulo={g.grupo} resumo={contagem(g.itens.length, "regra")} />
            <ul>
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
            </ul>
          </BlocoFolha>
        ))}
      </div>
    </AccessGate>
  );
}
