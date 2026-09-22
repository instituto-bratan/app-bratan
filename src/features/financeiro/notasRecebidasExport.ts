// O PACOTE DO MÊS PARA A CONTABILIDADE (22/09/2026)
//
// Lucas: "eu preciso ter todas, todas, todas as notas fiscais que vêm para a
// gente, porque eu tenho que mandar para a contabilidade". Além da pasta do mês
// no SharePoint (que recebe cada arquivo sozinha), este módulo monta um ZIP
// do mês com tudo o que existe — PDF e XML de cada nota — e um índice em
// Excel na frente: número, emitente, CNPJ, data, valor, tipo, situação, a conta
// a que foi ligada e o nome do arquivo. É o que o contador abre primeiro.
//
// O ZIP é o mesmo "stored" do gerador de Excel (sem dependência nova).
import { buildXlsx, zipStored, type XlsxSheet } from "@/lib/xlsxWriter";
import { salvarArquivo } from "@/lib/salvarArquivo";
import type { NotaRecebida } from "@/lib/remote/notasRecebidas";
import { nomeDoArquivoRecebido, numeroCurto, pastaDoMes } from "../../../supabase/functions/_shared/notasRecebidas";

export type ContaResumida = { id: string; description: string };

const ROTULO_TIPO: Record<NotaRecebida["tipo"], string> = { NFE: "NF-e (mercadoria)", NFSE: "NFS-e nacional", NFSE_SP: "NFS-e São Paulo" };
const ROTULO_STATUS: Record<NotaRecebida["status"], string> = { NOVA: "sem conta ligada", VINCULADA: "ligada à conta", IGNORADA: "não é nossa", CANCELADA: "cancelada" };

/** As notas do mês (pela data de emissão), das mais antigas às mais novas. */
export function notasDoMes(notas: NotaRecebida[], mes: string) {
  return notas.filter((n) => pastaDoMes(n.emitidaEm) === mes).sort((a, b) => a.emitidaEm.localeCompare(b.emitidaEm));
}

/** Contagens que a tela mostra em uma frase — sempre com a frase, nunca só o número. */
export function resumoDoMes(notas: NotaRecebida[]) {
  const validas = notas.filter((n) => n.status !== "CANCELADA" && n.status !== "IGNORADA");
  const comArquivo = validas.filter((n) => n.storagePathPdf || n.storagePathXml || n.urlExterna).length;
  const total = validas.reduce((s, n) => s + n.valor, 0);
  return { quantidade: validas.length, comArquivo, semArquivo: validas.length - comArquivo, total, ligadas: validas.filter((n) => n.status === "VINCULADA").length };
}

export function abaIndice(notas: NotaRecebida[], mes: string, contas: ContaResumida[]): XlsxSheet {
  const nomeDaConta = (ref: string | null) => (ref ? contas.find((c) => c.id === ref)?.description ?? ref : "");
  return {
    name: "Notas recebidas",
    title: `Notas fiscais emitidas contra o Instituto Bratan — ${mes.slice(5, 7)}/${mes.slice(0, 4)}`,
    subtitle: `Fonte: SEFAZ/Focus (NF-e e NFS-e nacional) e portal da prefeitura de São Paulo (NFS-e tomadas). Gerado pelo app em ${new Date().toLocaleDateString("pt-BR")}.`,
    columns: [
      { header: "Emissão", width: 12, kind: "data" },
      { header: "Tipo", width: 18 },
      { header: "Número", width: 10 },
      { header: "Emitente", width: 44 },
      { header: "CNPJ/CPF", width: 18 },
      { header: "Valor", width: 14, kind: "dinheiro" },
      { header: "Situação", width: 16 },
      { header: "Conta no app", width: 40 },
      { header: "Arquivo no ZIP", width: 48 },
      { header: "Chave / link", width: 50 },
    ],
    rows: notas.map((n) => [
      n.emitidaEm.slice(0, 10),
      ROTULO_TIPO[n.tipo],
      numeroCurto(n),
      n.emitenteNome,
      n.emitenteDocumento,
      n.valor,
      ROTULO_STATUS[n.status],
      nomeDaConta(n.expenseRef),
      n.storagePathPdf ? nomeDoArquivoRecebido(n, "pdf") : n.storagePathXml ? nomeDoArquivoRecebido(n, "xml") : n.urlExterna ? "(abrir pelo link)" : "(aguardando a SEFAZ)",
      n.urlExterna || n.chave,
    ]),
    totalRow: ["", "", "", `${notas.length} notas`, "", notas.filter((n) => n.status !== "CANCELADA").reduce((s, n) => s + n.valor, 0), "", "", "", ""],
  };
}

/**
 * Monta e salva o ZIP do mês. `baixar` traz os bytes de um arquivo do bucket
 * (URL assinada) — fica fora daqui para o módulo continuar testável.
 */
export async function baixarZipDoMes(notas: NotaRecebida[], mes: string, contas: ContaResumida[], baixar: (storagePath: string) => Promise<Uint8Array>, aoProgredir?: (feitos: number, total: number) => void) {
  const doMes = notasDoMes(notas, mes);
  const arquivos: { nome: string; dados: Uint8Array }[] = [];
  const indice = buildXlsx([abaIndice(doMes, mes, contas)]);
  arquivos.push({ nome: `indice-notas-recebidas-${mes}.xlsx`, dados: new Uint8Array(await indice.arrayBuffer()) });
  const comArquivo = doMes.filter((n) => n.storagePathPdf || n.storagePathXml);
  let feitos = 0;
  for (const n of comArquivo) {
    for (const [caminho, ext] of [[n.storagePathPdf, "pdf"], [n.storagePathXml, "xml"]] as [string | null, "pdf" | "xml"][]) {
      if (!caminho) continue;
      try {
        arquivos.push({ nome: `${ext}/${nomeDoArquivoRecebido(n, ext)}`, dados: await baixar(caminho) });
      } catch {
        /* arquivo que não veio fica fora do ZIP; o índice mostra o que existe */
      }
    }
    feitos += 1;
    aoProgredir?.(feitos, comArquivo.length);
  }
  const blob = new Blob([zipStored(arquivos) as unknown as BlobPart], { type: "application/zip" });
  return salvarArquivo(`notas-recebidas-${mes}.zip`, blob);
}
