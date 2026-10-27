// O CHECK-IN DA SEMANA NA FICHA DO PACIENTE (27/10/2026).
//
// As últimas semanas que o paciente respondeu no Meu Bratan (fome, energia,
// enjoo), para a enfermagem abrir a ficha pela tarefa "Check-in do Meu Bratan:
// ligar hoje" e ver o que foi marcado. Só lê: resposta é do paciente e só entra
// pelo portal. Quem vê é quem vê a bioimpedância (canVerMedicoes — no banco,
// can_paciente_medicao_read).
import { useQuery } from "@tanstack/react-query";
import { HeartPulse } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { listRemoteCheckinsDoPaciente } from "@/lib/remote/semanasDoPortal";
import { ITENS_DO_CHECKIN, PERGUNTAS_DO_CHECKIN } from "../../../supabase/functions/_shared/semanaDoPaciente";

const COR_DO_NIVEL: Record<number, string> = { 1: "bg-emerald-500", 2: "bg-amber-500", 3: "bg-red-600" };

export function CheckinsNaFicha({ contactRef }: { contactRef: string }) {
  const checkins = useQuery({ queryKey: ["portal-checkins", contactRef], queryFn: () => listRemoteCheckinsDoPaciente(contactRef), staleTime: 30_000 });
  // Sem a tabela (migração ainda não aplicada) ou sem resposta: a seção nem aparece.
  if (checkins.isError || !checkins.data?.length) return null;
  return (
    <div className="grid gap-2 border-t border-brand-oliva/15 pt-3">
      <p className="flex items-center gap-1.5 font-semibold text-brand-tinta">
        <HeartPulse className="h-4 w-4 text-brand-oliva" aria-hidden="true" /> Check-in da semana (portal)
        <InfoTip title="O que o paciente marcou">
          Um toque por item, uma vez por semana do plano. Vermelho em qualquer item cria uma tarefa para a enfermagem ligar no mesmo dia. Nenhuma IA
          decide nada: a ligação é para ouvir o paciente; mudança no tratamento é decisão do médico.
        </InfoTip>
      </p>
      <ul className="grid gap-1">
        {checkins.data.map((checkin) => (
          <li key={checkin.semana} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2.5 py-1.5", checkin.vermelho ? "bg-red-50" : "bg-white/70")}>
            <span className="font-semibold tabular-nums">Semana {checkin.semana}</span>
            {ITENS_DO_CHECKIN.map((item) => {
              const nivel = checkin[item];
              return (
                <span key={item} className="inline-flex items-center gap-1 text-xs">
                  <i className={cn("inline-block h-2 w-2 rounded-full", nivel ? COR_DO_NIVEL[nivel] : "bg-gray-300")} aria-hidden="true" />
                  {PERGUNTAS_DO_CHECKIN[item].titulo}: {nivel ? PERGUNTAS_DO_CHECKIN[item].niveis[nivel - 1].toLowerCase() : "—"}
                </span>
              );
            })}
            {checkin.vermelho ? <span className="text-[11px] font-semibold text-red-700">{checkin.tarefaRef ? "tarefa de ligação criada" : "vermelho"}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
