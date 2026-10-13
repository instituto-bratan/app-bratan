// AUDITORIA — redesenho Papel & Musgo, etapa 4 (08/10/2026).
//
// Registro das ações sensíveis do app (financeiro, CRM & 360, acessos,
// colaboradores, mural, checklist, comprovantes, lembretes e Estalecas). Mudou
// só a forma: o cabeçalho diz quantas ações e qual foi a última, os filtros
// viraram leituras com o número ao lado (Financeiro 12), os eventos são uma
// lista numa folha e o resumo por pessoa fica ao lado, num bloco de leitura.
// Os mesmos filtros, a mesma busca e o mesmo resumo de antes.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, History, ShieldCheck, UserRound } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Cabecalho, CampoBusca } from "@/components/ui/fundacao";
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
import { contagem } from "./frasesAjustes";
import { AJUDA, CabecaDaFolha, CampoSelecao, Etiqueta, Leitura, Recado, TituloDoSaber, Vazio } from "./pecasAjustes";

const actionFilters = [
  { label: "Tudo", value: "all" },
  { label: "Financeiro", value: "financeiro" },
  { label: "CRM & 360", value: "crm360" },
  { label: "Acessos", value: "auth" },
  { label: "Colaboradores", value: "colaborador" },
  { label: "Mural", value: "aviso" },
  { label: "Comprovantes", value: "comprovante" },
  { label: "Lembretes", value: "pagamento_lembrete" },
  { label: "Estalecas", value: "estalecas" },
  { label: "Checklist", value: "checklist" },
];

const estalecaEntities = [
  "gamification_profile",
  "estaleca_config",
  "estaleca_transactions",
  "estaleca_claims",
  "checkins",
  "checkin_event_codes",
  "rewards",
];

function auditAreaPhrase(event: AuditEventRecord) {
  if (event.action.startsWith("financeiro.")) return "no Financeiro";
  if (event.action.startsWith("crm.") || event.action.startsWith("inteligencia_360.")) return "no CRM & 360";
  if (event.action.startsWith("estalecas.") || estalecaEntities.includes(event.entity)) return "em Estalecas";
  if (event.action.startsWith("checklist") || event.entity.includes("checklist")) return "no Checklist";
  if (event.action.startsWith("pagamento_lembrete.")) return "em Lembretes";
  if (event.action.startsWith("comprovante.")) return "em Comprovantes";
  if (event.action.startsWith("aviso.")) return "no Mural";
  if (event.action.startsWith("colaborador.")) return "em Colaboradores";
  if (event.action.startsWith("auth.")) return "em Acessos";
  return "em outras áreas";
}

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
  if (filter === "financeiro") return event.action.startsWith("financeiro.");
  if (filter === "crm360") return event.action.startsWith("crm.") || event.action.startsWith("inteligencia_360.");
  if (filter === "auth") return event.action.startsWith("auth.");
  if (filter === "checklist") return event.entity.includes("checklist");
  if (filter === "estalecas") return event.action.startsWith("estalecas.") || estalecaEntities.includes(event.entity);
  return event.entity === filter;
}

export function AuditoriaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [person, setPerson] = useState("all");
  const auditQuery = useQuery({
    queryKey: ["audit-events"],
    queryFn: listRemoteAuditEvents,
    enabled: useRemote,
  });
  const events = auditQuery.data ?? [];

  const actors = useMemo(() => {
    const names = new Set<string>();
    for (const event of events) {
      if (event.actorName) names.add(event.actorName);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [events]);

  const personSummary = useMemo(() => {
    const byActor = new Map<string, { name: string; total: number; areas: Map<string, number> }>();

    for (const event of events) {
      const name = event.actorName || "Sem identificação";
      const entry = byActor.get(name) ?? { name, total: 0, areas: new Map<string, number>() };
      const area = auditAreaPhrase(event);
      entry.total += 1;
      entry.areas.set(area, (entry.areas.get(area) ?? 0) + 1);
      byActor.set(name, entry);
    }

    return [...byActor.values()]
      .sort((a, b) => b.total - a.total)
      .map((entry) => ({
        name: entry.name,
        total: entry.total,
        description: [...entry.areas.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([area, count], index) =>
            index === 0 ? `${count} ${count === 1 ? "ação" : "ações"} ${area}` : `${count} ${area}`,
          )
          .join(", "),
      }));
  }, [events]);

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return events.filter((event) => {
      if (!isInsideFilter(event, filter)) return false;
      if (person !== "all" && event.actorName !== person) return false;
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
  }, [events, filter, person, query]);

  const lastEvent = visibleEvents[0] ?? events[0] ?? null;

  // Quantos eventos cada leitura mostra (a mesma regra do filtro, só contada).
  const contagemPorFiltro = useMemo(() => {
    const porFiltro: Record<string, number> = {};
    for (const item of actionFilters) porFiltro[item.value] = events.filter((event) => isInsideFilter(event, item.value)).length;
    return porFiltro;
  }, [events]);
  const filtrando = filter !== "all" || person !== "all" || Boolean(query.trim());

  const fraseDoTopo = !useRemote ? (
    <>Registro de ações sensíveis do app: financeiro, CRM & 360, acessos, colaboradores, mural, checklist, comprovantes, lembretes e Estalecas.</>
  ) : events.length ? (
    <>
      <strong>{contagem(events.length, "ação registrada", "ações registradas")}</strong> nos últimos eventos
      {filtrando ? `; ${visibleEvents.length} neste filtro` : ""}.
      {lastEvent ? (
        <>
          {" "}
          Último movimento: {auditActionLabel(lastEvent.action).toLowerCase()}, em <span className="tabular-nums">{formatDateTime(lastEvent.createdAt)}</span>.
        </>
      ) : null}
    </>
  ) : (
    <>Nenhum evento registrado ainda. As ações novas aparecem aqui conforme a equipe usar o app.</>
  );

  return (
    <AccessGate allowed={canAdministracao} label="Auditoria">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho className="mb-0 max-md:mb-0" sobrancelha="Ajustes" titulo="Auditoria" frase={fraseDoTopo} />

        {!useRemote ? (
          <Recado tom="info">A auditoria real aparece quando o app está conectado ao Supabase. Na prévia local, as ações não gravam em banco.</Recado>
        ) : null}

        {auditQuery.isError ? (
          <Recado tom="erro">Não foi possível carregar a auditoria. Confira se a migration de auditoria foi aplicada e se sua conta é coordenação.</Recado>
        ) : null}

        <div className="grid items-start gap-8 max-md:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          <BlocoFolha as="section" aria-labelledby="auditoria-eventos" className="min-w-0 overflow-hidden">
            <CabecaDaFolha
              id="auditoria-eventos"
              icone={<History />}
              titulo="Eventos"
              resumo={filtrando ? `${visibleEvents.length} de ${events.length}` : contagem(events.length, "evento")}
            />
            <div className="grid gap-3 border-t border-fio px-6 py-4 max-md:px-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
                <CampoBusca valor={query} onMudar={setQuery} placeholder="Buscar por pessoa, módulo ou ação" rotulo="Buscar na auditoria" />
                <label htmlFor="auditoria-pessoa" className="sr-only">
                  Pessoa
                </label>
                <CampoSelecao id="auditoria-pessoa" value={person} onChange={(event) => setPerson(event.target.value)}>
                  <option value="all">Todas as pessoas</option>
                  {actors.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </CampoSelecao>
              </div>
              <div className="-mx-1 flex gap-x-4 gap-y-1 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible" role="group" aria-label="Área">
                {actionFilters.map((item) => (
                  <Leitura key={item.value} ativa={filter === item.value} rotulo={item.label} numero={contagemPorFiltro[item.value]} onClick={() => setFilter(item.value)} />
                ))}
              </div>
            </div>

            {visibleEvents.length ? (
              <ul>
                {visibleEvents.map((event) => (
                  <li key={event.id} className="grid gap-2 border-t border-fio px-6 py-4 max-md:px-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold leading-4 tabular-nums text-tinta-2">{formatDateTime(event.createdAt)}</span>
                        <Etiqueta tom="musgo">{auditEntityLabel(event.entity)}</Etiqueta>
                      </p>
                      <p className="mt-1.5 text-[15px] font-bold leading-6 text-tinta">{auditActionLabel(event.action)}</p>
                      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-5 text-tinta">
                        <UserRound className="h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
                        <span className="truncate">{event.actorName}</span>
                        {event.actorEmail ? <span className="truncate font-medium text-tinta-2">· {event.actorEmail}</span> : null}
                      </p>
                      <p className="mt-1.5 text-[13px] font-medium leading-5 text-tinta-2 [overflow-wrap:anywhere]">{formatAuditMetadata(event.metadata)}</p>
                    </div>

                    {event.entityId ? (
                      <div className="min-w-0 md:max-w-48 md:text-right">
                        <p className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Registro</p>
                        <p className="mt-1 truncate font-mono text-xs leading-4 text-tinta-2" title={event.entityId}>
                          {event.entityId}
                        </p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio icone={<History />} titulo="Nenhum evento encontrado" className="border-t border-fio">
                As ações novas aparecerão aqui conforme a equipe usar o app.
              </Vazio>
            )}
          </BlocoFolha>

          <div className="grid min-w-0 gap-6 xl:sticky xl:top-24">
            <BlocoSaber as="aside" aria-labelledby="resumo-por-pessoa">
              <TituloDoSaber id="resumo-por-pessoa">
                <span className="inline-flex items-center gap-2">
                  <Activity className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                  Resumo por pessoa
                </span>
              </TituloDoSaber>
              {personSummary.length ? (
                <>
                  <ul className="grid">
                    {personSummary.map((entry) => (
                      <li key={entry.name} className="grid gap-0.5 border-t border-fio py-3 first:border-t-0 first:pt-0">
                        <p className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-bold leading-5 text-tinta">{entry.name}</span>
                          <span className="shrink-0 text-sm font-extrabold tabular-nums text-tinta">{entry.total}</span>
                        </p>
                        <p className="text-[13px] font-medium leading-5 text-tinta-2">{entry.description}</p>
                      </li>
                    ))}
                  </ul>
                  <p className={cn(AJUDA, "mt-3 border-t border-fio pt-3")}>Contagem sobre os eventos carregados no período.</p>
                </>
              ) : (
                <p className="text-sm font-medium leading-6 text-tinta-2">Sem eventos para resumir ainda.</p>
              )}
            </BlocoSaber>
            <p className="flex items-start gap-2 text-[13px] font-medium leading-5 text-tinta-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
              A auditoria é operacional e interna. Ela ajuda a coordenar a rotina, mas não substitui logs técnicos, controles fiscais ou sistemas oficiais externos.
            </p>
          </div>
        </div>
      </div>
    </AccessGate>
  );
}
