// PESSOAS ATENDIDAS PELA NUTRIÇÃO (28/09/2026).
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Search, UserPlus } from "lucide-react";
import { Button } from "@/features/crm/comercialVisual";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule } from "@/lib/access";
import { normalizarParaBusca } from "../dominio/extracao";
import { dataCurta } from "../dominio/texto";
import { useAtualizarNutricao, useNutricaoPronta, usePessoas, useTodosAtendimentos, useTodosPlanos } from "../store/hooks";
import * as repo from "../store/repositorio";
import { CAIXA_CAMPO, CabecalhoDaPagina, Carregando, Modulo, SeloFicticio, Vazio } from "../ui/basicos";
import { fraseDasPessoas } from "../dominio/frases";

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

  const comPlanoVigente = new Set(planos.filter((x) => x.estado === "finalizado").map((x) => x.pessoaId)).size;
  const frase = fraseDasPessoas({ pessoas: pessoas.length, comPlanoVigente });

  // PAPEL & MUSGO (08/10/2026): uma folha com as pessoas em linhas separadas
  // por fio (não em cartõezinhos); a busca é o campo do guia. O módulo tem a
  // largura das outras abas (o cabeçalho e as abas não pulam ao trocar de aba);
  // só a lista fica mais estreita, para o nome não morar longe da seta.
  return (
    <Modulo>
      <CabecalhoDaPagina
        sobretitulo="Pacientes · Nutrição"
        titulo="Pessoas"
        detalhe={
          <>
            <strong>{frase.destaque}</strong> {frase.resto}
          </>
        }
      />
      <div className="max-w-[960px]">
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (filtradas.length === 1) navegar(`/nutricao/pessoas/${filtradas[0].id}`);
        }}
      >
        <div className="relative min-w-[16rem] flex-1 max-md:min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-2" aria-hidden="true" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pelo nome (com ou sem acento)"
            aria-label="Buscar pessoa"
            className={`${CAIXA_CAMPO} h-10 w-full pl-9 pr-3 text-sm font-medium max-md:text-base`}
          />
        </div>
        {canEditModule(usuario, "nutricao") && busca.trim() && filtradas.length === 0 ? (
          <Button type="button" className="gap-1.5" onClick={() => void cadastrar()}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Cadastrar {busca.trim()}
          </Button>
        ) : null}
      </form>
      {filtradas.length === 0 ? <Vazio titulo="Ninguém com esse nome">Confira a grafia ou cadastre a pessoa.</Vazio> : null}
      {filtradas.length ? (
        <ul className="divide-y divide-fio overflow-hidden rounded-bloco border border-fio bg-folha">
          {filtradas.map((p) => {
            const ultimo = atendimentos.find((a) => a.pessoaId === p.id);
            const plano = planos.find((x) => x.pessoaId === p.id && x.estado === "finalizado");
            return (
              <li key={p.id}>
                <Link
                  to={`/nutricao/pessoas/${p.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 ease-papel hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-bold leading-5 text-tinta">
                      {p.nome} {p.ficticia ? <SeloFicticio /> : null}
                    </span>
                    <span className="mt-0.5 block text-[13px] font-medium leading-5 text-tinta-2 md:truncate">
                      {p.faseAcompanhamento ? `mês ${p.faseAcompanhamento.mes} de ${p.faseAcompanhamento.total}` : "sem fase"} · {ultimo ? `último atendimento ${dataCurta(ultimo.data)}` : "sem atendimento"} ·{" "}
                      {plano ? `plano vigente versão ${plano.numero}` : "sem plano vigente"}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      </div>
    </Modulo>
  );
}
