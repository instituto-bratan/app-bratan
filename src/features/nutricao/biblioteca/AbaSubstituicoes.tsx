// BIBLIOTECA › SUBSTITUIÇÕES (16/10/2026).
//
// Os grupos que alimentam o botão "substituições pelo carboidrato" no plano:
// quais alimentos se trocam entre si e por qual nutriente a porção é igualada
// (resposta dela: "pelo carboidrato"; carnes, pela proteína). Cada gravação é
// uma versão nova; as substituições já postas nos planos não mudam.
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/features/crm/comercialVisual";
import { ROTULO_DA_BASE, type BaseDaEquivalencia, type GrupoSubstituicao } from "../dominio/equivalentes";
import type { Alimento } from "../dominio/tipos";
import { useAtualizarNutricao } from "../store/hooks";
import * as repo from "../store/repositorio";
import { CAIXA_CAMPO, Cartao } from "../ui/basicos";

const naoSalvou = (e: unknown) => (e instanceof Error ? `Não salvou: ${e.message}` : "Não salvou. Recarregue a página e tente de novo.");

/** "Arroz, tipo 1, cozido" → "Arroz tipo 1 cozido": nome de partida para o documento; ela troca. */
function nomeDoDocumento(a: Alimento): string {
  return a.nome.replace(/,\s*/g, " ").replace(/\s+/g, " ").trim();
}

function EditorDeGrupo({ grupo, alimentos, editavel }: { grupo: GrupoSubstituicao; alimentos: Alimento[]; editavel: boolean }) {
  const atualizar = useAtualizarNutricao();
  const [rascunho, setRascunho] = useState(grupo);
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const porId = new Map(alimentos.map((a) => [a.id, a]));
  const mudou = JSON.stringify(rascunho) !== JSON.stringify(grupo);
  const listaId = `alimentos-grupo-${grupo.id}`;

  return (
    <Cartao titulo={`${grupo.titulo} · versão ${grupo.versao}`} acoes={<span className="text-xs text-tinta-2">iguala pela {ROTULO_DA_BASE[grupo.base]}</span>}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid flex-1 gap-1 text-xs" htmlFor={`titulo-${grupo.id}`}>
            <span className="font-semibold text-tinta-2">Nome do grupo</span>
            <input id={`titulo-${grupo.id}`} value={rascunho.titulo} disabled={!editavel} onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })} className={`${CAIXA_CAMPO} h-10 min-w-[14rem] px-3 text-sm font-semibold`} />
          </label>
          <label className="grid gap-1 text-xs" htmlFor={`base-${grupo.id}`}>
            <span className="font-semibold text-tinta-2">Porção igual em</span>
            <select id={`base-${grupo.id}`} value={rascunho.base} disabled={!editavel} onChange={(e) => setRascunho({ ...rascunho, base: e.target.value as BaseDaEquivalencia })} className={`${CAIXA_CAMPO} h-10 px-2 text-sm`}>
              {(Object.keys(ROTULO_DA_BASE) as BaseDaEquivalencia[]).map((b) => (
                <option key={b} value={b}>
                  {ROTULO_DA_BASE[b]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ul className="grid gap-1">
          {rascunho.alimentos.map((membro, i) => {
            const a = porId.get(membro.alimentoId);
            return (
              <li key={`${membro.alimentoId}-${i}`} className="flex flex-wrap items-center gap-2 border-t border-fio pt-1.5">
                <input
                  aria-label="Nome no documento"
                  value={membro.nome}
                  disabled={!editavel}
                  onChange={(e) => setRascunho({ ...rascunho, alimentos: rascunho.alimentos.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })}
                  className={`${CAIXA_CAMPO} h-8 min-w-[12rem] flex-1 px-2 text-sm font-semibold`}
                />
                <span className="text-xs text-tinta-2">
                  {a ? `${a.nome} · ${a.por100g[rascunho.base] === null ? "sem valor" : `${String(a.por100g[rascunho.base]).replace(".", ",")} g de ${ROTULO_DA_BASE[rascunho.base]}`}/100 g` : "alimento fora da tabela"}
                </span>
                {editavel ? (
                  <button type="button" className="rounded p-1 text-tinta-2 hover:bg-erro-claro hover:text-erro" aria-label={`Tirar ${membro.nome}`} onClick={() => setRascunho({ ...rascunho, alimentos: rascunho.alimentos.filter((_, j) => j !== i) })}>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {editavel ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              list={listaId}
              value={busca}
              onChange={(e) => {
                const valor = e.target.value;
                const a = alimentos.find((x) => x.nome === valor);
                if (a) {
                  setRascunho({ ...rascunho, alimentos: [...rascunho.alimentos, { alimentoId: a.id, nome: nomeDoDocumento(a) }] });
                  setBusca("");
                } else {
                  setBusca(valor);
                }
              }}
              placeholder="Acrescentar alimento da TACO"
              aria-label="Acrescentar alimento ao grupo"
              className={`${CAIXA_CAMPO} h-9 w-72 max-w-full px-3 text-sm`}
            />
            <datalist id={listaId}>
              {busca.trim().length >= 2 ? alimentos.filter((a) => a.nome.toLowerCase().includes(busca.trim().toLowerCase())).slice(0, 40).map((a) => <option key={a.id} value={a.nome} />) : null}
            </datalist>
            <Button
              type="button"
              size="sm"
              disabled={!mudou || !rascunho.titulo.trim()}
              onClick={async () => {
                try {
                  const salvo = await repo.salvarGrupoSubstituicao({ ...rascunho, titulo: rascunho.titulo.trim() }, grupo.versao);
                  await atualizar();
                  setAviso({ texto: `Versão ${salvo.versao} salva. As substituições já postas nos planos não mudam.`, erro: false });
                } catch (e) {
                  setAviso({ texto: naoSalvou(e), erro: true });
                }
              }}
            >
              Salvar nova versão
            </Button>
            {confirmarApagar ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-erro"
                  onClick={async () => {
                    await repo.apagarGrupoSubstituicao(grupo.id);
                    await atualizar();
                  }}
                >
                  Apagar o grupo de vez
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmarApagar(false)}>
                  Manter
                </Button>
              </>
            ) : (
              <button type="button" className="ml-auto rounded p-1 text-tinta-2 hover:text-erro" aria-label={`Apagar o grupo ${grupo.titulo}`} onClick={() => setConfirmarApagar(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : null}
        {aviso ? (
          <p className={aviso.erro ? "text-xs font-medium text-erro" : "text-xs text-ok"} role={aviso.erro ? "alert" : "status"}>
            {aviso.texto}
          </p>
        ) : null}
      </div>
    </Cartao>
  );
}

export function AbaSubstituicoes({ grupos, alimentos, editavel }: { grupos: GrupoSubstituicao[]; alimentos: Alimento[]; editavel: boolean }) {
  const atualizar = useAtualizarNutricao();
  return (
    <div className="grid gap-4">
      <p className="text-sm text-tinta-2">
        No plano, cada alimento destes grupos ganha o botão <strong>substituições pelo carboidrato</strong> (ou pela proteína): o app calcula a porção de cada
        alimento do grupo com a mesma quantidade do nutriente e escreve na sua medida caseira quando já conhece. As substituições continuam fora do cálculo.
      </p>
      {grupos.map((g) => (
        <EditorDeGrupo key={`${g.id}-${g.versao}`} grupo={g} alimentos={alimentos} editavel={editavel} />
      ))}
      {editavel ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start gap-1.5"
          onClick={async () => {
            await repo.salvarGrupoSubstituicao({ id: repo.novoId(), titulo: "Grupo novo", base: "cho", alimentos: [], versao: 0, atualizadoEm: repo.agora() }, null);
            await atualizar();
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Grupo novo
        </Button>
      ) : null}
    </div>
  );
}
