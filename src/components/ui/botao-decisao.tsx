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
//
// LARGURA (08/10/2026, etapa 4 — o ajuste que só Pedidos fazia, agora na peça):
// · Cabe numa linha → Aprovar · Devolver … Recusar, e o Recusar (só a palavra,
//   sem moldura) encosta a palavra na margem do conteúdo, como na prancha: o
//   respiro interno dele "pendura" 16 px no respiro da barra. Quem tira o
//   respiro da barra (p-0) precisa deixar 16 px livres à direita.
// · Não cabe (painel estreito) → o Aprovar ocupa a linha de cima e Devolver |
//   Recusar dividem a de baixo; o Recusar continua na ponta, longe do Aprovar,
//   em vez de cair sozinho numa linha. A barra MEDE os botões (o valor dentro
//   do Aprovar muda a largura), não adivinha pela largura da janela.
// · No celular (< 768 px) vale a ordem do polegar: Devolver | Recusar em cima e
//   o Aprovar grande embaixo.
import * as React from "react";
import { Check, Info, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Botao, type TamanhoBotao } from "./botao";
import { cabeNumaLinha, formatarReais } from "./papel-musgo";

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
  const linhaRef = React.useRef<HTMLDivElement>(null);
  const [estreita, setEstreita] = React.useState(false);
  const textoDoValor = valor === undefined || valor === null ? "" : String(valor);
  const temDevolver = Boolean(onDevolver);
  const temRecusar = Boolean(onRecusar);

  // Painel estreito: mede a largura natural dos botões (sem esticar) e decide se
  // eles cabem numa linha. Remede quando a barra muda de largura, quando o valor
  // ou o rótulo do Aprovar mudam e quando as fontes terminam de chegar.
  React.useLayoutEffect(() => {
    if (confirmando) return undefined;
    const linha = linhaRef.current;
    if (!linha) return undefined;
    let vivo = true;
    const medir = () => {
      if (!vivo) return;
      const botoes = Array.from(linha.children) as HTMLElement[];
      const larguras = botoes.map((botao) => {
        const { width, maxWidth } = botao.style;
        botao.style.width = "max-content";
        botao.style.maxWidth = "none";
        const largura = botao.getBoundingClientRect().width;
        botao.style.width = width;
        botao.style.maxWidth = maxWidth;
        return largura;
      });
      const vao = Number.parseFloat(window.getComputedStyle(linha).columnGap) || 8;
      setEstreita(!cabeNumaLinha(larguras, vao, linha.clientWidth, temRecusar));
    };
    medir();
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    observador?.observe(linha);
    void document.fonts?.ready.then(medir);
    return () => {
      vivo = false;
      observador?.disconnect();
    };
  }, [confirmando, textoDoValor, rotuloAprovar, temDevolver, temRecusar]);

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
          <div
            ref={linhaRef}
            data-largura={estreita ? "estreita" : "uma-linha"}
            className={cn("flex flex-wrap items-center gap-2 max-md:grid max-md:grid-cols-2", estreita && "grid grid-cols-2")}
          >
            <BotaoDecisao
              tipo="aprovar"
              valor={valor}
              rotulo={rotuloAprovar}
              disabled={bloqueado}
              carregando={ocupado === "aprovar"}
              onClick={() => void executar("aprovar", onAprovar)}
              className={cn("max-md:order-3 max-md:col-span-2 max-md:h-[52px] max-md:text-base", estreita && "col-span-2")}
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
                className={cn(
                  "max-md:ml-0 max-md:mr-0 max-md:h-11 max-md:shadow-[inset_0_0_0_1px_var(--fio-2)]",
                  // Numa linha: na ponta, com a palavra na margem (pendura 16 px). Estreita: a coluna da direita.
                  estreita ? "ml-0" : "ml-auto md:-mr-4",
                )}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
