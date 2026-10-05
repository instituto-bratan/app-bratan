// ABA PACIENTES (05/10/2026). Pedido do Lucas: "não consigo pesquisar o perfil
// deles para colocar o CPF". A ficha do contato já existia (/crm/contatos/:id),
// mas só se chegava nela por um cartão do Kanban ou por uma linha da cadência.
// Esta aba é a lista de todo mundo, com busca, e o CPF à mão.
//
// Módulo puro: a busca e os rótulos ficam aqui, testáveis sem tela.

export type TipoDoContato = "PATIENT" | "FORMER_PATIENT" | "LEAD" | string;

export type PacienteDaLista = {
  /** A chave do contato nas telas (client_ref). */
  id: string;
  nome: string;
  apelido: string;
  telefone: string;
  whatsapp: string;
  email: string;
  tipo: TipoDoContato;
  criadoEm: string;
  /** O CPF está guardado na ficha? Só quem pode ver o CPF recebe esta informação. */
  temCpf: boolean;
};

export type FiltroDeTipo = "pacientes" | "ex" | "leads" | "todos";

export const rotuloDoTipo: Record<string, string> = {
  PATIENT: "Paciente",
  FORMER_PATIENT: "Ex-paciente",
  LEAD: "Lead",
};

/** Sem acento e sem caixa: "Géssica" acha "gessica"; "11 9 8280" acha o telefone. */
export function normalizar(texto: string) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function soDigitos(texto: string) {
  return (texto || "").replace(/\D/g, "");
}

export function passaNoFiltro(p: PacienteDaLista, filtro: FiltroDeTipo) {
  if (filtro === "todos") return true;
  if (filtro === "pacientes") return p.tipo === "PATIENT";
  if (filtro === "ex") return p.tipo === "FORMER_PATIENT";
  return p.tipo === "LEAD";
}

/**
 * Busca por nome, apelido, e-mail ou telefone. Cada palavra digitada tem que
 * aparecer em algum campo ("ana flavia" acha "Ana Flávia Araújo"); números
 * procuram no telefone sem máscara.
 */
export function buscar(lista: PacienteDaLista[], termo: string, filtro: FiltroDeTipo = "todos") {
  const limpo = normalizar(termo);
  const palavras = limpo.split(/\s+/).filter(Boolean);
  // Só números (com ou sem espaço, parêntese e traço): procura no telefone.
  const soTelefone = Boolean(limpo) && !/[a-z@]/.test(limpo) && soDigitos(limpo).length >= 3;
  const digitosDoTermo = soDigitos(limpo);
  return lista.filter((p) => {
    if (!passaNoFiltro(p, filtro)) return false;
    if (!palavras.length) return true;
    if (soTelefone) return (soDigitos(p.telefone) + " " + soDigitos(p.whatsapp)).includes(digitosDoTermo);
    const texto = normalizar(`${p.nome} ${p.apelido} ${p.email}`);
    return palavras.every((palavra) => texto.includes(palavra));
  });
}

/** Ordem da lista: quem tem CPF faltando primeiro? Não: ordem alfabética, estável. */
export function ordenar(lista: PacienteDaLista[]) {
  return [...lista].sort((a, b) => normalizar(a.nome).localeCompare(normalizar(b.nome), "pt-BR"));
}

export function resumoDaLista(lista: PacienteDaLista[], sabeCpf: boolean) {
  const pacientes = lista.filter((p) => p.tipo === "PATIENT").length;
  const comCpf = lista.filter((p) => p.temCpf).length;
  const partes = [`${lista.length} contato(s)`, `${pacientes} paciente(s)`];
  if (sabeCpf) partes.push(`${comCpf} com CPF guardado`);
  return partes.join(" · ");
}
