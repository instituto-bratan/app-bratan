// APLICAÇÕES DA ENFERMAGEM (29/09/2026, aprovado pelo Lucas): "ficha de
// aplicação da enfermagem ligada ao estoque".
//
// A tela é a lista do dia e o botão "Registrar aplicação". Registrar grava a
// aplicação E a saída do estoque numa transação só (registrar_aplicacao no
// banco) — é isso que responde "qual lote foi em quem" e faz o kardex e o
// COMPRAR ficarem certos sem ninguém lembrar de lançar a saída.
//
// REDESENHO PAPEL & MUSGO (08/10/2026): a mesma ficha, na forma aprovada — um
// cabeçalho só (com a frase do que acontece ao salvar), o formulário numa
// folha com campos de contorno 3:1, os avisos de estoque em faixas de atenção
// e erro (a palavra diz; a cor reforça) e a lista do dia em linhas densas.
// Nada de vidro. Os campos, as travas, a liberação da gestão e o estorno são os de antes.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, CheckCircle2, KeyRound, Plus, Save, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { perguntar } from "@/components/ui/avisos";
import { BlocoFolha, Botao, Cabecalho, FraseDoFluxo } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canRegistrarAplicacao, isGestaoAplicacao } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { completeCrmTask, formatCrmDateTime, type CrmContact, type CrmTask } from "@/features/crm/crmData";
import { PatientPicker, type PatientPickerValue } from "@/features/crm/PatientPicker";
import { useCrmState } from "@/features/crm/useCrmState";
import {
  LIMITE_DOSE,
  LIMITE_LOCAL,
  LIMITE_OBSERVACAO,
  MINIMO_MOTIVO_ESTORNO,
  NOTA_TAREFA_CONCLUIDA,
  agoraEmBrasiliaParaCampo,
  aplicacoesDoDia,
  campoParaISO,
  diaBR,
  diaEmBrasilia,
  ehMedicacao,
  insumoSugerido,
  locaisSugeridos,
  loteSugeridoParaAplicacao,
  lotesParaAplicacao,
  motivoDeLiberacaoValido,
  produtosDaEnfermagem,
  qtdBR,
  resumoDoDia,
  tarefasDeDoseAbertas,
  validarAplicacao,
  viaLabels,
  viaSugerida,
  vias,
  type EnfermagemAplicacao,
  type RascunhoAplicacao,
  type ViaAplicacao,
} from "./aplicacaoData";
import { Campo, CampoArea, CampoSelecao, CampoTexto, Recado } from "@/features/compras/pecas";
import { saldoDoItem, type EstoqueItem, type EstoqueMovimento } from "./estoqueData";
import { LinhaDaAplicacao } from "./LinhaDaAplicacao";
import { useAplicacoes } from "./useAplicacoes";
import { useEstoque } from "./useEstoque";

const novoId = () => `apl-${crypto.randomUUID()}`;
const LOTE_OUTRO = "__outro__";
const chaveLote = (lote: string, validade: string | null) => `${lote}|${validade ?? ""}`;

type Liberacao = { motivo: string; senha: string };

// ---------------------------------------------------------------------------
// O formulário
// ---------------------------------------------------------------------------

function RegistrarAplicacaoForm({
  contacts,
  tasks,
  items,
  moves,
  pacienteInicial,
  podeLiberarLogado,
  onRegistrar,
  onFechar,
}: {
  contacts: CrmContact[];
  tasks: CrmTask[];
  items: EstoqueItem[];
  moves: EstoqueMovimento[];
  pacienteInicial: PatientPickerValue | null;
  podeLiberarLogado: boolean;
  onRegistrar: (
    id: string,
    rascunho: RascunhoAplicacao,
    liberacao: Liberacao | null,
  ) => Promise<{ ok: true; mensagem: string } | { ok: false; problemas: string[]; senhaIncorreta?: boolean; erro?: string }>;
  onFechar: () => void;
}) {
  // Um identificador por rascunho: se a rede cair depois de o banco gravar,
  // apertar de novo devolve "já gravada" em vez de baixar o estoque duas vezes.
  const [id, setId] = useState(novoId);
  const [paciente, setPaciente] = useState<PatientPickerValue>(pacienteInicial ?? { ref: "", name: "" });
  const [itemRef, setItemRef] = useState("");
  const [frascoAberto, setFrascoAberto] = useState(false);
  const [loteEscolha, setLoteEscolha] = useState("");
  const [loteDigitado, setLoteDigitado] = useState("");
  const [validadeDigitada, setValidadeDigitada] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [dose, setDose] = useState("");
  const [via, setVia] = useState<ViaAplicacao | "">("");
  const [local, setLocal] = useState("");
  const [quando, setQuando] = useState(() => agoraEmBrasiliaParaCampo());
  const [observacao, setObservacao] = useState("");
  const [insumoRef, setInsumoRef] = useState("");
  const [insumoQtd, setInsumoQtd] = useState("1");
  const [tarefaRef, setTarefaRef] = useState("");
  const [erros, setErros] = useState<string[]>([]);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [liberando, setLiberando] = useState(false);
  const [motivoLiberacao, setMotivoLiberacao] = useState("");
  const [senhaGestor, setSenhaGestor] = useState("");
  const [salvando, setSalvando] = useState(false);

  const produtos = useMemo(() => produtosDaEnfermagem(items), [items]);
  const item = produtos.find((produto) => produto.id === itemRef) ?? null;
  const aplicadoEm = campoParaISO(quando);
  const dia = aplicadoEm ? diaEmBrasilia(aplicadoEm) : todayISO();
  const lotes = useMemo(() => (itemRef ? lotesParaAplicacao(moves, itemRef, dia, frascoAberto) : []), [moves, itemRef, dia, frascoAberto]);
  const tarefas = useMemo(() => tarefasDeDoseAbertas(tasks, paciente.ref), [tasks, paciente.ref]);

  // Trocou o produto: via, lote (FEFO) e insumo sugeridos — a enfermeira troca o que quiser.
  useEffect(() => {
    if (!item) return;
    setVia(viaSugerida(item));
    const insumo = insumoSugerido(item, items);
    setInsumoRef(insumo?.id ?? "");
    setInsumoQtd("1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemRef]);

  useEffect(() => {
    if (!itemRef) return;
    const sugerido = loteSugeridoParaAplicacao(moves, itemRef, dia, frascoAberto);
    setLoteEscolha(sugerido ? chaveLote(sugerido.lote, sugerido.validade) : LOTE_OUTRO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemRef, frascoAberto]);

  // Escolheu o paciente: a tarefa de atendimento aberta dele já vem marcada.
  useEffect(() => {
    setTarefaRef(tarefas[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paciente.ref]);

  const loteDaLista = lotes.find((lote) => chaveLote(lote.lote, lote.validade) === loteEscolha) ?? null;
  const loteFinal = loteEscolha === LOTE_OUTRO ? loteDigitado.trim() : loteDaLista?.lote ?? "";
  const validadeFinal = loteEscolha === LOTE_OUTRO ? validadeDigitada : loteDaLista?.validade ?? "";

  const rascunho: RascunhoAplicacao = {
    contactRef: paciente.ref,
    pacienteNome: paciente.name,
    itemRef,
    lote: loteFinal,
    validade: validadeFinal || "",
    quantidade: frascoAberto ? 0 : Number(quantidade.replace(",", ".")) || 0,
    frascoAberto,
    dose,
    via,
    localAplicacao: local,
    aplicadoEm,
    observacao,
    insumoItemRef: insumoRef,
    insumoQuantidade: Number(insumoQtd.replace(",", ".")) || 0,
    crmTaskRef: tarefaRef,
  };

  // Mexeu no formulário depois de um aviso de estoque: o aviso pode não valer mais.
  useEffect(() => {
    setProblemas([]);
    setLiberando(false);
  }, [itemRef, loteEscolha, loteDigitado, validadeDigitada, quantidade, frascoAberto, insumoRef, insumoQtd]);

  async function salvar(event: FormEvent) {
    event.preventDefault();
    const validacao = validarAplicacao(rascunho, { items, moves });
    setErros(validacao.erros);
    if (validacao.erros.length) return;
    const liberacao = liberando ? { motivo: motivoLiberacao, senha: senhaGestor } : null;
    if (validacao.problemasDeEstoque.length && !liberacao) {
      setProblemas(validacao.problemasDeEstoque);
      return;
    }
    if (liberacao) {
      if (!motivoDeLiberacaoValido(liberacao.motivo)) {
        setErros(["Escreva o motivo da liberação (o que está desatualizado no estoque) — pelo menos 10 letras."]);
        return;
      }
      if (!podeLiberarLogado && !liberacao.senha) {
        setErros(["Falta a senha do gestor para liberar."]);
        return;
      }
    }
    setSalvando(true);
    try {
      const resposta = await onRegistrar(id, rascunho, liberacao);
      if (resposta.ok) {
        setSenhaGestor("");
        setId(novoId());
        onFechar();
        return;
      }
      if (resposta.erro) {
        setErros([resposta.erro]);
        return;
      }
      setProblemas(resposta.problemas);
      if (resposta.senhaIncorreta) {
        setLiberando(true);
        setErros([podeLiberarLogado ? "O banco não aceitou a liberação." : "Senha do gestor incorreta (ou ainda não criada). Nada foi salvo."]);
        setSenhaGestor("");
      }
    } finally {
      setSalvando(false);
    }
  }

  const medicacoes = produtos.filter(ehMedicacao);
  const insumos = produtos.filter((produto) => !ehMedicacao(produto));
  const rotuloProduto = (produto: EstoqueItem) => `${produto.nome} — ${qtdBR(saldoDoItem(moves, produto.id))} ${produto.unidade} no estoque`;

  return (
    <BlocoFolha as="section" aria-labelledby="apl-form-titulo" respiro>
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 id="apl-form-titulo" className="flex flex-wrap items-center gap-2 text-base font-bold leading-6 text-tinta">
          Registrar aplicação
          <InfoTip title="O que acontece ao salvar">
            A aplicação e a saída do estoque são gravadas juntas: o saldo do lote cai na hora e, se o item ficar abaixo do
            mínimo, entra em COMPRAR. O lote sugerido é o que vence primeiro (FEFO) entre os que não estão vencidos na
            data da aplicação — dá para trocar. Lote vencido nunca salva. Sem saldo no lote, só salva se a gestão liberar.
          </InfoTip>
        </h2>
        <button
          type="button"
          onClick={onFechar}
          className="-mr-2 -mt-2 grid h-11 w-11 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
          aria-label="Fechar o formulário"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <form className="grid gap-5" onSubmit={salvar}>
        <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <Campo id="apl-paciente" rotulo="Paciente">
            <PatientPicker contacts={contacts} value={paciente} onChange={setPaciente} id="apl-paciente" somenteVincular />
          </Campo>
          <Campo id="apl-quando" rotulo="Data e hora (Brasília)">
            <CampoTexto id="apl-quando" type="datetime-local" value={quando} onChange={(event) => setQuando(event.target.value)} />
          </Campo>
        </div>

        {tarefas.length ? (
          <Campo id="apl-tarefa" rotulo="Tarefa da régua que esta aplicação cumpre" className="rounded-bloco bg-saber p-3">
            <CampoSelecao id="apl-tarefa" value={tarefaRef} onChange={(event) => setTarefaRef(event.target.value)}>
              <option value="">Não concluir nenhuma tarefa</option>
              {tarefas.map((tarefa) => (
                <option key={tarefa.id} value={tarefa.id}>
                  Concluir: {tarefa.title} (vence {formatCrmDateTime(tarefa.dueAt)})
                </option>
              ))}
            </CampoSelecao>
          </Campo>
        ) : null}

        <div className="grid gap-4 md:grid-cols-[1.6fr_1fr] md:items-end">
          <Campo id="apl-produto" rotulo="Produto (estoque da enfermagem)">
            <CampoSelecao id="apl-produto" value={itemRef} onChange={(event) => setItemRef(event.target.value)}>
              <option value="">— escolha o produto —</option>
              <optgroup label="Medicações e injetáveis">
                {medicacoes.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {rotuloProduto(produto)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Insumos">
                {insumos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {rotuloProduto(produto)}
                  </option>
                ))}
              </optgroup>
            </CampoSelecao>
          </Campo>
          <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-tinta max-md:min-h-11">
            <input type="checkbox" checked={frascoAberto} onChange={(event) => setFrascoAberto(event.target.checked)} className="h-5 w-5 accent-[rgb(var(--musgo-rgb))]" />
            <span className="inline-flex items-center gap-1">
              Dose de frasco já aberto
              <InfoTip title="Quando marcar">
                O frasco saiu do estoque inteiro numa dose anterior (ex.: tirzepatida) e esta é mais uma dose dele. A
                aplicação fica registrada com o lote, mas não baixa o estoque de novo.
              </InfoTip>
            </span>
          </label>
        </div>

        {item ? (
          <div className="grid gap-4 md:grid-cols-[1.6fr_0.7fr]">
            <Campo
              id="apl-lote"
              rotulo="Lote"
              ajuda={!lotes.some((lote) => !lote.vencido) ? "Nenhum lote válido com saldo no estoque deste produto — digite o da caixa." : undefined}
            >
              <CampoSelecao id="apl-lote" value={loteEscolha} onChange={(event) => setLoteEscolha(event.target.value)}>
                {lotes.map((lote) => (
                  <option key={chaveLote(lote.lote, lote.validade)} value={chaveLote(lote.lote, lote.validade)} disabled={lote.vencido}>
                    Lote {lote.lote} · validade {diaBR(lote.validade)}
                    {frascoAberto ? "" : ` · ${qtdBR(lote.saldo)} ${item.unidade} no lote`}
                    {lote.vencido ? " · VENCIDO" : ""}
                  </option>
                ))}
                <option value={LOTE_OUTRO}>Outro lote (digitar o da caixa)</option>
              </CampoSelecao>
            </Campo>
            {!frascoAberto ? (
              <Campo id="apl-qtd" rotulo={`Sai do estoque (${item.unidade})`}>
                <CampoTexto id="apl-qtd" inputMode="decimal" value={quantidade} onChange={(event) => setQuantidade(event.target.value)} className="tabular-nums" />
              </Campo>
            ) : null}
          </div>
        ) : null}

        {item && loteEscolha === LOTE_OUTRO ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Campo id="apl-lote-dig" rotulo="Lote (como está na caixa)">
              <CampoTexto id="apl-lote-dig" value={loteDigitado} onChange={(event) => setLoteDigitado(event.target.value)} autoComplete="off" />
            </Campo>
            <Campo id="apl-validade-dig" rotulo="Validade">
              <CampoTexto id="apl-validade-dig" type="date" value={validadeDigitada} onChange={(event) => setValidadeDigitada(event.target.value)} />
            </Campo>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Campo id="apl-dose" rotulo="Dose">
            <CampoTexto id="apl-dose" value={dose} onChange={(event) => setDose(event.target.value)} placeholder="5 mg · 0,5 mL · 2 pellets" maxLength={LIMITE_DOSE} />
          </Campo>
          <Campo id="apl-via" rotulo="Via">
            <CampoSelecao id="apl-via" value={via} onChange={(event) => setVia(event.target.value as ViaAplicacao | "")}>
              <option value="">— escolha —</option>
              {vias.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {viaLabels[opcao]}
                </option>
              ))}
            </CampoSelecao>
          </Campo>
          <Campo id="apl-local" rotulo="Local da aplicação">
            <CampoTexto id="apl-local" list="apl-locais" value={local} onChange={(event) => setLocal(event.target.value)} placeholder="Glúteo direito" maxLength={LIMITE_LOCAL} />
            <datalist id="apl-locais">
              {(via ? locaisSugeridos[via] : []).map((sugestao) => (
                <option key={sugestao} value={sugestao} />
              ))}
            </datalist>
          </Campo>
        </div>

        {item ? (
          <div className="grid gap-4 md:grid-cols-[1.6fr_0.7fr]">
            <Campo id="apl-insumo" rotulo="Insumo que sai junto (opcional)">
              <CampoSelecao id="apl-insumo" value={insumoRef} onChange={(event) => setInsumoRef(event.target.value)}>
                <option value="">Nenhum</option>
                {produtos
                  .filter((produto) => produto.id !== itemRef)
                  .map((produto) => (
                    <option key={produto.id} value={produto.id}>
                      {rotuloProduto(produto)}
                    </option>
                  ))}
              </CampoSelecao>
            </Campo>
            {insumoRef ? (
              <Campo id="apl-insumo-qtd" rotulo="Quantidade do insumo">
                <CampoTexto id="apl-insumo-qtd" inputMode="decimal" value={insumoQtd} onChange={(event) => setInsumoQtd(event.target.value)} className="tabular-nums" />
              </Campo>
            ) : null}
          </div>
        ) : null}

        <Campo
          id="apl-obs"
          rotulo="Observação (curta)"
          ajuda={
            <span className="block text-right tabular-nums">
              {observacao.length} de {LIMITE_OBSERVACAO} letras
            </span>
          }
        >
          <CampoArea
            id="apl-obs"
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
            maxLength={LIMITE_OBSERVACAO}
            rows={2}
            placeholder="Ex.: paciente relatou dor leve no local"
          />
        </Campo>

        {erros.length ? (
          <Recado tom="erro" role="alert" icone={<AlertTriangle aria-hidden="true" />}>
            {erros.map((texto) => (
              <strong key={texto} className="block">
                {texto}
              </strong>
            ))}
          </Recado>
        ) : null}

        {problemas.length ? (
          <Recado tom="atencao" role="alert" icone={<AlertTriangle aria-hidden="true" />}>
            <strong className="block">O estoque não bate com esta aplicação. Não salvei.</strong>
            <ul className="mt-1 list-disc pl-5">
              {problemas.map((texto) => (
                <li key={texto}>{texto}</li>
              ))}
            </ul>
            <p className="mt-2">
              Confira o lote na caixa. Se a dose já foi aplicada e o estoque é que está desatualizado, a gestão libera
              com um motivo — a aplicação fica marcada "estoque a ajustar" até alguém acertar a contagem.
            </p>
            {!liberando ? (
              <Botao variante="secundario" tamanho="pq" icone={<KeyRound className="h-4 w-4" aria-hidden="true" />} onClick={() => setLiberando(true)} className="mt-3 max-md:h-11">
                A gestão libera
              </Botao>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-[1.6fr_1fr] md:items-end">
                <Campo id="apl-lib-motivo" rotulo="Motivo (o que está desatualizado)">
                  <CampoTexto
                    id="apl-lib-motivo"
                    value={motivoLiberacao}
                    onChange={(event) => setMotivoLiberacao(event.target.value)}
                    placeholder="Entrada da caixa nova ainda não lançada"
                    maxLength={200}
                  />
                </Campo>
                {podeLiberarLogado ? (
                  <p className="text-[13px] font-medium text-tinta">Você é da gestão: a liberação sai no seu nome.</p>
                ) : (
                  <Campo id="apl-lib-senha" rotulo="Senha do gestor">
                    <CampoTexto id="apl-lib-senha" type="password" autoComplete="off" value={senhaGestor} onChange={(event) => setSenhaGestor(event.target.value)} />
                  </Campo>
                )}
              </div>
            )}
          </Recado>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-fio pt-4">
          <Botao type="submit" variante="primario" carregando={salvando} icone={<Save className="h-4 w-4" aria-hidden="true" />} className="max-md:h-11 max-md:flex-1">
            {salvando ? "Salvando…" : liberando ? "Liberar e salvar" : "Salvar aplicação"}
          </Botao>
          <Botao variante="fantasma" onClick={onFechar} disabled={salvando} className="max-md:h-11">
            Cancelar
          </Botao>
        </div>
      </form>
    </BlocoFolha>
  );
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

function AplicacoesConteudo() {
  const { pessoa } = useAuth();
  const location = useLocation();
  const estoque = useEstoque();
  const ficha = useAplicacoes();
  const { state, persist } = useCrmState();
  const podeRegistrar = canEditModule(pessoa, "aplicacoes") && canRegistrarAplicacao(pessoa);
  const podeLiberarLogado = isGestaoAplicacao(pessoa?.cargo);

  // A ficha do paciente no CRM manda o paciente pelo estado da navegação (não
  // pela URL: endereço vai para histórico e log, e ficha clínica não).
  const pacienteDaFicha = (location.state as { paciente?: PatientPickerValue } | null)?.paciente ?? null;
  const [formAberto, setFormAberto] = useState(Boolean(pacienteDaFicha) && podeRegistrar);
  const [dia, setDia] = useState(() => todayISO());
  const [feedback, setFeedback] = useState("");
  const [erro, setErro] = useState("");

  const doDia = useMemo(() => aplicacoesDoDia(ficha.aplicacoes, dia), [ficha.aplicacoes, dia]);

  async function registrar(id: string, rascunho: RascunhoAplicacao, liberacao: Liberacao | null) {
    setErro("");
    setFeedback("");
    try {
      const resposta = await ficha.registrar(id, rascunho, {
        liberacao: liberacao ? { motivo: liberacao.motivo, senhaGestor: liberacao.senha, comoLocal: podeLiberarLogado ? "GESTAO_LOGADA" : "SENHA_GESTOR" } : null,
        items: estoque.items,
        createMoveLocal: estoque.createMove,
      });
      if (!resposta.ok) return resposta;
      const produto = estoque.items.find((item) => item.id === rascunho.itemRef);
      let mensagem = `Aplicação salva: ${produto?.nome ?? "produto"}, lote ${rascunho.lote}.${rascunho.frascoAberto ? " Não baixou estoque (frasco já aberto)." : " A saída já está no estoque."}`;
      if (resposta.repetida) mensagem = "Esta aplicação já estava salva — nada foi duplicado.";
      if (resposta.liberado) mensagem += " Ficou marcada \"estoque a ajustar\".";
      // A tarefa é concluída pelo motor do CRM, e não pelo banco: é o motor que
      // avança a fase do Programa e registra o toque (ver a migration 202609290001).
      if (rascunho.crmTaskRef && !resposta.repetida) {
        const concluiu = await persist((atual) =>
          completeCrmTask(atual, rascunho.crmTaskRef, { result: "OTHER", resultNotes: NOTA_TAREFA_CONCLUIDA, actorId: pessoa?.id ?? "preview" }),
        );
        if (concluiu) mensagem += " A tarefa da régua foi concluída.";
        else setErro("A aplicação foi salva, mas a tarefa da régua NÃO foi concluída no CRM (falhou a sincronização). Conclua em CRM → Minhas Tarefas.");
      }
      setFeedback(mensagem);
      setDia(diaEmBrasilia(rascunho.aplicadoEm) || todayISO());
      return { ok: true as const, mensagem };
    } catch (falha) {
      const texto = falha instanceof Error ? falha.message : String(falha);
      return { ok: false as const, problemas: [], erro: `Não salvei: ${texto}` };
    }
  }

  async function estornar(aplicacao: EnfermagemAplicacao) {
    setErro("");
    setFeedback("");
    const motivo = await perguntar("Estornar esta aplicação?", {
      corpo: "A aplicação continua no histórico, marcada como estornada, e o que saiu do estoque volta para o mesmo lote. Diga o que estava errado.",
      rotulo: "Motivo do estorno",
      placeholder: "Ex.: lancei no paciente errado",
      confirmar: "Estornar",
    });
    if (motivo === null) return;
    if (motivo.trim().length < MINIMO_MOTIVO_ESTORNO) {
      setErro("Não estornei: escreva o motivo do estorno (o que estava errado).");
      return;
    }
    try {
      await ficha.estornar(aplicacao, motivo, estoque.createMove);
      setFeedback(`Aplicação estornada: ${aplicacao.produtoNome}, lote ${aplicacao.lote}. O estoque voltou.`);
    } catch (falha) {
      setErro(`Não estornei: ${falha instanceof Error ? falha.message : String(falha)}`);
    }
  }

  const ehHoje = dia === todayISO();
  return (
    <div className="mx-auto w-full max-w-[1200px] font-sans text-tinta">
      <Cabecalho
        sobrancelha="Compras e estoque · Enfermagem"
        titulo="Aplicações"
        frase={
          <>
            <strong>{ehHoje ? "Hoje" : diaBR(dia)}:</strong> {resumoDoDia(doDia).replace(/\.$/, "")}.{" "}
            <InfoTip title="Para que serve" className="align-middle">
              Cada aplicação guarda o paciente, o produto, o lote, a validade, a dose, a via, o local, a hora e quem aplicou —
              é assim que se responde "qual lote foi em quem". Salvar já lança a saída no estoque da enfermagem. Aplicação
              errada não se apaga: estorna, com motivo, e o estoque volta.
            </InfoTip>
          </>
        }
        acoes={
          podeRegistrar && !formAberto ? (
            <Botao variante="primario" icone={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setFormAberto(true)} className="max-md:h-11">
              Registrar aplicação
            </Botao>
          ) : null
        }
        rodape={
          <FraseDoFluxo link={{ to: "/estoque", rotulo: "Ver o estoque" }}>
            Registre na hora da aplicação: o estoque baixa sozinho e a ficha do paciente no CRM mostra o histórico.
          </FraseDoFluxo>
        }
      />

      <div className="grid gap-6">
        {feedback ? (
          <Recado tom="ok" role="status" icone={<CheckCircle2 aria-hidden="true" />}>
            <strong>{feedback}</strong>
          </Recado>
        ) : null}
        {erro || ficha.erroAoCarregar ? (
          <Recado tom="erro" role="alert" icone={<AlertTriangle aria-hidden="true" />}>
            <strong>{erro || `Não consegui ler as aplicações: ${ficha.erroAoCarregar}`}</strong>
          </Recado>
        ) : null}

        {formAberto && podeRegistrar ? (
          <RegistrarAplicacaoForm
            contacts={state.contacts}
            tasks={state.tasks}
            items={estoque.items}
            moves={estoque.moves}
            pacienteInicial={pacienteDaFicha}
            podeLiberarLogado={podeLiberarLogado}
            onRegistrar={registrar}
            onFechar={() => setFormAberto(false)}
          />
        ) : null}

        {/* A lista do dia, com o dia que ela mostra na própria cabeça (08/10/2026):
            o seletor de dia só muda esta lista, então mora junto dela. */}
        <BlocoFolha as="section" aria-labelledby="apl-do-dia">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-4 pb-3 pt-4">
            <div className="grid min-w-0 gap-0.5">
              <h2 id="apl-do-dia" className="text-sm font-bold leading-5 text-tinta">
                {ehHoje ? "Aplicações de hoje" : `Aplicações de ${diaBR(dia)}`}
              </h2>
              <p className="text-[13px] font-medium leading-5 text-tinta-2">{resumoDoDia(doDia)}</p>
            </div>
            <label htmlFor="apl-dia" className="flex items-center gap-2 text-[13px] font-bold leading-5 text-tinta max-md:w-full">
              Ver o dia
              <CampoTexto id="apl-dia" type="date" value={dia} onChange={(event) => setDia(event.target.value || todayISO())} className="h-9 w-auto tabular-nums max-md:h-11 max-md:flex-1" />
            </label>
          </div>
          {ficha.carregando ? <p className="border-t border-fio px-4 py-4 text-sm font-medium text-tinta-2">Carregando as aplicações…</p> : null}
          {!ficha.carregando && !doDia.length ? (
            <p className="border-t border-fio px-4 py-6 text-center text-sm font-medium text-tinta-2">
              {podeRegistrar ? "Nada registrado neste dia. Use \"Registrar aplicação\" logo depois de aplicar." : "Nada registrado neste dia."}
            </p>
          ) : null}
          {doDia.length ? (
            <ul>
              {doDia.map((aplicacao) => (
                <LinhaDaAplicacao key={aplicacao.id} aplicacao={aplicacao} podeEstornar={podeRegistrar} onEstornar={estornar} />
              ))}
            </ul>
          ) : null}
        </BlocoFolha>
      </div>

      {/* Sem banco (prévia), avisa em português; com o banco não há o que dizer. */}
      {ficha.syncMode === "Somente local" ? (
        <p className="mt-8 text-center text-[13px] font-medium text-tinta-2">Modo prévia: as aplicações ficam só neste aparelho.</p>
      ) : null}
    </div>
  );
}

export function AplicacoesPage() {
  return (
    <AccessGate allowed={() => false} module="aplicacoes" label="Aplicações da enfermagem">
      <AplicacoesConteudo />
    </AccessGate>
  );
}
