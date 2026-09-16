// BIOIMPEDÂNCIA DA INBODY DENTRO DO APP (16/09/2026).
//
// O aparelho da InBody guarda todos os exames e exporta uma planilha (pelo
// Lookin'Body do computador ou pelo pendrive do próprio aparelho). Este módulo
// lê essa planilha e devolve as medições já casadas com os pacientes do CRM,
// para a enfermagem conferir antes de salvar.
//
// Por que por arquivo e não pela API: a API da InBody (LookinBody Web) é um
// serviço pago, com contrato à parte, e mesmo assim só CONSULTA — não avisa
// quando sai um exame novo. O arquivo entrega o mesmo dado hoje, sem contrato.
//
// Regra que vale a pena saber: "massa magra" aqui é a MASSA LIVRE DE GORDURA
// (FFM / massa magra), não a massa muscular esquelética (SMM / MME). São
// números diferentes, e trocar um pelo outro estraga a curva do paciente.

import { personNamesMatch } from "@/features/crm/nameMatch";

export type MedicaoImportada = {
  /** Linha da planilha (1 = primeira linha do arquivo), para a pessoa achar o erro. */
  linha: number;
  nome: string;
  dia: string; // YYYY-MM-DD
  pesoKg: number | null;
  gorduraPct: number | null;
  massaMagraKg: number | null;
  cinturaCm: number | null;
};

export type ColunasInBody = {
  nome: number;
  dia: number;
  peso: number;
  gordura: number;
  massaMagra: number;
  cintura: number;
};

// Os títulos que a InBody usa, em inglês e em português. Comparação sem acento,
// sem maiúscula e sem pontuação — planilha de aparelho muda de versão para versão.
const TITULOS = {
  nome: ["name", "nome", "nome do usuario", "user name", "username", "paciente"],
  dia: ["test date time", "test date  time", "test date", "test datetime", "data do teste", "data hora do teste", "data teste", "data", "date"],
  peso: ["weight", "peso", "peso kg", "weight kg"],
  gordura: ["pbf", "percent body fat", "body fat percentage", "pgc", "percentual de gordura", "gordura corporal", "gordura corporal pct", "percentual de gordura corporal"],
  // FFM/massa magra primeiro; SLM (soft lean mass) só como último recurso.
  massaMagra: ["ffm", "fat free mass", "massa livre de gordura", "massa magra", "mlg", "slm", "soft lean mass"],
  cintura: ["waist circumference", "circunferencia da cintura", "circunferencia abdominal", "cintura", "wc"],
} as const;

export function normalizarTitulo(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function acharColuna(titulos: string[], candidatos: readonly string[]) {
  // Título idêntico ganha de título que apenas contém — senão "Weight" casaria
  // com "Target Weight", que é meta, não medida.
  for (const candidato of candidatos) {
    const exato = titulos.indexOf(candidato);
    if (exato >= 0) return exato;
  }
  for (const candidato of candidatos) {
    const contem = titulos.findIndex((titulo) => titulo.startsWith(`${candidato} `) || titulo.endsWith(` ${candidato}`));
    if (contem >= 0) return contem;
  }
  return -1;
}

/**
 * Acha a linha de cabeçalho e o que cada coluna significa. Devolve null quando
 * o arquivo não tem, no mínimo, nome + data + peso — sem os três não dá para
 * montar uma medição.
 */
export function lerCabecalhoInBody(linhas: string[][]): { indiceDoCabecalho: number; colunas: ColunasInBody } | null {
  const limite = Math.min(linhas.length, 20);
  for (let i = 0; i < limite; i += 1) {
    const titulos = linhas[i].map(normalizarTitulo);
    const colunas: ColunasInBody = {
      nome: acharColuna(titulos, TITULOS.nome),
      dia: acharColuna(titulos, TITULOS.dia),
      peso: acharColuna(titulos, TITULOS.peso),
      gordura: acharColuna(titulos, TITULOS.gordura),
      massaMagra: acharColuna(titulos, TITULOS.massaMagra),
      cintura: acharColuna(titulos, TITULOS.cintura),
    };
    if (colunas.nome >= 0 && colunas.dia >= 0 && colunas.peso >= 0) return { indiceDoCabecalho: i, colunas };
  }
  return null;
}

/** Número da planilha: aceita "72,4", "72.4" e "72.4 kg". */
export function numeroDaCelula(valor: string | undefined): number | null {
  if (!valor) return null;
  const limpo = valor.replace(/[^\d,.-]/g, "").trim();
  if (!limpo) return null;
  // Com vírgula E ponto, a vírgula é o decimal (padrão brasileiro: 1.234,5).
  const texto = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

/** Data da planilha: ISO, dd/mm/aaaa, mm/dd/aaaa e o número serial do Excel. */
export function diaDaCelula(valor: string | undefined): string | null {
  if (!valor) return null;
  const texto = valor.trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const barra = texto.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (barra) {
    const primeiro = Number(barra[1]);
    const segundo = Number(barra[2]);
    // Acima de 12 no primeiro campo só pode ser dia; o resto segue o padrão
    // brasileiro (dd/mm), que é como o aparelho sai configurado aqui.
    const dia = primeiro > 12 ? primeiro : segundo > 12 ? segundo : primeiro;
    const mes = primeiro > 12 ? segundo : segundo > 12 ? primeiro : segundo;
    return `${barra[3]}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }

  const serial = Number(texto);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    // Serial do Excel: dia 1 é 01/01/1900, com o bug do ano bissexto de 1900.
    const data = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    return data.toISOString().slice(0, 10);
  }
  return null;
}

/** Descarta o que claramente não é medida de gente (o aparelho às vezes exporta linha de teste). */
function medidaPlausivel(medicao: MedicaoImportada) {
  if (medicao.pesoKg !== null && (medicao.pesoKg < 20 || medicao.pesoKg > 400)) return false;
  if (medicao.gorduraPct !== null && (medicao.gorduraPct < 1 || medicao.gorduraPct > 80)) return false;
  if (medicao.massaMagraKg !== null && (medicao.massaMagraKg < 10 || medicao.massaMagraKg > 200)) return false;
  if (medicao.cinturaCm !== null && (medicao.cinturaCm < 30 || medicao.cinturaCm > 250)) return false;
  return true;
}

export type LeituraInBody = {
  medicoes: MedicaoImportada[];
  /** Linhas que o app não conseguiu ler, com o motivo em português. */
  problemas: { linha: number; motivo: string }[];
};

/** Transforma as linhas da planilha em medições. Não toca no banco. */
export function lerMedicoesInBody(linhas: string[][]): LeituraInBody {
  const cabecalho = lerCabecalhoInBody(linhas);
  if (!cabecalho) {
    return { medicoes: [], problemas: [{ linha: 1, motivo: "Não achei as colunas de nome, data do teste e peso. Exporte de novo pelo Lookin'Body, sem tirar o cabeçalho." }] };
  }
  const { indiceDoCabecalho, colunas } = cabecalho;
  const medicoes: MedicaoImportada[] = [];
  const problemas: { linha: number; motivo: string }[] = [];

  for (let i = indiceDoCabecalho + 1; i < linhas.length; i += 1) {
    const celulas = linhas[i];
    const numeroDaLinha = i + 1;
    const nome = (celulas[colunas.nome] ?? "").trim();
    if (!nome) continue; // linha em branco entre blocos: não é erro

    const dia = diaDaCelula(celulas[colunas.dia]);
    if (!dia) {
      problemas.push({ linha: numeroDaLinha, motivo: `Não entendi a data do teste de ${nome}.` });
      continue;
    }
    const medicao: MedicaoImportada = {
      linha: numeroDaLinha,
      nome,
      dia,
      pesoKg: numeroDaCelula(celulas[colunas.peso]),
      gorduraPct: colunas.gordura >= 0 ? numeroDaCelula(celulas[colunas.gordura]) : null,
      massaMagraKg: colunas.massaMagra >= 0 ? numeroDaCelula(celulas[colunas.massaMagra]) : null,
      cinturaCm: colunas.cintura >= 0 ? numeroDaCelula(celulas[colunas.cintura]) : null,
    };
    if (medicao.pesoKg === null && medicao.gorduraPct === null && medicao.massaMagraKg === null && medicao.cinturaCm === null) {
      problemas.push({ linha: numeroDaLinha, motivo: `A linha de ${nome} não trouxe nenhuma medida.` });
      continue;
    }
    if (!medidaPlausivel(medicao)) {
      problemas.push({ linha: numeroDaLinha, motivo: `Os valores de ${nome} estão fora do que uma pessoa mede — confira a linha no arquivo.` });
      continue;
    }
    medicoes.push(medicao);
  }
  return { medicoes, problemas };
}

export type Contato = { id: string; name: string };

export type Casamento = {
  /** Achou um paciente só: pode salvar. */
  prontas: { medicao: MedicaoImportada; contactRef: string; contatoNome: string }[];
  /** O nome bate com mais de um paciente: alguém precisa escolher. */
  ambiguas: { medicao: MedicaoImportada; candidatos: Contato[] }[];
  /** Nome que não existe no CRM. */
  semDono: MedicaoImportada[];
  /** Já existe medição desse paciente nesse dia — não entra de novo. */
  repetidas: { medicao: MedicaoImportada; contatoNome: string }[];
};

/**
 * Casa cada medição com um paciente do CRM pelo nome, e separa o que já existe.
 * Repetida é por paciente + dia: reimportar o mesmo arquivo não duplica nada.
 */
export function casarMedicoesComContatos(
  medicoes: MedicaoImportada[],
  contatos: Contato[],
  jaRegistradas: { contactRef: string; dia: string }[],
): Casamento {
  const existentes = new Set(jaRegistradas.map((item) => `${item.contactRef}|${item.dia}`));
  const resultado: Casamento = { prontas: [], ambiguas: [], semDono: [], repetidas: [] };
  // Dentro do próprio arquivo, o mesmo paciente no mesmo dia também só entra uma vez.
  const vistas = new Set<string>();

  for (const medicao of medicoes) {
    const candidatos = contatos.filter((contato) => personNamesMatch(contato.name, medicao.nome));
    if (candidatos.length === 0) {
      resultado.semDono.push(medicao);
      continue;
    }
    if (candidatos.length > 1) {
      resultado.ambiguas.push({ medicao, candidatos });
      continue;
    }
    const chave = `${candidatos[0].id}|${medicao.dia}`;
    if (existentes.has(chave) || vistas.has(chave)) {
      resultado.repetidas.push({ medicao, contatoNome: candidatos[0].name });
      continue;
    }
    vistas.add(chave);
    resultado.prontas.push({ medicao, contactRef: candidatos[0].id, contatoNome: candidatos[0].name });
  }
  return resultado;
}

/** Frase do resumo — número derivado nunca aparece sozinho. */
export function fraseDaImportacao(casamento: Casamento) {
  const partes = [`${casamento.prontas.length} ${casamento.prontas.length === 1 ? "medição pronta para salvar" : "medições prontas para salvar"}`];
  if (casamento.repetidas.length) partes.push(`${casamento.repetidas.length} que já estavam no app`);
  if (casamento.ambiguas.length) partes.push(`${casamento.ambiguas.length} com mais de um paciente do mesmo nome`);
  if (casamento.semDono.length) partes.push(`${casamento.semDono.length} sem paciente no CRM`);
  return partes.join(" · ");
}
