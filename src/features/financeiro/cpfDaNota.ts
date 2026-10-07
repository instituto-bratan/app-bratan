// CPF NA NOTA, NUMA TELA SÓ (07/10/2026) — as regras puras.
//
// Pedido do Lucas: "Quero colocar/editar o CPF direto no Lote de notas
// conferido (Impostos & NFs) e emitir numa tela só, sem ir na aba Pacientes. E
// em Lançar Dia também: colocar o CPF e já emitir de lá."
//
// O campo é um só (CpfDaNotaInline), usado no lote e na lista do Lançar Dia.
// As decisões moram aqui para as duas telas decidirem igual e o teste trancar:
//  · o CPF vai para a ficha ligada à comanda (contato_documento) — só quem a
//    RLS deixa gravar vê o campo;
//  · TRAVA: se a nota sai no nome de uma pessoa e a comanda está ligada à ficha
//    de OUTRA (o caso Simone ligada à ficha do filho Murilo, ou a nota no nome
//    de quem pagou), o CPF NÃO vai para a ficha — gravaria o documento de uma
//    pessoa no cadastro de outra. Quem emite pode mandar o CPF só nesta nota;
//    quem não emite só lê o aviso;
//  · emitir é sempre de quem podeEmitirNota (por padrão, só o Estevão).
import { primeiroNome, primeirosNomesBatem } from "@/features/crm/nameMatch";

export type SituacaoDoCpfDaNota = "CARREGANDO" | "SEM_FICHA" | "OUTRA_PESSOA" | "SEM_CPF" | "COM_CPF";
export type AcaoDoCpfDaNota = "GUARDAR_E_EMITIR" | "GUARDAR" | "SO_NESTA_NOTA";

/**
 * A comanda está ligada à ficha de OUTRA pessoa? Primeiro nome diferente (com a
 * mesma tolerância de digitação do CRM). Nome que não se sabe não trava.
 */
export function fichaDeOutraPessoa(nomeDaNota: string, nomeDaFicha: string | null | undefined) {
  if (!nomeDaFicha || !primeiroNome(nomeDaFicha) || !primeiroNome(nomeDaNota)) return false;
  return !primeirosNomesBatem(nomeDaNota, nomeDaFicha);
}

export function situacaoDoCpfDaNota(entrada: {
  contactRef: string | null | undefined;
  nomeDaNota: string;
  nomeDaFicha: string | null | undefined;
  /** undefined = ainda conferindo a ficha. */
  temCpf: boolean | undefined;
}): SituacaoDoCpfDaNota {
  if (!entrada.contactRef) return "SEM_FICHA";
  if (fichaDeOutraPessoa(entrada.nomeDaNota, entrada.nomeDaFicha)) return "OUTRA_PESSOA";
  if (entrada.temCpf === undefined) return "CARREGANDO";
  return entrada.temCpf ? "COM_CPF" : "SEM_CPF";
}

/** O aviso em cima do campo (português de balcão). */
export function avisoDoCpfDaNota(situacao: SituacaoDoCpfDaNota, nomes: { nomeDaNota: string; nomeDaFicha: string | null | undefined }) {
  if (situacao === "OUTRA_PESSOA") {
    return `Esta nota sai no nome de ${nomes.nomeDaNota}, mas a comanda está ligada à ficha de ${nomes.nomeDaFicha}. O CPF não vai para a ficha de ${nomes.nomeDaFicha}.`;
  }
  if (situacao === "SEM_FICHA") return "A comanda não está ligada a uma ficha: o CPF não tem onde ficar guardado.";
  return null;
}

/**
 * O que a pessoa pode fazer na linha. `editando` = trocando um CPF que já está
 * na ficha. Quem não grava CPF não vê o campo de guardar; quem não emite nunca
 * recebe uma ação que emite.
 */
export function acoesDoCpfDaNota(entrada: { situacao: SituacaoDoCpfDaNota; podeGravarCpf: boolean; podeEmitir: boolean; editando: boolean }): {
  mostraCampo: boolean;
  acoes: AcaoDoCpfDaNota[];
} {
  const { situacao, podeGravarCpf, podeEmitir, editando } = entrada;
  // Ficha de outra pessoa ou sem ficha: nunca grava; só emite com o CPF desta nota.
  if (situacao === "OUTRA_PESSOA" || situacao === "SEM_FICHA") {
    return podeEmitir ? { mostraCampo: true, acoes: ["SO_NESTA_NOTA"] } : { mostraCampo: false, acoes: [] };
  }
  if (situacao === "CARREGANDO" || !podeGravarCpf) return { mostraCampo: false, acoes: [] };
  if (situacao === "COM_CPF" && !editando) return { mostraCampo: false, acoes: [] };
  return { mostraCampo: true, acoes: podeEmitir ? ["GUARDAR_E_EMITIR", "GUARDAR"] : ["GUARDAR"] };
}

export function rotuloDaAcao(acao: AcaoDoCpfDaNota, todas: AcaoDoCpfDaNota[]) {
  if (acao === "GUARDAR_E_EMITIR") return "Guardar CPF e emitir";
  if (acao === "SO_NESTA_NOTA") return "Emitir com este CPF só nesta nota";
  return todas.includes("GUARDAR_E_EMITIR") ? "Só guardar" : "Guardar CPF";
}

/**
 * Tira qualquer número com cara de CPF de um texto que vai para a tela (erro do
 * banco, recado). O CPF não aparece inteiro em aviso, toast nem log.
 */
export function semCpfNoTexto(texto: string) {
  return String(texto ?? "").replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, "***.***.***-**");
}
