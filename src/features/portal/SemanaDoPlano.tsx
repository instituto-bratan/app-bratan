// SEMANA X DE N NO PORTAL (27/10/2026) — motivo para abrir o Meu Bratan toda semana.
//
// Um cartão por semana do plano: o que costuma acontecer naquela semana e uma
// missão simples (o texto é da equipe, editado no 360), e o check-in de 1 toque
// — fome, energia, enjoo, três níveis cada. Cada toque grava na hora.
//
// O terceiro nível de qualquer item é o vermelho: o banco cria uma tarefa para a
// ENFERMAGEM ligar (gatilho paciente_checkin_chama_enfermagem). O portal só
// avisa o paciente que vão ligar e lembra que urgência não espera ligação.
// Nenhuma IA decide nada; conduta é do médico (Res. CFM 2.454/2026). O texto é
// educativo e não promete resultado (Res. CFM 2.336/2023).
import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { ITENS_DO_CHECKIN, PERGUNTAS_DO_CHECKIN, ehVermelho, type CheckinDaSemana, type ItemDoCheckin, type NivelDoCheckin } from "../../../supabase/functions/_shared/semanaDoPaciente";
import { responderCheckin } from "./portalCliente";
import type { PortalSemana } from "./portalPaciente";
import { vibrar } from "./movimento";

const VAZIO: CheckinDaSemana = { fome: null, energia: null, enjoo: null };

function doServidor(checkin: PortalSemana["checkin"]): CheckinDaSemana {
  const nivel = (valor: number | null | undefined) => (valor === 1 || valor === 2 || valor === 3 ? valor : null);
  return checkin ? { fome: nivel(checkin.fome), energia: nivel(checkin.energia), enjoo: nivel(checkin.enjoo) } : VAZIO;
}

export function SemanaDoPlano({
  semana,
  total,
  sessao,
  previa,
  linkDaClinica,
  aoMudarCheckin,
}: {
  semana: PortalSemana;
  /** O N do "Semana X de N"; null quando o plano não tem passos (só tratamento). */
  total: number | null;
  sessao: string | null;
  previa: boolean;
  /** WhatsApp da concierge, quando configurado — o atalho do alerta vermelho. */
  linkDaClinica: string | null;
  aoMudarCheckin?: (checkin: CheckinDaSemana) => void;
}) {
  const [checkin, setCheckin] = useState<CheckinDaSemana>(() => doServidor(semana.checkin));
  const [salvando, setSalvando] = useState<ItemDoCheckin | null>(null);
  const [guardado, setGuardado] = useState<ItemDoCheckin | null>(null);
  useEffect(() => setCheckin(doServidor(semana.checkin)), [semana.numero, semana.checkin]);

  async function tocar(item: ItemDoCheckin, nivel: NivelDoCheckin) {
    if (salvando) return;
    const antes = checkin;
    const novo = { ...checkin, [item]: nivel };
    setCheckin(novo);
    setGuardado(null);
    vibrar(8);
    if (previa || !sessao) {
      setGuardado(item);
      aoMudarCheckin?.(novo);
      return;
    }
    setSalvando(item);
    try {
      const r = await responderCheckin(sessao, item, nivel);
      if (!r.ok || !r.checkin) {
        setCheckin(antes);
        toast(r.error ?? "Não consegui guardar a resposta agora. Tente de novo.", { tom: "erro" });
        return;
      }
      const doBanco = doServidor(r.checkin);
      setCheckin(doBanco);
      setGuardado(item);
      aoMudarCheckin?.(doBanco);
    } finally {
      setSalvando(null);
    }
  }

  const vermelho = ehVermelho(checkin);
  const respondidos = ITENS_DO_CHECKIN.filter((item) => checkin[item] !== null).length;
  const conteudo = semana.conteudo;
  return (
    <section id="semana-do-plano" className="p-sec p-anim wide" aria-labelledby="t-semana-plano">
      <span className="t-sec" id="t-semana-plano">
        {total ? `Semana ${semana.numero} de ${total}` : `Semana ${semana.numero} do seu plano`}
      </span>
      <div className="p-card p-semana-plano">
        {conteudo?.titulo ? <p className="t-title3">{conteudo.titulo}</p> : <p className="t-title3">Como está a sua semana?</p>}
        {conteudo?.costumaAcontecer ? (
          <div className="p-semana-bloco">
            <span className="p-semana-rotulo">O que costuma acontecer</span>
            <p className="t-body">{conteudo.costumaAcontecer}</p>
          </div>
        ) : null}
        {conteudo?.missao ? (
          <div className="p-semana-missao">
            <span className="p-semana-missao-icone" aria-hidden="true">
              <Target size={18} strokeWidth={2.2} />
            </span>
            <div className="p-cresce">
              <span className="p-semana-rotulo">Missão da semana</span>
              <p className="t-body">{conteudo.missao}</p>
            </div>
          </div>
        ) : null}

        <div className="p-checkin" role="group" aria-labelledby="t-checkin">
          <div>
            <p className="t-headline" id="t-checkin">Como você está esta semana?</p>
            <p className="t-foot t-2">Um toque em cada linha. A enfermagem acompanha as respostas.</p>
          </div>
          {ITENS_DO_CHECKIN.map((item) => {
            const pergunta = PERGUNTAS_DO_CHECKIN[item];
            return (
              <div key={item} className="p-checkin-linha">
                <div className="p-checkin-item">
                  <b id={`checkin-${item}`}>{pergunta.titulo}</b>
                  <span className="p-checkin-estado" aria-live="polite">
                    {salvando === item ? "guardando…" : guardado === item ? "guardado" : ""}
                  </span>
                </div>
                <div className="p-niveis" role="group" aria-labelledby={`checkin-${item}`}>
                  {pergunta.niveis.map((rotulo, indice) => {
                    const nivel = (indice + 1) as NivelDoCheckin;
                    return (
                      <button key={nivel} type="button" className={`p-nivel n${nivel}`} aria-pressed={checkin[item] === nivel} disabled={salvando !== null} onClick={() => void tocar(item, nivel)}>
                        <i aria-hidden="true" />
                        {rotulo}
                      </button>
                    );
                  })}
                </div>
                <p className="t-foot t-3">{pergunta.ajuda}</p>
              </div>
            );
          })}
        </div>

        {vermelho ? (
          <div className="p-checkin-alerta" role="status">
            <p className="t-sub">
              <b>Obrigado por contar.</b> A enfermagem vai ligar para você para saber como está{previa ? " (exemplo: na demonstração ninguém liga)" : ""}.
            </p>
            <p className="t-foot">Se for urgente, não espere a ligação: procure um pronto atendimento.</p>
            {linkDaClinica ? (
              <a className="p-btn tonal mini" style={{ justifySelf: "start" }} href={linkDaClinica} target="_blank" rel="noreferrer">
                Falar agora com a clínica
              </a>
            ) : null}
          </div>
        ) : respondidos === ITENS_DO_CHECKIN.length ? (
          <p className="t-foot t-2">Respostas guardadas. Se algo mudar durante a semana, é só tocar de novo.</p>
        ) : null}

        <p className="t-foot t-3">Conteúdo educativo, que não substitui a consulta. Cada corpo responde no seu tempo.</p>
      </div>
    </section>
  );
}
