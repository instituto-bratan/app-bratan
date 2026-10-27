// A POLÍTICA MUDOU (27/10/2026). A política de privacidade promete: "Se esta
// política mudar, o portal avisa". Com o check-in da semana e os recados de voz,
// ela mudou — este cartão aparece no topo de Hoje uma vez por versão, por
// aparelho, com o link para ler. Sem armazenamento no aparelho, não aparece
// (melhor do que voltar a cada abertura).
import { useState } from "react";
import { Link } from "react-router-dom";
import { VERSAO_DA_POLITICA } from "./PoliticaDePrivacidade";

const CHAVE = "meu-bratan-politica-vista";

export function AvisoDaPolitica() {
  const [visto, setVisto] = useState(() => {
    try {
      return window.localStorage.getItem(CHAVE) === VERSAO_DA_POLITICA;
    } catch {
      return true;
    }
  });
  if (visto) return null;
  function marcarVisto() {
    try {
      window.localStorage.setItem(CHAVE, VERSAO_DA_POLITICA);
    } catch {
      /* sem armazenamento: o aviso some só nesta abertura */
    }
    setVisto(true);
  }
  return (
    <section className="p-sec p-anim wide" aria-labelledby="t-politica">
      <div className="p-card">
        <p className="t-headline" id="t-politica">A política de privacidade mudou</p>
        <p className="t-sub t-2">Agora ela fala do check-in da semana e dos recados de voz: o que fica guardado, quem vê e como apagar.</p>
        <div className="p-botoes">
          <Link to="/meu/privacidade" className="p-btn tonal" onClick={marcarVisto}>
            Ler o que mudou
          </Link>
          <button type="button" className="p-btn plain" onClick={marcarVisto}>
            Entendi
          </button>
        </div>
      </div>
    </section>
  );
}
