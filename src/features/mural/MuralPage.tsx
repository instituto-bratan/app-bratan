import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Archive, Megaphone, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canPublishMural } from "@/lib/access";
import { formatShortTime, readLocalValue, writeLocalValue } from "@/lib/localStore";
import { archiveRemoteAviso, listRemoteAvisos, publishRemoteAviso } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import type { PrioridadeAviso } from "@/types/database";
import { activeAvisos as getActiveAvisos, initialAvisos, muralStorageKey, type Aviso } from "./muralData";

const muralSchema = z.object({
  corpo: z.string().min(8, "Escreva um aviso um pouco mais completo.").max(420, "Use até 420 caracteres."),
  prioridade: z.enum(["info", "importante"]),
});

type MuralForm = z.infer<typeof muralSchema>;

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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="gold" className="mb-4">Comunicação de 1 via</Badge>
            <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Mural de avisos</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Coordenação publica comunicados claros. A equipe acompanha tudo sem depender do ruído do WhatsApp.
            </p>
          </div>
          <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3">
            <p className="text-2xl font-bold text-brand-musgo">{activeAvisos.length}</p>
            <p className="text-xs font-semibold uppercase text-brand-oliva">{useRemote ? "Supabase" : "avisos ativos"}</p>
          </div>
        </div>
      </motion.section>

      {avisosQuery.isError ? (
        <Card className="border-destructive/30 bg-destructive/5 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-destructive">
              Não foi possível carregar o mural do Supabase. Aplique as migrations e confira o cargo do usuário.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {canPublish ? (
        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
              Publicar aviso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit(publish)}>
              <div className="space-y-2">
                <Label htmlFor="corpo">Mensagem</Label>
                <textarea
                  id="corpo"
                  rows={4}
                  className="min-h-28 w-full resize-none rounded-lg border border-input bg-white/80 px-3 py-3 text-sm leading-6 text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Escreva um aviso claro para a equipe..."
                  {...form.register("corpo")}
                />
                {form.formState.errors.corpo ? (
                  <p className="text-sm text-destructive">{form.formState.errors.corpo.message}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <div className="grid grid-cols-2 rounded-lg border border-brand-oliva/20 bg-brand-papel p-1">
                    {(["info", "importante"] as PrioridadeAviso[]).map((prioridade) => (
                      <button
                        key={prioridade}
                        type="button"
                        onClick={() => form.setValue("prioridade", prioridade, { shouldDirty: true })}
                        className={cn(
                          "rounded-md px-4 py-2 text-sm font-semibold capitalize transition",
                          form.watch("prioridade") === prioridade
                            ? "bg-white text-brand-musgo shadow-sm"
                            : "text-muted-foreground hover:text-brand-tinta",
                        )}
                      >
                        {prioridade === "info" ? "Informativo" : "Importante"}
                      </button>
                    ))}
                  </div>
                </div>
                <LiquidButton type="submit" size="lg" disabled={form.formState.isSubmitting || publishMutation.isPending}>
                  {publishMutation.isPending ? "Publicando..." : "Publicar aviso"}
                  <Send className="ml-2 h-4 w-4" aria-hidden="true" />
                </LiquidButton>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-brand-oliva/20 bg-white/60 shadow-none backdrop-blur">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-brand-musgo">
              Você está em modo leitura. Novos avisos são publicados pela coordenação.
            </p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-4">
        {activeAvisos.map((aviso, index) => (
          <motion.article
            key={aviso.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
          >
            <Card
              className={cn(
                "border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur",
                aviso.prioridade === "importante" && "border-brand-dourado/60 bg-brand-creme/45",
              )}
            >
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge variant={aviso.prioridade === "importante" ? "gold" : "muted"}>
                        {aviso.prioridade === "importante" ? "Importante" : "Informativo"}
                      </Badge>
                      <span className="text-xs font-semibold uppercase text-brand-oliva">
                        {aviso.autor} · {formatShortTime(aviso.publicadoEm)}
                      </span>
                    </div>
                    <p className="text-base leading-7 text-brand-tinta">{aviso.corpo}</p>
                  </div>
                  {canPublish ? (
                    <Button type="button" variant="ghost" size="sm" disabled={archiveMutation.isPending} onClick={() => archive(aviso.id)}>
                      <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                      Arquivar
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </motion.article>
        ))}
      </section>
    </div>
  );
}
