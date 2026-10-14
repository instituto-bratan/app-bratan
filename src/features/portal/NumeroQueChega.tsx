// O NÚMERO QUE CHEGA (14/10/2026, revisão): peso, Score e mês do plano
// entram na tela já com o valor medido — cada algarismo sobe e acende, em
// sequência. Antes eles "contavam" a partir de um número que ninguém mediu
// (86,2 kg partia de 88,6). Num app de saúde o número da tela é sempre o real.
// O leitor de tela lê o número inteiro (texto escondido), não algarismo por algarismo.
export function NumeroQueChega({ texto, atraso = 0 }: { texto: string; atraso?: number }) {
  return (
    <span className="p-chega">
      <span className="p-so-leitor">{texto}</span>
      <span className="p-chega-algarismos" aria-hidden="true">
        {[...texto].map((ch, i) => (
          <span key={i} style={{ animationDelay: `${atraso + i * 0.06}s` }}>
            {ch}
          </span>
        ))}
      </span>
    </span>
  );
}
