// INTERRUPTOR DO PORTAL (17/09/2026)
//
// A ideia veio de uma referência que o Lucas mandou: um interruptor cujo traço
// se redesenha ao trocar de lado, em vez do bloquinho que desliza. É bonito e é
// tátil — o desenho responde ao toque, não só muda de cor.
//
// A referência vinha em styled-components, que não existe neste projeto e traria
// um segundo sistema de estilo (o portal já tem o seu, com os tokens --p-*) e
// cores fixas (#aaa, #fff) que ignorariam o verde da marca e o tema escuro.
// Então: a mesma ideia, escrita no idioma da casa.
//
// O traço é UMA linha só que percorre os dois círculos e a barra entre eles.
// Mudando o recorte (stroke-dashoffset) e virando o desenho, a linha "corre"
// de um lado para o outro. Com prefers-reduced-motion, troca sem correr.
import { useId } from "react";

export function InterruptorDoPortal({
  ligado,
  aoTrocar,
  rotuloDesligado,
  rotuloLigado,
  descricao,
}: {
  ligado: boolean;
  aoTrocar: (ligado: boolean) => void;
  rotuloDesligado: string;
  rotuloLigado: string;
  /** O que o interruptor faz, para quem navega por leitor de tela. */
  descricao: string;
}) {
  const id = useId();
  return (
    <div className="p-interruptor">
      <span className={ligado ? "p-interruptor-rotulo" : "p-interruptor-rotulo ativo"} aria-hidden="true">
        {rotuloDesligado}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={ligado}
        aria-label={descricao}
        onChange={(evento) => aoTrocar(evento.target.checked)}
      />
      <label htmlFor={id} title={descricao}>
        {/* Um traço só: círculo, barra, círculo. O recorte decide onde ele está. */}
        <svg viewBox="0 0 212.4992 84.4688" aria-hidden="true" focusable="false">
          <path
            pathLength={360}
            fill="none"
            stroke="currentColor"
            d="M 42.2496 0 A 42.24 42.24 90 0 0 0 42.2496 A 42.24 42.24 90 0 0 42.2496 84.4688 A 42.24 42.24 90 0 0 84.4992 42.2496 A 42.24 42.24 90 0 0 42.2496 0 A 42.24 42.24 90 0 0 0 42.2496 A 42.24 42.24 90 0 0 42.2496 84.4688 L 170.2496 84.4688 A 42.24 42.24 90 0 0 212.4992 42.2496 A 42.24 42.24 90 0 0 170.2496 0 A 42.24 42.24 90 0 0 128 42.2496 A 42.24 42.24 90 0 0 170.2496 84.4688 A 42.24 42.24 90 0 0 212.4992 42.2496 A 42.24 42.24 90 0 0 170.2496 0 L 42.2496 0"
          />
        </svg>
      </label>
      <span className={ligado ? "p-interruptor-rotulo ativo" : "p-interruptor-rotulo"} aria-hidden="true">
        {rotuloLigado}
      </span>
    </div>
  );
}
