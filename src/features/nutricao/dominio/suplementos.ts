// BLOCO "SUPLEMENTOS E MEDICAMENTOS" (28/09/2026).
//
// Como a Dra. Géssica faz hoje (áudio): pergunta como a pessoa está usando cada
// item e confere com a prescrição do Dr. Daniel. Se diverge, orienta na hora e
// escreve que "não estava usando corretamente, mas foi orientado a partir
// daquela data". A prescrição aqui sempre vem do item que ela registrou; o
// sistema nunca cria, sugere ou muda dose.
import { normalizarParaBusca } from "./extracao";
import { dataCurta, normalizarTexto, terminarComPonto } from "./texto";
import type { ConferenciaUso, Id, ItemUso } from "./tipos";

export function textoDaPrescricao(item: Pick<ItemUso, "dose" | "frequencia" | "horario">): string {
  return [item.dose, item.frequencia, item.horario]
    .map((parte) => parte.trim())
    .filter(Boolean)
    .join(", ");
}

export function conferenciaDoItem(item: ItemUso, novoId: () => Id): ConferenciaUso {
  return {
    id: novoId(),
    itemId: item.id,
    nome: item.nome,
    prescricao: textoDaPrescricao(item),
    usoRelatado: "",
    adesao: "nao_informado",
    orientacao: "",
    orientadoEm: null,
    origem: null,
    evidencias: [],
  };
}

function trechoDaOrientacao(c: ConferenciaUso): string {
  const orientacao = c.orientacao.trim();
  if (!orientacao) return "";
  const quando = c.orientadoEm ? ` em ${dataCurta(c.orientadoEm)}` : "";
  return ` Orientação${quando}: ${terminarComPonto(orientacao)}`;
}

export function linhaDaConferencia(c: ConferenciaUso): string {
  const nome = c.nome.trim();
  const relato = c.usoRelatado.trim();
  let linha: string;
  switch (c.adesao) {
    case "ok":
      linha = `${nome}: adesão ok.`;
      break;
    case "divergente": {
      const prescricao = c.prescricao.trim() ? `prescrição ${c.prescricao.trim()}; ` : "";
      linha = `${nome}: ${prescricao}relatou ${relato ? `uso ${relato.replace(/^uso\s+/i, "")}` : "uso diferente do prescrito"}.`;
      break;
    }
    case "nao_usa":
      linha = `${nome}: não está usando${relato ? ` (${relato})` : ""}.`;
      break;
    default:
      // Sem conferir a adesão, a orientação dada continua valendo (achado da revisão de 28/09).
      if (!c.orientacao.trim()) return normalizarTexto(`${nome}: não informado.`);
      linha = `${nome}: adesão não informada.`;
  }
  return normalizarTexto(linha + trechoDaOrientacao(c));
}

/**
 * Enquanto o checkpoint é rascunho, a prescrição acompanha a lista registrada:
 * se ela corrige um item no meio da consulta, o prontuário sai com o valor
 * novo. Item registrado depois entra na conferência; se ele já tinha sido
 * mencionado fora da lista com o mesmo nome, é essa conferência que passa a
 * apontar para o item (sem duplicar no prontuário). Nada mudou = mesma lista.
 */
export function sincronizarPrescricoes(conferencias: ConferenciaUso[], itens: ItemUso[], novoId: () => Id): ConferenciaUso[] {
  let mudou = false;
  const porId = new Map(itens.map((i) => [i.id, i]));
  const ligados = new Set(conferencias.map((c) => c.itemId).filter(Boolean));
  const soltosPorNome = new Map(
    itens.filter((i) => i.situacao === "em_uso" && !ligados.has(i.id)).map((i) => [normalizarParaBusca(i.nome), i] as const),
  );
  const atualizadas = conferencias.map((c) => {
    let item = c.itemId ? porId.get(c.itemId) : undefined;
    if (!c.itemId) {
      const chave = normalizarParaBusca(c.nome);
      item = chave ? soltosPorNome.get(chave) : undefined;
      if (!item) return c;
      soltosPorNome.delete(chave);
      mudou = true;
      return { ...c, itemId: item.id, nome: item.nome, prescricao: textoDaPrescricao(item) };
    }
    if (!item) return c;
    const prescricao = textoDaPrescricao(item);
    if (prescricao === c.prescricao && item.nome === c.nome) return c;
    mudou = true;
    return { ...c, prescricao, nome: item.nome };
  });
  const presentes = new Set(atualizadas.map((c) => c.itemId).filter(Boolean));
  const novos = itens.filter((i) => i.situacao === "em_uso" && !presentes.has(i.id)).map((i) => conferenciaDoItem(i, novoId));
  if (novos.length) mudou = true;
  return mudou ? [...atualizadas, ...novos] : conferencias;
}
