// SALVAR ARQUIVO ONDE A PESSOA ESCOLHE (09/09/2026, Lucas: "quando eu baixo não
// consigo achar nas pastas; 'mostrar no Finder' não vai").
//
// O download pelo <a download> funcionava (o arquivo estava em ~/Downloads,
// válido), mas no app instalado (PWA) o Chrome não abre o Finder e a pessoa
// fica sem saber para onde foi. Solução em duas camadas:
//   1. Chrome/Edge (inclusive o app instalado) têm showSaveFilePicker: abre a
//      janela "Salvar como" do sistema, a pessoa escolhe a pasta e vê o nome.
//   2. Safari/Firefox não têm: cai no <a download> de sempre e a tela avisa
//      "salvo na pasta Downloads com o nome X".
// Nos dois casos quem chamou recebe o resultado para mostrar na tela.
export type ResultadoSalvar = {
  status: "SALVO_ONDE_ESCOLHEU" | "SALVO_EM_DOWNLOADS" | "CANCELADO";
  nome: string;
};

type OpcaoTipo = { description: string; accept: Record<string, string[]> };
type SavePicker = (opcoes: { suggestedName?: string; types?: OpcaoTipo[]; excludeAcceptAllOption?: boolean }) => Promise<{
  createWritable: () => Promise<{ write: (dados: Blob) => Promise<void>; close: () => Promise<void> }>;
  name?: string;
}>;

const TIPOS: Record<string, OpcaoTipo> = {
  xlsx: { description: "Planilha do Excel", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } },
  csv: { description: "Planilha CSV", accept: { "text/csv": [".csv"] } },
  pdf: { description: "PDF", accept: { "application/pdf": [".pdf"] } },
  txt: { description: "Texto", accept: { "text/plain": [".txt"] } },
  json: { description: "JSON", accept: { "application/json": [".json"] } },
};

function pickerDisponivel(): SavePicker | null {
  if (typeof window === "undefined") return null;
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  // Dentro de iframe o picker é bloqueado; só vale na janela de cima.
  if (typeof picker !== "function" || window.top !== window.self) return null;
  return picker;
}

function baixarPeloLink(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revogar na hora fazia o Safari (e às vezes o Chrome) perder o arquivo.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Salva um Blob com o nome dado. Pede a pasta quando o navegador permite; senão vai para Downloads. */
export async function salvarArquivo(nome: string, blob: Blob): Promise<ResultadoSalvar> {
  const extensao = (nome.split(".").pop() || "").toLowerCase();
  const picker = pickerDisponivel();
  if (picker) {
    try {
      const tipo = TIPOS[extensao];
      const handle = await picker({ suggestedName: nome, types: tipo ? [tipo] : undefined, excludeAcceptAllOption: false });
      const escrita = await handle.createWritable();
      await escrita.write(blob);
      await escrita.close();
      return { status: "SALVO_ONDE_ESCOLHEU", nome: handle.name || nome };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return { status: "CANCELADO", nome };
      // Picker indisponível/negado (política, contexto): segue pelo caminho antigo.
      console.warn("Salvar como falhou; usando download direto.", error);
    }
  }
  baixarPeloLink(nome, blob);
  return { status: "SALVO_EM_DOWNLOADS", nome };
}

/** Frase para mostrar na tela depois de salvar. */
export function mensagemDoSalvamento(resultado: ResultadoSalvar) {
  if (resultado.status === "CANCELADO") return "";
  if (resultado.status === "SALVO_ONDE_ESCOLHEU") return `Salvo: ${resultado.nome}`;
  return `Salvo na pasta Downloads: ${resultado.nome}`;
}
