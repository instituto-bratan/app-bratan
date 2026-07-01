import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  KeyRound,
  LockKeyhole,
  MailWarning,
  ShieldCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, cargoLabels, isCoordenacao, seededColaboradores } from "@/lib/access";
import { readLocalValue } from "@/lib/localStore";
import { listRemoteAuditEvents, listRemoteColaboradores } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type { Colaborador } from "@/types/database";
import { auditActionLabel, auditEntityLabel } from "./auditoriaData";
import { colaboradoresStorageKey } from "./colaboradoresData";

type RiskLevel = "ok" | "attention" | "critical";

type SecuritySignal = {
  title: string;
  description: string;
  level: RiskLevel;
};

function isInstitutionalEmail(email: string) {
  return email.toLowerCase().endsWith("@institutobratan.com.br");
}

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function statusTone(level: RiskLevel) {
  if (level === "critical") return "border-destructive/35 bg-destructive/5";
  if (level === "attention") return "border-brand-dourado/45 bg-brand-creme/45";
  return "border-brand-oliva/20 bg-white/72";
}

function signalIcon(level: RiskLevel) {
  if (level === "ok") return CheckCircle2;
  return AlertTriangle;
}

function buildSecuritySignals(colaboradores: Colaborador[], hasRemoteAudit: boolean): SecuritySignal[] {
  const ativos = colaboradores.filter((colaborador) => colaborador.ativo);
  const coordenacaoAtiva = ativos.filter((colaborador) => isCoordenacao(colaborador.cargo));
  const semLogin = ativos.filter((colaborador) => !colaborador.auth_id);
  const emailsExternos = colaboradores.filter((colaborador) => !isInstitutionalEmail(colaborador.email));
  const desligadosComLogin = colaboradores.filter((colaborador) => !colaborador.ativo && colaborador.auth_id);

  const signals: SecuritySignal[] = [
    {
      title: "Coordenação ativa",
      description:
        coordenacaoAtiva.length >= 2
          ? `${coordenacaoAtiva.length} perfis de coordenação ativos.`
          : "Mantenha ao menos dois perfis de coordenação ativos para contingência.",
      level: coordenacaoAtiva.length >= 2 ? "ok" : "critical",
    },
    {
      title: "Colaboradores sem login",
      description:
        semLogin.length === 0
          ? "Todos os colaboradores ativos têm login criado."
          : `${semLogin.length} colaborador(es) ativo(s) ainda sem login.`,
      level: semLogin.length === 0 ? "ok" : "attention",
    },
    {
      title: "E-mails institucionais",
      description:
        emailsExternos.length === 0
          ? "Todos os cadastros usam e-mail institucional."
          : `${emailsExternos.length} cadastro(s) fora do domínio institutobratan.com.br.`,
      level: emailsExternos.length === 0 ? "ok" : "critical",
    },
    {
      title: "Desligados sem acesso",
      description:
        desligadosComLogin.length === 0
          ? "Nenhum colaborador desligado mantém vínculo de login."
          : `${desligadosComLogin.length} desligado(s) ainda com auth_id vinculado.`,
      level: desligadosComLogin.length === 0 ? "ok" : "critical",
    },
    {
      title: "Auditoria operacional",
      description: hasRemoteAudit ? "Eventos sensíveis estão sendo registrados." : "Sem eventos remotos carregados nesta sessão.",
      level: hasRemoteAudit ? "ok" : "attention",
    },
  ];

  return signals;
}

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
    <Card className={cn("border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur", tone === "gold" && "border-brand-dourado/45 bg-brand-creme/45")}>
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

export function SegurancaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const localColaboradores = useMemo(() => readLocalValue(colaboradoresStorageKey, seededColaboradores), []);
  const colaboradoresQuery = useQuery({
    queryKey: ["colaboradores"],
    queryFn: listRemoteColaboradores,
    enabled: useRemote,
  });
  const auditQuery = useQuery({
    queryKey: ["audit-events"],
    queryFn: listRemoteAuditEvents,
    enabled: useRemote,
  });

  const colaboradores = useRemote ? colaboradoresQuery.data ?? [] : localColaboradores;
  const eventos = auditQuery.data ?? [];
  const ativos = colaboradores.filter((colaborador) => colaborador.ativo);
  const comLogin = ativos.filter((colaborador) => Boolean(colaborador.auth_id));
  const semLogin = ativos.filter((colaborador) => !colaborador.auth_id);
  const desligados = colaboradores.filter((colaborador) => !colaborador.ativo);
  const coordenacaoAtiva = ativos.filter((colaborador) => isCoordenacao(colaborador.cargo));
  const signals = buildSecuritySignals(colaboradores, useRemote && eventos.length > 0);
  const sensitiveEvents = eventos.filter((event) =>
    ["auth.", "colaborador."].some((prefix) => event.action.startsWith(prefix)),
  );
  const attentionCount = signals.filter((signal) => signal.level !== "ok").length;

  return (
    <AccessGate allowed={canAdministracao} label="Segurança">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="gold" className="mb-4">
                Coordenação
              </Badge>
              <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Segurança</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Visão operacional dos acessos, colaboradores desligados, cadastros sem login e eventos sensíveis.
              </p>
            </div>
            <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/55 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-brand-musgo">{attentionCount}</p>
              <p className="text-xs font-semibold uppercase text-brand-oliva">pontos de atenção</p>
            </div>
          </div>
        </motion.section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={UsersRound} label="Ativos" value={`${ativos.length}`} detail={`${coordenacaoAtiva.length} em coordenação`} />
          <StatCard icon={KeyRound} label="Com login" value={`${comLogin.length}`} detail="Acessos vinculados ao Auth" tone={comLogin.length ? "gold" : "default"} />
          <StatCard icon={LockKeyhole} label="Sem login" value={`${semLogin.length}`} detail="Ativos aguardando criação de acesso" tone={semLogin.length ? "gold" : "default"} />
          <StatCard icon={UserRoundX} label="Desligados" value={`${desligados.length}`} detail="Histórico preservado, fora da operação" />
        </div>

        {(colaboradoresQuery.isError || auditQuery.isError) ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive">
                Não foi possível carregar todos os dados de segurança. Confira migrations, RLS e permissões da conta.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <section className="space-y-4">
            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  Sinais de segurança
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {signals.map((signal, index) => {
                  const Icon = signalIcon(signal.level);

                  return (
                    <motion.div
                      key={signal.title}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.24, delay: index * 0.03, ease: [0.4, 0, 0.2, 1] }}
                      className={cn("rounded-lg border p-4", statusTone(signal.level))}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-5 w-5", signal.level === "ok" ? "text-brand-musgo" : "text-brand-dourado")} aria-hidden="true" />
                          <p className="font-semibold text-brand-tinta">{signal.title}</p>
                        </div>
                        <Badge variant={signal.level === "ok" ? "muted" : "gold"}>{signal.level === "ok" ? "ok" : "atenção"}</Badge>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">{signal.description}</p>
                    </motion.div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MailWarning className="h-5 w-5" aria-hidden="true" />
                    Cadastros para revisar
                  </CardTitle>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/administracao/colaboradores">Abrir colaboradores</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {[...semLogin, ...colaboradores.filter((colaborador) => !isInstitutionalEmail(colaborador.email))].slice(0, 8).map((colaborador) => (
                  <div key={`${colaborador.id}-${colaborador.email}`} className="flex flex-col gap-2 rounded-lg border border-brand-oliva/16 bg-white/65 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-tinta">{colaborador.nome}</p>
                      <p className="truncate text-sm text-muted-foreground">{colaborador.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{cargoLabels[colaborador.cargo]}</Badge>
                      {!colaborador.auth_id ? <Badge variant="gold">sem login</Badge> : null}
                      {!isInstitutionalEmail(colaborador.email) ? <Badge variant="gold">e-mail externo</Badge> : null}
                    </div>
                  </div>
                ))}
                {semLogin.length === 0 && colaboradores.every((colaborador) => isInstitutionalEmail(colaborador.email)) ? (
                  <div className="rounded-lg border border-brand-oliva/16 bg-brand-papel/55 p-4">
                    <p className="text-sm font-semibold text-brand-tinta">Nenhum cadastro pendente nesta lista.</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-4">
            <Card className="border-brand-dourado/45 bg-brand-creme/35 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <History className="h-5 w-5" aria-hidden="true" />
                  Eventos sensíveis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sensitiveEvents.slice(0, 6).map((event) => (
                  <div key={event.id} className="rounded-lg border border-brand-dourado/25 bg-white/62 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="gold">{auditEntityLabel(event.entity)}</Badge>
                      <span className="text-xs font-semibold uppercase text-brand-oliva">{formatDateTime(event.createdAt)}</span>
                    </div>
                    <p className="text-sm font-semibold text-brand-tinta">{auditActionLabel(event.action)}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{event.actorName}</p>
                  </div>
                ))}
                {sensitiveEvents.length === 0 ? (
                  <p className="text-sm leading-6 text-muted-foreground">Nenhum evento sensível carregado nesta sessão.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Próximo controle</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Revisar a lista de colaboradores ativos sempre que alguém mudar de função ou sair da equipe.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </AccessGate>
  );
}
