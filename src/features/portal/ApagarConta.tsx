// APAGAR A CONTA DO PORTAL (01/10/2026, Diretriz 5.1.1(v) da Apple). Fica na aba
// Você, depois de tudo, e pede duas confirmações: abrir o bloco e escrever
// APAGAR. Antes de apagar, diz com todas as letras o que sai e o que a clínica
// guarda por lei — a mesma lista que o servidor usa para apagar.
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/avisos";
import { O_QUE_FICA, O_QUE_SE_APAGA } from "../../../supabase/functions/_shared/contaDoPortal";
import { apagarContaDoPortal, guardarSessao } from "./portalCliente";

const PALAVRA = "APAGAR";
/** O aviso que a tela de entrar mostra depois de apagar (a página recarrega no meio). */
export const CHAVE_AVISO_DE_ENTRADA = "meu-bratan-aviso";

function deixarAviso(texto: string) {
  try {
    sessionStorage.setItem(CHAVE_AVISO_DE_ENTRADA, texto);
  } catch {
    /* sem armazenamento: o aviso some, a conta continua apagada */
  }
}

export function ApagarConta({ sessao, previa, aoTerminar }: { sessao: string | null; previa: boolean; aoTerminar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [apagando, setApagando] = useState(false);
  const pronto = confirmacao.trim().toUpperCase() === PALAVRA;

  async function apagar() {
    if (!pronto || apagando) return;
    if (previa || !sessao) {
      deixarAviso("Esta era a demonstração: nada foi apagado. No portal de verdade, a conta some na hora e você volta para esta tela.");
      guardarSessao(null);
      aoTerminar();
      return;
    }
    setApagando(true);
    try {
      const r = await apagarContaDoPortal(sessao);
      if (!r.ok) {
        toast(r.error ?? "Não consegui apagar a conta agora. Tente de novo.", { tom: "erro" });
        return;
      }
      guardarSessao(null);
      deixarAviso("Sua conta do portal foi apagada. Se quiser voltar, a recepção manda um link novo.");
      aoTerminar();
    } finally {
      setApagando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="p-btn plain perigo" onClick={() => setAberto(true)}>
        Apagar minha conta
      </button>
    );
  }

  return (
    <section className="p-card p-apagar" aria-labelledby="t-apagar">
      <h2 className="t-title3" id="t-apagar">Apagar a sua conta do portal</h2>
      <p className="t-body">A conta some agora, em todos os aparelhos, e não dá para desfazer. Saem:</p>
      <ul className="p-itens">
        {O_QUE_SE_APAGA.map((item) => (
          <li key={item}>{item.charAt(0).toUpperCase() + item.slice(1)}.</li>
        ))}
      </ul>
      <p className="t-body">A clínica continua guardando o que a lei manda:</p>
      <ul className="p-itens">
        {O_QUE_FICA.map((item) => (
          <li key={item}>{item.charAt(0).toUpperCase() + item.slice(1)}.</li>
        ))}
      </ul>
      <p className="t-foot t-2">
        Se quiser voltar a usar o portal depois, a recepção manda um link novo. Detalhes na <Link to="/meu/privacidade#apagar">política de privacidade</Link>.
      </p>
      <label className="p-rotulo" htmlFor="confirmar-apagar">Para confirmar, escreva {PALAVRA}</label>
      <input
        id="confirmar-apagar"
        className="p-entrada"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        value={confirmacao}
        onChange={(evento) => setConfirmacao(evento.target.value)}
        placeholder={PALAVRA}
      />
      <div className="p-botoes">
        <button type="button" className="p-btn full perigo-cheio" disabled={!pronto || apagando} onClick={() => void apagar()}>
          {apagando ? "Apagando" : "Apagar minha conta"}
        </button>
        <button type="button" className="p-btn plain full" onClick={() => { setAberto(false); setConfirmacao(""); }}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
