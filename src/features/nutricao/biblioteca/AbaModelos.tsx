// BIBLIOTECA › MODELOS (16/10/2026).
//
// Os planos que ela guardou como ponto de partida ("Salvar como modelo" no
// plano). Aqui ela renomeia, descreve para quem serve e apaga o que não usa.
// Para mudar refeições e alimentos de um modelo: comece um plano dele, edite e
// salve como modelo de novo.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/features/crm/comercialVisual";
import { resumoDoModelo, type ModeloPlano } from "../dominio/modelos";
import { useAtualizarNutricao } from "../store/hooks";
import * as repo from "../store/repositorio";
import { CAIXA_CAMPO, Cartao, Vazio } from "../ui/basicos";

function EditorDeModelo({ modelo, editavel }: { modelo: ModeloPlano; editavel: boolean }) {
  const atualizar = useAtualizarNutricao();
  const [nome, setNome] = useState(modelo.nome);
  const [descricao, setDescricao] = useState(modelo.descricao);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const mudou = nome !== modelo.nome || descricao !== modelo.descricao;
  const refeicoes = modelo.refeicoes.filter((r) => r.itens.some((i) => i.descricao.trim()));

  return (
    <Cartao titulo={modelo.nome} acoes={<span className="text-xs text-tinta-2">{resumoDoModelo(modelo)}</span>}>
      <div className="grid gap-3">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="grid gap-1 text-xs" htmlFor={`modelo-nome-${modelo.id}`}>
            <span className="font-semibold text-tinta-2">Nome</span>
            <input id={`modelo-nome-${modelo.id}`} value={nome} disabled={!editavel} onChange={(e) => setNome(e.target.value)} className={`${CAIXA_CAMPO} h-10 px-3 text-sm font-semibold`} />
          </label>
          <label className="grid gap-1 text-xs" htmlFor={`modelo-desc-${modelo.id}`}>
            <span className="font-semibold text-tinta-2">Para quem serve</span>
            <input id={`modelo-desc-${modelo.id}`} value={descricao} disabled={!editavel} onChange={(e) => setDescricao(e.target.value)} className={`${CAIXA_CAMPO} h-10 px-3 text-sm`} />
          </label>
        </div>
        <ul className="grid gap-1 text-sm">
          {refeicoes.map((r) => (
            <li key={r.id} className="border-t border-fio pt-1.5">
              <strong>{r.nome}</strong>
              {r.opcional ? <span className="text-tinta-2"> (opcional)</span> : null}:{" "}
              <span className="text-tinta-2">
                {r.itens
                  .filter((i) => i.descricao.trim())
                  .map((i) => [i.descricao, i.quantidade].filter(Boolean).join(" "))
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
        {editavel ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!mudou || !nome.trim()}
              onClick={async () => {
                try {
                  await repo.salvarModelo({ ...modelo, nome: nome.trim(), descricao: descricao.trim() }, modelo.versao);
                  await atualizar();
                  setAviso("Salvo.");
                } catch (e) {
                  setAviso(e instanceof Error ? `Não salvou: ${e.message}` : "Não salvou.");
                }
              }}
            >
              Salvar
            </Button>
            {aviso ? <span className="text-xs text-tinta-2">{aviso}</span> : null}
            {confirmar ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto text-erro"
                  onClick={async () => {
                    await repo.apagarModelo(modelo.id);
                    await atualizar();
                  }}
                >
                  Apagar o modelo de vez
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmar(false)}>
                  Manter
                </Button>
              </>
            ) : (
              <button type="button" className="ml-auto rounded p-1 text-tinta-2 hover:text-erro" aria-label={`Apagar o modelo ${modelo.nome}`} onClick={() => setConfirmar(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : null}
      </div>
    </Cartao>
  );
}

export function AbaModelos({ modelos, editavel }: { modelos: ModeloPlano[]; editavel: boolean }) {
  if (!modelos.length) {
    return (
      <Vazio titulo="Nenhum modelo ainda">
        Abra um plano que ficou bom e clique em <strong>Salvar como modelo</strong>. Na próxima pessoa, “Começar de um modelo” traz as refeições prontas, e “Ajustar as
        quantidades às metas” acerta as porções para ela.
      </Vazio>
    );
  }
  return (
    <div className="grid gap-4">
      {modelos.map((m) => (
        <EditorDeModelo key={`${m.id}-${m.versao}`} modelo={m} editavel={editavel} />
      ))}
    </div>
  );
}
