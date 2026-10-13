// COLABORADORES — redesenho Papel & Musgo, etapa 4 (08/10/2026).
//
// Cadastro da equipe (nome, e-mail, cargo), login inicial, desligar e reativar.
// No redesenho mudou só a forma: um cabeçalho com a frase da equipe, a lista de
// pessoas numa folha (itens do mesmo tipo em lista) com a busca e as leituras
// Ativos · Desligados · Todos, e o formulário numa folha ao lado. As regras (e-mail
// de qualquer domínio com formato válido, senha inicial de 12+ caracteres, não
// desligar a si mesmo, o motivo devolvido pela função de criar acesso) continuam.
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, RotateCcw, Save, ShieldCheck, Trash2, UserRoundPlus, UsersRound } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { AvatarBadge } from "@/components/ui/avatar-badge";
import { BlocoFolha, Botao, Cabecalho, CampoBusca, LinkSeta } from "@/components/ui/fundacao";
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
import { confirmar } from "@/components/ui/avisos";
import { contagem, nomeParaInicial } from "./frasesAjustes";
import { AJUDA, CabecaDaFolha, Campo, CampoSelecao, CampoTexto, Etiqueta, Leitura, MARCAR, RUBRICA, Recado, Vazio } from "./pecasAjustes";

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

/**
 * QUALQUER E-MAIL SERVE (25/08/2026, pedido do Lucas): "a nossa nutricionista
 * não tem esse email, então vou pedir pra que seja qualquer email que seja
 * autorizado". Antes o cadastro exigia @institutobratan.com.br e simplesmente
 * barrava quem é da casa mas usa e-mail próprio.
 *
 * O que continua sendo checado é o FORMATO — um e-mail torto não cria login no
 * Supabase e a pessoa fica sem acesso sem saber por quê.
 */
function isEmailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Só para informar (não bloqueia): e-mail do domínio da casa? */
export function isInstitutionalEmail(email: string) {
  return email.trim().toLowerCase().endsWith("@institutobratan.com.br");
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

  async function fillGeneratedAccessPassword() {
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
    } catch (falha) {
      // Mostra o motivo que a função devolveu (e-mail inválido, senha curta,
      // cargo desconhecido, já tem acesso) em vez de mandar o Lucas conferir
      // uma Edge Function que ele não tem como abrir.
      const motivo = (falha as Error)?.message?.trim();
      setAccessError(
        motivo && !/non-2xx|Failed to send|Edge Function/i.test(motivo)
          ? motivo
          : "Não foi possível criar o acesso agora. Confira a internet e tente de novo — se insistir, me chame.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nome = form.nome.trim();
    const email = form.email.trim().toLowerCase();

    if (!nome) {
      setError("Informe o nome do colaborador.");
      return;
    }

    if (!isEmailValido(email)) {
      setError("Esse e-mail não parece válido — confira (ex.: nome@gmail.com).");
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

    const confirmed = await confirmar(`Desligar ${colaborador.nome}?`, { corpo: "O histórico é preservado e o acesso ao app fica bloqueado.", destrutivo: true, confirmar: "Desligar" });
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

  const desligadosTotal = colaboradores.length - activeColaboradores.length;
  const semLoginAtivos = useRemote ? activeColaboradores.filter((colaborador) => !colaborador.auth_id).length : 0;
  const contagemPorLeitura = { ativos: activeColaboradores.length, desligados: desligadosTotal, todos: colaboradores.length };

  // O número do topo vem numa frase (o Lucas rejeita número solto).
  const fraseDoTopo = (
    <>
      <strong>{contagem(activeColaboradores.length, "pessoa ativa", "pessoas ativas")}</strong>
      {useRemote ? " no app" : " na prévia"}
      {semLoginAtivos ? (
        <>
          , <span className="alerta">{semLoginAtivos} ainda sem login</span>
        </>
      ) : null}
      {desligadosTotal ? `, ${contagem(desligadosTotal, "desligada", "desligadas")}` : ""}. O cargo de cada uma decide o que ela vê no app.
    </>
  );

  return (
    <AccessGate allowed={canAdministracao} label="Colaboradores">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho className="mb-0 max-md:mb-0" sobrancelha="Ajustes" titulo="Colaboradores" frase={fraseDoTopo} />

        {colaboradoresQuery.isError ? (
          <Recado tom="erro">Não foi possível carregar colaboradores do Supabase. Verifique RLS, migrations e vínculo do seu usuário.</Recado>
        ) : null}

        {/* No computador: a lista (decidir) à esquerda e o formulário ao lado; no
            celular o formulário vem primeiro, como antes. */}
        <div className="grid items-start gap-8 max-md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          {/* Preso no alto enquanto a lista rola (Editar lá embaixo e o formulário à
              vista); com o "Criar acesso" aberto fica solto, senão passaria da tela. */}
          <div className={cn("grid min-w-0 gap-6 lg:col-start-2 lg:row-start-1", !(useRemote && accessTarget) && "lg:sticky lg:top-24")}>
            <BlocoFolha as="section" aria-labelledby="colaborador-form" respiro>
              <h2 id="colaborador-form" className="flex items-center gap-2 text-base font-bold leading-6 text-tinta">
                {form.id ? <Save className="h-4 w-4 stroke-oliva" aria-hidden="true" /> : <UserRoundPlus className="h-4 w-4 stroke-oliva" aria-hidden="true" />}
                {form.id ? "Editar colaborador" : "Cadastrar colaborador"}
              </h2>
              <form className="mt-4 grid gap-4" onSubmit={submit}>
                <Campo id="nome" rotulo="Nome">
                  <CampoTexto
                    id="nome"
                    value={form.nome}
                    placeholder="[Nome do colaborador]"
                    onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                  />
                </Campo>
                <Campo
                  id="email"
                  rotulo="E-mail"
                  ajuda="Pode ser e-mail próprio (Gmail, Outlook…) — é com ele que a pessoa vai entrar no app. Quando não é do domínio da casa, o e-mail fica marcado em Segurança: a caixa não é nossa, então tirar o acesso é sempre por aqui, desativando o colaborador."
                >
                  <CampoTexto
                    id="email"
                    type="email"
                    value={form.email}
                    placeholder="nome@institutobratan.com.br ou e-mail próprio"
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  />
                </Campo>
                <Campo id="cargo" rotulo="Cargo">
                  <CampoSelecao id="cargo" value={form.cargo} onChange={(event) => setForm((current) => ({ ...current, cargo: event.target.value as Cargo }))}>
                    {cargos.map((cargo) => (
                      <option key={cargo} value={cargo}>
                        {cargoLabels[cargo]}
                      </option>
                    ))}
                  </CampoSelecao>
                </Campo>

                {useRemote && !form.id ? (
                  <div className="grid gap-3 rounded-bloco bg-saber p-4">
                    <label className="flex items-start gap-3 text-sm font-semibold leading-5 text-tinta">
                      <input type="checkbox" checked={createAccessNow} onChange={(event) => setCreateAccessNow(event.target.checked)} className={cn(MARCAR, "mt-0.5")} />
                      <span>Criar login agora</span>
                    </label>
                    {createAccessNow ? (
                      <Campo id="initial-password" rotulo="Senha inicial">
                        <CampoTexto
                          id="initial-password"
                          type="text"
                          minLength={12}
                          autoComplete="new-password"
                          value={initialPassword}
                          placeholder="mínimo 12 caracteres"
                          className="font-mono"
                          onChange={(event) => setInitialPassword(event.target.value)}
                        />
                        <Botao tamanho="pq" variante="secundario" className="w-fit" icone={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} onClick={fillGeneratedInitialPassword}>
                          Gerar senha segura
                        </Botao>
                      </Campo>
                    ) : null}
                  </div>
                ) : null}

                {error ? <Recado tom="erro">{error}</Recado> : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Botao type="submit" variante="primario" className="w-full sm:flex-1 max-md:h-11" carregando={saveMutation.isPending}>
                    {saveMutation.isPending ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar"}
                  </Botao>
                  {form.id ? (
                    <Botao variante="fantasma" className="max-md:h-11" onClick={resetForm}>
                      Cancelar
                    </Botao>
                  ) : null}
                </div>
              </form>
            </BlocoFolha>

            {useRemote && accessTarget ? (
              <BlocoFolha as="section" aria-labelledby="criar-acesso" respiro className="border-musgo">
                <h2 id="criar-acesso" className="flex items-center gap-2 text-base font-bold leading-6 text-tinta">
                  <KeyRound className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                  Criar acesso
                </h2>
                <form className="mt-4 grid gap-4" onSubmit={submitAccess}>
                  <div className="min-w-0 rounded-bloco bg-saber px-4 py-3">
                    <p className="truncate text-sm font-bold leading-5 text-tinta">{accessTarget.nome}</p>
                    <p className="truncate text-[13px] font-medium leading-5 text-tinta-2">{accessTarget.email}</p>
                    <p className={cn(RUBRICA, "mt-1")}>{cargoLabels[accessTarget.cargo]}</p>
                  </div>
                  <Campo id="access-password" rotulo="Senha inicial">
                    <CampoTexto
                      id="access-password"
                      type="text"
                      minLength={12}
                      autoComplete="new-password"
                      value={accessPassword}
                      placeholder="mínimo 12 caracteres"
                      className="font-mono"
                      onChange={(event) => setAccessPassword(event.target.value)}
                    />
                    <Botao tamanho="pq" variante="secundario" className="w-fit" icone={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} onClick={fillGeneratedAccessPassword}>
                      Gerar senha segura
                    </Botao>
                  </Campo>

                  {accessError ? <Recado tom="erro">{accessError}</Recado> : null}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Botao type="submit" variante="primario" className="w-full sm:flex-1 max-md:h-11" carregando={accessMutation.isPending}>
                      {accessMutation.isPending ? "Criando..." : "Ativar login"}
                    </Botao>
                    <Botao variante="fantasma" className="max-md:h-11" onClick={closeAccess}>
                      Cancelar
                    </Botao>
                  </div>
                </form>
              </BlocoFolha>
            ) : null}
          </div>

          <BlocoFolha as="section" aria-labelledby="equipe-lista" className="min-w-0 overflow-hidden lg:col-start-1 lg:row-start-1">
            <CabecaDaFolha
              id="equipe-lista"
              icone={<UsersRound />}
              titulo="Equipe"
              resumo={contagem(sortedColaboradores.length, "pessoa", "pessoas")}
              acoes={
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {(
                    [
                      { id: "ativos", label: "Ativos" },
                      { id: "desligados", label: "Desligados" },
                      { id: "todos", label: "Todos" },
                    ] as const
                  ).map((filter) => (
                    <Leitura
                      key={filter.id}
                      ativa={statusFilter === filter.id}
                      rotulo={filter.label}
                      numero={contagemPorLeitura[filter.id]}
                      onClick={() => setStatusFilter(filter.id)}
                    />
                  ))}
                </div>
              }
            />
            <div className="border-t border-fio px-6 py-3 max-md:px-4">
              <CampoBusca valor={query} onMudar={setQuery} placeholder="Buscar por nome, e-mail ou cargo" rotulo="Buscar colaborador" />
            </div>

            {sortedColaboradores.length ? (
              <ul>
                {sortedColaboradores.map((colaborador) => {
                  const emEdicao = form.id === colaborador.id;
                  return (
                    <li
                      key={colaborador.id}
                      className={cn(
                        "flex flex-col gap-3 border-t border-fio px-6 py-4 transition-colors duration-150 ease-papel max-md:px-4 xl:flex-row xl:items-center xl:justify-between",
                        emEdicao && "bg-saber shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]",
                      )}
                    >
                      <div className={cn("flex min-w-0 items-center gap-3", !colaborador.ativo && "opacity-70")}>
                        <AvatarBadge pessoaId={colaborador.id} nome={nomeParaInicial(colaborador.nome)} className="h-10 w-10" />
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-bold leading-6 text-tinta">{colaborador.nome}</p>
                          <p className="truncate text-[13px] font-medium leading-5 text-tinta-2">{colaborador.email}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <Etiqueta>{cargoLabels[colaborador.cargo]}</Etiqueta>
                            <Etiqueta>{cargoGroup(colaborador.cargo)}</Etiqueta>
                            {!colaborador.ativo ? <Etiqueta>Desligado</Etiqueta> : null}
                            {useRemote ? (
                              colaborador.ativo && colaborador.auth_id ? (
                                <Etiqueta tom="ok">Acesso ativo</Etiqueta>
                              ) : (
                                <Etiqueta tom={colaborador.ativo ? "atencao" : "neutro"}>Sem acesso</Etiqueta>
                              )
                            ) : null}
                            {emEdicao ? <Etiqueta tom="musgo">em edição</Etiqueta> : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                        {useRemote && colaborador.ativo && !colaborador.auth_id ? (
                          <Botao tamanho="pq" variante="suave" className="max-md:h-10" icone={<KeyRound className="h-4 w-4" aria-hidden="true" />} onClick={() => openAccess(colaborador)}>
                            Criar acesso
                          </Botao>
                        ) : null}
                        {colaborador.ativo ? (
                          <>
                            <Botao tamanho="pq" variante="secundario" className="max-md:h-10" onClick={() => edit(colaborador)}>
                              Editar
                            </Botao>
                            <LinkSeta to={`/administracao/colaboradores/${colaborador.id}`} className="px-1 text-[13px]">
                              Perfil
                            </LinkSeta>
                            <Botao
                              tamanho="pq"
                              variante="perigo"
                              className="max-md:h-10 xl:ml-2"
                              disabled={deactivateMutation.isPending || colaborador.id === pessoa?.id}
                              icone={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                              onClick={() => deactivate(colaborador)}
                            >
                              Desligar
                            </Botao>
                          </>
                        ) : (
                          <>
                            <LinkSeta to={`/administracao/colaboradores/${colaborador.id}`} className="px-1 text-[13px]">
                              Perfil
                            </LinkSeta>
                            <Botao
                              tamanho="pq"
                              variante="secundario"
                              className="max-md:h-10"
                              disabled={reactivateMutation.isPending}
                              icone={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
                              onClick={() => reactivate(colaborador)}
                            >
                              Reativar
                            </Botao>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Vazio icone={<UsersRound />} titulo={query.trim() ? "Ninguém com esse nome, e-mail ou cargo." : "Ninguém nesta leitura."} className="border-t border-fio">
                {query.trim() ? "Confira a grafia ou troque a leitura (Ativos, Desligados, Todos)." : "Troque a leitura acima para ver as outras pessoas."}
              </Vazio>
            )}
            <p className={cn(AJUDA, "border-t border-fio px-6 py-3 max-md:px-4")}>
              O cargo alimenta a matriz de acesso da interface e as políticas de segurança do banco (RLS do Supabase).
            </p>
          </BlocoFolha>
        </div>
      </div>
    </AccessGate>
  );
}
