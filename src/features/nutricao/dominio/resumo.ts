// TEXTO DO PRONTUÁRIO E FINALIZAÇÃO DO CHECKPOINT (28/09/2026).
//
// O texto é o que ela cola no iClinic: as 14 linhas do roteiro, a linha do
// plano e o bloco de suplementos. Finalizar congela o registro; corrigir
// depois é retificação, com motivo, autor e data, guardando o que havia antes.
import { CAMPO_IDS, TITULO_BLOCO_SUPLEMENTOS, rotuloDoCampo } from "./roteiro";
import { conteudoDoCampo, linhaDoCampo } from "./campos";
import { linhaDaConferencia } from "./suplementos";
import { normalizarTexto } from "./texto";
import type { Atendimento, CampoId, ConfigNutricao, DataISO, MomentoISO, Retificacao } from "./tipos";

export type LinhaDaFolha = {
  campo: CampoId | null;
  rotulo: string;
  texto: string;
  estado: "ok" | "nao_informado" | "pendente" | "plano" | "titulo" | "suplemento" | "vazia";
};

/** Linhas com estado, para a folha desenhar cada uma (a pendente aparece, marcada). */
export function linhasDaFolha(at: Atendimento, config: ConfigNutricao): LinhaDaFolha[] {
  const linhas: LinhaDaFolha[] = [];
  for (const id of CAMPO_IDS) {
    const valor = at.campos[id];
    const rotulo = rotuloDoCampo(id);
    if (valor.estado === "anterior_pendente") {
      linhas.push({ campo: id, rotulo, texto: conteudoDoCampo(id, valor, config), estado: "pendente" });
      continue;
    }
    const conteudo = conteudoDoCampo(id, valor, config);
    linhas.push({ campo: id, rotulo, texto: conteudo || "não informado", estado: conteudo ? "ok" : "nao_informado" });
  }
  if (at.linhaPlano.ativa && at.linhaPlano.texto.trim()) {
    linhas.push({ campo: null, rotulo: "", texto: normalizarTexto(at.linhaPlano.texto), estado: "plano" });
  }
  linhas.push({ campo: null, rotulo: "", texto: "", estado: "vazia" });
  linhas.push({ campo: null, rotulo: "", texto: TITULO_BLOCO_SUPLEMENTOS, estado: "titulo" });
  if (at.suplementos.length === 0) {
    linhas.push({ campo: null, rotulo: "", texto: "Não informado.", estado: "suplemento" });
  } else {
    for (const c of at.suplementos) linhas.push({ campo: null, rotulo: "", texto: linhaDaConferencia(c), estado: "suplemento" });
  }
  return linhas;
}

/** Texto pronto para colar. Linha ainda pendente do anterior fica de fora. */
export function textoDoProntuario(at: Atendimento, config: ConfigNutricao): string {
  const saida: string[] = [];
  for (const id of CAMPO_IDS) {
    const linha = linhaDoCampo(id, at.campos[id], config);
    if (linha !== null) saida.push(linha);
  }
  if (at.linhaPlano.ativa && at.linhaPlano.texto.trim()) saida.push(normalizarTexto(at.linhaPlano.texto));
  saida.push("");
  saida.push(TITULO_BLOCO_SUPLEMENTOS);
  if (at.suplementos.length === 0) saida.push("Não informado.");
  for (const c of at.suplementos) saida.push(linhaDaConferencia(c));
  return saida.join("\n");
}

export type PendenciaFinalizacao = {
  tipo: "anterior_pendente" | "sugestao_pendente" | "suplemento_sugestao_pendente" | "conduta_sugestao_pendente" | "nao_classificado_pendente";
  campo: CampoId | null;
  descricao: string;
};

export function pendenciasParaFinalizar(at: Atendimento): PendenciaFinalizacao[] {
  const pendencias: PendenciaFinalizacao[] = [];
  for (const id of CAMPO_IDS) {
    const valor = at.campos[id];
    if (valor.estado === "anterior_pendente") {
      pendencias.push({ tipo: "anterior_pendente", campo: id, descricao: `${rotuloDoCampo(id)}: valor do atendimento anterior ainda não confirmado` });
    }
  }
  const org = at.organizacao;
  if (org) {
    for (const s of org.campos) {
      if (s.estado === "pendente") pendencias.push({ tipo: "sugestao_pendente", campo: s.campo, descricao: `${rotuloDoCampo(s.campo)}: sugestão da IA ainda não revisada` });
    }
    for (const s of org.suplementos) {
      if (s.estado === "pendente") pendencias.push({ tipo: "suplemento_sugestao_pendente", campo: null, descricao: `${s.nome}: sugestão da IA ainda não revisada` });
    }
    if (org.conduta && org.conduta.estado === "pendente") {
      pendencias.push({ tipo: "conduta_sugestao_pendente", campo: null, descricao: "Conduta: sugestão da IA ainda não revisada" });
    }
    for (const n of org.naoClassificados) {
      if (n.estado === "pendente") pendencias.push({ tipo: "nao_classificado_pendente", campo: null, descricao: `Mencionado e não classificado: ${n.texto}` });
    }
  }
  return pendencias;
}

export function podeFinalizar(at: Atendimento): boolean {
  return pendenciasParaFinalizar(at).length === 0;
}

/** `prazoPlano` é calculado por quem chama (prazos.ts), para a regra de dias úteis ficar num lugar só. */
export function finalizarAtendimento(at: Atendimento, agora: MomentoISO, prazoPlano: DataISO | null): Atendimento {
  const pendencias = pendenciasParaFinalizar(at);
  if (pendencias.length > 0) {
    throw new Error(`Há ${pendencias.length} pendência(s) antes de finalizar: ${pendencias.map((p) => p.descricao).join("; ")}`);
  }
  return {
    ...at,
    estado: "finalizado",
    finalizadoEm: agora,
    prazoPlano: at.linhaPlano.ativa && at.linhaPlano.texto.trim() ? prazoPlano : null,
    atualizadoEm: agora,
  };
}

export type ConteudoRetificavel = Pick<Atendimento, "campos" | "suplementos" | "conduta" | "linhaPlano">;

export function aplicarRetificacao(at: Atendimento, novo: ConteudoRetificavel, motivo: string, autor: string, agora: MomentoISO): Atendimento {
  if (at.estado !== "finalizado") throw new Error("Só um checkpoint finalizado pode ser retificado.");
  if (!motivo.trim()) throw new Error("Escreva o motivo da retificação.");
  const pendentes = CAMPO_IDS.filter((id) => novo.campos[id].estado === "anterior_pendente");
  if (pendentes.length) {
    throw new Error(`Há ${pendentes.length} pendência(s): confirme ou limpe ${pendentes.map(rotuloDoCampo).join(", ")} antes de salvar a retificação.`);
  }
  const retificacao: Retificacao = {
    em: agora,
    motivo: motivo.trim(),
    autor,
    antes: JSON.parse(JSON.stringify({ campos: at.campos, suplementos: at.suplementos, conduta: at.conduta, linhaPlano: at.linhaPlano })),
  };
  return {
    ...at,
    campos: novo.campos,
    suplementos: novo.suplementos,
    conduta: novo.conduta,
    linhaPlano: novo.linhaPlano,
    retificacoes: [...at.retificacoes, retificacao],
    atualizadoEm: agora,
  };
}
