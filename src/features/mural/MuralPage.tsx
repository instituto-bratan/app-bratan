// MURAL — redesenho "Papel & Musgo", etapa 4 (08/10/2026).
//
// O que a tela FAZ não mudou: a coordenação (canPublishMural) publica um aviso
// de 8 a 420 letras, Informativo ou Importante, e arquiva; o resto da equipe só
// lê. Com login, os avisos vêm do banco (listRemoteAvisos/publish/archive); na
// prévia, do aparelho (muralStorageKey). Mudou a forma: um Cabecalho com a frase
// que conta os avisos (o selo técnico "Supabase" no lugar do número saiu); os
// avisos para LER num bloco "saber", em lista, com a data em palavras ("hoje,
// 09:12"); o publicar — a decisão — numa folha ao lado. Sem vidro, sem animação
// de entrada, sem as cores com opacidade que não geravam CSS.
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Info, Megaphone, Newspaper, Send, TriangleAlert } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { Campo, CampoArea, Recado } from "@/features/compras/pecas";
import { EstadoVazio, Rubrica } from "@/features/pops/pecasDaEquipe";
import { useAuth } from "@/hooks/useAuth";
import { canPublishMural } from "@/lib/access";
import { readLocalValue, writeLocalValue } from "@/lib/localStore";
import { archiveRemoteAviso, listRemoteAvisos, publishRemoteAviso } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type { PrioridadeAviso } from "@/types/database";
import { activeAvisos as getActiveAvisos, fraseDoMural, initialAvisos, muralStorageKey, quandoFoiPublicado, type Aviso } from "./muralData";

const LIMITE_DO_AVISO = 420;

const muralSchema = z.object({
  corpo: z.string().min(8, "Escreva um aviso um pouco mais completo.").max(LIMITE_DO_AVISO, "Use até 420 caracteres."),
  prioridade: z.enum(["info", "importante"]),
});

type MuralForm = z.infer<typeof muralSchema>;

const PRIORIDADES: { valor: PrioridadeAviso; rotulo: string; ajuda: string }[] = [
  { valor: "info", rotulo: "Informativo", ajuda: "Para saber" },
  { valor: "importante", rotulo: "Importante", ajuda: "Pede atenção" },
];

export function MuralPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const canPublish = canPublishMural(pessoa?.cargo);
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [localAvisos, setLocalAvisos] = useState<Aviso[]>(() => readLocalValue(muralStorageKey, initialAvisos));
  const avisosQuery = useQuery({
    queryKey: ["avisos"],
    queryFn: listRemoteAvisos,
    enabled: useRemote,
  });
  const publishMutation = useMutation({
    mutationFn: publishRemoteAviso,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["avisos"] }),
  });
  const archiveMutation = useMutation({
    mutationFn: archiveRemoteAviso,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["avisos"] }),
  });
  const avisos = useRemote ? avisosQuery.data ?? [] : localAvisos;
  const activeAvisos = getActiveAvisos(avisos);
  const carregando = useRemote && avisosQuery.isLoading;

  const form = useForm<MuralForm>({
    resolver: zodResolver(muralSchema),
    defaultValues: {
      corpo: "",
      prioridade: "info",
    },
  });

  function persist(nextAvisos: Aviso[]) {
    setLocalAvisos(nextAvisos);
    writeLocalValue(muralStorageKey, nextAvisos);
  }

  async function publish(values: MuralForm) {
    if (useRemote && pessoa) {
      await publishMutation.mutateAsync({
        pessoa,
        corpo: values.corpo,
        prioridade: values.prioridade,
      });
      form.reset({ corpo: "", prioridade: "info" });
      return;
    }

    const nextAviso: Aviso = {
      id: `aviso-${crypto.randomUUID?.() ?? Date.now()}`,
      corpo: values.corpo,
      prioridade: values.prioridade,
      autor: pessoa?.nome ?? "Gestor",
      publicadoEm: new Date().toISOString(),
    };

    persist([nextAviso, ...avisos]);
    form.reset({ corpo: "", prioridade: "info" });
  }

  async function archive(id: string) {
    if (useRemote) {
      await archiveMutation.mutateAsync(id);
      return;
    }

    persist(avisos.map((aviso) => (aviso.id === id ? { ...aviso, deletedAt: new Date().toISOString() } : aviso)));
  }

  const frase = fraseDoMural(avisos);
  const corpo = form.watch("corpo") ?? "";
  const prioridade = form.watch("prioridade");
  const erroDoCorpo = form.formState.errors.corpo?.message;

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Equipe"
        titulo="Mural"
        frase={
          carregando ? (
            "Lendo o mural…"
          ) : (
            <>
              {frase.destaque ? <strong>{frase.destaque}</strong> : null}
              {frase.destaque ? frase.resto : frase.resto.trim()} A coordenação publica; a equipe lê aqui, sem depender do WhatsApp.
            </>
          )
        }
      />

      {avisosQuery.isError ? (
        <Recado tom="erro" role="alert" icone={<TriangleAlert className="text-erro" aria-hidden="true" />}>
          <strong>Não foi possível carregar o mural.</strong> Tente de novo em instantes; se continuar, peça à gestão para conferir o seu cargo.
        </Recado>
      ) : null}

      <div className="grid items-start gap-8 max-md:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* O publicar vem primeiro no celular (é a ação de quem coordena); no computador, ao lado. */}
        <div className="grid min-w-0 gap-4 xl:order-2">
          {canPublish ? (
            <BlocoFolha as="section" respiro aria-labelledby="mural-publicar">
              <h2 id="mural-publicar" className="flex items-center gap-2 text-base font-bold leading-6 text-tinta">
                <Megaphone className="h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
                Publicar aviso
              </h2>
              <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">Toda a equipe vê o aviso assim que ele sai.</p>
              <form className="mt-5 grid gap-5" onSubmit={form.handleSubmit(publish)} noValidate>
                <Campo id="corpo" rotulo="Mensagem">
                  <CampoArea
                    id="corpo"
                    rows={5}
                    maxLength={LIMITE_DO_AVISO + 80}
                    aria-invalid={erroDoCorpo ? true : undefined}
                    aria-describedby="mural-corpo-ajuda"
                    className="min-h-[132px]"
                    placeholder="Escreva um aviso claro para a equipe..."
                    {...form.register("corpo")}
                  />
                  <p id="mural-corpo-ajuda" className="flex items-start justify-between gap-3 text-[13px] font-medium leading-5 text-tinta-2">
                    {erroDoCorpo ? (
                      <span className="inline-flex items-start gap-1 font-bold text-erro">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {erroDoCorpo}
                      </span>
                    ) : (
                      <span>De 8 a 420 letras.</span>
                    )}
                    <span className={cn("shrink-0 tabular-nums", corpo.length > LIMITE_DO_AVISO && "font-bold text-erro")}>
                      {corpo.length} de {LIMITE_DO_AVISO}
                    </span>
                  </p>
                </Campo>

                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-[13px] font-bold leading-5 text-tinta">Prioridade</legend>
                  <div className="grid grid-cols-2 gap-1 rounded-controle bg-saber p-1">
                    {PRIORIDADES.map((opcao) => (
                      <label
                        key={opcao.valor}
                        className={cn(
                          "flex min-h-10 cursor-pointer flex-col items-center justify-center rounded-[4px] px-3 py-1.5 text-center transition-colors duration-150 ease-papel max-md:min-h-11",
                          "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foco",
                          prioridade === opcao.valor ? "bg-folha text-tinta shadow-[0_0_0_1px_rgb(var(--fio-2-rgb))]" : "text-tinta-2 hover:text-tinta",
                        )}
                      >
                        <input type="radio" value={opcao.valor} className="sr-only" {...form.register("prioridade")} />
                        <span className="text-sm font-bold leading-5">{opcao.rotulo}</span>
                        <span className="text-xs font-medium leading-4 text-tinta-2">{opcao.ajuda}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <Botao
                  type="submit"
                  variante="primario"
                  bloco
                  carregando={publishMutation.isPending}
                  disabled={form.formState.isSubmitting}
                  icone={<Send className="h-4 w-4" aria-hidden="true" />}
                  className="max-md:h-11"
                >
                  {publishMutation.isPending ? "Publicando..." : "Publicar aviso"}
                </Botao>
              </form>
            </BlocoFolha>
          ) : (
            <Recado tom="neutro" role="status" icone={<Info className="stroke-oliva" aria-hidden="true" />}>
              Você está em modo leitura. Novos avisos são publicados pela coordenação.
            </Recado>
          )}
        </div>

        <BlocoSaber as="section" aria-labelledby="mural-avisos" className="min-w-0 p-0 max-md:p-0 xl:order-1">
          <div className="flex items-baseline justify-between gap-3 px-6 pb-2 pt-5 max-md:px-4 max-md:pt-4">
            <Rubrica id="mural-avisos">Avisos no ar</Rubrica>
            {activeAvisos.length ? (
              <span className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                {activeAvisos.length === 1 ? "1 aviso" : `${activeAvisos.length} avisos`} · o mais novo primeiro
              </span>
            ) : null}
          </div>

          {carregando ? (
            <ul aria-busy="true" aria-label="Carregando os avisos">
              {[0, 1, 2].map((i) => (
                <li key={i} className="grid gap-2 border-t border-fio px-6 py-5 max-md:px-4">
                  <span className="h-3 w-40 rounded-sm bg-fio motion-safe:animate-pulse" />
                  <span className="h-4 w-full rounded-sm bg-fio motion-safe:animate-pulse" />
                  <span className="h-4 w-2/3 rounded-sm bg-fio motion-safe:animate-pulse" />
                </li>
              ))}
            </ul>
          ) : activeAvisos.length === 0 ? (
            <EstadoVazio icone={<Newspaper aria-hidden="true" />} titulo="Nenhum aviso no mural" className="border-t border-fio">
              {canPublish
                ? "Quando você publicar um comunicado, ele aparece aqui para toda a equipe."
                : "Quando a coordenação publicar um comunicado, ele aparece aqui."}
            </EstadoVazio>
          ) : (
            <ul>
              {activeAvisos.map((aviso) => (
                <li key={aviso.id} className="grid gap-2 border-t border-fio px-6 py-5 max-md:px-4 max-md:py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <EtiquetaDaPrioridade prioridade={aviso.prioridade} />
                    <span className="text-[13px] font-semibold leading-5 text-tinta-2">
                      {aviso.autor}
                      <span aria-hidden="true" className="px-1.5 text-fio-2">
                        ·
                      </span>
                      <time dateTime={aviso.publicadoEm} title={new Date(aviso.publicadoEm).toLocaleString("pt-BR")} className="tabular-nums">
                        {quandoFoiPublicado(aviso.publicadoEm)}
                      </time>
                    </span>
                    {canPublish ? (
                      <Botao
                        variante="fantasma"
                        tamanho="pq"
                        disabled={archiveMutation.isPending}
                        onClick={() => archive(aviso.id)}
                        icone={<Archive className="h-4 w-4" aria-hidden="true" />}
                        className="ml-auto max-md:h-11"
                      >
                        Arquivar
                      </Botao>
                    ) : null}
                  </div>
                  <p className="max-w-[68ch] whitespace-pre-line text-base font-medium leading-7 text-tinta [overflow-wrap:anywhere]">{aviso.corpo}</p>
                </li>
              ))}
            </ul>
          )}
        </BlocoSaber>
      </div>
    </div>
  );
}

/** Importante pede atenção (laranja, com ícone); Informativo fica neutro. A palavra sempre vai junto. */
function EtiquetaDaPrioridade({ prioridade }: { prioridade: PrioridadeAviso }) {
  const importante = prioridade === "importante";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-controle px-2 text-xs font-bold leading-5",
        importante ? "bg-atencao-claro text-atencao" : "bg-folha text-tinta-2 shadow-[inset_0_0_0_1px_rgb(var(--fio-2-rgb))]",
      )}
    >
      {importante ? <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" /> : null}
      {importante ? "Importante" : "Informativo"}
    </span>
  );
}
