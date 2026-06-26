import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Eye, KeyRound, RotateCcw, Save, Search, ShieldCheck, Trash2, UserRoundPlus, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, cargoGroup, cargoLabels, cargos, seededColaboradores } from "@/lib/access";
import { readLocalValue, writeLocalValue } from "@/lib/localStore";
import {
  createRemoteColaboradorAccess,
  deactivateRemoteColaborador,
  listRemoteColaboradores,
  reactivateRemoteColaborador,
  saveRemoteColaborador,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type { Cargo, Colaborador } from "@/types/database";
import { colaboradoresStorageKey } from "./colaboradoresData";

type ColaboradorForm = {
  id: string | null;
  nome: string;
  email: string;
  cargo: Cargo;
};

const emptyForm: ColaboradorForm = {
  id: null,
  nome: "",
  email: "",
  cargo: "recepcionista",
};

function createId() {
  return `colaborador-${crypto.randomUUID?.() ?? Date.now()}`;
}

function createSecurePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function isInstitutionalEmail(email: string) {
  return email.endsWith("@institutobratan.com.br");
}

export function ColaboradoresPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [localColaboradores, setLocalColaboradores] = useState<Colaborador[]>(() => readLocalValue(colaboradoresStorageKey, seededColaboradores));
  const [form, setForm] = useState<ColaboradorForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [accessTarget, setAccessTarget] = useState<Colaborador | null>(null);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [createAccessNow, setCreateAccessNow] = useState(false);
  const [initialPassword, setInitialPassword] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ativos" | "desligados" | "todos">("ativos");
  const colaboradoresQuery = useQuery({
    queryKey: ["colaboradores"],
    queryFn: listRemoteColaboradores,
    enabled: useRemote,
  });
  const saveMutation = useMutation({
    mutationFn: saveRemoteColaborador,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["colaboradores"] }),
  });
  const accessMutation = useMutation({
    mutationFn: createRemoteColaboradorAccess,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["colaboradores"] }),
  });
  const deactivateMutation = useMutation({
    mutationFn: deactivateRemoteColaborador,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["colaboradores"] }),
  });
  const reactivateMutation = useMutation({
    mutationFn: reactivateRemoteColaborador,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["colaboradores"] }),
  });
  const colaboradores = useRemote ? colaboradoresQuery.data ?? [] : localColaboradores;
  const activeColaboradores = useMemo(() => colaboradores.filter((colaborador) => colaborador.ativo), [colaboradores]);

  const sortedColaboradores = useMemo(
    () => {
      const normalizedQuery = query.trim().toLowerCase();

      return colaboradores
        .filter((colaborador) => {
          if (statusFilter === "ativos" && !colaborador.ativo) return false;
          if (statusFilter === "desligados" && colaborador.ativo) return false;

          if (!normalizedQuery) return true;

          return `${colaborador.nome} ${colaborador.email} ${cargoLabels[colaborador.cargo]}`
            .toLowerCase()
            .includes(normalizedQuery);
        })
        .sort((a, b) => {
          if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
        const cargoDelta = cargos.indexOf(a.cargo) - cargos.indexOf(b.cargo);
        return cargoDelta || a.nome.localeCompare(b.nome);
        });
    },
    [colaboradores, query, statusFilter],
  );

  function persist(nextColaboradores: Colaborador[]) {
    setLocalColaboradores(nextColaboradores);
    writeLocalValue(colaboradoresStorageKey, nextColaboradores);
  }

  function edit(colaborador: Colaborador) {
    setError(null);
    setCreateAccessNow(false);
    setInitialPassword("");
    setForm({
      id: colaborador.id,
      nome: colaborador.nome,
      email: colaborador.email,
      cargo: colaborador.cargo,
    });
  }

  function resetForm() {
    setError(null);
    setForm(emptyForm);
    setCreateAccessNow(false);
    setInitialPassword("");
  }

  function openAccess(colaborador: Colaborador) {
    setAccessError(null);
    setAccessPassword("");
    setAccessTarget(colaborador);
  }

  function closeAccess() {
    setAccessError(null);
    setAccessPassword("");
    setAccessTarget(null);
  }

  function fillGeneratedInitialPassword() {
    setInitialPassword(createSecurePassword());
  }

  function fillGeneratedAccessPassword() {
    setAccessPassword(createSecurePassword());
  }

  async function submitAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessError(null);

    const target = accessTarget;
    const password = accessPassword.trim();

    if (!target) return;
    if (password.length < 12) {
      setAccessError("Use uma senha inicial com pelo menos 12 caracteres.");
      return;
    }

    try {
      await accessMutation.mutateAsync({
        colaboradorId: target.id,
        nome: target.nome,
        email: target.email,
        cargo: target.cargo,
        password,
      });
      closeAccess();
    } catch {
      setAccessError("Não foi possível criar o acesso. Verifique a Edge Function e tente novamente.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nome = form.nome.trim();
    const email = form.email.trim().toLowerCase();

    if (!nome || !email.includes("@")) {
      setError("Informe nome e e-mail válidos.");
      return;
    }

    if (!isInstitutionalEmail(email)) {
      setError("Use um e-mail @institutobratan.com.br.");
      return;
    }

    const emailInUse = colaboradores.some((colaborador) => colaborador.email.toLowerCase() === email && colaborador.id !== form.id);
    if (emailInUse) {
      setError("Este e-mail já está cadastrado. Edite ou reative o colaborador existente.");
      return;
    }

    if (useRemote) {
      if (!form.id && createAccessNow && initialPassword.trim().length < 12) {
        setError("Use uma senha inicial com pelo menos 12 caracteres.");
        return;
      }

      try {
        const savedId = await saveMutation.mutateAsync({
          id: form.id,
          nome,
          email,
          cargo: form.cargo,
        });

        if (!form.id && createAccessNow) {
          try {
            await accessMutation.mutateAsync({
              colaboradorId: savedId,
              nome,
              email,
              cargo: form.cargo,
              password: initialPassword.trim(),
            });
          } catch {
            setError("Colaborador cadastrado, mas o login não foi criado. Use o botão Criar acesso na lista.");
            return;
          }
        }

        resetForm();
      } catch {
        setError("Não foi possível salvar no Supabase. Confira permissões e tente novamente.");
      }

      return;
    }

    if (form.id) {
      persist(
        colaboradores.map((colaborador) =>
          colaborador.id === form.id
            ? {
                ...colaborador,
                nome,
                email,
                cargo: form.cargo,
                updated_at: new Date().toISOString(),
              }
            : colaborador,
        ),
      );
    } else {
      persist([
        ...colaboradores,
        {
          id: createId(),
          auth_id: null,
          nome,
          email,
          cargo: form.cargo,
          ativo: true,
          created_at: new Date().toISOString(),
          updated_at: null,
        },
      ]);
    }

    resetForm();
  }

  async function deactivate(colaborador: Colaborador) {
    setError(null);

    if (colaborador.id === pessoa?.id || colaborador.auth_id === pessoa?.auth_id) {
      setError("Você não pode desligar o próprio acesso.");
      return;
    }

    const confirmed = window.confirm(`Desligar ${colaborador.nome}? O histórico será preservado e o acesso ao app será bloqueado.`);
    if (!confirmed) return;

    if (useRemote) {
      try {
        await deactivateMutation.mutateAsync(colaborador.id);
        if (form.id === colaborador.id) resetForm();
      } catch {
        setError("Não foi possível desligar este colaborador. Verifique se ainda existe outra conta de coordenação ativa.");
      }
      return;
    }

    persist(
      colaboradores.map((current) =>
        current.id === colaborador.id
          ? {
              ...current,
              ativo: false,
              auth_id: null,
              updated_at: new Date().toISOString(),
            }
          : current,
      ),
    );
    if (form.id === colaborador.id) resetForm();
  }

  async function reactivate(colaborador: Colaborador) {
    setError(null);

    if (useRemote) {
      try {
        await reactivateMutation.mutateAsync(colaborador.id);
      } catch {
        setError("Não foi possível reativar este colaborador.");
      }
      return;
    }

    persist(
      colaboradores.map((current) =>
        current.id === colaborador.id
          ? {
              ...current,
              ativo: true,
              updated_at: new Date().toISOString(),
            }
          : current,
      ),
    );
  }

  return (
    <AccessGate allowed={canAdministracao} label="Colaboradores">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="gold" className="mb-4">
                Administração
              </Badge>
              <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Colaboradores</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Cadastre e ajuste nome, e-mail e cargo. O cargo alimenta a matriz de acesso da interface e as políticas RLS do Supabase.
              </p>
            </div>
            <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-brand-musgo">{activeColaboradores.length}</p>
              <p className="text-xs font-semibold uppercase text-brand-oliva">{useRemote ? "ativos no Supabase" : "ativos na prévia"}</p>
            </div>
          </div>
        </motion.section>

        {colaboradoresQuery.isError ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive">
                Não foi possível carregar colaboradores do Supabase. Verifique RLS, migrations e vínculo do seu usuário.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <Card className="h-fit border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {form.id ? <Save className="h-5 w-5" aria-hidden="true" /> : <UserRoundPlus className="h-5 w-5" aria-hidden="true" />}
                  {form.id ? "Editar colaborador" : "Cadastrar colaborador"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submit}>
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome</Label>
                    <Input
                      id="nome"
                      value={form.nome}
                      placeholder="[Nome do colaborador]"
                      onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      placeholder="nome@institutobratan.com.br"
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cargo">Cargo</Label>
                    <select
                      id="cargo"
                      value={form.cargo}
                      onChange={(event) => setForm((current) => ({ ...current, cargo: event.target.value as Cargo }))}
                      className="flex h-10 w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {cargos.map((cargo) => (
                        <option key={cargo} value={cargo}>
                          {cargoLabels[cargo]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {useRemote && !form.id ? (
                    <div className="rounded-lg border border-brand-oliva/18 bg-white/60 p-3">
                      <label className="flex items-start gap-3 text-sm font-medium text-brand-tinta">
                        <input
                          type="checkbox"
                          checked={createAccessNow}
                          onChange={(event) => setCreateAccessNow(event.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-brand-oliva/40 text-brand-musgo"
                        />
                        <span>Criar login agora</span>
                      </label>
                      {createAccessNow ? (
                        <div className="mt-3 space-y-2">
                          <Label htmlFor="initial-password">Senha inicial</Label>
                          <Input
                            id="initial-password"
                            type="text"
                            minLength={12}
                            autoComplete="new-password"
                            value={initialPassword}
                            placeholder="mínimo 12 caracteres"
                            onChange={(event) => setInitialPassword(event.target.value)}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={fillGeneratedInitialPassword}>
                            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                            Gerar senha segura
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {error ? <p className="text-sm text-destructive">{error}</p> : null}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <LiquidButton type="submit" size="lg" className="w-full" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar"}
                    </LiquidButton>
                    {form.id ? (
                      <Button type="button" variant="outline" onClick={resetForm}>
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </form>
              </CardContent>
            </Card>

            {useRemote && accessTarget ? (
              <Card className="border-brand-dourado/45 bg-brand-creme/40 shadow-none backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <KeyRound className="h-5 w-5" aria-hidden="true" />
                    Criar acesso
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={submitAccess}>
                    <div className="rounded-lg border border-brand-dourado/30 bg-white/60 px-3 py-2">
                      <p className="truncate text-sm font-semibold text-brand-tinta">{accessTarget.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">{accessTarget.email}</p>
                      <p className="mt-1 text-xs font-semibold uppercase text-brand-oliva">{cargoLabels[accessTarget.cargo]}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="access-password">Senha inicial</Label>
                      <Input
                        id="access-password"
                        type="text"
                        minLength={12}
                        autoComplete="new-password"
                        value={accessPassword}
                        placeholder="mínimo 12 caracteres"
                        onChange={(event) => setAccessPassword(event.target.value)}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={fillGeneratedAccessPassword}>
                        <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                        Gerar senha segura
                      </Button>
                    </div>

                    {accessError ? <p className="text-sm text-destructive">{accessError}</p> : null}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <LiquidButton type="submit" size="lg" className="w-full" disabled={accessMutation.isPending}>
                        {accessMutation.isPending ? "Criando..." : "Ativar login"}
                      </LiquidButton>
                      <Button type="button" variant="outline" onClick={closeAccess}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <section className="grid gap-3">
            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardContent className="space-y-3 p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar por nome, e-mail ou cargo"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "ativos", label: "Ativos" },
                    { id: "desligados", label: "Desligados" },
                    { id: "todos", label: "Todos" },
                  ].map((filter) => (
                    <Button
                      key={filter.id}
                      type="button"
                      size="sm"
                      variant={statusFilter === filter.id ? "default" : "outline"}
                      onClick={() => setStatusFilter(filter.id as typeof statusFilter)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {sortedColaboradores.map((colaborador, index) => (
              <motion.article
                key={colaborador.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: index * 0.03, ease: [0.4, 0, 0.2, 1] }}
              >
                <Card
                  className={cn(
                    "border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-calm",
                    form.id === colaborador.id && "border-brand-dourado/60 bg-brand-creme/35",
                    !colaborador.ativo && "border-muted bg-white/45 opacity-75",
                  )}
                >
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
                        <UsersRound className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-brand-tinta">{colaborador.nome}</p>
                        <p className="truncate text-sm text-muted-foreground">{colaborador.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge variant="outline">{cargoLabels[colaborador.cargo]}</Badge>
                      <Badge variant="muted">{cargoGroup(colaborador.cargo)}</Badge>
                      {!colaborador.ativo ? <Badge variant="muted">Desligado</Badge> : null}
                      {useRemote ? (
                        colaborador.ativo && colaborador.auth_id ? (
                          <Badge variant="gold">Acesso ativo</Badge>
                        ) : (
                          <Badge variant="muted">Sem acesso</Badge>
                        )
                      ) : null}
                      {useRemote && colaborador.ativo && !colaborador.auth_id ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => openAccess(colaborador)}>
                          Criar acesso
                        </Button>
                      ) : null}
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/administracao/colaboradores/${colaborador.id}`}>
                          <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                          Perfil
                        </Link>
                      </Button>
                      {colaborador.ativo ? (
                        <>
                          <Button type="button" variant="ghost" size="sm" onClick={() => edit(colaborador)}>
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={deactivateMutation.isPending || colaborador.id === pessoa?.id}
                            onClick={() => deactivate(colaborador)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                            Desligar
                          </Button>
                        </>
                      ) : (
                        <Button type="button" variant="outline" size="sm" disabled={reactivateMutation.isPending} onClick={() => reactivate(colaborador)}>
                          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                          Reativar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.article>
            ))}
          </section>
        </div>
      </div>
    </AccessGate>
  );
}
