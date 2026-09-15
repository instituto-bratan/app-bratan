// LISTA DE ESPERA (15/09/2026, proposta 3.2): quando um paciente pede para
// remarcar (resposta ao toque de confirmação), o horário libera e a recepção
// chama o próximo daqui. Simples: nome, telefone, preferência.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/avisos";
import { addRemoteListaEspera, listRemoteListaEspera, resolverRemoteListaEspera } from "@/lib/remoteData";

export function ListaEsperaCard({ pessoaId, ativo }: { pessoaId: string | null; ativo: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["lista-espera"], queryFn: listRemoteListaEspera, enabled: ativo, staleTime: 60_000 });
  const [form, setForm] = useState({ nome: "", telefone: "", preferencia: "", profissional: "" });
  const [salvando, setSalvando] = useState(false);
  if (!ativo) return null;

  async function adicionar() {
    if (!form.nome.trim()) return;
    setSalvando(true);
    try {
      await addRemoteListaEspera({ nome: form.nome.trim(), telefone: form.telefone.trim(), preferencia: form.preferencia.trim(), profissional: form.profissional.trim() }, pessoaId);
      setForm({ nome: "", telefone: "", preferencia: "", profissional: "" });
      await queryClient.invalidateQueries({ queryKey: ["lista-espera"] });
      toast("Entrou na lista de espera.", { tom: "ok" });
    } catch (error) {
      toast(`Não consegui gravar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListPlus className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
          Lista de espera ({query.data?.length ?? 0})
          <InfoTip title="Para que serve">
            Quem quer ser encaixado antes. Quando um paciente responde “remarcar” ao toque de confirmação, a Fila do dia avisa a recepção que
            o horário liberou — e o próximo daqui é chamado. Marcar “encaixado” tira da lista.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-[1fr_9rem_1fr_8rem_auto]">
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome" className="h-9" />
          <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="WhatsApp" className="h-9" inputMode="tel" />
          <Input value={form.preferencia} onChange={(e) => setForm({ ...form, preferencia: e.target.value })} placeholder="Preferência (ex.: manhãs, terça)" className="h-9" />
          <Input value={form.profissional} onChange={(e) => setForm({ ...form, profissional: e.target.value })} placeholder="Profissional" className="h-9" />
          <Button type="button" size="sm" className="h-9" disabled={salvando || !form.nome.trim()} onClick={() => void adicionar()}>
            Adicionar
          </Button>
        </div>
        {query.data?.length ? (
          <ul className="grid gap-1">
            {query.data.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-oliva/15 bg-brand-papel/50 px-2.5 py-1.5">
                <span className="text-brand-tinta">
                  <strong>{item.nome}</strong>
                  {item.telefone ? ` · ${item.telefone}` : ""}
                  {item.preferencia ? ` · ${item.preferencia}` : ""}
                  {item.profissional ? ` · ${item.profissional}` : ""}
                  <span className="ml-1 text-xs text-muted-foreground">desde {item.criadoEm.slice(8, 10)}/{item.criadoEm.slice(5, 7)}</span>
                </span>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void resolverRemoteListaEspera(item.id).then(() => queryClient.invalidateQueries({ queryKey: ["lista-espera"] }))}>
                  Encaixado
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Ninguém esperando encaixe.</p>
        )}
      </CardContent>
    </Card>
  );
}
