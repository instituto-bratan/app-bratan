// REVISÃO AUTOMÁTICA ANTES DE FINALIZAR O PLANO (28/09/2026).
//
// Confere o que a Dra. Géssica pediu para o documento: título "Plano alimentar
// — [mês e ano]", o nome sem "paciente", a identificação dela inteira no fim,
// nenhuma refeição vazia saindo no papel. Só bloqueia o que impede um
// documento correto; o resto vira aviso para ela decidir.
import { tituloDoPlano } from "./plano";
import { nomeNoDocumento, normalizarTexto } from "./texto";
import type { IdentificacaoProfissional, Plano } from "./tipos";

export type ItemDaRevisao = { id: string; ok: boolean; bloqueia: boolean; texto: string };
export type Revisao = { itens: ItemDaRevisao[]; podeFinalizar: boolean };

type CalculoResumido = { avisos: { descricao: string }[] };
type PaginacaoResumida = { paginas: number; avisos: { blocoId: string; tipo: string }[]; sobraMaxima: number };

export function revisarPlano(plano: Plano, identificacao: IdentificacaoProfissional, calculo: CalculoResumido, paginacao: PaginacaoResumida | null): Revisao {
  const itens: ItemDaRevisao[] = [];

  itens.push({ id: "titulo", ok: true, bloqueia: false, texto: `Título: ${tituloDoPlano(plano.mesRef)}` });

  const nome = normalizarTexto(plano.nomeDocumento);
  const semPaciente = nomeNoDocumento(nome);
  if (!semPaciente) {
    itens.push({ id: "nome", ok: false, bloqueia: true, texto: "Falta o nome da pessoa no documento." });
  } else if (semPaciente !== nome) {
    itens.push({ id: "nome", ok: false, bloqueia: false, texto: `O nome sai sem a palavra "paciente": ${semPaciente}` });
  } else {
    itens.push({ id: "nome", ok: true, bloqueia: false, texto: `Nome: ${nome}` });
  }

  const comItens = plano.refeicoes.filter((r) => r.itens.some((i) => normalizarTexto(i.descricao)));
  itens.push(
    comItens.length
      ? { id: "refeicoes", ok: true, bloqueia: false, texto: `${comItens.length} refeição(ões) no documento` }
      : { id: "refeicoes", ok: false, bloqueia: true, texto: "Nenhuma refeição tem alimento." },
  );
  const vazias = plano.refeicoes.filter((r) => !r.itens.some((i) => normalizarTexto(i.descricao)));
  if (vazias.length) {
    itens.push({ id: "refeicoes-vazias", ok: false, bloqueia: false, texto: `Sem alimento, não saem no documento: ${vazias.map((r) => r.nome).join(", ")}` });
  }

  const semMedida: string[] = [];
  for (const r of plano.refeicoes) {
    for (const i of r.itens) {
      if (normalizarTexto(i.descricao) && !i.legumes && !normalizarTexto(i.quantidade) && !i.gramas) semMedida.push(`${r.nome} · ${i.descricao}`);
    }
  }
  if (semMedida.length) itens.push({ id: "sem-medida", ok: false, bloqueia: false, texto: `Sem medida caseira: ${semMedida.join("; ")}` });

  const linhasId = identificacao.linhas.map((l) => l.trim());
  const idCompleta = linhasId.length >= 5 && linhasId.every(Boolean);
  itens.push(
    idCompleta
      ? { id: "identificacao", ok: true, bloqueia: false, texto: `Identificação no fim: ${linhasId[0]}, ${linhasId[2]}` }
      : { id: "identificacao", ok: false, bloqueia: true, texto: "A identificação profissional está incompleta (Biblioteca › Identificação)." },
  );

  itens.push(
    calculo.avisos.length
      ? { id: "calculo", ok: false, bloqueia: false, texto: `Cálculo com ${calculo.avisos.length} aviso(s): ${calculo.avisos.map((a) => a.descricao).join(" ")}` }
      : { id: "calculo", ok: true, bloqueia: false, texto: "Cálculo sem avisos" },
  );

  if (paginacao) {
    const grandes = paginacao.avisos.filter((a) => a.tipo === "maior_que_pagina").length;
    const sozinho = paginacao.avisos.some((a) => a.tipo === "cabecalho_sozinho");
    const problemas = [grandes ? `${grandes} bloco(s) maior(es) que uma página` : "", sozinho ? "título sozinho numa página" : ""].filter(Boolean);
    itens.push({
      id: "paginas",
      ok: problemas.length === 0,
      bloqueia: false,
      texto: `${paginacao.paginas} página${paginacao.paginas === 1 ? "" : "s"}, nenhuma refeição partida${problemas.length ? `; atenção: ${problemas.join(", ")}` : ""}`,
    });
  }

  return { itens, podeFinalizar: !itens.some((i) => i.bloqueia) };
}
