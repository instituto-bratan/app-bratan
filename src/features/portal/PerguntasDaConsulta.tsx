// O QUE PERGUNTAR NA CONSULTA (14/10/2026): no consultório a gente esquece
// metade do que queria perguntar. O paciente anota aqui, ao longo da semana, e
// chega na consulta com a lista. Fica SÓ neste aparelho (nada vai para o
// servidor): é a caderneta da pessoa, não um canal com a clínica.
//
// Revisão de 14/10: uma lista por paciente (não por consulta — remarcar não
// apaga o que foi anotado), gravação também ao sair do campo e ao fechar, e
// tudo some do aparelho quando a pessoa sai ou apaga a conta.
import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, MessageCircleQuestion } from "lucide-react";

const PREFIXO = "meu-bratan-perguntas-v1:";

function chave(contactRef: string) {
  return `${PREFIXO}${contactRef}`;
}

export function contarPerguntas(texto: string) {
  return texto.split(/\n+/).map((l) => l.trim()).filter(Boolean).length;
}

/** Ao sair do portal ou apagar a conta: nenhuma anotação nem marca de medalha vista fica no aparelho. */
export function apagarAnotacoesDoAparelho() {
  try {
    const chaves: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith(PREFIXO) || k.startsWith("meu-bratan-conquistas-vistas-v1:"))) chaves.push(k);
    }
    chaves.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* sem armazenamento: não havia o que apagar */
  }
}

function gravar(contactRef: string, texto: string) {
  try {
    if (texto.trim()) window.localStorage.setItem(chave(contactRef), texto);
    else window.localStorage.removeItem(chave(contactRef));
  } catch {
    /* sem armazenamento: a anotação vale enquanto a tela estiver aberta */
  }
}

export function PerguntasDaConsulta({ contactRef, ehHoje }: { contactRef: string; ehHoje: boolean }) {
  const id = useId();
  const [texto, setTexto] = useState(() => {
    try {
      return window.localStorage.getItem(chave(contactRef)) ?? "";
    } catch {
      return "";
    }
  });
  const [aberto, setAberto] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const ultimoTexto = useRef(texto);
  const voltarFoco = useRef(false);
  const n = contarPerguntas(texto);
  ultimoTexto.current = texto;

  // Grava com folga enquanto digita e, por garantia, ao desmontar (troca de aba).
  useEffect(() => {
    const t = window.setTimeout(() => gravar(contactRef, texto), 300);
    return () => window.clearTimeout(t);
  }, [texto, contactRef]);
  useEffect(() => () => gravar(contactRef, ultimoTexto.current), [contactRef]);

  // O campo cresce com o texto (sem barra de rolagem dentro do cartão).
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(260, el.scrollHeight)}px`;
  }, [texto, aberto]);

  useEffect(() => {
    if (aberto) campo.current?.focus();
    else if (voltarFoco.current) {
      voltarFoco.current = false;
      botao.current?.focus();
    }
  }, [aberto]);

  function fechar() {
    gravar(contactRef, texto);
    voltarFoco.current = true;
    setAberto(false);
  }

  if (!aberto) {
    return (
      <button ref={botao} type="button" className={`p-perguntas-fechado ${ehHoje && n ? "hoje" : ""}`} onClick={() => setAberto(true)} aria-expanded="false" aria-controls={id}>
        <MessageCircleQuestion size={18} aria-hidden="true" className="p-perguntas-icone" />
        <span className="p-cresce">
          {n ? (
            <>
              <b>
                {n} {n === 1 ? "pergunta anotada" : "perguntas anotadas"}
              </b>
              {ehHoje ? " · é hoje: leve a lista" : " para a consulta"}
            </>
          ) : (
            "Anotar perguntas para a consulta"
          )}
        </span>
        <ChevronRight size={18} aria-hidden="true" className="p-chev" />
      </button>
    );
  }
  return (
    <div className="p-perguntas" id={id}>
      <label className="p-rotulo" htmlFor={`${id}-campo`}>
        O que perguntar na consulta
      </label>
      <textarea
        id={`${id}-campo`}
        ref={campo}
        className="p-entrada p-perguntas-campo"
        rows={3}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => gravar(contactRef, texto)}
        placeholder={"Uma pergunta por linha.\nEx.: posso treinar no dia da aplicação?"}
      />
      <div className="p-perguntas-pe">
        <span className="t-foot t-2">Fica só neste aparelho e é apagada quando você sai. Ninguém da clínica vê.</span>
        <div className="p-perguntas-acoes">
          {texto.trim() ? (
            <button
              type="button"
              className="p-btn plain mini"
              onClick={() => {
                setTexto("");
                campo.current?.focus();
              }}
            >
              Limpar
            </button>
          ) : null}
          <button type="button" className="p-btn tonal mini" onClick={fechar}>
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
