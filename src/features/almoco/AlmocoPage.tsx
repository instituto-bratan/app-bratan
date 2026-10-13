// ALMOÇO — redesenho "Papel & Musgo", etapa 4 (08/10/2026).
//
// O que a tela FAZ não mudou: a escala fixa (almocoData), a situação de cada um
// calculada pelo relógio (antes · no almoço · voltou), atualizada a cada 30 s, e
// o aviso de que isto NÃO é o ponto eletrônico. Mudou a forma: um Cabecalho com
// a frase de quem está em pausa agora (no lugar dos três quadrinhos "em pausa ·
// a sair · agora"); a escala como LISTA num bloco "saber", cada pessoa com o
// avatar no arco, o horário, a situação escrita com ícone e o fio do almoço —
// a faixa de horário de cada um numa régua comum, com o traço de ouro no agora.
// A data saiu daqui (a casca já mostra no topo). Sem vidro, sem animação de
// entrada, sem as cores com opacidade que não geravam CSS.
import { useEffect, useMemo, useState } from "react";
import { CircleCheck, Clock, ShieldAlert, Utensils } from "lucide-react";
import { BlocoSaber, Cabecalho } from "@/components/ui/fundacao";
import { Recado } from "@/features/compras/pecas";
import { AvatarEmArco, EstadoVazio, Rubrica, Situacao, type TomDaSituacao } from "@/features/pops/pecasDaEquipe";
import { cn } from "@/lib/utils";
import { fraseDoAlmoco, lunchSummary, posicaoNaRegua, reguaDoAlmoco, statusLabel, type LunchStatus } from "./almocoData";

const TOM: Record<LunchStatus, TomDaSituacao> = { antes: "neutro", agora: "agora", depois: "ok" };
const ICONE: Record<LunchStatus, React.ReactNode> = {
  antes: <Clock aria-hidden="true" />,
  agora: <Utensils aria-hidden="true" />,
  depois: <CircleCheck aria-hidden="true" />,
};

// A faixa de cada pessoa: vazada antes, ouro enquanto está fora (é o agora), cheia depois.
const FAIXA: Record<LunchStatus, string> = {
  antes: "bg-folha shadow-[inset_0_0_0_1.5px_rgb(var(--fio-2-rgb))]",
  agora: "bg-ouro-fio",
  depois: "bg-musgo",
};

// A mesma grade na régua e nas linhas, para a faixa de cada um cair embaixo da hora certa.
const GRADE =
  "grid grid-cols-[auto_minmax(150px,220px)_minmax(0,1fr)_minmax(132px,auto)] items-center gap-x-6 " +
  "max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:gap-x-3";

export function AlmocoPage() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const { slotsWithStatus, currentLunch, pendingLunch } = useMemo(() => lunchSummary(now), [now]);
  const frase = fraseDoAlmoco(slotsWithStatus);
  const regua = useMemo(() => reguaDoAlmoco(slotsWithStatus), [slotsWithStatus]);
  const agoraNaRegua = posicaoNaRegua(regua, now);
  const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Equipe"
        titulo="Almoço"
        frase={
          <>
            {frase.destaque ? <strong>{frase.destaque}</strong> : null}
            {frase.destaque ? frase.resto : frase.resto.trim()}
          </>
        }
      />

      <Recado tom="neutro" icone={<ShieldAlert className="stroke-oliva" aria-hidden="true" />}>
        Isto é só para organização da equipe. <strong>NÃO substitui o ponto eletrônico</strong> — o registro oficial de jornada continua no
        sistema de ponto do DP.
      </Recado>

      <BlocoSaber as="section" aria-labelledby="almoco-escala" className="min-w-0 p-0 max-md:p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-6 pb-3 pt-5 max-md:px-4 max-md:pt-4">
          <Rubrica id="almoco-escala">Escala de hoje</Rubrica>
          <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
            Agora, {hora} · {currentLunch.length === 0 ? "ninguém em pausa" : `${currentLunch.length} em pausa`} ·{" "}
            {pendingLunch.length === 0 ? "ninguém mais sai" : pendingLunch.length === 1 ? "1 ainda sai" : `${pendingLunch.length} ainda saem`}
          </p>
        </div>

        {slotsWithStatus.length === 0 ? (
          <EstadoVazio icone={<Utensils aria-hidden="true" />} titulo="Ninguém na escala do almoço" className="border-t border-fio">
            Quando a escala for montada, cada pessoa aparece aqui com o horário de saída e de volta.
          </EstadoVazio>
        ) : (
          <>
            {/* A régua das horas: só no computador, na coluna do fio. */}
            <div aria-hidden="true" className={cn(GRADE, "border-t border-fio px-6 pb-1 pt-3 max-md:hidden")}>
              <span className="w-8" />
              <span />
              <div className="relative h-5">
                {regua.marcas.map((marca) => {
                  const posicao = posicaoNaRegua(regua, marca) ?? 0;
                  // A hora de agora (em ouro) toma o lugar da marca que ficaria embaixo dela.
                  if (agoraNaRegua !== null && Math.abs(posicao - agoraNaRegua) < 6) return null;
                  return (
                    <span
                      key={marca}
                      className="absolute top-0 -translate-x-1/2 text-xs font-semibold leading-4 tabular-nums text-tinta-2"
                      style={{ left: `${posicao}%` }}
                    >
                      {marca}
                    </span>
                  );
                })}
                {agoraNaRegua !== null ? (
                  <span
                    className="absolute top-0 -translate-x-1/2 rounded-sm bg-saber px-1 text-xs font-bold leading-4 tabular-nums text-ouro"
                    style={{ left: `${agoraNaRegua}%` }}
                  >
                    {hora}
                  </span>
                ) : null}
              </div>
              <span />
            </div>

            <ul>
              {slotsWithStatus.map((slot) => {
                const inicio = posicaoNaRegua(regua, slot.horaInicio) ?? 0;
                const fim = posicaoNaRegua(regua, slot.horaFim) ?? 100;
                return (
                  <li key={slot.id} className={cn(GRADE, "gap-y-3 border-t border-fio px-6 py-4 max-md:px-4")}>
                    <AvatarEmArco pessoaId={null} nome={slot.rotulo} />
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold leading-6 text-tinta">{slot.rotulo}</p>
                      <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                        {slot.horaInicio} às {slot.horaFim}
                      </p>
                    </div>

                    {/* O fio do almoço: a faixa da pessoa e o traço de ouro do agora (enfeite; o texto já diz tudo). */}
                    <div aria-hidden="true" className="relative h-6 max-md:col-span-full max-md:row-start-2">
                      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-fio-2" />
                      <span
                        className={cn("absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm", FAIXA[slot.status])}
                        style={{ left: `${inicio}%`, width: `${Math.max(2, fim - inicio)}%` }}
                      />
                      {agoraNaRegua !== null ? (
                        <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-sm bg-ouro-fio" style={{ left: `${agoraNaRegua}%` }} />
                      ) : null}
                    </div>

                    <div className="grid justify-items-end">
                      <Situacao tom={TOM[slot.status]} icone={ICONE[slot.status]}>
                        {statusLabel(slot.status, slot)}
                      </Situacao>
                      {slot.status === "agora" ? (
                        <span className="text-xs font-medium leading-4 text-tinta-2">cobertura em atenção</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="border-t border-fio px-6 py-3 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">
              A situação muda sozinha pelo relógio: ninguém precisa marcar a saída nem a volta aqui.
            </p>
          </>
        )}
      </BlocoSaber>
    </div>
  );
}
