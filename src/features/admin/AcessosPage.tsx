// ACESSOS POR PESSOA (23/07/2026) — redesenho Papel & Musgo, etapa 4 (08/10/2026).
//
// O CARGO dá o acesso padrão de cada tela; aqui se gravam as EXCEÇÕES por pessoa
// (Sem acesso · Só vê · Vê e edita; "Padrão" volta a seguir o cargo). A tela é
// exclusiva de quem gerencia acessos (Lucas, Dr. Daniel, CEO — canManageAcessos,
// fixo por cargo para ninguém se trancar fora). No redesenho mudou só a forma:
// cabeçalho da fundação, a lista de pessoas numa folha (itens do mesmo tipo em
// lista, não em cartões) e o seletor de nível como um controle segmentado. As
// regras, os níveis, o que se grava (saveRemoteColaboradorAcessos) e os textos
// continuam os mesmos.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LockKeyhole, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, Botao, Cabecalho } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import {
  accessLevelLabels,
  canManageAcessos,
  cargoDefaultLevelFor,
  cargoLabels,
  moduleKeys,
  moduleLabels,
  seededColaboradores,
  type AccessLevel,
  type ModuleKey,
} from "@/lib/access";
import { listRemoteColaboradores, saveRemoteColaboradorAcessos } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type { Colaborador } from "@/types/database";
import { contagem, pessoasComExcecao, textoDasExcecoes } from "./frasesAjustes";
import { CabecaDaFolha, Etiqueta, Recado, Vazio, TituloComDica } from "./pecasAjustes";

const levelOptions: (AccessLevel | "PADRAO")[] = ["PADRAO", "OCULTO", "VER", "EDITAR"];

// A opção escolhida ganha o tom do nível — sempre com a palavra ao lado (a cor
// nunca fala sozinha): Padrão em musgo, Sem acesso em erro, Só vê em folha com
// fio firme, Vê e edita em ok.
const levelTone: Record<AccessLevel | "PADRAO", string> = {
  PADRAO: "bg-musgo-claro text-musgo shadow-[inset_0_0_0_1px_rgb(var(--musgo-rgb))]",
  OCULTO: "bg-erro-claro text-erro shadow-[inset_0_0_0_1px_rgb(var(--erro-rgb))]",
  VER: "bg-folha text-tinta shadow-[inset_0_0_0_1px_rgb(var(--borda-campo-rgb))]",
  EDITAR: "bg-ok-claro text-ok shadow-[inset_0_0_0_1px_rgb(var(--ok-rgb))]",
};

// Um colaborador: grade de telas com o nível efetivo + exceções editáveis.
function PessoaAcessos({
  pessoa,
  editorId,
  onSaved,
}: {
  pessoa: Colaborador;
  editorId: string | null;
  onSaved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...(pessoa.acessos ?? {}) }));
  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: () => saveRemoteColaboradorAcessos(pessoa.id, draft, editorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-colaboradores-acessos"] });
      onSaved(`Acessos de ${pessoa.nome} salvos — valem no próximo carregamento do app da pessoa.`);
    },
    onError: () => onSaved(`Não consegui salvar os acessos de ${pessoa.nome} — tente de novo.`),
  });

  const overrides = Object.keys(draft).length;
  const dirty = JSON.stringify(draft) !== JSON.stringify(pessoa.acessos ?? {});
  const idDaGrade = `acessos-${pessoa.id}`;

  function setLevel(module: ModuleKey, level: AccessLevel | "PADRAO") {
    setDraft((current) => {
      const next = { ...current };
      if (level === "PADRAO") delete next[module];
      else next[module] = level;
      return next;
    });
  }

  return (
    <li className={cn("border-t border-fio first:border-t-0", !pessoa.ativo && "text-tinta-2", open && "bg-papel")}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors duration-150 ease-papel hover:bg-saber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco max-md:px-4"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={idDaGrade}
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold leading-6 text-tinta">{pessoa.nome}</span>
          <span className="mt-0.5 block text-[13px] font-medium leading-5 text-tinta-2">
            {cargoLabels[pessoa.cargo]}
            {!pessoa.ativo ? " · inativo" : ""}
            {` · ${textoDasExcecoes(overrides)}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {dirty ? <Etiqueta tom="atencao">não salvo</Etiqueta> : overrides ? <Etiqueta tom="musgo">{textoDasExcecoes(overrides)}</Etiqueta> : null}
          <ChevronDown className={cn("h-4 w-4 text-tinta-2 transition-transform duration-150 ease-papel", open && "rotate-180")} aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <div id={idDaGrade} className="grid gap-4 px-6 pb-6 max-md:px-4 max-md:pb-4">
          <ul className="overflow-hidden rounded-bloco border border-fio bg-folha">
            {moduleKeys.map((module) => {
              const padrao = cargoDefaultLevelFor(pessoa.cargo, module);
              const selected = (draft[module] as AccessLevel | undefined) ?? "PADRAO";
              return (
                <li
                  key={module}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-fio px-4 py-2.5 first:border-t-0 max-md:px-3"
                >
                  <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-tinta">{moduleLabels[module]}</p>
                  <div
                    role="group"
                    aria-label={`Nível de ${pessoa.nome} em ${moduleLabels[module]}`}
                    className="grid shrink-0 grid-cols-2 gap-1 rounded-controle bg-saber p-0.5 max-md:w-full sm:flex"
                  >
                    {levelOptions.map((level) => (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={selected === level}
                        onClick={() => setLevel(module, level)}
                        className={cn(
                          "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[5px] px-2.5 font-sans text-[13px] leading-5 transition-colors duration-150 ease-papel max-md:h-10",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco",
                          selected === level ? cn("font-bold", levelTone[level]) : "font-semibold text-tinta-2 hover:bg-folha hover:text-tinta",
                        )}
                        title={level === "PADRAO" ? `Padrão do cargo: ${accessLevelLabels[padrao]}` : accessLevelLabels[level as AccessLevel]}
                      >
                        {level === "PADRAO" ? `Padrão (${accessLevelLabels[padrao].toLowerCase()})` : accessLevelLabels[level as AccessLevel]}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Botao variante="primario" disabled={!dirty} carregando={saveMutation.isPending} onClick={() => saveMutation.mutate()} className="max-md:h-11">
              {saveMutation.isPending ? "Salvando…" : "Salvar acessos"}
            </Botao>
            <Botao
              variante="fantasma"
              disabled={!overrides}
              onClick={() => setDraft({})}
              icone={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
              className="max-md:h-11"
            >
              Voltar tudo ao padrão do cargo
            </Botao>
            {dirty ? <span className="text-[13px] font-bold leading-5 text-atencao">alterações não salvas</span> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function AcessosPage() {
  const { pessoa, isPreview } = useAuth();
  const [feedback, setFeedback] = useState("");
  const colaboradoresQuery = useQuery({
    queryKey: ["admin-colaboradores-acessos"],
    queryFn: listRemoteColaboradores,
    retry: 1,
    enabled: !isPreview,
  });
  // Prévia local (sem banco): mostra a equipe-semente pra dar pra ver a grade.
  const colaboradores = useMemo(
    () => ((isPreview ? seededColaboradores : (colaboradoresQuery.data ?? [])) as Colaborador[]).filter((item) => item.ativo),
    [colaboradoresQuery.data, isPreview],
  );
  const comExcecao = pessoasComExcecao(colaboradores);
  // O recado de volta do salvar é uma frase só; a que começa por "Não consegui" é o erro.
  const feedbackDeErro = feedback.startsWith("Não consegui");

  const fraseDoTopo = (
    <>
      O cargo dá o acesso padrão de cada tela; aqui ficam as exceções por pessoa.{" "}
      {comExcecao ? (
        <>
          <strong>{contagem(comExcecao, "pessoa")}</strong> {comExcecao === 1 ? "tem" : "têm"} exceção hoje.
        </>
      ) : (
        <>Hoje ninguém tem exceção: todos seguem o cargo.</>
      )}
    </>
  );

  return (
    <AccessGate allowed={canManageAcessos} label="Administração · Acessos">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Ajustes"
          titulo={
            <TituloComDica
              texto="Acessos por pessoa"
              tituloDaDica="Como funciona?"
              dica={
                <>
                  O CARGO dá o acesso padrão de cada tela. Aqui você grava EXCEÇÕES por pessoa: Sem acesso (a tela some do menu),
                  Só vê (abre mas não edita — nas telas do Financeiro) ou Vê e edita. "Padrão" volta a seguir o cargo. As
                  mudanças valem quando a pessoa recarregar o app. Esta tela é exclusiva do Lucas, do Dr. Daniel e da CEO —
                  fixo, para ninguém se trancar fora.
                </>
              }
            />
          }
          frase={fraseDoTopo}
        />

        {feedback ? <Recado tom={feedbackDeErro ? "erro" : "ok"}>{feedback}</Recado> : null}

        {colaboradoresQuery.isLoading && !isPreview ? (
          <p role="status" className="rounded-bloco bg-saber px-4 py-6 text-center text-sm font-semibold text-tinta-2">
            Carregando colaboradores…
          </p>
        ) : colaboradoresQuery.isError && !isPreview ? (
          <Recado tom="erro" icone={<LockKeyhole aria-hidden="true" />}>
            Não consegui carregar a equipe — confira a conexão e recarregue.
          </Recado>
        ) : colaboradores.length ? (
          <BlocoFolha as="section" aria-labelledby="acessos-pessoas" className="overflow-hidden">
            <CabecaDaFolha
              id="acessos-pessoas"
              icone={<UsersRound />}
              titulo="Escolha a pessoa, ajuste tela por tela e salve"
              resumo={contagem(colaboradores.length, "pessoa ativa", "pessoas ativas")}
              className="border-b border-fio"
            />
            <ul>
              {colaboradores.map((item) => (
                <PessoaAcessos key={item.id} pessoa={item} editorId={pessoa?.id ?? null} onSaved={setFeedback} />
              ))}
            </ul>
          </BlocoFolha>
        ) : (
          <BlocoFolha>
            <Vazio icone={<UsersRound />} titulo="Nenhum colaborador ativo encontrado.">
              Cadastre a equipe em Colaboradores; quem estiver ativo aparece aqui.
            </Vazio>
          </BlocoFolha>
        )}

        <p className="flex items-start gap-2 text-[13px] font-medium leading-5 text-tinta-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
          A interface esconde e trava conforme o que você define aqui; a segurança de dados profunda continua nas políticas
          RLS do Supabase por cargo.
        </p>
      </div>
    </AccessGate>
  );
}

export default AcessosPage;
