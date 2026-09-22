// A NOTA FISCAL NA TELA DO FECHAMENTO (18/09/2026)
//
// Pedido do Lucas: *"eu quero que a emissão da nota fiscal ocorra na tela do
// CRM. Ou seja, quando alguém vai realizar um fechamento no Kanban... na mesma
// tela, que vai ser emitida a nota fiscal, para um toque já fazer tudo isso. E
// aí vai ter opção se a nota vai ser unificada, que vai ser tudo tratamento, ou
// se vai ser repartida. Vai repartir como? Uma de consulta? Quantos reais? Uma
// de bio? Quantos reais? Uma de tratamento? Quantos reais?"*
//
// TRÊS DECISÕES DE DESENHO, e o porquê de cada uma:
//
// 1. A ESCOLHA VEM ANTES DOS CAMPOS. Os três valores só aparecem depois de
//    "Notas separadas". Quem vai emitir unificada nunca vê campo de repartir —
//    e campo que não existe não é preenchido por engano.
//
// 2. O TEXTO DA NOTA FICA À VISTA. Não basta mostrar valor e código: o que a
//    prefeitura publica é a DISCRIMINAÇÃO, e é ela que afirma o que foi feito.
//    Quem fecha consegue ler, antes de emitir, a frase exata que vai sair.
//
// 3. A SOMA É A TRAVA. Repartir R$ 6.997 em notas que somam R$ 6.000 é imposto
//    errado, e ninguém percebe olhando. Por isso a diferença aparece em cada
//    tecla e o fechamento não passa enquanto não fechar ao centavo.
import { useEffect, useState } from "react";
import { AlertTriangle, Check, FileText, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { moneyFin, parseFinAmount, type FinPaymentMethod } from "@/features/financeiro/financeiroData";
import {
  economiaDaUnificada,
  escolhaDaNotaLabels,
  naturezaLabels,
  pendenciasDoTomador,
  planoDeNotas,
  type EscolhaDaNota,
  type NotaDoFechamento,
} from "./notaNoFechamento";

/** Campo de dinheiro que deixa digitar em paz: o texto é daqui, o número sobe. */
function CampoDinheiro({
  rotulo,
  valor,
  onValor,
}: {
  rotulo: string;
  valor: number;
  onValor: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(valor > 0 ? String(valor).replace(".", ",") : "");
  // Só re-semeia quando o fechamento é limpo de fora (salvou, cancelou). Durante
  // a digitação o texto é soberano — senão "1.5" vira "1,5" no meio da palavra.
  useEffect(() => {
    if (valor === 0 && texto !== "") setTexto("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  return (
    <div>
      <Label>{rotulo}</Label>
      <Input
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
          onValor(parseFinAmount(evento.target.value));
        }}
        inputMode="decimal"
        placeholder="0,00"
      />
    </div>
  );
}

export function NotaNoFechamentoCard({
  nota,
  onNotaChange,
  valorRecebido,
  diaISO,
  parcelas,
  ehSinal,
  tomador,
  onEmailChange,
}: {
  nota: NotaDoFechamento;
  onNotaChange: (nota: NotaDoFechamento) => void;
  valorRecebido: number;
  diaISO: string;
  parcelas: { forma: FinPaymentMethod; parcelas?: number | string }[];
  /** Sinal de consulta é adiantamento — a nota sai inteira no fechamento. */
  ehSinal: boolean;
  tomador: { nome: string; cpf: string; email: string };
  /** 22/09/2026: a nota vai por e-mail ao paciente — este é o campo para acertar o endereço na hora. */
  onEmailChange?: (email: string) => void;
}) {
  const [mostrarTexto, setMostrarTexto] = useState(false);
  const plano = planoDeNotas({ escolha: nota.escolha, valorRecebido, divisao: nota.divisao, diaISO, parcelas });
  const economia = economiaDaUnificada(valorRecebido, nota.divisao);
  const faltaNoTomador = pendenciasDoTomador(tomador);
  const escolhas: EscolhaDaNota[] = ["UNIFICADA", "REPARTIDA", "SEM_NOTA"];

  return (
    <div className="grid gap-3 rounded-lg border border-brand-dourado/40 bg-brand-creme/30 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-oliva">
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Nota fiscal
      </p>

      {ehSinal ? (
        <p className="text-xs leading-snug text-muted-foreground">
          Sinal de consulta é adiantamento: a nota sai inteira quando o paciente fechar o tratamento. Emitir agora sairia em
          duplicidade.
        </p>
      ) : null}

      {/* A escolha é do PACIENTE. Fica gravada porque é decisão dele, não do operador. */}
      <div className="grid gap-1.5 sm:grid-cols-3">
        {escolhas.map((escolha) => {
          const ativa = nota.escolha === escolha;
          return (
            <button
              key={escolha}
              type="button"
              onClick={() => onNotaChange({ ...nota, escolha })}
              aria-pressed={ativa}
              className={cn(
                "rounded-md border px-3 py-2.5 text-left text-sm transition",
                ativa
                  ? "border-brand-musgo bg-brand-musgo text-white shadow-sm"
                  : "border-input bg-white/80 text-brand-tinta hover:border-brand-musgo/60",
              )}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                {ativa ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                {escolhaDaNotaLabels[escolha]}
              </span>
            </button>
          );
        })}
      </div>

      {nota.escolha === "REPARTIDA" ? (
        <div className="grid gap-2">
          <p className="text-xs leading-snug text-muted-foreground">
            Quanto vai em cada nota. Quem reparte é você — o app não divide sozinho, para não escrever num documento fiscal um
            exame que não houve.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <CampoDinheiro
              rotulo="Consulta (R$)"
              valor={nota.divisao.consulta}
              onValor={(consulta) => onNotaChange({ ...nota, divisao: { ...nota.divisao, consulta } })}
            />
            <CampoDinheiro
              rotulo="Bioimpedância (R$)"
              valor={nota.divisao.bioimpedancia}
              onValor={(bioimpedancia) => onNotaChange({ ...nota, divisao: { ...nota.divisao, bioimpedancia } })}
            />
            <CampoDinheiro
              rotulo="Tratamento (R$)"
              valor={nota.divisao.tratamento}
              onValor={(tratamento) => onNotaChange({ ...nota, divisao: { ...nota.divisao, tratamento } })}
            />
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              Somando as notas: <strong className="text-brand-tinta">{moneyFin(plano.somaDasNotas)}</strong> de{" "}
              {moneyFin(valorRecebido)} recebidos
            </span>
            {economia > 0 ? (
              <span className="text-brand-oliva">Uma nota só economizaria {moneyFin(economia)} de imposto</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {nota.escolha === "SEM_NOTA" && !ehSinal ? (
        <div>
          <Label>Por que não vai ter nota agora?</Label>
          <Input
            value={nota.motivoSemNota}
            onChange={(evento) => onNotaChange({ ...nota, motivoSemNota: evento.target.value })}
            placeholder="Ex.: paciente vai passar o CPF da empresa amanhã"
          />
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Fica registrado com o seu nome e a data. A regra da casa é que tudo tem nota — não ter é exceção, e exceção tem
            motivo.
          </p>
        </div>
      ) : null}

      {/* O QUE VAI SAIR. Valor, código e — quando a pessoa quiser ver — a frase exata. */}
      {plano.notas.length ? (
        <div className="grid gap-1.5 rounded-md border border-brand-dourado/30 bg-white/70 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-oliva">
            <Receipt className="h-3 w-3" aria-hidden="true" />
            {plano.notas.length === 1 ? "Vai sair 1 nota" : `Vão sair ${plano.notas.length} notas`}
          </p>
          {plano.notas.map((item) => (
            <div key={item.natureza} className="grid gap-0.5 border-t border-brand-dourado/20 pt-1.5 first:border-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-brand-tinta">
                  {naturezaLabels[item.natureza]}{" "}
                  <span className="text-[11px] font-normal text-muted-foreground">código {item.codigoServico}</span>
                </span>
                <span className="font-semibold tabular-nums text-brand-tinta">{moneyFin(item.valor)}</span>
              </div>
              {mostrarTexto ? (
                <p className="whitespace-pre-line rounded bg-brand-creme/50 p-2 text-[11px] leading-snug text-muted-foreground">
                  {item.discriminacao}
                </p>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => setMostrarTexto((antes) => !antes)}
              className="underline underline-offset-2 hover:text-brand-oliva"
            >
              {mostrarTexto ? "Esconder o texto da nota" : "Ver o texto que vai na nota"}
            </button>
            <span>Imposto estimado no total: {moneyFin(plano.impostoTotal)}</span>
          </div>
        </div>
      ) : null}

      {/* Antes de digitar o valor não há o que emitir — cobrar já seria ruído. */}
      {valorRecebido > 0 && plano.impedimento ? (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs leading-snug text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {plano.impedimento}
        </p>
      ) : null}

      {/* O E-MAIL É PARA ONDE A NOTA VAI (22/09/2026, pedido do Lucas). Vem da
          ficha quando existe; quem fecha confere ou digita aqui, e o cadastro
          do paciente ganha o e-mail junto. */}
      {nota.escolha !== "SEM_NOTA" && !ehSinal && onEmailChange ? (
        <div className="grid gap-1">
          <Label htmlFor="nota-email-paciente" className="text-xs">
            E-mail do paciente <span className="font-normal text-muted-foreground">— a nota autorizada vai para ele</span>
          </Label>
          <Input
            id="nota-email-paciente"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={tomador.email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="nome@exemplo.com"
            className="h-9 bg-white"
          />
        </div>
      ) : null}

      {nota.escolha !== "SEM_NOTA" && plano.notas.length && faltaNoTomador.length ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Para a nota sair completa ainda falta: <strong>{faltaNoTomador.map((item) => (item === "CPF" ? "CPF (guardar na ficha do paciente)" : item)).join(", ")}</strong>.
          Dá para fechar assim — a nota sai sem esse dado{faltaNoTomador.includes("e-mail") ? " e não vai por e-mail" : ""}.
        </p>
      ) : null}
    </div>
  );
}
