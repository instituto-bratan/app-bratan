// CONFERÊNCIA DE SUPLEMENTOS E MEDICAMENTOS NA CONSULTA (28/09/2026).
//
// Como ela faz hoje: pergunta como a pessoa está usando e confere com a
// prescrição do Dr. Daniel. A prescrição vem da lista registrada (nunca da IA);
// aqui se registra o uso relatado, a adesão e a orientação dada, com a data.
import { Check, Plus, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/features/crm/comercialVisual";
import { normalizarParaBusca } from "../dominio/extracao";
import type { Adesao, ConferenciaUso, SegmentoTranscricao, SugestaoSuplemento } from "../dominio/tipos";
import * as repo from "../store/repositorio";
import { Bolinha, LinhaQueCresce } from "../ui/basicos";
import { FalaDeOrigem } from "./FalaDeOrigem";

const ADESOES: { id: Adesao; rotulo: string }[] = [
  { id: "ok", rotulo: "adesão ok" },
  { id: "divergente", rotulo: "diverge da prescrição" },
  { id: "nao_usa", rotulo: "não está usando" },
  { id: "nao_informado", rotulo: "não conferido" },
];

type Props = {
  pessoaId: string;
  conferencias: ConferenciaUso[];
  sugestoes: SugestaoSuplemento[];
  segmentos: SegmentoTranscricao[];
  dataAtendimento: string;
  editavel: boolean;
  aoMudar: (lista: ConferenciaUso[]) => void;
  aoResolverSugestao: (indice: number, aceitar: boolean) => void;
};

export function sugestaoDaConferencia(c: ConferenciaUso, sugestoes: SugestaoSuplemento[]): number {
  return sugestoes.findIndex((s) => s.estado === "pendente" && ((s.itemId && s.itemId === c.itemId) || normalizarParaBusca(s.nome) === normalizarParaBusca(c.nome)));
}

export function ConferenciaDeSuplementos({ pessoaId, conferencias, sugestoes, segmentos, dataAtendimento, editavel, aoMudar, aoResolverSugestao }: Props) {
  const mudar = (id: string, parcial: Partial<ConferenciaUso>) =>
    aoMudar(
      conferencias.map((c) => {
        if (c.id !== id) return c;
        const proximo = { ...c, ...parcial, origem: c.origem === "ia_aceita" || c.origem === "ia_editada" ? ("ia_editada" as const) : ("digitado" as const) };
        // A data da orientação nasce quando ela escreve a orientação.
        if (parcial.orientacao !== undefined) proximo.orientadoEm = parcial.orientacao.trim() ? c.orientadoEm ?? dataAtendimento : null;
        return proximo;
      }),
    );

  const semPar = sugestoes.map((s, i) => ({ s, i })).filter(({ s }) => s.estado === "pendente" && !conferencias.some((c) => sugestaoDaConferencia(c, [s]) === 0));

  return (
    <div className="grid gap-3">
      {conferencias.length === 0 ? <p className="text-sm text-tinta-2">Nenhum suplemento ou medicamento na lista desta pessoa. O bloco sai “Não informado.”</p> : null}
      {conferencias.map((c) => {
        const indice = sugestaoDaConferencia(c, sugestoes);
        const sugestao = indice >= 0 ? sugestoes[indice] : null;
        return (
          <div key={c.id} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 rounded-bloco border border-fio bg-folha p-3">
            <div className="pt-1">
              <Bolinha estado={sugestao ? "ia" : c.adesao === "nao_informado" ? "vazio" : "ok"} />
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                {c.itemId || !editavel ? (
                  <p className="font-semibold text-musgo">{c.nome || "Sem nome"}</p>
                ) : (
                  <input
                    value={c.nome}
                    onChange={(e) => aoMudar(conferencias.map((x) => (x.id === c.id ? { ...x, nome: e.target.value } : x)))}
                    placeholder="Nome do suplemento ou medicamento"
                    aria-label="Nome do suplemento ou medicamento"
                    className="h-8 min-w-0 flex-1 rounded-controle border border-borda-campo bg-folha text-tinta px-2 text-sm font-semibold focus-visible:border-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                  />
                )}
                <p className="text-xs text-tinta-2">{c.itemId ? `prescrição registrada: ${c.prescricao || "sem detalhe"}` : "mencionado na consulta, fora da lista"}</p>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Adesão: ${c.nome}`}>
                {ADESOES.map((a) => (
                  <button key={a.id} type="button" className="nutri-chip" aria-pressed={c.adesao === a.id} disabled={!editavel} onClick={() => mudar(c.id, { adesao: a.id })}>
                    {a.rotulo}
                  </button>
                ))}
              </div>
              {c.adesao !== "ok" && c.adesao !== "nao_informado" ? (
                <LinhaQueCresce value={c.usoRelatado} disabled={!editavel} placeholder="Como a pessoa disse que está usando" onChange={(e) => mudar(c.id, { usoRelatado: e.target.value })} aria-label={`Uso relatado: ${c.nome}`} />
              ) : null}
              <LinhaQueCresce value={c.orientacao} disabled={!editavel} placeholder="Orientação dada hoje (opcional)" onChange={(e) => mudar(c.id, { orientacao: e.target.value })} aria-label={`Orientação: ${c.nome}`} />
              {sugestao ? (
                <div className="nutri-sugestao grid gap-1.5 px-3 py-2 text-sm">
                  <span className="text-xs font-bold uppercase tracking-wide nutri-texto-ia">sugestão da gravação</span>
                  <p>
                    {ADESOES.find((a) => a.id === sugestao.adesao)?.rotulo}
                    {sugestao.usoRelatado ? ` · relato: ${sugestao.usoRelatado}` : ""}
                    {sugestao.orientacao ? ` · orientação: ${sugestao.orientacao}` : ""}
                  </p>
                  <FalaDeOrigem evidencias={sugestao.evidencias} segmentos={segmentos} />
                  {editavel ? (
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" className="h-8 gap-1" onClick={() => aoResolverSugestao(indice, true)}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Aceitar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={() => aoResolverSugestao(indice, false)}>
                        <X className="h-3.5 w-3.5" aria-hidden="true" /> Recusar
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {editavel && !c.itemId ? (
                <button type="button" className="justify-self-start text-xs font-semibold text-tinta-2 hover:text-erro" onClick={() => aoMudar(conferencias.filter((x) => x.id !== c.id))}>
                  <Trash2 className="mr-1 inline h-3 w-3" aria-hidden="true" /> tirar do registro
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      {semPar.map(({ s, i }) => (
        <div key={`sug-${i}`} className="nutri-sugestao grid gap-1.5 px-3 py-2 text-sm">
          <span className="text-xs font-bold uppercase tracking-wide nutri-texto-ia">mencionado na gravação, fora da lista: {s.nome}</span>
          <p>
            {ADESOES.find((a) => a.id === s.adesao)?.rotulo}
            {s.usoRelatado ? ` · relato: ${s.usoRelatado}` : ""}
            {s.orientacao ? ` · orientação: ${s.orientacao}` : ""}
          </p>
          <FalaDeOrigem evidencias={s.evidencias} segmentos={segmentos} />
          {editavel ? (
            <div className="flex gap-1.5">
              <Button type="button" size="sm" className="h-8 gap-1" onClick={() => aoResolverSugestao(i, true)}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Pôr no registro
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={() => aoResolverSugestao(i, false)}>
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Recusar
              </Button>
            </div>
          ) : null}
        </div>
      ))}

      {editavel ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5 text-tinta-2"
            onClick={() =>
              aoMudar([
                ...conferencias,
                { id: repo.novoId(), itemId: null, nome: "", prescricao: "", usoRelatado: "", adesao: "nao_informado", orientacao: "", orientadoEm: null, origem: "digitado", evidencias: [] },
              ])
            }
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Mencionado fora da lista
          </Button>
          <Button asChild size="sm" variant="ghost" className="text-tinta-2">
            <Link to={`/nutricao/pessoas/${pessoaId}?aba=suplementos`}>Editar a lista registrada</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
