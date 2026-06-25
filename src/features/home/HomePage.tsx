import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarClock,
  CheckSquare,
  Clock,
  FileText,
  History,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  Utensils,
} from "lucide-react";
import { Hero } from "@/components/ui/animated-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GetStartedButton } from "@/components/ui/get-started-button";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, canBaseModules, canComprovantes, canLembretesPagamento, cargoGroup, cargoLabels } from "@/lib/access";
import { formatLongDate, formatShortTime, readLocalValue } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { lunchSummary, statusLabel } from "@/features/almoco/almocoData";
import { checklistStorageKey, checklistSummary, createChecklistRun, filterChecklistItemsByCargo } from "@/features/checklist/checklistData";
import {
  comprovantesStorageKey,
  comprovantesSummary,
  money,
  type ComprovanteRecord,
} from "@/features/comprovantes/comprovantesData";
import { activeAvisos, initialAvisos, muralStorageKey } from "@/features/mural/muralData";
import {
  formatDate,
  money as pagamentoMoney,
  pagamentosStorageKey,
  pagamentosSummary,
  type PagamentoLembrete,
} from "@/features/pagamentos/pagamentosData";
import { listRemotePagamentos } from "@/lib/remoteData";

const modules = [
  {
    title: "Tarefas do dia",
    href: "/tarefas",
    icon: CheckSquare,
    label: "Checklist",
    description: "Marque o fechamento diário, acompanhe progresso e preserve a execução do dia.",
    action: "Abrir checklist",
    allowed: canBaseModules,
  },
  {
    title: "Almoço",
    href: "/almoco",
    icon: Utensils,
    label: "Cobertura",
    description: "Veja quem está em pausa, quem ainda sai e quem já voltou.",
    action: "Ver cobertura",
    allowed: canBaseModules,
  },
  {
    title: "Mural de avisos",
    href: "/mural",
    icon: Bell,
    label: "Comunicados",
    description: "Coordenação publica. Equipe lê. Comunicação clara, em um só lugar.",
    action: "Abrir mural",
    allowed: canBaseModules,
  },
  {
    title: "POPs & Fluxos",
    href: "/pops-fluxos",
    icon: FileText,
    label: "18 fluxos",
    description: "Fluxogramas reais por setor, com contexto operacional e tarefas extraídas.",
    action: "Abrir biblioteca",
    allowed: canBaseModules,
  },
  {
    title: "Comprovantes",
    href: "/comprovantes",
    icon: ReceiptText,
    label: "Recepção + Coordenação",
    description: "Anexe arquivos, filtre por período e preserve histórico imutável.",
    action: "Anexar",
    allowed: canComprovantes,
  },
  {
    title: "Lembretes de pagamento",
    href: "/lembretes-pagamento",
    icon: CalendarClock,
    label: "Coordenação",
    description: "Acompanhe saldos prometidos, datas combinadas e retornos vencidos.",
    action: "Ver lembretes",
    allowed: canLembretesPagamento,
  },
  {
    title: "Colaboradores",
    href: "/administracao/colaboradores",
    icon: UsersRound,
    label: "Administração",
    description: "Gerencie perfis e cargos que controlam os acessos.",
    action: "Gerir equipe",
    allowed: canAdministracao,
  },
  {
    title: "Auditoria",
    href: "/administracao/auditoria",
    icon: History,
    label: "Administração",
    description: "Veja ações sensíveis registradas no app e acompanhe o uso pela coordenação.",
    action: "Ver registros",
    allowed: canAdministracao,
  },
];

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "gold";
}) {
  return (
    <Card
      className={cn(
        "border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur",
        tone === "gold" && "border-brand-dourado/45 bg-brand-creme/45",
      )}
    >
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <Badge variant={tone === "gold" ? "gold" : "muted"}>{label}</Badge>
        </div>
        <p className="text-3xl font-bold text-brand-tinta">{value}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function HomePage() {
  const { pessoa, session, isPreview } = useAuth();
  const navigate = useNavigate();
  const firstName = pessoa?.nome.split(" ")[0] ?? "Equipe";
  const cargo = pessoa?.cargo;
  const useRemote = Boolean(pessoa && session && !isPreview);
  const now = useMemo(() => new Date(), []);
  const allowedModules = modules.filter((module) => module.allowed(cargo));
  const pagamentosQuery = useQuery({
    queryKey: ["pagamentos-lembretes"],
    queryFn: listRemotePagamentos,
    enabled: useRemote && canLembretesPagamento(cargo),
  });

  const checklist = useMemo(() => {
    const items = readLocalValue(checklistStorageKey(), createChecklistRun());
    return checklistSummary(filterChecklistItemsByCargo(items, cargo));
  }, [cargo]);

  const lunch = useMemo(() => lunchSummary(now), [now]);

  const avisos = useMemo(() => {
    return activeAvisos(readLocalValue(muralStorageKey, initialAvisos));
  }, []);

  const comprovantes = useMemo(() => {
    if (!canComprovantes(cargo)) return null;
    return comprovantesSummary(readLocalValue<ComprovanteRecord[]>(comprovantesStorageKey, []));
  }, [cargo]);

  const pagamentos = useMemo(() => {
    if (!canLembretesPagamento(cargo)) return null;
    const records = useRemote
      ? pagamentosQuery.data ?? []
      : readLocalValue<PagamentoLembrete[]>(pagamentosStorageKey, []);
    return pagamentosSummary(records);
  }, [cargo, pagamentosQuery.data, useRemote]);

  const nextLunchLabel = lunch.currentLunch[0]
    ? `${lunch.currentLunch[0].rotulo} está em pausa`
    : lunch.nextSlot
      ? `${lunch.nextSlot.rotulo} ${statusLabel(lunch.nextSlot.status, lunch.nextSlot).toLowerCase()}`
      : "Todos os turnos voltaram";

  const nextPriority = pagamentos?.vencidos[0]
    ? `${pagamentos.vencidos[0].pacienteNome} tem lembrete vencido`
    : checklist.nextItem
    ? checklist.nextItem.descricao
    : avisos[0]?.corpo ?? "Rotina do dia em ordem";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, ease: [0.4, 0, 0.2, 1] }}
        className="overflow-hidden rounded-lg border border-brand-oliva/20 bg-white/62 px-5 py-6 shadow-calm backdrop-blur sm:px-7 sm:py-8 lg:px-10"
      >
        <div className="mb-5 flex flex-wrap gap-2">
          <Badge variant="gold">Painel do dia</Badge>
          <Badge variant="outline">{formatLongDate(now)}</Badge>
          <Badge variant="outline">Confiável</Badge>
          <Badge variant="outline">Nobre</Badge>
          <Badge variant="outline">Ético</Badge>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <Hero
            eyebrow={`Bom trabalho, ${firstName}`}
            titleLead="Operação"
            rotatingWords={["em foco.", "sem ruído.", "no ritmo.", "sob controle."]}
            description="Seu resumo do dia: tarefas, almoço, avisos e comprovantes em uma visão única, filtrada pelo seu cargo."
            primaryAction={{ label: "Abrir tarefas", onClick: () => navigate("/tarefas") }}
            secondaryAction={{ label: canComprovantes(cargo) ? "Anexar comprovante" : "Ver POPs", onClick: () => navigate(canComprovantes(cargo) ? "/comprovantes" : "/pops-fluxos") }}
          />

          <Card className="border-brand-dourado/45 bg-brand-creme/45 shadow-none">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase text-brand-oliva">Perfil ativo</p>
              <p className="mt-1 text-lg font-semibold text-brand-tinta">
                {cargo ? cargoLabels[cargo] : "Sem cargo definido"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{cargo ? cargoGroup(cargo) : "Acesso ainda não configurado."}</p>
              <div className="mt-5 rounded-lg border border-brand-oliva/20 bg-white/62 p-4">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Próxima prioridade</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-tinta">{nextPriority}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl text-brand-musgo">Resumo operacional</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sinais principais para decidir o próximo passo.</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/mural">Ver avisos</Link>
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={CheckSquare}
            label="Checklist"
            value={`${checklist.progress}%`}
            detail={`${checklist.doneCount}/${checklist.total} tarefas concluídas`}
            tone={checklist.progress === 100 ? "gold" : "default"}
          />
          <StatCard
            icon={Utensils}
            label="Almoço"
            value={`${lunch.currentLunch.length}`}
            detail={nextLunchLabel}
            tone={lunch.currentLunch.length ? "gold" : "default"}
          />
          <StatCard
            icon={Bell}
            label="Mural"
            value={`${avisos.length}`}
            detail={avisos[0] ? `Último aviso às ${formatShortTime(avisos[0].publicadoEm)}` : "Sem avisos ativos"}
          />
          {comprovantes ? (
            <StatCard
              icon={ReceiptText}
              label="Comprovantes"
              value={`${comprovantes.todayRecords.length}`}
              detail={`${money(comprovantes.totalHoje)} hoje · ${comprovantes.pendingSharePoint} pendentes SharePoint`}
              tone={comprovantes.todayRecords.length ? "gold" : "default"}
            />
          ) : (
            <StatCard
              icon={ShieldCheck}
              label="Acesso"
              value="Base"
              detail="Comprovantes ficam ocultos para este cargo."
            />
          )}
          {pagamentos ? (
            <StatCard
              icon={CalendarClock}
              label="Lembretes"
              value={`${pagamentos.vencidos.length}`}
              detail={`${pagamentoMoney(pagamentos.totalAberto)} em aberto · ${pagamentos.hoje.length} hoje`}
              tone={pagamentos.vencidos.length || pagamentos.hoje.length ? "gold" : "default"}
            />
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Fila de atenção</CardTitle>
              <Badge variant="muted">Agora</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
              <div className="flex items-start gap-3">
                <CheckSquare className="mt-1 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-brand-tinta">
                    {checklist.nextItem ? checklist.nextItem.descricao : "Checklist completo"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {checklist.nextItem ? `${checklist.pendingCount} tarefas pendentes` : "Tudo certo para encerrar o dia."}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
              <div className="flex items-start gap-3">
                <Clock className="mt-1 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-brand-tinta">{nextLunchLabel}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · status calculado automaticamente
                  </p>
                </div>
              </div>
            </div>

            {comprovantes?.lastRecord ? (
              <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
                <div className="flex items-start gap-3">
                  <ReceiptText className="mt-1 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-brand-tinta">{comprovantes.lastRecord.arquivoNome}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Último comprovante · {formatShortTime(comprovantes.lastRecord.anexadoEm)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {pagamentos?.proximoLembrete ? (
              <div className="rounded-lg border border-brand-dourado/30 bg-brand-creme/35 p-4">
                <div className="flex items-start gap-3">
                  <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-brand-tinta">
                      {pagamentos.proximoLembrete.pacienteNome} · {pagamentoMoney(pagamentos.proximoLembrete.valorPendente)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Lembrete de pagamento para {formatDate(pagamentos.proximoLembrete.dataPrevista)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Avisos recentes</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/mural">Abrir</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {avisos.slice(0, 3).map((aviso) => (
              <div key={aviso.id} className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={aviso.prioridade === "importante" ? "gold" : "muted"}>
                    {aviso.prioridade === "importante" ? "Importante" : "Informativo"}
                  </Badge>
                  <span className="text-xs font-semibold uppercase text-brand-oliva">{formatShortTime(aviso.publicadoEm)}</span>
                </div>
                <p className="line-clamp-2 text-sm leading-6 text-brand-tinta">{aviso.corpo}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl text-brand-musgo">Acessos rápidos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Visíveis para o cargo atual.</p>
          </div>
          <LiquidButton type="button" size="lg" onClick={() => navigate("/tarefas")}>
            Continuar rotina
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
          </LiquidButton>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {allowedModules.map((module, index) => (
            <motion.div
              key={module.href}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.38, delay: 0.06 * index, ease: [0.4, 0, 0.2, 1] }}
            >
              <Card className="h-full border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-calm">
                <CardHeader>
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-musgo text-brand-papel">
                    <module.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <Badge variant="muted" className="w-fit">
                    {module.label}
                  </Badge>
                  <CardTitle>{module.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-5 min-h-16 text-sm leading-6 text-muted-foreground">{module.description}</p>
                  {index === 0 ? (
                    <GetStartedButton className="w-full" label={module.action} onClick={() => navigate(module.href)} />
                  ) : (
                    <Button asChild variant="outline" className="w-full">
                      <Link to={module.href}>{module.action}</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
