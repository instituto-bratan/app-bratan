// FILA DO DIA — a agenda na frente da planilha (02/09/2026; refinada 08/09).
// Cada linha tem o que a pessoa precisa decidir agora, com um clique:
// Paguei · Adiar (atalhos de data, sem digitar) · Copiar código do boleto.
//
// REDESENHO PAPEL & MUSGO (08/10/2026, imagem 03 aprovada): as quatro colunas
// coloridas viraram UMA lista numa folha (bloco de decidir), agrupada pelo dia
// de pagar — "Vencidas", "Pagar hoje", "Pagar na sexta, 09/10"… — com a soma de
// cada grupo ao lado do título, o valor à direita em números tabulares e o
// "Paguei" na ponta. As compras que chegaram e falta resolver fecham a lista.
// O que a fila CONTÉM continua vindo de buildFilaFinanceira (filaFinanceira.ts):
// esta tela só desenha. O grupo é o `item.pagarEm` da fila (o DIA DE PAGAR:
// sábado, domingo e feriado pagam no dia útil anterior — regra de
// filaFinanceiraDiaDePagar.ts); quando ele é outro que o vencimento, a linha
// repete o `item.pagaAntes` da fila: "vence no sábado, 10/10".
import { useState, type ReactNode } from "react";
import { CalendarClock, ChevronRight, Copy, PackageCheck, PackageSearch } from "lucide-react";
import { BlocoFolha, Botao, BotaoDecisao, Selo } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { perguntar } from "@/components/ui/avisos";
import { cn } from "@/lib/utils";
import { moneyFin, monthLastDay, type FinExpense, type FinPurchase } from "./financeiroData";
import { diaUtilSeguinte, diasEntre } from "./recebiveisRede";
import type { FilaFinanceira, ItemFila } from "./filaFinanceira";
import { CAMPO_PQ, Etiqueta, Vazio, diaCurto, diaDaSemana, quantos } from "./pecasDiaPagar";

const alertaLabel: Record<NonNullable<ItemFila["alerta"]>, string> = {
  SEM_ARQUIVO: "sem boleto anexado",
  SEM_NF: "sem NF",
  SEM_CONTA: "sem conta a pagar",
  ATRASADO: "entrega atrasada",
  CHEGANDO: "chega hoje",
  AGUARDA_APROVACAO: "aguarda aprovação",
  RECUSADA: "aprovação recusada",
};

/** Quantas linhas cada grupo mostra antes do "+N na planilha abaixo". */
const POR_GRUPO = 12;

function somaDias(iso: string, dias: number) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** A linha digitável guardada na conta pelo "Lançar rápido" (só dígitos). */
export function linhaDigitavelDaConta(expense: FinExpense) {
  const achado = /linha digit[aá]vel:\s*([\d .-]+)/i.exec(expense.notes ?? "");
  const digitos = achado ? achado[1].replace(/\D/g, "") : "";
  return digitos.length >= 44 ? digitos : "";
}

/** "Pagar amanhã" · "Pagar na sexta, 09/10" (o título do grupo de um dia da semana). */
function tituloDoDia(iso: string, hoje: string) {
  if (iso === somaDias(hoje, 1)) return `Pagar amanhã, ${diaCurto(iso)}`;
  const dia = diaDaSemana(iso);
  const artigo = dia === "sábado" || dia === "domingo" ? "no" : "na";
  return `Pagar ${artigo} ${dia}, ${diaCurto(iso)}`;
}

type Grupo = { chave: string; titulo: string; itens: ItemFila[]; tom?: "atencao"; resto?: string };

export function FilaDoDiaCard({
  fila,
  readOnly,
  onPagar,
  onAdiar,
  onEditar,
  onChegou,
  onVirarConta,
  onAnotarNf,
  podeAprovar = false,
  onAprovar,
  categoriaDe,
}: {
  fila: FilaFinanceira;
  readOnly: boolean;
  /** APROVAÇÃO (14/09/2026): quem está na lista de aprovadores vê "Aprovar / Recusar" nas contas acima do limite. */
  podeAprovar?: boolean;
  onAprovar?: (expense: FinExpense, decisao: "APROVADA" | "RECUSADA") => void;
  onPagar: (expense: FinExpense) => void;
  onAdiar: (expense: FinExpense, novaData: string) => void;
  onEditar: (expense: FinExpense) => void;
  onChegou: (purchase: FinPurchase) => void;
  onVirarConta: (purchase: FinPurchase) => void;
  onAnotarNf: (purchase: FinPurchase) => void;
  /** Nome da categoria da conta (a primeira coisa da linha de baixo, como na imagem 03). */
  categoriaDe?: (expense: FinExpense) => string;
}) {
  const [adiando, setAdiando] = useState<string | null>(null);
  const [dataLivre, setDataLivre] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);

  // Os grupos, na ordem de decidir: o que já passou, hoje, os dias da semana, as compras.
  const porDia = new Map<string, ItemFila[]>();
  for (const item of fila.semana) {
    const dia = item.pagarEm || item.data;
    porDia.set(dia, [...(porDia.get(dia) ?? []), item]);
  }
  const grupos = ([
    { chave: "vencidas", titulo: "Vencidas", itens: fila.vencidas, tom: "atencao", resto: "na planilha abaixo" },
    { chave: "hoje", titulo: "Pagar hoje", itens: fila.vencemHoje, resto: "na planilha abaixo" },
    ...[...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, itens]) => ({ chave: `dia:${dia}`, titulo: tituloDoDia(dia, fila.hoje), itens, resto: "na planilha abaixo" })),
    { chave: "pendencias", titulo: "Chegou e falta resolver", itens: fila.pendencias, resto: "na tela Compras" },
  ] as Grupo[]).filter((grupo) => grupo.itens.length > 0);
  const totalItens = grupos.reduce((soma, grupo) => soma + grupo.itens.length, 0);

  async function copiar(expense: FinExpense) {
    const codigo = linhaDigitavelDaConta(expense);
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(expense.id);
      window.setTimeout(() => setCopiado((atual) => (atual === expense.id ? null : atual)), 2500);
    } catch {
      void perguntar("Copie a linha digitável:", { valorInicial: codigo, confirmar: "Fechar" });
    }
  }

  function adiar(expense: FinExpense, novaData: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return;
    onAdiar(expense, novaData);
    setAdiando(null);
    setDataLivre("");
  }

  return (
    <BlocoFolha as="section" aria-labelledby="fila-do-dia-titulo" className="min-w-0 overflow-hidden">
      <h2 id="fila-do-dia-titulo" className="sr-only">
        Fila do dia
      </h2>
      {totalItens === 0 ? (
        <Vazio titulo="Nada vencido, nada para hoje e nada nos próximos 7 dias.">
          As contas aparecem aqui no dia de pagar, com o “Paguei” na mão. As compras que chegarem sem nota ou sem conta também.
        </Vazio>
      ) : (
        grupos.map((grupo, indice) => {
          const soma = grupo.itens.reduce((total, item) => total + item.valor, 0);
          return (
            <div key={grupo.chave} className={cn(indice > 0 && "border-t border-fio-2")}>
              <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-6 pb-3 pt-4 max-md:px-4">
                <h3 className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className={cn("whitespace-nowrap text-base font-bold leading-6", grupo.tom === "atencao" ? "text-atencao" : "text-tinta")}>{grupo.titulo}</span>
                  <span className="whitespace-nowrap text-sm font-bold leading-6 tabular-nums text-tinta">
                    {grupo.chave === "pendencias" ? quantos(grupo.itens.length, "compra") : quantos(grupo.itens.length, "conta")} · {moneyFin(soma)}
                  </span>
                </h3>
                {indice === 0 ? (
                  <InfoTip title="O que é a fila do dia">
                    A agenda na frente da planilha: tudo que precisa de uma decisão agora, tirado das contas e das compras que já existem —
                    nada é digitado aqui. &quot;Paguei&quot; marca a conta como paga hoje (dá para desfazer no aviso que aparece); &quot;Adiar&quot;
                    oferece o próximo dia útil, +7 dias, o fim do mês ou uma data; o ícone de copiar leva a linha digitável lida do boleto. Nas
                    compras, &quot;Chegou&quot; dá a entrada e &quot;Virar conta&quot; cria a conta a pagar com os dados da compra. Vencidas com mais de 90
                    dias ficam só na planilha do mês.
                  </InfoTip>
                ) : null}
              </div>
              <ul>
                {grupo.itens.slice(0, POR_GRUPO).map((item) => (
                  <LinhaDaFila
                    key={item.chave}
                    item={item}
                    grupo={grupo.chave}
                    fila={fila}
                    readOnly={readOnly}
                    podeAprovar={podeAprovar}
                    onAprovar={onAprovar}
                    onPagar={onPagar}
                    onEditar={onEditar}
                    onChegou={onChegou}
                    onVirarConta={onVirarConta}
                    onAnotarNf={onAnotarNf}
                    categoriaDe={categoriaDe}
                    copiado={item.expense ? copiado === item.expense.id : false}
                    onCopiar={copiar}
                    adiando={item.expense ? adiando === item.expense.id : false}
                    onAlternarAdiar={(id) => setAdiando((atual) => (atual === id ? null : id))}
                    dataLivre={dataLivre}
                    onDataLivre={setDataLivre}
                    onAdiar={adiar}
                  />
                ))}
              </ul>
              {grupo.itens.length > POR_GRUPO ? (
                <p className="border-t border-fio px-6 py-3 text-[13px] font-semibold text-tinta-2 max-md:px-4">
                  +{grupo.itens.length - POR_GRUPO} {grupo.resto}
                </p>
              ) : null}
            </div>
          );
        })
      )}
    </BlocoFolha>
  );
}

function LinhaDaFila({
  item,
  grupo,
  fila,
  readOnly,
  podeAprovar,
  onAprovar,
  onPagar,
  onEditar,
  onChegou,
  onVirarConta,
  onAnotarNf,
  categoriaDe,
  copiado,
  onCopiar,
  adiando,
  onAlternarAdiar,
  dataLivre,
  onDataLivre,
  onAdiar,
}: {
  item: ItemFila;
  grupo: string;
  fila: FilaFinanceira;
  readOnly: boolean;
  podeAprovar: boolean;
  onAprovar?: (expense: FinExpense, decisao: "APROVADA" | "RECUSADA") => void;
  onPagar: (expense: FinExpense) => void;
  onEditar: (expense: FinExpense) => void;
  onChegou: (purchase: FinPurchase) => void;
  onVirarConta: (purchase: FinPurchase) => void;
  onAnotarNf: (purchase: FinPurchase) => void;
  categoriaDe?: (expense: FinExpense) => string;
  copiado: boolean;
  onCopiar: (expense: FinExpense) => Promise<void>;
  adiando: boolean;
  onAlternarAdiar: (id: string) => void;
  dataLivre: string;
  onDataLivre: (valor: string) => void;
  onAdiar: (expense: FinExpense, novaData: string) => void;
}) {
  const expense = item.expense;
  const purchase = item.purchase;
  const atraso = grupo === "vencidas" && item.data ? diasEntre(item.data, fila.hoje) : 0;
  const codigo = expense ? linhaDigitavelDaConta(expense) : "";
  // Regra de sábado/feriado (08/10/2026): quando a fila manda pagar num dia
  // diferente do vencimento, a linha conta qual era o vencimento — a frase vem
  // pronta da fila ("vence no sábado, 10/10" · "vence no feriado, 12/10").
  const venceEmOutroDia = grupo !== "vencidas" ? item.pagaAntes : null;
  // Revisão de 08/10/2026: no fim de semana ou no feriado, a conta que passou do
  // dia de pagar mas AINDA NÃO VENCEU (a de segunda 12/10, feriado, vista no
  // sábado 10/10) não leva o selo seco "Vencida": a linha diz o que houve, com as
  // mesmas palavras do Início — "era para pagar 09/10 · vence no feriado, 12/10".
  const passouDoDiaDePagar = grupo === "vencidas" && Boolean(item.pagaAntes) && item.data >= fila.hoje;
  const categoria = expense && categoriaDe ? categoriaDe(expense) : "";
  // O detalhe da fila é "fornecedor · forma"; quando o fornecedor é o próprio
  // título da linha ("Stin Pharma"), ele não se repete embaixo.
  const detalhe = item.detalhe
    .split(" · ")
    .filter((parte) => parte && parte.trim().toLowerCase() !== item.titulo.trim().toLowerCase())
    .join(" · ");
  const meta = [categoria, detalhe].filter(Boolean);
  const aprovadaEm = expense?.aprovacaoStatus === "APROVADA" && expense.aprovacaoEm ? expense.aprovacaoEm : null;

  return (
    <li className="border-t border-fio transition-colors duration-150 hover:bg-saber/70">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-6 py-3 max-md:px-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm font-bold leading-5 text-tinta [overflow-wrap:anywhere]">{item.titulo}</p>
          {/* O detalhe da linha: selo · categoria · fornecedor/forma · "vence no sábado".
              Cada pedaço traz o seu ponto à esquerda e a lista anda 12 px para fora
              de uma caixa que corta o excesso: quando a linha quebra (no celular),
              o ponto do começo da linha fica escondido em vez de sobrar sozinho
              (08/10/2026). */}
          <div className="overflow-hidden">
            <p className="-ml-3 flex flex-wrap items-center gap-y-1 text-[13px] font-medium leading-5 text-tinta-2">
              {passouDoDiaDePagar ? (
                <PedacoDaLinha className="whitespace-nowrap font-bold text-atencao">
                  era para pagar {diaCurto(item.pagarEm)} · {item.pagaAntes}
                </PedacoDaLinha>
              ) : grupo === "vencidas" ? (
                <PedacoDaLinha>
                  <Selo estado="vencido">{atraso > 0 ? `Vencida há ${atraso} ${atraso === 1 ? "dia" : "dias"}` : "Vencida"}</Selo>
                </PedacoDaLinha>
              ) : null}
              {grupo === "pendencias" ? <PedacoDaLinha className="tabular-nums">{diaCurto(item.data)}</PedacoDaLinha> : null}
              {meta.map((parte, i) => (
                <PedacoDaLinha key={i}>{parte}</PedacoDaLinha>
              ))}
              {venceEmOutroDia ? <PedacoDaLinha className="whitespace-nowrap font-semibold text-tinta">{venceEmOutroDia}</PedacoDaLinha> : null}
            </p>
          </div>
          {item.alerta ? (
            <span className="mt-1 flex flex-wrap gap-2">
              {item.alerta === "AGUARDA_APROVACAO" ? (
                // A regra de quem aprova, ao passar o mouse (como antes do redesenho).
                <span title={`Acima de ${moneyFin(fila.limiteAprovacao)}: precisa da aprovação da CEO ou do Dr. Daniel antes de pagar`}>
                  <Selo estado="aguardando" className="text-[13px]">
                    Aguarda aprovação (acima de {moneyFin(fila.limiteAprovacao)})
                  </Selo>
                </span>
              ) : item.alerta === "RECUSADA" ? (
                <Selo estado="recusado">Aprovação recusada</Selo>
              ) : item.alerta === "ATRASADO" ? (
                <Selo estado="vencido">Entrega atrasada</Selo>
              ) : item.alerta === "CHEGANDO" ? (
                <Selo estado="a-caminho">Chega hoje</Selo>
              ) : (
                <Etiqueta tom={item.alerta === "SEM_ARQUIVO" ? "neutro" : "atencao"}>{alertaLabel[item.alerta]}</Etiqueta>
              )}
              {aprovadaEm ? (
                <Etiqueta tom="ok" title={expense?.aprovacaoNota ?? ""}>
                  aprovada {diaCurto(aprovadaEm)}
                </Etiqueta>
              ) : null}
            </span>
          ) : aprovadaEm ? (
            <span className="mt-1">
              <Etiqueta tom="ok" title={expense?.aprovacaoNota ?? ""}>
                aprovada {diaCurto(aprovadaEm)}
              </Etiqueta>
            </span>
          ) : null}
        </div>

        <span className="justify-self-end whitespace-nowrap text-sm font-bold leading-5 tabular-nums text-tinta">{moneyFin(item.valor)}</span>

        {readOnly ? null : (
          <div className="col-span-full flex flex-wrap items-center justify-end gap-1 md:col-span-1 max-md:justify-start">
            {item.tipo === "CONTA" && expense ? (
              <>
                {item.aguardaAprovacao ? (
                  podeAprovar && onAprovar ? (
                    <>
                      <BotaoDecisao tipo="aprovar" tamanho="pq" valor={item.valor} onClick={() => onAprovar(expense, "APROVADA")} />
                      <BotaoDecisao tipo="recusar" tamanho="pq" onClick={() => onAprovar(expense, "RECUSADA")} />
                    </>
                  ) : null
                ) : (
                  <Botao
                    variante="suave"
                    tamanho="pq"
                    onClick={() => onPagar(expense)}
                    aria-label={`Marcar ${item.titulo} como paga hoje`}
                    className="max-md:h-11"
                  >
                    Paguei
                  </Botao>
                )}
                <Botao
                  variante={adiando ? "secundario" : "fantasma"}
                  tamanho="pq"
                  aria-expanded={adiando}
                  icone={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => onAlternarAdiar(expense.id)}
                  className="max-md:h-11"
                >
                  Adiar
                </Botao>
                {codigo ? (
                  <Botao
                    variante="fantasma"
                    tamanho="pq"
                    icone={<Copy className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => void onCopiar(expense)}
                    title="Copiar a linha digitável do boleto"
                    className="max-md:h-11"
                  >
                    {copiado ? "Copiado!" : "Código"}
                  </Botao>
                ) : null}
                <button
                  type="button"
                  onClick={() => onEditar(expense)}
                  aria-label={`Abrir e editar ${item.titulo}`}
                  title="Editar a conta"
                  className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco max-md:h-11 max-md:w-11"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            ) : null}
            {item.tipo === "COMPRA" && purchase ? (
              <>
                {!purchase.receivedAt ? (
                  <Botao variante="suave" tamanho="pq" icone={<PackageCheck className="h-4 w-4" aria-hidden="true" />} onClick={() => onChegou(purchase)} className="max-md:h-11">
                    Chegou
                  </Botao>
                ) : null}
                {item.alerta === "SEM_CONTA" ? (
                  <Botao variante="secundario" tamanho="pq" onClick={() => onVirarConta(purchase)} className="max-md:h-11">
                    Virar conta a pagar
                  </Botao>
                ) : null}
                {item.alerta === "SEM_NF" ? (
                  <Botao variante="secundario" tamanho="pq" icone={<PackageSearch className="h-4 w-4" aria-hidden="true" />} onClick={() => onAnotarNf(purchase)} className="max-md:h-11">
                    Anotar NF
                  </Botao>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </div>

      {adiando && expense ? (
        <div className="mx-6 mb-3 flex flex-wrap items-center gap-2 rounded-controle bg-saber p-3 max-md:mx-4">
          <span className="text-[13px] font-bold text-tinta">Novo vencimento:</span>
          <Botao variante="secundario" tamanho="pq" onClick={() => onAdiar(expense, diaUtilSeguinte(fila.hoje))}>
            próximo dia útil ({diaCurto(diaUtilSeguinte(fila.hoje))})
          </Botao>
          <Botao variante="secundario" tamanho="pq" onClick={() => onAdiar(expense, somaDias(expense.dueDate, 7))}>
            +7 dias ({diaCurto(somaDias(expense.dueDate, 7))})
          </Botao>
          <Botao variante="secundario" tamanho="pq" onClick={() => onAdiar(expense, monthLastDay(fila.hoje.slice(0, 7)))}>
            fim do mês ({diaCurto(monthLastDay(fila.hoje.slice(0, 7)))})
          </Botao>
          <input
            type="date"
            value={dataLivre}
            min={fila.hoje}
            onChange={(event) => {
              onDataLivre(event.target.value);
              if (event.target.value) onAdiar(expense, event.target.value);
            }}
            className={cn(CAMPO_PQ, "w-[150px]")}
            aria-label="Escolher a data"
          />
        </div>
      ) : null}
    </li>
  );
}

/** Um pedaço do detalhe da linha, com o ponto separador à esquerda (cortado no começo da linha). */
function PedacoDaLinha({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-flex items-center pl-3", className)}>
      <span className="absolute left-0 w-3 text-center text-fio-2" aria-hidden="true">
        ·
      </span>
      {children}
    </span>
  );
}
