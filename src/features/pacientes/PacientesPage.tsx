// ABA PACIENTES (05/10/2026). Lucas: "adicione uma aba de pacientes pois não
// consigo pesquisar o perfil deles para eu colocar o CPF".
//
// A lista de todos os contatos com busca por nome, telefone ou e-mail; de cada
// linha abre a ficha completa (/crm/contatos/:id) ou, para quem pode, o CPF
// ali mesmo. O número do CPF nunca vem na lista: só "tem" ou "não tem".
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { IdCard, Search, UserRound, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan, canEditModule, canSeeModule } from "@/lib/access";
import { listRemoteContatosComCpf, listRemotePacientes } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { CpfDoPacienteCard } from "@/features/crm/CpfDoPacienteCard";
import { buscar, ordenar, resumoDaLista, rotuloDoTipo, type FiltroDeTipo, type PacienteDaLista } from "./pacientesData";

const FILTROS: { chave: FiltroDeTipo; rotulo: string }[] = [
  { chave: "pacientes", rotulo: "Pacientes" },
  { chave: "ex", rotulo: "Ex-pacientes" },
  { chave: "leads", rotulo: "Leads" },
  { chave: "todos", rotulo: "Todos" },
];

export function PacientesPage() {
  const { pessoa, session, isPreview } = useAuth();
  const usaRemoto = Boolean(pessoa && session && !isPreview);
  // O CPF segue a permissão da tela Impostos & NFs (é a mesma RLS de contato_documento).
  const veCpf = canSeeModule(pessoa, "fin-impostos");
  const editaCpf = canEditModule(pessoa, "fin-impostos");
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState<FiltroDeTipo>("todos");
  const [aberto, setAberto] = useState<string | null>(null);

  const contatos = useQuery({ queryKey: ["pacientes-lista"], queryFn: listRemotePacientes, enabled: usaRemoto, staleTime: 60_000 });
  const comCpf = useQuery({ queryKey: ["pacientes-com-cpf"], queryFn: listRemoteContatosComCpf, enabled: usaRemoto && veCpf, staleTime: 60_000 });

  const lista = useMemo<PacienteDaLista[]>(() => {
    const refs = comCpf.data ?? new Set<string>();
    return ordenar((contatos.data ?? []).map((c) => ({ ...c, temCpf: refs.has(c.id) })));
  }, [contatos.data, comCpf.data]);
  const visiveis = useMemo(() => buscar(lista, termo, filtro), [lista, termo, filtro]);

  return (
    <AccessGate allowed={canCrmBratan} label="Pacientes" module="pacientes">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl text-brand-musgo">Pacientes</h1>
            <p className="text-sm text-muted-foreground">{contatos.isLoading ? "Carregando a lista…" : resumoDaLista(lista, veCpf)}</p>
          </div>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-brand-musgo" aria-hidden="true" /> Buscar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="relative">
              <Input
                id="busca-paciente"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Nome, telefone ou e-mail"
                autoComplete="off"
                className="pr-9"
              />
              {termo ? (
                <button type="button" aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setTermo("")}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
              {FILTROS.map((f) => (
                <button
                  key={f.chave}
                  type="button"
                  onClick={() => setFiltro(f.chave)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition",
                    filtro === f.chave ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-oliva/30 bg-white/60 text-brand-tinta hover:border-brand-musgo/50",
                  )}
                >
                  {f.rotulo}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {contatos.isError ? (
              <p className="p-4 text-sm text-red-700">Não consegui carregar a lista de pacientes. Recarregue a página.</p>
            ) : !visiveis.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {contatos.isLoading ? "Carregando…" : termo ? `Ninguém com "${termo}" ${filtro === "todos" ? "" : "neste filtro"}.` : "Nenhum contato neste filtro."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b border-brand-oliva/14">
                      <th className="px-4 py-2">Nome</th>
                      <th className="px-4 py-2">Telefone</th>
                      <th className="px-4 py-2">E-mail</th>
                      <th className="px-4 py-2">Tipo</th>
                      {veCpf ? <th className="px-4 py-2">CPF</th> : null}
                      <th className="px-4 py-2 text-right">Abrir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((p) => (
                      <PacienteLinha
                        key={p.id}
                        p={p}
                        veCpf={veCpf}
                        editaCpf={editaCpf}
                        aberto={aberto === p.id}
                        onAbrirCpf={() => setAberto(aberto === p.id ? null : p.id)}
                        pessoaId={pessoa?.id ?? null}
                        colunas={veCpf ? 6 : 5}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}

function PacienteLinha({ p, veCpf, editaCpf, aberto, onAbrirCpf, pessoaId, colunas }: { p: PacienteDaLista; veCpf: boolean; editaCpf: boolean; aberto: boolean; onAbrirCpf: () => void; pessoaId: string | null; colunas: number }) {
  const telefone = p.whatsapp || p.telefone;
  return (
    <>
      <tr className={cn("border-b border-brand-oliva/10 align-top", aberto && "bg-brand-creme/30")}>
        <td className="px-4 py-2">
          <div className="font-semibold text-brand-tinta">{p.nome}</div>
          {p.apelido && p.apelido !== p.nome ? <div className="text-xs text-muted-foreground">{p.apelido}</div> : null}
        </td>
        <td className="px-4 py-2 whitespace-nowrap">{telefone || <span className="text-muted-foreground">—</span>}</td>
        <td className="px-4 py-2 break-all">{p.email || <span className="text-muted-foreground">—</span>}</td>
        <td className="px-4 py-2 whitespace-nowrap">
          <Badge variant={p.tipo === "PATIENT" ? "gold" : "outline"}>{rotuloDoTipo[p.tipo] ?? p.tipo}</Badge>
        </td>
        {veCpf ? (
          <td className="px-4 py-2 whitespace-nowrap">
            {p.temCpf ? (
              <span className="text-xs font-semibold text-brand-musgo">guardado</span>
            ) : (
              <span className="text-xs text-muted-foreground">sem CPF</span>
            )}
            {editaCpf ? (
              <Button type="button" size="sm" variant={p.temCpf ? "ghost" : "outline"} className="ml-2 h-7 px-2 text-xs" onClick={onAbrirCpf}>
                <IdCard className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {aberto ? "Fechar" : p.temCpf ? "Ver" : "Colocar CPF"}
              </Button>
            ) : null}
          </td>
        ) : null}
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <Button asChild type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <Link to={`/crm/contatos/${p.id}`}>
              <UserRound className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Ficha
            </Link>
          </Button>
        </td>
      </tr>
      {aberto && editaCpf ? (
        <tr className="border-b border-brand-oliva/10 bg-brand-creme/30">
          <td colSpan={colunas} className="px-4 pb-4 pt-1">
            <div className="max-w-xl">
              <CpfDoPacienteCard contactRef={p.id} pessoaId={pessoaId} ativo />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
