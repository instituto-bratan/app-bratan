// APLICAÇÕES DA ENFERMAGEM (29/09/2026, aprovado pelo Lucas): "ficha de
// aplicação da enfermagem ligada ao estoque".
//
// A tela é a lista do dia e o botão "Registrar aplicação". Registrar grava a
// aplicação E a saída do estoque numa transação só (registrar_aplicacao no
// banco) — é isso que responde "qual lote foi em quem" e faz o kardex e o
// COMPRAR ficarem certos sem ninguém lembrar de lançar a saída.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Boxes, CheckCircle2, KeyRound, Plus, Syringe, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { perguntar } from "@/components/ui/avisos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canRegistrarAplicacao, isGestaoAplicacao } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
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
import { saldoDoItem, type EstoqueItem, type EstoqueMovimento } from "./estoqueData";
import { LinhaDaAplicacao } from "./LinhaDaAplicacao";
import { useAplicacoes } from "./useAplicacoes";
import { useEstoque } from "./useEstoque";

const novoId = () => `apl-${crypto.randomUUID()}`;
const campo = "flex h-10 w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm";
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
    <Card className="border-brand-musgo/30 bg-white/80 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Syringe className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
          Registrar aplicação
          <InfoTip title="O que acontece ao salvar">
            A aplicação e a saída do estoque são gravadas juntas: o saldo do lote cai na hora e, se o item ficar abaixo do
            mínimo, entra em COMPRAR. O lote sugerido é o que vence primeiro (FEFO) entre os que não estão vencidos na
            data da aplicação — dá para trocar. Lote vencido nunca salva. Sem saldo no lote, só salva se a gestão liberar.
          </InfoTip>
          <button type="button" onClick={onFechar} className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-white" aria-label="Fechar o formulário">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={salvar}>
          <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
            <div>
              <Label htmlFor="apl-paciente">Paciente</Label>
              <PatientPicker contacts={contacts} value={paciente} onChange={setPaciente} id="apl-paciente" somenteVincular />
            </div>
            <div>
              <Label htmlFor="apl-quando">Data e hora (Brasília)</Label>
              <Input id="apl-quando" type="datetime-local" value={quando} onChange={(event) => setQuando(event.target.value)} />
            </div>
          </div>

          {tarefas.length ? (
            <div className="rounded-lg border border-brand-dourado/40 bg-brand-creme/40 px-3 py-2.5 text-sm">
              <Label htmlFor="apl-tarefa">Tarefa da régua que esta aplicação cumpre</Label>
              <select id="apl-tarefa" className={cn(campo, "mt-1")} value={tarefaRef} onChange={(event) => setTarefaRef(event.target.value)}>
                <option value="">Não concluir nenhuma tarefa</option>
                {tarefas.map((tarefa) => (
                  <option key={tarefa.id} value={tarefa.id}>
                    Concluir: {tarefa.title} (vence {formatCrmDateTime(tarefa.dueAt)})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[1.6fr_1fr]">
            <div>
              <Label htmlFor="apl-produto">Produto (estoque da enfermagem)</Label>
              <select id="apl-produto" className={campo} value={itemRef} onChange={(event) => setItemRef(event.target.value)}>
                <option value="">— escolha o produto —</option>
                <optgroup label="Medicações e injetáveis">
                  {medicacoes.map((produto) => (
                    <option key={produto.id} value={produto.id}>{rotuloProduto(produto)}</option>
                  ))}
                </optgroup>
                <optgroup label="Insumos">
                  {insumos.map((produto) => (
                    <option key={produto.id} value={produto.id}>{rotuloProduto(produto)}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={frascoAberto} onChange={(event) => setFrascoAberto(event.target.checked)} className="h-4 w-4" />
              <span>
                Dose de frasco já aberto
                <InfoTip title="Quando marcar">
                  O frasco saiu do estoque inteiro numa dose anterior (ex.: tirzepatida) e esta é mais uma dose dele. A
                  aplicação fica registrada com o lote, mas não baixa o estoque de novo.
                </InfoTip>
              </span>
            </label>
          </div>

          {item ? (
            <div className="grid gap-3 md:grid-cols-[1.6fr_0.7fr]">
              <div>
                <Label htmlFor="apl-lote">Lote</Label>
                <select id="apl-lote" className={campo} value={loteEscolha} onChange={(event) => setLoteEscolha(event.target.value)}>
                  {lotes.map((lote) => (
                    <option key={chaveLote(lote.lote, lote.validade)} value={chaveLote(lote.lote, lote.validade)} disabled={lote.vencido}>
                      Lote {lote.lote} · validade {diaBR(lote.validade)}
                      {frascoAberto ? "" : ` · ${qtdBR(lote.saldo)} ${item.unidade} no lote`}
                      {lote.vencido ? " · VENCIDO" : ""}
                    </option>
                  ))}
                  <option value={LOTE_OUTRO}>Outro lote (digitar o da caixa)</option>
                </select>
                {!lotes.some((lote) => !lote.vencido) ? (
                  <p className="mt-1 text-xs text-muted-foreground">Nenhum lote válido com saldo no estoque deste produto — digite o da caixa.</p>
                ) : null}
              </div>
              {!frascoAberto ? (
                <div>
                  <Label htmlFor="apl-qtd">Sai do estoque ({item.unidade})</Label>
                  <Input id="apl-qtd" inputMode="decimal" value={quantidade} onChange={(event) => setQuantidade(event.target.value)} />
                </div>
              ) : null}
            </div>
          ) : null}

          {item && loteEscolha === LOTE_OUTRO ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="apl-lote-dig">Lote (como está na caixa)</Label>
                <Input id="apl-lote-dig" value={loteDigitado} onChange={(event) => setLoteDigitado(event.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="apl-validade-dig">Validade</Label>
                <Input id="apl-validade-dig" type="date" value={validadeDigitada} onChange={(event) => setValidadeDigitada(event.target.value)} />
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="apl-dose">Dose</Label>
              <Input id="apl-dose" value={dose} onChange={(event) => setDose(event.target.value)} placeholder="5 mg · 0,5 mL · 2 pellets" maxLength={LIMITE_DOSE} />
            </div>
            <div>
              <Label htmlFor="apl-via">Via</Label>
              <select id="apl-via" className={campo} value={via} onChange={(event) => setVia(event.target.value as ViaAplicacao | "")}>
                <option value="">— escolha —</option>
                {vias.map((opcao) => (
                  <option key={opcao} value={opcao}>{viaLabels[opcao]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="apl-local">Local da aplicação</Label>
              <Input id="apl-local" list="apl-locais" value={local} onChange={(event) => setLocal(event.target.value)} placeholder="Glúteo direito" maxLength={LIMITE_LOCAL} />
              <datalist id="apl-locais">
                {(via ? locaisSugeridos[via] : []).map((sugestao) => (
                  <option key={sugestao} value={sugestao} />
                ))}
              </datalist>
            </div>
          </div>

          {item ? (
            <div className="grid gap-3 md:grid-cols-[1.6fr_0.7fr]">
              <div>
                <Label htmlFor="apl-insumo">Insumo que sai junto (opcional)</Label>
                <select id="apl-insumo" className={campo} value={insumoRef} onChange={(event) => setInsumoRef(event.target.value)}>
                  <option value="">Nenhum</option>
                  {produtos
                    .filter((produto) => produto.id !== itemRef)
                    .map((produto) => (
                      <option key={produto.id} value={produto.id}>{rotuloProduto(produto)}</option>
                    ))}
                </select>
              </div>
              {insumoRef ? (
                <div>
                  <Label htmlFor="apl-insumo-qtd">Quantidade do insumo</Label>
                  <Input id="apl-insumo-qtd" inputMode="decimal" value={insumoQtd} onChange={(event) => setInsumoQtd(event.target.value)} />
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <Label htmlFor="apl-obs">Observação (curta)</Label>
            <textarea
              id="apl-obs"
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              maxLength={LIMITE_OBSERVACAO}
              rows={2}
              className="w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm"
              placeholder="Ex.: paciente relatou dor leve no local"
            />
            <p className="text-right text-[11px] text-muted-foreground">{observacao.length} de {LIMITE_OBSERVACAO} letras</p>
          </div>

          {erros.length ? (
            <div className="grid gap-1 rounded-lg border border-rose-300 bg-rose-50/80 px-3 py-2.5 text-sm font-semibold text-red-800" role="alert">
              {erros.map((texto) => (
                <p key={texto} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {texto}
                </p>
              ))}
            </div>
          ) : null}

          {problemas.length ? (
            <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50/80 px-3 py-3 text-sm text-amber-900" role="alert">
              <p className="font-semibold">O estoque não bate com esta aplicação. Não salvei.</p>
              <ul className="list-disc pl-5">
                {problemas.map((texto) => (
                  <li key={texto}>{texto}</li>
                ))}
              </ul>
              <p>
                Confira o lote na caixa. Se a dose já foi aplicada e o estoque é que está desatualizado, a gestão libera
                com um motivo — a aplicação fica marcada "estoque a ajustar" até alguém acertar a contagem.
              </p>
              {!liberando ? (
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setLiberando(true)}>
                    <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" /> A gestão libera
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-[1.6fr_1fr]">
                  <div>
                    <Label htmlFor="apl-lib-motivo">Motivo (o que está desatualizado)</Label>
                    <Input
                      id="apl-lib-motivo"
                      value={motivoLiberacao}
                      onChange={(event) => setMotivoLiberacao(event.target.value)}
                      placeholder="Entrada da caixa nova ainda não lançada"
                      maxLength={200}
                    />
                  </div>
                  {podeLiberarLogado ? (
                    <p className="self-end text-xs text-amber-900">Você é da gestão: a liberação sai no seu nome.</p>
                  ) : (
                    <div>
                      <Label htmlFor="apl-lib-senha">Senha do gestor</Label>
                      <Input
                        id="apl-lib-senha"
                        type="password"
                        autoComplete="off"
                        value={senhaGestor}
                        onChange={(event) => setSenhaGestor(event.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : liberando ? "Liberar e salvar" : "Salvar aplicação"}
            </Button>
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="gold">Enfermagem</Badge>
          <Badge variant="muted">{ficha.syncMode}</Badge>
        </div>
        <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
          <Syringe className="h-8 w-8 text-brand-oliva" aria-hidden="true" />
          Aplicações
          <InfoTip title="Para que serve">
            Cada aplicação guarda o paciente, o produto, o lote, a validade, a dose, a via, o local, a hora e quem aplicou —
            é assim que se responde "qual lote foi em quem". Salvar já lança a saída no estoque da enfermagem. Aplicação
            errada não se apaga: estorna, com motivo, e o estoque volta.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Registre na hora da aplicação: o estoque baixa sozinho e a ficha do paciente no CRM mostra o histórico.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="apl-dia">Dia</Label>
            <Input id="apl-dia" type="date" value={dia} onChange={(event) => setDia(event.target.value || todayISO())} className="w-44" />
          </div>
          {podeRegistrar && !formAberto ? (
            <Button type="button" onClick={() => setFormAberto(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Registrar aplicação
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link to="/estoque">
              <Boxes className="mr-1.5 h-4 w-4" aria-hidden="true" /> Ver o estoque
            </Link>
          </Button>
        </div>
      </motion.section>

      {feedback ? (
        <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
          {feedback}
        </div>
      ) : null}
      {erro || ficha.erroAoCarregar ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50/80 px-4 py-3 text-sm font-semibold text-red-800" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {erro || `Não consegui ler as aplicações: ${ficha.erroAoCarregar}`}
        </div>
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

      <Card className="border-brand-oliva/20 bg-white/70 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {dia === todayISO() ? "Hoje" : diaBR(dia)} · {resumoDoDia(doDia)}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {ficha.carregando ? <p className="text-sm text-muted-foreground">Carregando as aplicações…</p> : null}
          {!ficha.carregando && !doDia.length ? (
            <p className="text-sm text-muted-foreground">
              {podeRegistrar ? "Nada registrado neste dia. Use \"Registrar aplicação\" logo depois de aplicar." : "Nada registrado neste dia."}
            </p>
          ) : null}
          {doDia.map((aplicacao) => (
            <LinhaDaAplicacao key={aplicacao.id} aplicacao={aplicacao} podeEstornar={podeRegistrar} onEstornar={estornar} />
          ))}
        </CardContent>
      </Card>
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
