// AVISOS (08/10/2026) — destino NOVO do Início no menu aprovado ("tudo o que
// chegou para você"), na rota nova /avisos, aberta a todos como o Início.
//
// Decisão do Lucas (08/10): nota fiscal sem CPF vai para Avisos, como
// PRIORIDADE — e NÃO entra no contador do Início (que conta só decisões). Por
// isso ela vem no topo, num bloco de folha, com o caminho para completar o CPF
// no lote de notas (Impostos & NFs). Embaixo fica o lugar dos outros avisos;
// nesta etapa, os recados do Mural. A etapa 2 traz o resto do Início.
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell } from "lucide-react";
import { BlocoFolha, BlocoSaber } from "@/components/ui/blocos";
import { LinkSeta } from "@/components/ui/botao";
import { Cabecalho } from "@/components/ui/cabecalho";
import { formatarReais } from "@/components/ui/papel-musgo";
import { useAuth } from "@/hooks/useAuth";
import { canSeeModule } from "@/lib/access";
import { readLocalValue } from "@/lib/localStore";
import { listRemoteAvisos } from "@/lib/remoteData";
import { activeAvisos, initialAvisos, muralStorageKey } from "@/features/mural/muralData";
import { fraseDasNotasSemCpf, nomeDoMes } from "@/layouts/casca/contadores";
import { useContadoresDaTela } from "@/layouts/casca/contexto";

/** Quantas notas a lista mostra antes do "e mais N" (o lote completo está em Impostos & NFs). */
const MOSTRAR = 8;

const LINK_DO_LOTE = "/financeiro/impostos#lote-de-notas";

const dataCurta = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

function dataDoMural(iso: string) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function AvisosPage() {
  const { pessoa, session, isPreview } = useAuth();
  const contadores = useContadoresDaTela();
  const notas = contadores.notasSemCpf;
  const remoto = Boolean(pessoa && session && !isPreview);

  // O Mural (módulo "hoje"): os mesmos recados que a Home mostrava em "Avisos recentes".
  const veMural = canSeeModule(pessoa, "hoje");
  const muralQuery = useQuery({ queryKey: ["avisos", "home"], queryFn: listRemoteAvisos, enabled: remoto && veMural });
  const recados = useMemo(() => {
    if (!veMural) return [];
    const lista = remoto ? muralQuery.data ?? [] : readLocalValue(muralStorageKey, initialAvisos);
    return activeAvisos(lista).slice(0, 5);
  }, [veMural, remoto, muralQuery.data]);

  const temNotas = contadores.veNotas && notas.length > 0;
  const mostradas = notas.slice(0, MOSTRAR);
  const restantes = notas.length - mostradas.length;
  const comErro = notas.filter((nota) => nota.comErro).length;

  let frase: ReactNode;
  if (temNotas) {
    frase = (
      <>
        <strong>{fraseDasNotasSemCpf(notas)}</strong> Sem o CPF a nota não sai — complete no lote.
      </>
    );
  } else if (contadores.carregandoNotas) {
    frase = "Conferindo o lote de notas…";
  } else {
    frase = "Aqui chega o que é para você saber. Nada esperando por você agora.";
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] font-sans text-tinta">
      <Cabecalho sobrancelha="Início" titulo="Avisos" frase={frase} />

      {temNotas ? (
        <section aria-labelledby="avisos-prioridade" className="mb-8">
          <BlocoFolha as="div">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-fio px-6 py-4 max-md:px-4">
              {/* A .etiqueta da proposta: 20 px de altura, ícone de 12 px (revisão de 08/10/2026). */}
              <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-controle bg-atencao-claro px-2 text-xs font-bold leading-5 text-atencao">
                <AlertTriangle className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
                Prioridade
              </span>
              <h2 id="avisos-prioridade" className="text-base font-bold text-tinta">
                Notas fiscais sem CPF
                <span className="ml-2 font-semibold text-tinta-2">
                  {notas.length} {notas.length === 1 ? "nota" : "notas"}
                  {comErro ? ` · ${comErro} com erro ao emitir` : ""}
                </span>
              </h2>
              <LinkSeta to={LINK_DO_LOTE} className="ml-auto">
                Completar no lote
              </LinkSeta>
            </div>
            <ul>
              {mostradas.map((nota) => (
                <li key={nota.id} className="flex items-center gap-4 border-b border-fio px-6 py-3 last:border-b-0 max-md:px-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-tinta">{nota.tomador}</p>
                    <p className="text-[13px] font-medium text-tinta-2">
                      comanda de {dataCurta(nota.dia)} · lote de {nomeDoMes(nota.mes)}
                      {nota.comErro ? <span className="font-bold text-atencao"> · deu erro ao emitir</span> : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-tinta">{formatarReais(nota.valor)}</span>
                </li>
              ))}
            </ul>
            {restantes > 0 ? (
              <p className="border-t border-fio px-6 py-3 text-[13px] font-medium text-tinta-2 max-md:px-4">
                E mais {restantes} {restantes === 1 ? "nota" : "notas"} no lote.{" "}
                <Link to={LINK_DO_LOTE} className="font-bold text-musgo underline-offset-[3px] hover:underline">
                  Ver todas
                </Link>
              </p>
            ) : null}
          </BlocoFolha>
          {contadores.exemplo ? (
            <p className="mt-2 text-[13px] font-medium text-tinta-2">Prévia: estas linhas são exemplos, sem dado da clínica.</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="avisos-outros">
        <h2 id="avisos-outros" className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-tinta-2">
          Outros avisos
        </h2>
        <BlocoSaber>
          {recados.length ? (
            <>
              <ul className="grid gap-3">
                {recados.map((recado) => (
                  <li key={recado.id} className="flex gap-3">
                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-6 text-tinta [overflow-wrap:anywhere]">
                        {recado.prioridade === "importante" ? <strong className="font-bold text-atencao">Importante · </strong> : null}
                        {recado.corpo}
                      </p>
                      <p className="text-xs font-medium text-tinta-2">
                        {recado.autor} · {dataDoMural(recado.publicadoEm)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <LinkSeta to="/mural" className="mt-4">
                Abrir o mural
              </LinkSeta>
            </>
          ) : (
            <p className="text-sm font-medium text-tinta-2">
              Nada novo por aqui. Os recados da coordenação aparecem neste lugar{veMural ? " e no Mural" : ""}.
            </p>
          )}
        </BlocoSaber>
      </section>
    </div>
  );
}
