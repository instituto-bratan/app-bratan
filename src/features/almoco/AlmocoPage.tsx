import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, ShieldAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLongDate } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { initials, lunchSummary, statusLabel } from "./almocoData";

export function AlmocoPage() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const { slotsWithStatus, currentLunch, pendingLunch } = useMemo(() => lunchSummary(now), [now]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="gold" className="mb-4">Cobertura da equipe</Badge>
            <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Almoço</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Visibilidade simples de quem está em pausa, quem ainda sai e quem já voltou.
            </p>
            <p className="mt-2 text-sm font-semibold capitalize text-brand-oliva">{formatLongDate(now)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-brand-musgo">{currentLunch.length}</p>
              <p className="text-xs font-semibold uppercase text-brand-oliva">em pausa</p>
            </div>
            <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-brand-musgo">{pendingLunch.length}</p>
              <p className="text-xs font-semibold uppercase text-brand-oliva">a sair</p>
            </div>
            <div className="col-span-2 rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center sm:col-span-1">
              <p className="text-2xl font-bold text-brand-musgo">
                {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-xs font-semibold uppercase text-brand-oliva">agora</p>
            </div>
          </div>
        </div>
      </motion.section>

      <Card className="border-brand-dourado/40 bg-brand-creme/40 shadow-none backdrop-blur">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/70 text-brand-musgo">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold leading-6 text-brand-tinta">
            Isto é só para organização da equipe. NÃO substitui o ponto eletrônico - o registro oficial de jornada continua no sistema de ponto do DP.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {slotsWithStatus.map((slot, index) => (
          <motion.div
            key={slot.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
          >
            <Card
              className={cn(
                "h-full border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur transition duration-300 hover:shadow-calm",
                slot.status === "agora" && "border-brand-dourado/55 bg-brand-creme/45",
              )}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "grid h-12 w-12 place-items-center rounded-lg text-sm font-bold",
                        slot.status === "agora" ? "bg-brand-musgo text-brand-papel" : "bg-brand-papel text-brand-musgo",
                      )}
                    >
                      {initials(slot.rotulo)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{slot.rotulo}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {slot.horaInicio} - {slot.horaFim}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={slot.status === "agora" ? "gold" : slot.status === "antes" ? "outline" : "muted"}
                    className="shrink-0"
                  >
                    {statusLabel(slot.status, slot)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {slot.status === "agora" ? (
                    <>
                      <Users className="h-4 w-4 text-brand-musgo" aria-hidden="true" />
                      Cobertura em atenção neste momento.
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
                      Status calculado automaticamente pelo horário.
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
