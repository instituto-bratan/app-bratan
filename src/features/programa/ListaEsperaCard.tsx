// LISTA DE ESPERA (15/09/2026, proposta 3.2): quando um paciente pede para
// remarcar (resposta ao toque de confirmação), o horário libera e a recepção
// chama o próximo daqui. Simples: nome, telefone, preferência.
//
// Papel & Musgo (08/10/2026, redesenho etapa 4): é onde se age (pôr na lista,
// marcar encaixado), então mora numa folha; os campos são os do guia (40 px,
// rótulo para o leitor de tela) e a contagem vem em frase ao lado do título.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { BlocoFolha, Botao } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
import { CAMPO } from "@/features/crm/comercialVisual";
import { TituloDoBloco } from "@/features/financeiro/pecasDiaPagar";
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

  const quantos = query.data?.length ?? 0;

  return (
    <BlocoFolha as="section" aria-labelledby="titulo-lista-de-espera" respiro className="font-sans">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TituloDoBloco id="titulo-lista-de-espera" icone={<ListPlus className="h-4 w-4" aria-hidden="true" />} detalhe={quantos === 0 ? undefined : `${quantos} ${quantos === 1 ? "pessoa esperando" : "pessoas esperando"}`}>
          Lista de espera
        </TituloDoBloco>
        <InfoTip title="Para que serve">
          Quem quer ser encaixado antes. Quando um paciente responde “remarcar” ao toque de confirmação, a Fila do dia avisa a recepção que
          o horário liberou — e o próximo daqui é chamado. Marcar “encaixado” tira da lista.
        </InfoTip>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_9rem_1fr_8rem_auto]">
        <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome" aria-label="Nome" className={CAMPO} />
        <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="WhatsApp" aria-label="WhatsApp" className={`${CAMPO} tabular-nums`} inputMode="tel" />
        <input value={form.preferencia} onChange={(e) => setForm({ ...form, preferencia: e.target.value })} placeholder="Preferência (ex.: manhãs, terça)" aria-label="Preferência" className={CAMPO} />
        <input value={form.profissional} onChange={(e) => setForm({ ...form, profissional: e.target.value })} placeholder="Profissional" aria-label="Profissional" className={CAMPO} />
        <Botao variante="secundario" carregando={salvando} disabled={salvando || !form.nome.trim()} onClick={() => void adicionar()}>
          Adicionar
        </Botao>
      </div>
      {query.data?.length ? (
        <ul className="mt-4 border-t border-fio">
          {query.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-fio py-2.5 last:border-b-0">
              <span className="min-w-0 text-sm font-medium leading-5 text-tinta">
                <strong className="font-bold">{item.nome}</strong>
                <span className="tabular-nums">{item.telefone ? ` · ${item.telefone}` : ""}</span>
                {item.preferencia ? ` · ${item.preferencia}` : ""}
                {item.profissional ? ` · ${item.profissional}` : ""}
                <span className="ml-1.5 text-[13px] tabular-nums text-tinta-2">
                  desde {item.criadoEm.slice(8, 10)}/{item.criadoEm.slice(5, 7)}
                </span>
              </span>
              <Botao
                tamanho="pq"
                variante="suave"
                onClick={() =>
                  void resolverRemoteListaEspera(item.id)
                    .then(() => queryClient.invalidateQueries({ queryKey: ["lista-espera"] }))
                    .catch(() => toast("Não deu para tirar da lista de espera. Tente de novo.", { tom: "erro" }))
                }
              >
                Encaixado
              </Botao>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] font-medium text-tinta-2">Ninguém esperando encaixe.</p>
      )}
    </BlocoFolha>
  );
}
