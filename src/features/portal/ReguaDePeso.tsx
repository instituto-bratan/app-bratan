// A RÉGUA DA PESAGEM (14/10/2026): em vez de só digitar "82,4", a pessoa
// desliza uma régua que começa no último peso MEDIDO — como nas balanças
// conectadas. O número grande continua sendo um campo: quem prefere digitar
// (ou usa leitor de tela) digita, e a régua acompanha.
//
// Revisão de 14/10: a régua nunca escreve no campo sozinha. Só um gesto da
// pessoa (dedo, roda do mouse, arrastar) muda o peso; quando é o código que
// rola (abrir, acompanhar a digitação, encaixar no traço), o evento de rolagem
// é ignorado. Sem medição anterior, a régua nem aparece (quem decide é a tela).
import { useEffect, useMemo, useRef, type PointerEvent as EventoDoPonteiro } from "react";
import { reduzMovimento, vibrar } from "./movimento";
import { um } from "./portalPaciente";

const PASSO_PX = 9; // cada 0,1 kg
const FAIXA_KG = 25; // para cada lado do peso de partida

function paraNumero(texto: string) {
  if (!texto.trim()) return null;
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function ReguaDePeso({ valor, aoMudar, partida }: { valor: string; aoMudar: (texto: string) => void; partida: number }) {
  const min = Math.max(30, Math.floor(partida - FAIXA_KG));
  const max = Math.min(300, Math.ceil(partida + FAIXA_KG));
  const total = Math.round((max - min) * 10);
  const trilho = useRef<HTMLDivElement>(null);
  const porCodigo = useRef(false);
  const fimPorCodigo = useRef<number | null>(null);
  const gesto = useRef(false);
  const fimDoGesto = useRef<number | null>(null);
  const quadro = useRef<number | null>(null);
  const ultimoInteiro = useRef<number | null>(null);
  const ultimoEnviado = useRef<string | null>(null);
  const arrasto = useRef<{ x: number; inicio: number } | null>(null);
  // O dedo ainda encostado (eventos de TOQUE: no Android o pointercancel chega
  // assim que o navegador assume a rolagem, com o dedo ainda na tela).
  const dedoNaRegua = useRef(false);
  const rolouNoGesto = useRef(false);

  /** Rola por código: os eventos de rolagem que isso gera não mudam o peso. */
  function rolarPara(kg: number, suave: boolean) {
    const el = trilho.current;
    if (!el) return;
    const alvo = Math.round((Math.min(max, Math.max(min, kg)) - min) * 10) * PASSO_PX;
    if (Math.abs(el.scrollLeft - alvo) < 1) return;
    porCodigo.current = true;
    if (fimPorCodigo.current) window.clearTimeout(fimPorCodigo.current);
    // O WKWebView do app da loja pode não ter "scrollend": a trava tem prazo.
    fimPorCodigo.current = window.setTimeout(() => (porCodigo.current = false), suave ? 450 : 80);
    el.scrollTo({ left: alvo, behavior: suave && !reduzMovimento() ? "smooth" : "auto" });
  }

  // Abre no peso de partida (ou no que já está no campo), sem mexer no campo.
  useEffect(() => {
    rolarPara(paraNumero(valor) ?? partida, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max]);

  // Quem DIGITA move a régua junto — a menos que a mudança tenha vindo dela
  // (o eco da própria régua é reconhecido pelo último valor que ela mandou).
  // Enquanto há gesto (o dedo/mouse na régua, ou a inércia dele), a régua é a
  // dona do valor: um eco atrasado dela num aparelho lento não pode ser lido
  // como digitação. O gesto acaba no touchend/mouseup, então não fica preso.
  useEffect(() => {
    if (gesto.current || valor === ultimoEnviado.current) return;
    ultimoEnviado.current = null;
    const n = paraNumero(valor);
    if (n === null || n < min || n > max) return;
    rolarPara(n, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, min, max]);

  useEffect(
    () => () => {
      [fimPorCodigo.current, fimDoGesto.current].forEach((t) => t && window.clearTimeout(t));
      if (quadro.current) cancelAnimationFrame(quadro.current);
    },
    [],
  );

  function comecouGesto() {
    gesto.current = true;
    rolouNoGesto.current = false;
    porCodigo.current = false;
  }

  /** O gesto acaba quando o dedo/mouse sai E a inércia para: aí encosta no traço. */
  function armarFimDoGesto() {
    if (fimDoGesto.current) window.clearTimeout(fimDoGesto.current);
    fimDoGesto.current = window.setTimeout(() => {
      if (arrasto.current || dedoNaRegua.current) return;
      gesto.current = false;
      if (!rolouNoGesto.current) return;
      const n = paraNumero(ultimoEnviado.current ?? "");
      if (n !== null) rolarPara(n, true);
    }, 160);
  }

  function aoRolar() {
    // Dedo na régua manda mais que qualquer rolagem por código em andamento.
    if (dedoNaRegua.current && !gesto.current) comecouGesto();
    if (dedoNaRegua.current) porCodigo.current = false;
    if (porCodigo.current) {
      // Ainda é o código rolando: só renova o prazo da trava.
      if (fimPorCodigo.current) window.clearTimeout(fimPorCodigo.current);
      fimPorCodigo.current = window.setTimeout(() => (porCodigo.current = false), 160);
      return;
    }
    if (!gesto.current) return;
    rolouNoGesto.current = true;
    // Um cálculo por quadro, não um por evento de rolagem.
    if (quadro.current === null) {
      quadro.current = requestAnimationFrame(() => {
        quadro.current = null;
        const el = trilho.current;
        if (!el) return;
        const kg = Math.min(max, Math.max(min, min + Math.round(el.scrollLeft / PASSO_PX) / 10));
        const texto = um(kg);
        if (texto !== ultimoEnviado.current) {
          ultimoEnviado.current = texto;
          aoMudar(texto);
        }
        const inteiro = Math.floor(kg);
        if (ultimoInteiro.current !== null && inteiro !== ultimoInteiro.current) vibrar(3);
        ultimoInteiro.current = inteiro;
      });
    }
    armarFimDoGesto();
  }

  // No computador o mouse arrasta a régua como o dedo arrasta no celular.
  function aoApertar(e: EventoDoPonteiro<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || !trilho.current) return; // o toque é tratado pelos eventos de toque
    comecouGesto();
    arrasto.current = { x: e.clientX, inicio: trilho.current.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function aoMover(e: EventoDoPonteiro<HTMLDivElement>) {
    if (!arrasto.current || !trilho.current) return;
    trilho.current.scrollLeft = arrasto.current.inicio - (e.clientX - arrasto.current.x);
  }
  function aoSoltar() {
    const a = arrasto.current;
    if (!a) return;
    arrasto.current = null;
    // Clique sem arrastar não escreve nada no campo.
    if (!trilho.current || Math.abs(trilho.current.scrollLeft - a.inicio) < 1) gesto.current = false;
    else armarFimDoGesto();
  }
  function dedoEncostou() {
    dedoNaRegua.current = true;
    comecouGesto();
  }
  function dedoSaiu() {
    dedoNaRegua.current = false;
    armarFimDoGesto();
  }

  const marcas = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);

  return (
    <div className="p-regua">
      <div className="p-regua-janela">
        <div
          ref={trilho}
          className="p-regua-trilho"
          onScroll={aoRolar}
          onTouchStart={dedoEncostou}
          onTouchEnd={dedoSaiu}
          onTouchCancel={dedoSaiu}
          onWheel={(e) => {
            // Qualquer componente horizontal (inclusive a diagonal do trackpad) é
            // gesto na régua; só a roda puramente vertical é da página.
            if (e.deltaX === 0) return;
            comecouGesto();
            armarFimDoGesto();
          }}
          onPointerDown={aoApertar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          tabIndex={-1}
          aria-hidden="true"
        >
          <div className="p-regua-escala" style={{ width: total * PASSO_PX + 1, ["--passo" as string]: `${PASSO_PX}px` }}>
            {marcas.map((kg) => (
              <span key={kg} className="p-regua-kg" style={{ left: (kg - min) * 10 * PASSO_PX }}>
                {kg}
              </span>
            ))}
          </div>
        </div>
        <i className="p-regua-agulha" aria-hidden="true" />
      </div>
    </div>
  );
}
