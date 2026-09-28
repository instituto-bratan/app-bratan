// O QUE A TELA "HOJE" MOSTRA (28/09/2026).
//
// Pedido do briefing: identificar atendimentos previstos, checkpoints
// pendentes, planos em rascunho, documentos finalizados ainda não entregues e
// retornos a organizar, cada um abrindo a tarefa. Regra de entrega: "PDF
// gerado", "compartilhado" e "recebimento confirmado" são etapas diferentes;
// exportar o arquivo não conclui a entrega.
import { estadoDaEntrega } from "./plano";
import { situacaoDoPrazo, type SituacaoPrazo } from "./prazos";
import type { Atendimento, DataISO, Pessoa, Plano, TipoAtendimento } from "./tipos";

export type ItemDeAgenda = { id: string; data: DataISO; hora: string; pessoaId: string; tipo: TipoAtendimento; versao: number };

export type EntradaDoPainel = {
  hoje: DataISO;
  pessoas: Pessoa[];
  atendimentos: Atendimento[];
  planos: Plano[];
  agenda: ItemDeAgenda[];
  feriados: DataISO[];
};

export type Painel = {
  agenda: { id: string; hora: string; tipo: TipoAtendimento; pessoa: Pessoa; atendimento: Atendimento | null }[];
  aEntregar: { pessoa: Pessoa; atendimento: Atendimento; plano: Plano | null; situacao: SituacaoPrazo }[];
  checkpointsEmRascunho: { pessoa: Pessoa; atendimento: Atendimento }[];
  planosEmRascunho: { pessoa: Pessoa; plano: Plano }[];
  pdfNaoCompartilhado: { pessoa: Pessoa; plano: Plano }[];
  semConfirmacao: { pessoa: Pessoa; plano: Plano; compartilhadoEm: string }[];
  retornos: { pessoa: Pessoa; ultimoAtendimento: DataISO }[];
};

const DIAS_PARA_RETORNO = 30;

function diasEntre(de: DataISO, ate: DataISO): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

const ORDEM_DO_PRAZO: Record<SituacaoPrazo["estado"], number> = { atrasado: 0, vence_hoje: 1, no_prazo: 2 };

export function montarPainel(entrada: EntradaDoPainel): Painel {
  const { hoje, feriados } = entrada;
  const pessoaPorId = new Map(entrada.pessoas.map((p) => [p.id, p]));
  const comPessoa = <T extends { pessoaId: string }>(x: T) => pessoaPorId.get(x.pessoaId);

  const agenda = entrada.agenda
    .filter((a) => a.data === hoje)
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .flatMap((a) => {
      const pessoa = pessoaPorId.get(a.pessoaId);
      if (!pessoa) return [];
      const atendimento = entrada.atendimentos.find((x) => x.pessoaId === a.pessoaId && x.data === hoje) ?? null;
      return [{ id: a.id, hora: a.hora, tipo: a.tipo, pessoa, atendimento }];
    });

  const planoCompartilhado = (p: Plano) => p.estado !== "rascunho" && estadoDaEntrega(p).compartilhadoEm !== null;

  const aEntregar = entrada.atendimentos
    .filter((a) => a.estado === "finalizado" && a.prazoPlano)
    .flatMap((atendimento) => {
      const pessoa = comPessoa(atendimento);
      if (!pessoa || !atendimento.prazoPlano) return [];
      const doAtendimento = entrada.planos.filter((p) => p.atendimentoId === atendimento.id);
      if (doAtendimento.some(planoCompartilhado)) return [];
      const plano = doAtendimento.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))[0] ?? null;
      return [{ pessoa, atendimento, plano, situacao: situacaoDoPrazo(hoje, atendimento.prazoPlano, feriados) }];
    })
    .sort((a, b) => ORDEM_DO_PRAZO[a.situacao.estado] - ORDEM_DO_PRAZO[b.situacao.estado] || (a.atendimento.prazoPlano ?? "").localeCompare(b.atendimento.prazoPlano ?? ""));

  const checkpointsEmRascunho = entrada.atendimentos
    .filter((a) => a.estado === "rascunho")
    .sort((a, b) => b.data.localeCompare(a.data))
    .flatMap((atendimento) => {
      const pessoa = comPessoa(atendimento);
      return pessoa ? [{ pessoa, atendimento }] : [];
    });

  const planosEmRascunho = entrada.planos
    .filter((p) => p.estado === "rascunho")
    .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
    .flatMap((plano) => {
      const pessoa = comPessoa(plano);
      return pessoa ? [{ pessoa, plano }] : [];
    });

  const finalizados = entrada.planos.filter((p) => p.estado === "finalizado");

  const pdfNaoCompartilhado = finalizados.flatMap((plano) => {
    const e = estadoDaEntrega(plano);
    const pessoa = comPessoa(plano);
    return pessoa && e.etapa === "pdf_gerado" ? [{ pessoa, plano }] : [];
  });

  const semConfirmacao = finalizados.flatMap((plano) => {
    const e = estadoDaEntrega(plano);
    const pessoa = comPessoa(plano);
    return pessoa && e.etapa === "compartilhado" && e.compartilhadoEm ? [{ pessoa, plano, compartilhadoEm: e.compartilhadoEm }] : [];
  });

  const naAgendaHoje = new Set(agenda.map((a) => a.pessoa.id));
  const retornos = entrada.pessoas.flatMap((pessoa) => {
    if (!pessoa.faseAcompanhamento || naAgendaHoje.has(pessoa.id)) return [];
    const datas = entrada.atendimentos.filter((a) => a.pessoaId === pessoa.id).map((a) => a.data).sort();
    const ultimo = datas.length ? datas[datas.length - 1] : null;
    if (!ultimo || diasEntre(ultimo, hoje) <= DIAS_PARA_RETORNO) return [];
    return [{ pessoa, ultimoAtendimento: ultimo }];
  });

  return { agenda, aEntregar, checkpointsEmRascunho, planosEmRascunho, pdfNaoCompartilhado, semConfirmacao, retornos };
}
