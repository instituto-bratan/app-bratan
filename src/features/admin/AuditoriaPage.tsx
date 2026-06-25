import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, Clock3, History, Search, ShieldCheck, UserRound } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao } from "@/lib/access";
import { listRemoteAuditEvents } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import {
  auditActionLabel,
  auditEntityLabel,
  formatAuditMetadata,
  type AuditEventRecord,
} from "./auditoriaData";

const actionFilters = [
  { label: "Tudo", value: "all" },
  { label: "Acessos", value: "auth" },
  { label: "Colaboradores", value: "colaborador" },
  { label: "Mural", value: "aviso" },
  { label: "Comprovantes", value: "comprovante" },
  { label: "Lembretes", value: "pagamento_lembrete" },
  { label: "Checklist", value: "checklist" },
];

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function isInsideFilter(event: AuditEventRecord, filter: string) {
  if (filter === "all") return true;
  if (filter === "auth") return event.action.startsWith("auth.");
  if (filter === "checklist") return event.entity.includes("checklist");
  return event.entity === filter;
}

export function AuditoriaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const auditQuery = useQuery({
    queryKey: ["audit-events"],
    queryFn: listRemoteAuditEvents,
    enabled: useRemote,
  });
  const events = auditQuery.data ?? [];
  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return events.filter((event) => {
      if (!isInsideFilter(event, filter)) return false;
      if (!normalized) return true;

      const haystack = [
        event.actorName,
        event.actorEmail,
        event.action,
        event.entity,
        event.entityId,
        auditActionLabel(event.action),
        auditEntityLabel(event.entity),
        formatAuditMetadata(event.metadata),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [events, filter, query]);

  const lastEvent = visibleEvents[0] ?? events[0] ?? null;

  return (
    <AccessGate allowed={canAdministracao} label="Auditoria">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="gold" className="mb-4">
                Coordenação
              </Badge>
              <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Auditoria</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Registro de ações sensíveis do app: acessos, colaboradores, mural, checklist, comprovantes e lembretes.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-brand-musgo">{events.length}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">{useRemote ? "últimos eventos" : "prévia"}</p>
              </div>
              <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/55 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-brand-musgo">{visibleEvents.length}</p>
                <p className="text-xs font-semibold uppercase text-brand-oliva">no filtro</p>
              </div>
            </div>
          </div>
        </motion.section>

        {!useRemote ? (
          <Card className="border-brand-dourado/35 bg-brand-creme/35 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-brand-tinta">
                A auditoria real aparece quando o app está conectado ao Supabase. Na prévia local, as ações não gravam em banco.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {auditQuery.isError ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive">
                Não foi possível carregar a auditoria. Confira se a migration de auditoria foi aplicada e se sua conta é coordenação.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <section className="space-y-4">
            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Search className="h-5 w-5" aria-hidden="true" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  value={query}
                  placeholder="Buscar por pessoa, módulo ou ação"
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {actionFilters.map((item) => (
                    <Button
                      key={item.value}
                      type="button"
                      variant={filter === item.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilter(item.value)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-brand-dourado/45 bg-brand-creme/35 shadow-none">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
                  <p className="font-semibold text-brand-tinta">Último movimento</p>
                </div>
                {lastEvent ? (
                  <>
                    <p className="text-sm font-semibold text-brand-tinta">{auditActionLabel(lastEvent.action)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(lastEvent.createdAt)}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            {visibleEvents.length ? (
              visibleEvents.map((event, index) => (
                <motion.article
                  key={event.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: index * 0.02, ease: [0.4, 0, 0.2, 1] }}
                >
                  <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-calm">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Badge variant="gold">{auditEntityLabel(event.entity)}</Badge>
                            <Badge variant="outline">{auditActionLabel(event.action)}</Badge>
                            <span className="text-xs font-semibold uppercase text-brand-oliva">
                              {formatDateTime(event.createdAt)}
                            </span>
                          </div>
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
                              <UserRound className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-brand-tinta">{event.actorName}</p>
                              {event.actorEmail ? <p className="truncate text-sm text-muted-foreground">{event.actorEmail}</p> : null}
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">{formatAuditMetadata(event.metadata)}</p>
                            </div>
                          </div>
                        </div>

                        {event.entityId ? (
                          <div className="rounded-lg border border-brand-oliva/16 bg-white/65 px-3 py-2">
                            <p className="text-xs font-semibold uppercase text-brand-oliva">Registro</p>
                            <p className="mt-1 max-w-48 truncate text-sm text-muted-foreground">{event.entityId}</p>
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </motion.article>
              ))
            ) : (
              <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
                <CardContent className="grid min-h-64 place-items-center p-8 text-center">
                  <div>
                    <History className="mx-auto mb-4 h-10 w-10 text-brand-oliva" aria-hidden="true" />
                    <p className="font-semibold text-brand-tinta">Nenhum evento encontrado</p>
                    <p className="mt-2 text-sm text-muted-foreground">As ações novas aparecerão aqui conforme a equipe usar o app.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>

        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              A auditoria é operacional e interna. Ela ajuda a coordenar a rotina, mas não substitui logs técnicos, controles fiscais ou sistemas oficiais externos.
            </p>
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
