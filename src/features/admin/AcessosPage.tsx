import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronDown, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
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

const levelOptions: (AccessLevel | "PADRAO")[] = ["PADRAO", "OCULTO", "VER", "EDITAR"];

const levelTone: Record<AccessLevel | "PADRAO", string> = {
  PADRAO: "border-brand-oliva/25 bg-white/70 text-brand-tinta",
  OCULTO: "border-red-300 bg-red-50 text-red-800",
  VER: "border-sky-300 bg-sky-50 text-sky-800",
  EDITAR: "border-emerald-300 bg-emerald-50 text-emerald-800",
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

  function setLevel(module: ModuleKey, level: AccessLevel | "PADRAO") {
    setDraft((current) => {
      const next = { ...current };
      if (level === "PADRAO") delete next[module];
      else next[module] = level;
      return next;
    });
  }

  return (
    <Card className={cn("border-brand-oliva/16 bg-white/60", !pessoa.ativo && "opacity-60")}>
      <CardHeader className="pb-2">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{pessoa.nome}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {cargoLabels[pessoa.cargo]}
              {!pessoa.ativo ? " · inativo" : ""}
              {overrides ? ` · ${overrides} exceção${overrides > 1 ? "ões" : ""}` : " · padrão do cargo"}
            </p>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-brand-oliva transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </CardHeader>
      {open ? (
        <CardContent className="grid gap-1.5">
          {moduleKeys.map((module) => {
            const padrao = cargoDefaultLevelFor(pessoa.cargo, module);
            const selected = (draft[module] as AccessLevel | undefined) ?? "PADRAO";
            return (
              <div key={module} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/12 bg-white/55 px-3 py-1.5">
                <p className="min-w-0 flex-1 truncate text-sm text-brand-tinta">{moduleLabels[module]}</p>
                <div className="flex shrink-0 gap-1">
                  {levelOptions.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setLevel(module, level)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                        selected === level ? levelTone[level] : "border-transparent bg-transparent text-muted-foreground hover:bg-brand-creme/50",
                      )}
                      title={level === "PADRAO" ? `Padrão do cargo: ${accessLevelLabels[padrao]}` : accessLevelLabels[level as AccessLevel]}
                    >
                      {level === "PADRAO" ? `Padrão (${accessLevelLabels[padrao].toLowerCase()})` : accessLevelLabels[level as AccessLevel]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <LiquidButton type="button" size="sm" className="h-9 px-4" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Salvando…" : "Salvar acessos"}
            </LiquidButton>
            <Button type="button" variant="ghost" size="sm" disabled={!overrides} onClick={() => setDraft({})}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Voltar tudo ao padrão do cargo
            </Button>
            {dirty ? <span className="text-xs font-semibold text-amber-700">alterações não salvas</span> : null}
          </div>
        </CardContent>
      ) : null}
    </Card>
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

  return (
    <AccessGate allowed={canManageAcessos} label="Administração · Acessos">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <Badge variant="gold">Administração</Badge>
          <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
            Acessos por pessoa
            <InfoTip title="Como funciona?">
              O CARGO dá o acesso padrão de cada tela. Aqui você grava EXCEÇÕES por pessoa: Sem acesso (a tela some do menu),
              Só vê (abre mas não edita — nas telas do Financeiro) ou Vê e edita. "Padrão" volta a seguir o cargo. As
              mudanças valem quando a pessoa recarregar o app. Esta tela é exclusiva do Lucas, do Dr. Daniel e da CEO —
              fixo, para ninguém se trancar fora.
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Escolha a pessoa, ajuste tela por tela e salve. O que não tiver exceção segue o padrão do cargo.
          </p>
        </motion.section>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        {colaboradoresQuery.isLoading && !isPreview ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando colaboradores…</p>
        ) : colaboradoresQuery.isError && !isPreview ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Não consegui carregar a equipe — confira a conexão e recarregue.
          </div>
        ) : colaboradores.length ? (
          <div className="grid gap-2">
            {colaboradores.map((item) => (
              <PessoaAcessos key={item.id} pessoa={item} editorId={pessoa?.id ?? null} onSaved={setFeedback} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum colaborador ativo encontrado.</p>
        )}

        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          A interface esconde e trava conforme o que você define aqui; a segurança de dados profunda continua nas políticas
          RLS do Supabase por cargo.
        </p>
      </div>
    </AccessGate>
  );
}

export default AcessosPage;
