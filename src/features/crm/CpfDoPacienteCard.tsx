// CPF DO PACIENTE (17/09/2026) — só para a nota fiscal sair identificada.
//
// Decisão do Lucas: guardar o CPF na ficha, porque a nota emitida sem tomador
// identificado tira do paciente o bilhete do sorteio da Nota do Milhão.
//
// Três cuidados que vêm junto com essa decisão, e que moram aqui:
// 1. O número fica em tabela separada (contato_documento), com permissão própria
//    — a ficha do contato é lida por quase todo mundo e pela função do portal.
// 2. Na tela ele aparece MASCARADO (123.***.***-45). O completo só quando
//    alguém pede para ver, e o botão diz o que está fazendo.
// 3. Dá para apagar. É dado pessoal: o paciente pode pedir para tirar, e quem
//    atende precisa conseguir fazer isso sem chamar ninguém.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, IdCard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { confirmar, toast } from "@/components/ui/avisos";
import { cpfEnquantoDigita, cpfFormatado, cpfMascarado, cpfValido, cpfDigitos } from "@/lib/cpf";
import { apagarRemoteCpfDoContato, lerRemoteCpfDoContato, salvarRemoteCpfDoContato } from "@/lib/remoteData";

export function CpfDoPacienteCard({ contactRef, pessoaId, ativo }: { contactRef: string; pessoaId: string | null; ativo: boolean }) {
  const queryClient = useQueryClient();
  const chave = ["contato-cpf", contactRef];
  const [rascunho, setRascunho] = useState("");
  const [editando, setEditando] = useState(false);
  const [mostrando, setMostrando] = useState(false);

  const guardado = useQuery({ queryKey: chave, queryFn: () => lerRemoteCpfDoContato(contactRef), enabled: ativo, staleTime: 60_000 });

  const salvar = useMutation({
    mutationFn: () => salvarRemoteCpfDoContato(contactRef, cpfDigitos(rascunho), pessoaId),
    onSuccess: () => {
      toast("CPF guardado. A nota deste paciente passa a sair identificada.", { tom: "ok" });
      setEditando(false);
      setRascunho("");
      void queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: () => toast("Não deu para guardar o CPF. Tente de novo.", { tom: "erro" }),
  });

  const apagar = useMutation({
    mutationFn: () => apagarRemoteCpfDoContato(contactRef),
    onSuccess: () => {
      toast("CPF apagado da ficha.", { tom: "ok" });
      setMostrando(false);
      void queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: () => toast("Não deu para apagar o CPF. Tente de novo.", { tom: "erro" }),
  });

  const temCpf = Boolean(guardado.data?.cpf);
  const rascunhoValido = cpfValido(rascunho);

  return (
    <Card className="border-brand-oliva/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <IdCard className="h-4 w-4 text-brand-musgo" aria-hidden="true" />
          CPF para a nota fiscal
          <InfoTip title="Por que o app guarda isto">
            A nota emitida sem identificar o tomador tira do paciente o bilhete do sorteio da Nota do Milhão. O número fica guardado à parte, aparece escondido na tela, só quem cuida de nota fiscal enxerga, e pode ser apagado a qualquer momento a pedido do paciente.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!ativo ? (
          <p className="text-muted-foreground">Entre com a sua conta para ver ou guardar o CPF.</p>
        ) : guardado.isLoading ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : editando ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={rascunho}
              onChange={(evento) => setRascunho(cpfEnquantoDigita(evento.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              className="h-9 w-44"
              aria-label="CPF do paciente"
              autoComplete="off"
            />
            <Button type="button" size="sm" disabled={!rascunhoValido || salvar.isPending} onClick={() => salvar.mutate()}>
              {salvar.isPending ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditando(false); setRascunho(""); }}>
              Cancelar
            </Button>
            {rascunho && !rascunhoValido ? <span className="text-xs text-red-700">Esse CPF não confere. Confira os números.</span> : null}
          </div>
        ) : temCpf ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-brand-papel/60 px-2.5 py-1 font-mono text-brand-tinta">
              {mostrando ? cpfFormatado(guardado.data!.cpf) : cpfMascarado(guardado.data!.cpf)}
            </span>
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setMostrando((atual) => !atual)}>
              {mostrando ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              {mostrando ? "Esconder" : "Ver completo"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setRascunho(cpfFormatado(guardado.data!.cpf)); setEditando(true); }}>
              Trocar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-1.5 text-red-700"
              disabled={apagar.isPending}
              onClick={async () => {
                if (!(await confirmar("Apagar o CPF deste paciente? A nota dele volta a sair sem identificação.", { destrutivo: true, confirmar: "Apagar" }))) return;
                apagar.mutate();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Apagar
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Sem CPF guardado — a nota deste paciente sai sem identificação.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
              Guardar o CPF
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
