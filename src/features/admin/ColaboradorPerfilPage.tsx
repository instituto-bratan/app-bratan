// PERFIL DO COLABORADOR — redesenho Papel & Musgo, etapa 4 (08/10/2026).
//
// Só leitura: o login, as datas do cadastro e o que o CARGO libera. Mudou a
// forma: um cabeçalho com o nome e a frase do cargo, o acesso num bloco de
// leitura (saber) e as permissões do cargo numa lista (itens do mesmo tipo em
// lista, não em cartões). Editar e criar acesso continuam em Colaboradores.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Cabecalho, LinkSeta, botaoClasses } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, cargoGroup, cargoLabels, seededColaboradores } from "@/lib/access";
import { readLocalValue } from "@/lib/localStore";
import { listRemoteColaboradores } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { accessMatrix, allowedModuleCount, colaboradoresStorageKey } from "./colaboradoresData";
import { CabecaDaFolha, Etiqueta, RUBRICA, Recado, TituloDoSaber, Vazio } from "./pecasAjustes";

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

  const voltar = (
    <Link to="/administracao/colaboradores" className={cn(botaoClasses({ variante: "fantasma", tamanho: "pq" }), "w-fit -ml-3 max-md:h-10")}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar para colaboradores
    </Link>
  );

  const liberados = colaborador ? allowedModuleCount(colaborador.cargo) : 0;

  return (
    <AccessGate allowed={canAdministracao} label="Perfil do colaborador">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <div className="grid gap-4">
          {voltar}
          {colaboradoresQuery.isError ? (
            <Recado tom="erro">Não foi possível carregar este perfil do Supabase. Confira RLS e vínculo do usuário.</Recado>
          ) : null}
          <Cabecalho
            className="mb-0 max-md:mb-0"
            sobrancelha={colaborador ? "Ajustes · Perfil" : "Ajustes · Colaboradores"}
            titulo={colaborador ? colaborador.nome : "Perfil não encontrado"}
            frase={
              colaborador ? (
                <>
                  <strong>{cargoLabels[colaborador.cargo]}</strong> ({cargoGroup(colaborador.cargo).toLowerCase()}) · {colaborador.email}. O cargo libera{" "}
                  <strong>
                    {liberados} de {accessMatrix.length}
                  </strong>{" "}
                  áreas do app.
                </>
              ) : (
                "O colaborador pode ter sido removido ou ainda não foi carregado."
              )
            }
          />
        </div>

        {!colaborador ? (
          <BlocoSaber>
            <Vazio icone={<UserRound />} titulo="Nada para mostrar aqui.">
              Volte para a lista de colaboradores e abra o perfil de novo.
            </Vazio>
          </BlocoSaber>
        ) : (
          <div className="grid items-start gap-8 max-md:gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
            <BlocoSaber as="aside" aria-labelledby="perfil-acesso" className="grid gap-5">
              <TituloDoSaber id="perfil-acesso" className="mb-0">
                Acesso
              </TituloDoSaber>
              <div>
                <p className={RUBRICA}>Login</p>
                <p className="mt-2 flex items-center gap-2 text-[15px] font-bold leading-6 text-tinta">
                  {colaborador.auth_id ? (
                    <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden="true" />
                  ) : (
                    <LockKeyhole className="h-4 w-4 text-atencao" aria-hidden="true" />
                  )}
                  {colaborador.auth_id ? "Acesso ativo" : "Sem acesso criado"}
                </p>
              </div>
              <div className="border-t border-fio pt-4">
                <p className={RUBRICA}>Cadastro</p>
                <p className="mt-2 text-sm font-medium leading-6 text-tinta-2">
                  Criado em <span className="tabular-nums text-tinta">{formatDateTime(colaborador.created_at)}</span>
                </p>
                <p className="text-sm font-medium leading-6 text-tinta-2">
                  Atualizado em <span className="tabular-nums text-tinta">{formatDateTime(colaborador.updated_at)}</span>
                </p>
              </div>
              <LinkSeta to="/administracao/colaboradores">Editar dados ou criar acesso</LinkSeta>
              <p className="border-t border-fio pt-4 text-[13px] font-medium leading-5 text-tinta-2">
                <span className={cn(RUBRICA, "mb-1 block")}>Regra operacional</span>
                A coordenação cadastra colaboradores nesta área. A segurança real continua nas políticas RLS do Supabase.
              </p>
            </BlocoSaber>

            <BlocoFolha as="section" aria-labelledby="perfil-permissoes" className="min-w-0 overflow-hidden">
              <CabecaDaFolha id="perfil-permissoes" icone={<ShieldCheck />} titulo="Permissões do cargo" resumo={`${liberados} liberadas`} />
              <ul>
                {accessMatrix.map((item) => {
                  const allowed = item.allowed(colaborador.cargo);

                  return (
                    <li key={item.label} className="flex items-start gap-3 border-t border-fio px-6 py-3.5 max-md:px-4">
                      {allowed ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
                      ) : (
                        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm font-bold leading-5", allowed ? "text-tinta" : "text-tinta-2")}>{item.label}</p>
                        <p className="mt-0.5 text-[13px] font-medium leading-5 text-tinta-2">{item.description}</p>
                      </div>
                      <Etiqueta tom={allowed ? "ok" : "neutro"}>{allowed ? "Liberado" : "Bloqueado"}</Etiqueta>
                    </li>
                  );
                })}
              </ul>
            </BlocoFolha>
          </div>
        )}
      </div>
    </AccessGate>
  );
}
