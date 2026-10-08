// BOTÃO DE DECISÃO E BARRA DE DECISÃO — Papel & Musgo (08/10/2026).
//
// A ordem é sempre a mesma em todo o app: Aprovar (com o VALOR dentro do botão,
// "Aprovar | R$ 486,00": quem aprova vê o que está aprovando) → Devolver … e
// Recusar na ponta oposta, longe do Aprovar.
//
// Aprovar NÃO abre janela de confirmação (o guia manda avisar com "Desfazer").
// Devolver e Recusar pedem o MOTIVO antes de valer: a barra abre um campo ali
// mesmo, e a decisão só sai com o motivo escrito. Sem teto para aprovar em lote
// (decisão do Lucas, 08/10/2026): o teto não mora aqui.
import * as React from "react";
import { Check, Info, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Botao, type TamanhoBotao } from "./botao";
import { formatarReais } from "./papel-musgo";

export type TipoDecisao = "aprovar" | "devolver" | "recusar";

const PADRAO: Record<TipoDecisao, { rotulo: string; variante: "primario" | "secundario" | "perigo"; Icone: typeof Check }> = {
  aprovar: { rotulo: "Aprovar", variante: "primario", Icone: Check },
  devolver: { rotulo: "Devolver", variante: "secundario", Icone: Undo2 },
  recusar: { rotulo: "Recusar", variante: "perigo", Icone: X },
};

export type BotaoDecisaoProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  tipo: TipoDecisao;
  /** Só no Aprovar: o valor vai dentro do botão. Número vira "R$ 486,00". */
  valor?: number | string;
  /** Troca a palavra ("Paguei", "Aprovar os 3"). */
  rotulo?: string;
  tamanho?: TamanhoBotao;
  carregando?: boolean;
  bloco?: boolean;
};

/** Um botão de decisão com a cara certa para o tipo (primário, secundário ou perigo). */
export const BotaoDecisao = React.forwardRef<HTMLButtonElement, BotaoDecisaoProps>(function BotaoDecisao(
  { tipo, valor, rotulo, tamanho = "padrao", carregando, bloco, className, ...resto },
  ref,
) {
  const padrao = PADRAO[tipo];
  const textoValor = valor === undefined || valor === null || valor === "" ? null : typeof valor === "number" ? formatarReais(valor) : valor;
  const Icone = padrao.Icone;
  return (
    <Botao
      ref={ref}
      variante={padrao.variante}
      tamanho={tamanho}
      carregando={carregando}
      bloco={bloco}
      icone={<Icone className={tamanho === "grande" ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />}
      className={className}
      {...resto}
    >
      {rotulo ?? padrao.rotulo}
      {textoValor ? (
        <span className="ml-1 inline-flex h-5 items-center border-l border-sobre-musgo/40 pl-3 font-semibold tabular-nums">
          {textoValor}
        </span>
      ) : null}
    </Botao>
  );
});

type Resultado = void | Promise<unknown>;

export type BarraDecisaoProps = {
  /** Valor do que está sendo aprovado (vai dentro do botão Aprovar). */
  valor?: number | string;
  /** Frase curta acima dos botões: o que acontece ao aprovar. */
  nota?: React.ReactNode;
  onAprovar: () => Resultado;
  /** Sem onDevolver, o botão Devolver não aparece. Recebe o motivo escrito. */
  onDevolver?: (motivo: string) => Resultado;
  /** Sem onRecusar, o botão Recusar não aparece. Recebe o motivo escrito. */
  onRecusar?: (motivo: string) => Resultado;
  rotuloAprovar?: string;
  /** Quem vai ler o motivo ("a Juliana"): entra na pergunta do campo. */
  quemLe?: string;
  desabilitado?: boolean;
  className?: string;
};

/**
 * A barra inteira: Aprovar (valor) → Devolver … Recusar. Devolver e Recusar
 * abrem a confirmação no lugar, com o campo do motivo; Esc ou "Voltar" desiste.
 */
export function BarraDecisao({
  valor,
  nota,
  onAprovar,
  onDevolver,
  onRecusar,
  rotuloAprovar,
  quemLe,
  desabilitado = false,
  className,
}: BarraDecisaoProps) {
  const [confirmando, setConfirmando] = React.useState<"devolver" | "recusar" | null>(null);
  const [motivo, setMotivo] = React.useState("");
  const [ocupado, setOcupado] = React.useState<TipoDecisao | null>(null);
  const campoRef = React.useRef<HTMLTextAreaElement>(null);
  const devolverRef = React.useRef<HTMLButtonElement>(null);
  const recusarRef = React.useRef<HTMLButtonElement>(null);
  const idCampo = React.useId();
  const idAjuda = React.useId();

  React.useEffect(() => {
    if (confirmando) campoRef.current?.focus();
  }, [confirmando]);

  /** Fecha a confirmação e devolve o foco ao botão que a abriu (o teclado não se perde). */
  const fecharConfirmacao = () => {
    const voltarPara = confirmando === "recusar" ? recusarRef : devolverRef;
    setConfirmando(null);
    setMotivo("");
    window.setTimeout(() => voltarPara.current?.focus(), 0);
  };

  const executar = async (tipo: TipoDecisao, acao: () => Resultado) => {
    setOcupado(tipo);
    try {
      await acao();
      if (tipo !== "aprovar") fecharConfirmacao();
    } finally {
      setOcupado(null);
    }
  };

  const desistir = fecharConfirmacao;

  const motivoLimpo = motivo.trim();
  const bloqueado = desabilitado || ocupado !== null;

  return (
    <div className={cn("grid gap-3 border-t border-fio bg-folha px-6 pb-6 pt-4 max-md:px-4 max-md:pb-4 max-md:pt-3", className)}>
      {confirmando ? (
        <form
          className="grid gap-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (!motivoLimpo) return;
            const acao = confirmando === "recusar" ? onRecusar : onDevolver;
            if (acao) void executar(confirmando, () => acao(motivoLimpo));
          }}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") {
              evento.preventDefault();
              desistir();
            }
          }}
        >
          <label htmlFor={idCampo} className="text-[13px] font-bold leading-5 text-tinta">
            {confirmando === "recusar" ? "Por que recusar?" : "O que falta ajustar?"}
            {quemLe ? <span className="font-medium text-tinta-2"> ({quemLe} vai ler)</span> : null}
          </label>
          <textarea
            ref={campoRef}
            id={idCampo}
            aria-describedby={idAjuda}
            required
            rows={2}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            className="min-h-[72px] w-full resize-y rounded-controle border border-borda-campo bg-folha px-3 py-2 text-sm font-medium leading-5 text-tinta placeholder:text-tinta-2 focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco"
            placeholder={confirmando === "recusar" ? "Ex.: já temos no estoque da recepção" : "Ex.: mandar a marca e o tamanho do galão"}
          />
          <p id={idAjuda} className="text-[13px] font-medium leading-5 text-tinta-2">
            {confirmando === "recusar" ? "Recusar encerra o pedido. O motivo vai junto." : "Devolver volta para quem pediu, com o motivo."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Botao
              type="submit"
              variante={confirmando === "recusar" ? "perigo-cheio" : "secundario"}
              tamanho="padrao"
              disabled={!motivoLimpo || desabilitado}
              carregando={ocupado === confirmando}
              icone={confirmando === "recusar" ? <X className="h-4 w-4" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}
              className="max-md:h-11"
            >
              {confirmando === "recusar" ? "Recusar com este motivo" : "Devolver com este motivo"}
            </Botao>
            <Botao variante="fantasma" onClick={desistir} disabled={ocupado !== null} className="max-md:h-11">
              Voltar
            </Botao>
          </div>
        </form>
      ) : (
        <>
          {nota ? (
            <p className="flex items-start gap-2 text-[13px] font-medium leading-5 text-tinta-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
              <span>{nota}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 max-md:grid max-md:grid-cols-2">
            <BotaoDecisao
              tipo="aprovar"
              valor={valor}
              rotulo={rotuloAprovar}
              disabled={bloqueado}
              carregando={ocupado === "aprovar"}
              onClick={() => void executar("aprovar", onAprovar)}
              className="max-md:order-3 max-md:col-span-2 max-md:h-[52px] max-md:text-base"
            />
            {onDevolver ? (
              <BotaoDecisao ref={devolverRef} tipo="devolver" disabled={bloqueado} onClick={() => setConfirmando("devolver")} className="max-md:h-11" />
            ) : null}
            {onRecusar ? (
              <BotaoDecisao
                ref={recusarRef}
                tipo="recusar"
                disabled={bloqueado}
                onClick={() => setConfirmando("recusar")}
                className="ml-auto max-md:ml-0 max-md:h-11 max-md:shadow-[inset_0_0_0_1px_var(--fio-2)]"
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
