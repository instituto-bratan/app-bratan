// PESSOAS ATENDIDAS PELA NUTRIÇÃO (28/09/2026).
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule } from "@/lib/access";
import { normalizarParaBusca } from "../dominio/extracao";
import { dataCurta } from "../dominio/texto";
import { useAtualizarNutricao, useNutricaoPronta, usePessoas, useTodosAtendimentos, useTodosPlanos } from "../store/hooks";
import * as repo from "../store/repositorio";
import { CabecalhoDaPagina, Carregando, Modulo, SeloFicticio, Vazio } from "../ui/basicos";

export function NutricaoPessoasPage() {
  const pronto = useNutricaoPronta();
  const { pessoa: usuario } = useAuth();
  const { data: pessoas = [] } = usePessoas();
  const { data: atendimentos = [] } = useTodosAtendimentos();
  const { data: planos = [] } = useTodosPlanos();
  const [busca, setBusca] = useState("");
  const navegar = useNavigate();
  const atualizar = useAtualizarNutricao();

  const filtradas = useMemo(() => {
    const termo = normalizarParaBusca(busca);
    return termo ? pessoas.filter((p) => normalizarParaBusca(p.nome).includes(termo)) : pessoas;
  }, [pessoas, busca]);

  if (pronto.isLoading) return <Carregando />;

  const cadastrar = async () => {
    if (!busca.trim()) return;
    const nova = await repo.salvarPessoa(repo.pessoaNova(busca), null);
    await atualizar();
    navegar(`/nutricao/pessoas/${nova.id}`);
  };

  return (
    <Modulo className="max-w-4xl">
      <CabecalhoDaPagina sobretitulo="Nutrição" titulo="Pessoas" detalhe={`${pessoas.length} pessoa(s) com registro de nutrição neste computador`} />
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (filtradas.length === 1) navegar(`/nutricao/pessoas/${filtradas[0].id}`);
        }}
      >
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pelo nome (com ou sem acento)"
            aria-label="Buscar pessoa"
            className="h-11 w-full rounded-xl border border-brand-oliva/20 bg-white/70 pl-9 pr-3 text-sm focus:border-brand-dourado focus:outline-none focus:ring-2 focus:ring-brand-dourado/25"
          />
        </div>
        {canEditModule(usuario, "nutricao") && busca.trim() && filtradas.length === 0 ? (
          <Button type="button" className="gap-1.5" onClick={() => void cadastrar()}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Cadastrar {busca.trim()}
          </Button>
        ) : null}
      </form>
      {filtradas.length === 0 ? <Vazio titulo="Ninguém com esse nome">Confira a grafia ou cadastre a pessoa.</Vazio> : null}
      <ul className="grid gap-2">
        {filtradas.map((p) => {
          const ultimo = atendimentos.find((a) => a.pessoaId === p.id);
          const plano = planos.find((x) => x.pessoaId === p.id && x.estado === "finalizado");
          return (
            <li key={p.id}>
              <Link to={`/nutricao/pessoas/${p.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-brand-oliva/12 bg-white/60 px-4 py-3 hover:border-brand-dourado/50">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold">
                    {p.nome} {p.ficticia ? <SeloFicticio /> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.faseAcompanhamento ? `mês ${p.faseAcompanhamento.mes} de ${p.faseAcompanhamento.total}` : "sem fase"} · {ultimo ? `último atendimento ${dataCurta(ultimo.data)}` : "sem atendimento"} ·{" "}
                    {plano ? `plano vigente versão ${plano.numero}` : "sem plano vigente"}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-brand-oliva" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Modulo>
  );
}
