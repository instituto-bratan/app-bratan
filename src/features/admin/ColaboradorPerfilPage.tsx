import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, cargoGroup, cargoLabels, seededColaboradores } from "@/lib/access";
import { readLocalValue } from "@/lib/localStore";
import { listRemoteColaboradores } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { accessMatrix, allowedModuleCount, colaboradoresStorageKey } from "./colaboradoresData";

function formatDateTime(dateString?: string | null) {
  if (!dateString) return "Não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export function ColaboradorPerfilPage() {
  const { id } = useParams();
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const localColaboradores = useMemo(() => readLocalValue(colaboradoresStorageKey, seededColaboradores), []);
  const colaboradoresQuery = useQuery({
    queryKey: ["colaboradores"],
    queryFn: listRemoteColaboradores,
    enabled: useRemote,
  });
  const colaboradores = useRemote ? colaboradoresQuery.data ?? [] : localColaboradores;
  const colaborador = colaboradores.find((item) => item.id === id);

  return (
    <AccessGate allowed={canAdministracao} label="Perfil do colaborador">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/administracao/colaboradores">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Voltar para colaboradores
            </Link>
          </Button>
        </div>

        {colaboradoresQuery.isError ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive">
                Não foi possível carregar este perfil do Supabase. Confira RLS e vínculo do usuário.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {!colaborador ? (
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardContent className="grid min-h-64 place-items-center p-8 text-center">
              <div>
                <UserRound className="mx-auto mb-4 h-10 w-10 text-brand-oliva" aria-hidden="true" />
                <h1 className="text-3xl text-brand-musgo">Perfil não encontrado</h1>
                <p className="mt-2 text-sm text-muted-foreground">O colaborador pode ter sido removido ou ainda não foi carregado.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Badge variant="gold">Perfil</Badge>
                    <Badge variant="outline">{cargoLabels[colaborador.cargo]}</Badge>
                    <Badge variant="muted">{cargoGroup(colaborador.cargo)}</Badge>
                  </div>
                  <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">{colaborador.nome}</h1>
                  <p className="mt-3 flex max-w-2xl items-center gap-2 text-base leading-7 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {colaborador.email}
                  </p>
                </div>
                <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-brand-musgo">{allowedModuleCount(colaborador.cargo)}</p>
                  <p className="text-xs font-semibold uppercase text-brand-oliva">módulos liberados</p>
                </div>
              </div>
            </motion.section>

            <div className="grid gap-5 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
              <section className="space-y-4">
                <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <KeyRound className="h-5 w-5" aria-hidden="true" />
                      Acesso
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
                      <p className="text-xs font-semibold uppercase text-brand-oliva">Login</p>
                      <div className="mt-2 flex items-center gap-2">
                        {colaborador.auth_id ? (
                          <CheckCircle2 className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
                        ) : (
                          <LockKeyhole className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                        )}
                        <p className="font-semibold text-brand-tinta">{colaborador.auth_id ? "Acesso ativo" : "Sem acesso criado"}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
                      <p className="text-xs font-semibold uppercase text-brand-oliva">Cadastro</p>
                      <p className="mt-2 text-sm text-muted-foreground">Criado em {formatDateTime(colaborador.created_at)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Atualizado em {formatDateTime(colaborador.updated_at)}</p>
                    </div>
                    <Button asChild variant="outline" className="w-full">
                      <Link to="/administracao/colaboradores">Editar dados ou criar acesso</Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-brand-dourado/45 bg-brand-creme/35 shadow-none">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase text-brand-oliva">Regra operacional</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      A coordenação cadastra colaboradores nesta área. A segurança real continua nas políticas RLS do Supabase.
                    </p>
                  </CardContent>
                </Card>
              </section>

              <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    Permissões do cargo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2">
                    {accessMatrix.map((item) => {
                      const allowed = item.allowed(colaborador.cargo);

                      return (
                        <div
                          key={item.label}
                          className={cn(
                            "rounded-lg border p-4 transition",
                            allowed ? "border-brand-oliva/20 bg-white/70" : "border-brand-oliva/12 bg-muted/35 opacity-75",
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="font-semibold text-brand-tinta">{item.label}</p>
                            <Badge variant={allowed ? "gold" : "muted"}>{allowed ? "Liberado" : "Bloqueado"}</Badge>
                          </div>
                          <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AccessGate>
  );
}
