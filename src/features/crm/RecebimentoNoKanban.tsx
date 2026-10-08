// RECEBIMENTO NO KANBAN — o mesmo bloco nos dois momentos da tela
//
// Pedido do Lucas (17/08/2026): "melhore esse fluxo e deixe mais fácil de
// entender, e visualmente também muito mais fácil de entender."
//
// O que estava difícil: um bloco só, denso, com seis campos soltos e um parágrafo
// comprido no fim explicando para onde ia. Quem usa não lia — e não dava para
// saber, de relance, se faltava algo.
//
// O que mudou: TRÊS PASSOS numerados (quanto entrou → o que é → comprovante) e,
// embaixo, um quadro de DESTINOS com uma linha por lugar alimentado, cada uma
// com ✓ quando já está resolvida. Em vez de ler um parágrafo, a pessoa vê a
// lista se completando.
//
// Um componente só, usado pelo cadastro do paciente E pelo fechamento: assim os
// dois caminhos têm a mesma cara e a mesma explicação.
import { useRef } from "react";
import { AlertTriangle, Check, FileText, Paperclip, Plus, X } from "lucide-react";
import {
  formataValor,
  itemFechadoDoProduto,
  itemComQuantidade,
  itemFechadoLivre,
  produtoPorNome,
  secoesDoCatalogo,
  totalDosItensFechados,
  type ItemFechado,
} from "@/features/financeiro/catalogoPrecificacao";
import { cn } from "@/lib/utils";
import { Button, CAMPO, CAMPO_PQ, Input, Label, classeDoChip } from "./comercialVisual";
import {
  parseFinAmount,
  paymentMethodLabels,
  moneyFin,
  saleItemTypeLabels,
  salePaymentMethods,
  type FinPaymentMethod,
  type FinSaleItemType,
} from "@/features/financeiro/financeiroData";
import {
  conferirDivisao,
  destinosDoRecebimento,
  parcelaVazia,
  quandoNotaLabels,
  somaDasParcelas,
  tipoRecebimentoLabels,
  tiposDeItem,
  type ParcelaDoRecebimento,
  type QuandoNota,
  type TipoRecebimento,
} from "./recebimentoKanbanData";
import { NotaNoFechamentoCard } from "./NotaNoFechamentoCard";
import type { SinalEmAberto } from "@/features/financeiro/sinaisDoPaciente";
import type { NotaDoFechamento } from "./notaNoFechamento";
import { todayISO } from "@/lib/localStore";

export function RecebimentoNoKanban({
  valorTexto,
  onValorChange,
  valor,
  divisao,
  onDivisaoChange,
  itemTipo,
  onItemTipoChange,
  itens,
  onItensChange,
  tipo,
  onTipoChange,
  tiposDisponiveis,
  nota,
  onNotaChange,
  tomador,
  onEmailChange,
  cpfRascunho,
  onCpfChange,
  notaInstrucao,
  onNotaInstrucaoChange,
  quandoNota,
  onQuandoNotaChange,
  arquivos,
  onArquivosChange,
  mandaDepois,
  onMandaDepoisChange,
  pacienteNovo,
  regua,
  titulo,
  sinais,
  somarSinais,
  onSomarSinais,
  valorDaNota,
}: {
  valorTexto: string;
  onValorChange: (valor: string) => void;
  valor: number;
  /** Como o paciente pagou. Mais de uma linha = pagamento dividido. */
  divisao: ParcelaDoRecebimento[];
  onDivisaoChange: (divisao: ParcelaDoRecebimento[]) => void;
  /** O que foi vendido (entra no item da comanda) — vale quando nenhum produto da tabela foi escolhido. */
  itemTipo: FinSaleItemType;
  onItemTipoChange: (tipo: FinSaleItemType) => void;
  /**
   * O QUE O PACIENTE FECHOU, PRODUTO A PRODUTO (02/09/2026, pedido do Lucas):
   * "Programa + HCG + testosterona + vitamina D". Cada linha vem da tabela de
   * precificação com nome e preço oficiais; a comanda nasce itemizada assim e o
   * Lucro Inteligente lê a coluna S de cada item sem adivinhar.
   */
  itens: ItemFechado[];
  onItensChange: (itens: ItemFechado[]) => void;
  tipo: TipoRecebimento;
  onTipoChange: (tipo: TipoRecebimento) => void;
  tiposDisponiveis: TipoRecebimento[];
  /** A decisão da nota: unificada, repartida (com os valores) ou sem nota com motivo. */
  nota: NotaDoFechamento;
  onNotaChange: (nota: NotaDoFechamento) => void;
  /** Para avisar o que ainda falta na ficha para a nota sair identificada. */
  tomador?: { nome: string; cpf: string; email: string };
  /** Deixa quem fecha acertar o e-mail para onde a nota vai. */
  onEmailChange?: (email: string) => void;
  /** CPF digitado na hora, quando a ficha não tem. */
  cpfRascunho?: string;
  onCpfChange?: (cpf: string) => void;
  notaInstrucao: string;
  onNotaInstrucaoChange: (texto: string) => void;
  quandoNota: QuandoNota;
  onQuandoNotaChange: (quando: QuandoNota) => void;
  /**
   * COMPROVANTES (plural, 18/08/2026 — pedido do Lucas). Um recebimento pode ter
   * mais de um: metade no PIX e metade no cartão são dois comprovantes, e a
   * família que paga junto manda o print de cada um.
   */
  arquivos: File[];
  onArquivosChange: (arquivos: File[]) => void;
  /** Marcou "vou mandar depois" — é o que libera salvar sem anexar. */
  mandaDepois: boolean;
  onMandaDepoisChange: (valor: boolean) => void;
  pacienteNovo: boolean;
  regua: string;
  titulo: string;
  /** Sinais já pagos que entram somados na nota (29/09/2026). */
  sinais?: SinalEmAberto[];
  somarSinais?: boolean;
  onSomarSinais?: (somar: boolean) => void;
  /** Valor da nota (recebido + sinais somados). Sem ele, a nota é o recebido. */
  valorDaNota?: number;
}) {
  const inputArquivo = useRef<HTMLInputElement>(null);
  // Tocar num produto adiciona a linha; tocar de novo soma mais um (duas doses).
  function adicionaProduto(nome: string) {
    const produto = produtoPorNome(nome);
    if (!produto) return;
    const indice = itens.findIndex((item) => item.produtoNome === produto.nome);
    if (indice < 0) {
      onItensChange([...itens, itemFechadoDoProduto(produto)]);
      return;
    }
    // Mais um da mesma coisa — mantendo o preço que a pessoa já tiver ajustado.
    onItensChange(itens.map((item, i) => (i === indice ? itemComQuantidade(item, item.quantidade + 1, parseFinAmount) : item)));
  }
  // Só dinheiro não gera comprovante; qualquer outra forma gera.
  const soDinheiro = divisao.length > 0 && divisao.every((parcela) => parcela.forma === "DINHEIRO");
  /**
   * FALTA COMPROVANTE (18/08/2026). O caso real: um fechamento de R$ 2.548 foi
   * salvo com o comprovante marcado como "aguardando" e ninguém percebeu — o
   * financeiro descobriu depois, na conferência. Agora a tela avisa aqui, e o
   * botão de salvar não passa sem uma decisão: anexar ou dizer que vem depois.
   */
  const faltaComprovante = valor > 0 && !soDinheiro && arquivos.length === 0 && !mandaDepois;
  const destinos = destinosDoRecebimento({
    valor,
    temArquivo: arquivos.length > 0,
    temNota: notaInstrucao.trim().length > 0,
    pacienteNovo,
    regua,
  });
  const prontos = destinos.filter((item) => item.pronto).length;

  return (
    <div className="grid gap-4 rounded-bloco bg-saber p-4 font-sans">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-bold leading-6 text-tinta">{titulo}</p>
        <span className="text-[13px] font-semibold leading-5 tabular-nums text-tinta-2">
          {prontos} de {destinos.length} destinos prontos
        </span>
      </div>

      {/* PASSO 1 — O QUE O PACIENTE FECHOU (02/09/2026). Lucas: "precisa estar
          todas essas opções aqui no Kanban, porque a maioria das comandas do
          Lançar Dia nasce do registrar fechamento". Antes a lista ficava dentro
          do passo "do que se trata", que só abria depois de digitar o valor, e
          num select fechado — ninguém via. Agora é a primeira coisa da tela,
          sempre visível, com os produtos da tabela de preços como botões
          agrupados por seção. Tocar num produto adiciona a linha com nome e
          preço oficiais; a soma preenche o valor vendido e o recebido. */}
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-musgo text-xs font-extrabold text-sobre-musgo">1</span>
          O que o paciente fechou (tabela de preços)
        </p>
        <div className="grid gap-3 rounded-bloco border border-fio bg-folha p-3">
          {secoesDoCatalogo().map((grupo) => (
            <div key={grupo.secao}>
              <p className="text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2">{grupo.secao}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {grupo.produtos.map((produto) => {
                  const escolhido = itens.some((item) => item.produtoNome === produto.nome);
                  return (
                    <button
                      key={produto.nome}
                      type="button"
                      onClick={() => adicionaProduto(produto.nome)}
                      aria-pressed={escolhido}
                      className={classeDoChip(escolhido)}
                      title={escolhido ? "Toque de novo para somar mais um" : "Adicionar à comanda"}
                    >
                      {produto.nome} <span className="ml-1 font-medium tabular-nums text-tinta-2">· {moneyFin(produto.preco)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => onItensChange([...itens, itemFechadoLivre(itemTipo)])}>
            <Plus className="h-4 w-4" aria-hidden="true" /> outro item (fora da tabela)
          </Button>
        </div>
        {itens.length ? (
          <div className="grid gap-1.5">
            {itens.map((item, index) => {
              const produto = item.produtoNome ? produtoPorNome(item.produtoNome) : null;
              const atualiza = (mudanca: Partial<ItemFechado>) => onItensChange(itens.map((it, i) => (i === index ? { ...it, ...mudanca } : it)));
              return (
                <div key={index} className="grid items-center gap-1.5 rounded-controle border border-fio bg-folha p-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.45fr)_minmax(0,0.8fr)_auto]">
                  {produto ? (
                    <span className="text-sm font-semibold text-tinta">
                      {produto.nome}{" "}
                      <span className="text-[13px] font-medium text-tinta-2">
                        · {saleItemTypeLabels[item.itemType]} · tabela {moneyFin(produto.preco)}
                        {Math.abs(parseFinAmount(item.valorTexto) - produto.preco * item.quantidade) > 0.005 && parseFinAmount(item.valorTexto) > 0 ? (
                          <strong className="text-musgo"> · cobrado {moneyFin(parseFinAmount(item.valorTexto))}</strong>
                        ) : null}
                      </span>
                    </span>
                  ) : (
                    <div className="grid min-w-0 gap-1 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                      <select
                        value={item.itemType}
                        onChange={(event) => atualiza({ itemType: event.target.value as FinSaleItemType })}
                        className={cn(CAMPO_PQ, "h-9 cursor-pointer")}
                        aria-label="Tipo do item"
                      >
                        {tiposDeItem.map((opcao) => (
                          <option key={opcao} value={opcao}>{saleItemTypeLabels[opcao]}</option>
                        ))}
                      </select>
                      <Input value={item.descricao} onChange={(event) => atualiza({ descricao: event.target.value })} placeholder="Descreva o item (fora da tabela)" className="h-9" />
                    </div>
                  )}
                  <label className="grid gap-1 text-xs font-bold leading-4 text-tinta-2">
                    Qtd
                    <Input
                      value={String(item.quantidade)}
                      onChange={(event) => {
                        const quantidade = Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1);
                        // Preserva o preço unitário digitado (sinal de R$ 200 continua R$ 200 × qtd).
                        atualiza(itemComQuantidade(item, quantidade, parseFinAmount));
                      }}
                      inputMode="numeric"
                      aria-label="Quantidade"
                      className="h-9 text-center tabular-nums"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold leading-4 text-tinta-2">
                    Valor cobrado
                    <Input
                      value={item.valorTexto}
                      onChange={(event) => atualiza({ valorTexto: event.target.value })}
                      placeholder={produto ? formataValor(produto.preco * item.quantidade) : "0,00"}
                      inputMode="decimal"
                      aria-label="Valor cobrado na linha"
                      className="h-9 text-right tabular-nums"
                    />
                  </label>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover item" onClick={() => onItensChange(itens.filter((_, i) => i !== index))}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              Itens somam <strong className="tabular-nums text-tinta">{moneyFin(totalDosItensFechados(itens, parseFinAmount))}</strong>
              {valor > 0 && Math.abs(totalDosItensFechados(itens, parseFinAmount) - valor) > 0.01
                ? ` — entrou ${moneyFin(valor)}: a comanda leva o que entrou, com cada item na mesma proporção; o resto fica como vendido.`
                : valor > 0
                  ? " — bate com o valor recebido."
                  : " — o valor recebido foi preenchido com essa soma; ajuste se entrou menos."}
            </p>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              O preço da tabela é só a sugestão: se cobrou diferente (sinal de R$ 200, desconto, acréscimo do cartão), digite o
              valor cobrado na linha — o nome do produto continua o mesmo.
            </p>
          </div>
        ) : (
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            Toque nos produtos que o paciente fechou — Plano + HCG + vitamina D, por exemplo. Cada um vira um item da comanda com o nome e o
            preço da tabela, e a soma preenche o valor.
          </p>
        )}
      </div>

      {/* O COMPROVANTE SEMPRE VISÍVEL (corrigido em 17/08/2026). Estava escondido
      atrás de "valor > 0": quem abria a tela não via o botão de anexar e
      concluía que nada havia mudado. */}
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-musgo text-xs font-extrabold text-sobre-musgo">2</span>
          Comprovante de pagamento
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputArquivo}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              // ACUMULA em vez de substituir: quem anexa um por vez (o PIX e
              // depois o cartão) não perde o primeiro. Repetido não entra duas
              // vezes — a chave é nome + tamanho.
              const novos = [...(event.target.files ?? [])];
              if (!novos.length) return;
              const chave = (arquivo: File) => `${arquivo.name}|${arquivo.size}`;
              const jaTem = new Set(arquivos.map(chave));
              onArquivosChange([...arquivos, ...novos.filter((arquivo) => !jaTem.has(chave(arquivo)))]);
              if (novos.length) onMandaDepoisChange(false);
              // Zera o input para o mesmo arquivo poder ser escolhido de novo
              // depois de removido (o onChange não dispara com o mesmo value).
              event.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputArquivo.current?.click()}>
            <Paperclip className="h-4 w-4" aria-hidden="true" />
            {arquivos.length ? "Anexar outro comprovante" : "Anexar comprovante"}
          </Button>
          {arquivos.length ? (
            <span className="text-[13px] font-bold text-musgo">
              {arquivos.length} arquivo{arquivos.length > 1 ? "s" : ""} — todos vão para a mesma comanda
            </span>
          ) : (
            <span className="text-[13px] font-medium text-tinta-2">Pode anexar mais de um (PIX + cartão, ou quem pagou junto).</span>
          )}
        </div>
        {arquivos.length ? (
          <ul className="grid gap-1">
            {arquivos.map((arquivo, indice) => (
              <li
                key={`${arquivo.name}-${arquivo.size}-${indice}`}
                className="flex items-center justify-between gap-2 rounded-controle border border-fio bg-folha px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tinta">{arquivo.name}</span>
                <button
                  type="button"
                  onClick={() => onArquivosChange(arquivos.filter((_, i) => i !== indice))}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                  aria-label={`Remover ${arquivo.name}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {faltaComprovante ? (
          <div className="flex flex-wrap items-start gap-2 rounded-bloco bg-atencao-claro px-4 py-3 text-[13px] font-medium leading-5 text-atencao">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <strong>Entrou dinheiro e não tem comprovante anexado.</strong> Anexe agora — ou marque abaixo que vem depois,
              para o financeiro saber que está pendente de propósito.
              <label className="mt-1.5 flex cursor-pointer items-center gap-2 font-semibold">
                <input type="checkbox" className="h-4 w-4 accent-musgo" checked={mandaDepois} onChange={(event) => onMandaDepoisChange(event.target.checked)} />
                Vou mandar o comprovante depois
              </label>
            </div>
          </div>
        ) : null}
        {mandaDepois && arquivos.length === 0 ? (
          <p className="text-[13px] font-semibold leading-5 text-tinta-2">
            Fica registrado como AGUARDANDO comprovante — aparece nos avisos até alguém anexar.
          </p>
        ) : null}
      </div>

      {/* PASSO 3 — quanto entrou */}
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-musgo text-xs font-extrabold text-sobre-musgo">3</span>
          Quanto entrou
        </p>
        <div>
          <Label>Valor recebido (R$)</Label>
          <Input
            value={valorTexto}
            onChange={(event) => onValorChange(event.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="mt-2 tabular-nums sm:max-w-xs"
          />
        </div>

        {valor > 0 ? (
          <div className="grid gap-2">
            <p className="text-[13px] font-bold leading-5 text-tinta">Como ele pagou</p>
            {divisao.map((parcela, indice) => (
              <div key={indice} className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_auto]">
                <select
                  value={parcela.forma}
                  onChange={(event) =>
                    onDivisaoChange(divisao.map((item, i) => (i === indice ? { ...item, forma: event.target.value as FinPaymentMethod } : item)))
                  }
                  className={cn(CAMPO, "cursor-pointer")}
                  aria-label="Forma de pagamento"
                >
                  {salePaymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabels[method]}
                    </option>
                  ))}
                </select>
                <Input
                  value={divisao.length === 1 ? valorTexto : parcela.valorTexto}
                  onChange={(event) =>
                    onDivisaoChange(divisao.map((item, i) => (i === indice ? { ...item, valorTexto: event.target.value } : item)))
                  }
                  inputMode="decimal"
                  placeholder="valor"
                  disabled={divisao.length === 1}
                  aria-label="Valor nesta forma"
                />
                <Input
                  value={parcela.parcelas}
                  onChange={(event) =>
                    onDivisaoChange(divisao.map((item, i) => (i === indice ? { ...item, parcelas: event.target.value } : item)))
                  }
                  inputMode="numeric"
                  disabled={parcela.forma !== "CARTAO_CREDITO"}
                  aria-label="Parcelas"
                  placeholder="1x"
                />
                {divisao.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Remover esta forma"
                    onClick={() => onDivisaoChange(divisao.filter((_, i) => i !== indice))}
                  >
                    ×
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onDivisaoChange([
                    ...divisao.map((item, i) =>
                      i === 0 && divisao.length === 1 ? { ...item, valorTexto: valorTexto } : item,
                    ),
                    parcelaVazia("CARTAO_CREDITO"),
                  ])
                }
              >
                + Dividiu em duas formas
              </Button>
              {divisao.length > 1 ? (
                <span className="text-[13px] font-medium tabular-nums text-tinta-2">
                  somando {moneyFin(somaDasParcelas(divisao, parseFinAmount))} de {moneyFin(valor)}
                </span>
              ) : null}
            </div>
            {conferirDivisao(valor, divisao, parseFinAmount) ? (
              <p className="rounded-bloco bg-atencao-claro px-4 py-3 text-[13px] font-semibold leading-5 text-atencao">
                {conferirDivisao(valor, divisao, parseFinAmount)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {valor > 0 ? (
        <>
          {/* PASSO 4 — do que se trata */}
          <div className="grid gap-2">
            <p className="flex items-center gap-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-musgo text-xs font-extrabold text-sobre-musgo">4</span>
              Do que se trata
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tiposDisponiveis.map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => onTipoChange(opcao)}
                  aria-pressed={tipo === opcao}
                  className={classeDoChip(tipo === opcao)}
                >
                  {tipoRecebimentoLabels[opcao]}
                </button>
              ))}
            </div>
            {itens.length === 0 ? (
              <div>
                <p className="text-[13px] font-medium leading-5 text-tinta-2">Sem produto escolhido no passo 1, a comanda leva um item só, deste tipo:</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {tiposDeItem.map((opcao) => (
                    <button
                      key={opcao}
                      type="button"
                      onClick={() => onItemTipoChange(opcao)}
                      aria-pressed={itemTipo === opcao}
                      className={classeDoChip(itemTipo === opcao)}
                    >
                      {saleItemTypeLabels[opcao]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[13px] font-medium leading-5 text-tinta-2">
                A comanda leva os {itens.length} item(ns) escolhidos no passo 1, com o nome da tabela.
              </p>
            )}
          </div>

          {/* PARA ONDE VAI — a lista se completando, em vez de um parágrafo */}
          <div className="grid gap-2 rounded-bloco border border-fio bg-folha p-4">
            <p className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
              Ao salvar, isto alimenta de uma vez
            </p>
            {destinos.map((destino) => (
              <span key={destino.titulo} className="flex items-start gap-2 text-sm leading-5">
                <span
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full",
                    destino.pronto ? "bg-musgo text-sobre-musgo" : "border border-fio-2 bg-folha",
                  )}
                >
                  {destino.pronto ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                </span>
                <span className={cn(destino.pronto ? "text-tinta" : "text-tinta-2")}>
                  <strong className="font-semibold">{destino.titulo}</strong>
                  <span className="text-tinta-2"> — {destino.detalhe}</span>
                </span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[13px] font-medium leading-5 text-tinta-2">
          Informe o valor recebido para lançar a comanda e o comprovante daqui. Sem valor, este cadastro segue normal — só o
          paciente e o card no Kanban.
        </p>
      )}

      {/* A NOTA FICA SEMPRE À VISTA (25/08/2026, pedido do Lucas: "eu queria
          que você já colocasse isso visível... senão fica difícil pra mim ver
          como que vai ser emitida a nota"). Antes este campo morava dentro do
          passo 3, que só aparecia depois de digitar o valor — e o que era
          escrito aqui não aparecia em NENHUMA outra tela. É a MESMA coisa que o
          campo "Observações (ex.: NF unificada)" do Lançar dia, e agora com o
          mesmo nome, para quem lança reconhecer na hora. */}
      <NotaNoFechamentoCard
        nota={nota}
        onNotaChange={onNotaChange}
        valorRecebido={valorDaNota ?? valor}
        sinais={sinais}
        somarSinais={somarSinais}
        onSomarSinais={onSomarSinais}
        diaISO={todayISO()}
        parcelas={divisao}
        ehSinal={tipo === "SINAL_CONSULTA"}
        tomador={tomador ?? { nome: "", cpf: "", email: "" }}
        onEmailChange={onEmailChange}
        cpfRascunho={cpfRascunho}
        onCpfChange={onCpfChange}
      />

      <div className="grid gap-3 rounded-bloco border border-fio bg-folha p-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
          <FileText className="h-4 w-4 text-oliva" aria-hidden="true" />
          Recado para quem emite
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div>
            <Label>Observações da nota (ex.: NF unificada, +11% imposto)</Label>
            <Input
              value={notaInstrucao}
              onChange={(event) => onNotaInstrucaoChange(event.target.value)}
              placeholder="Ex.: NF unificada consulta + tratamento · emitir no nome da mãe"
            />
          </div>
          <div>
            <Label>Emitir</Label>
            <select
              value={quandoNota}
              onChange={(event) => onQuandoNotaChange(event.target.value as QuandoNota)}
              className={cn(CAMPO, "mt-2 cursor-pointer")}
            >
              {(Object.keys(quandoNotaLabels) as QuandoNota[]).map((quando) => (
                <option key={quando} value={quando}>
                  {quandoNotaLabels[quando]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[13px] font-medium leading-5 text-tinta-2">
          Isto aparece na comanda do <strong>Lançar dia</strong> e na aba de <strong>Impostos &amp; NF</strong> — é o que a
          pessoa lê na hora de emitir.
        </p>
      </div>
    </div>
  );
}
