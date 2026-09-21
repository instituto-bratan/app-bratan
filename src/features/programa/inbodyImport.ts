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

import { personNameTokens, personNamesMatch } from "@/features/crm/nameMatch";

export type MedicaoImportada = {
  /** Linha da planilha (1 = primeira linha do arquivo), para a pessoa achar o erro. */
  linha: number;
  nome: string;
  dia: string; // YYYY-MM-DD
  pesoKg: number | null;
  gorduraPct: number | null;
  massaMagraKg: number | null;
  cinturaCm: number | null;
  /**
   * OS QUATRO QUE ERAM JOGADOS FORA (21/09/2026). O aparelho exporta 111
   * colunas; estas quatro estão em TODO exame do InBody 120 da clínica e são
   * as que mais falam com o paciente. Conferidas no arquivo real de 16/09.
   */
  inbodyScore: number | null;
  /** VFL. O aparelho escreve "Level 10" — só o número fica. Até 9 é a faixa normal do InBody. */
  gorduraVisceral: number | null;
  /** SMM — músculo esquelético. NÃO é a massa magra (FFM): são números diferentes. */
  massaMuscularKg: number | null;
  /** BMR, em kcal/dia. */
  tmbKcal: number | null;
};

export type ColunasInBody = {
  nome: number;
  dia: number;
  peso: number;
  gordura: number;
  massaMagra: number;
  gorduraKg: number;
  cintura: number;
  inbodyScore: number;
  visceral: number;
  smm: number;
  bmr: number;
};

// Os títulos que a InBody usa, em inglês e em português. Comparação sem acento,
// sem maiúscula e sem pontuação — planilha de aparelho muda de versão para versão.
// A ordem importa: o primeiro título que casar ganha. Por isso o nome completo da
// coluna vem antes da sigla — "PBF (Percent Body Fat)" tem que cair na gordura, e
// não em "Lower Limit (PBF Normal Range)".
const TITULOS = {
  nome: ["name", "nome", "nome do usuario", "user name", "username", "paciente"],
  dia: ["test date time", "test date  time", "test date", "test datetime", "data do teste", "data hora do teste", "data teste", "data", "date"],
  peso: ["weight", "peso", "peso kg", "weight kg"],
  gordura: ["pbf percent body fat", "pbf", "percent body fat", "body fat percentage", "pgc", "percentual de gordura", "gordura corporal", "percentual de gordura corporal"],
  // FFM/massa magra primeiro; SLM (soft lean mass) só como último recurso.
  // NUNCA o SMM: massa muscular esquelética é outro número (ver o topo do arquivo).
  massaMagra: ["ffm fat free mass", "ffm", "fat free mass", "massa livre de gordura", "massa magra", "mlg", "slm", "soft lean mass"],
  // Massa de gordura em kg. Não vai para a ficha do paciente; serve para calcular
  // a massa magra quando o aparelho não exporta o FFM (ver massaMagraDaLinha).
  gorduraKg: ["bfm body fat mass", "bfm", "body fat mass", "massa de gordura", "massa gorda"],
  // "Measured Circumference of Abdomen" é a medida de fita que a enfermagem anota.
  // NÃO confundir com "WHR (Waist-Hip Ratio)", que é razão, não centímetro.
  cintura: ["measured circumference of abdomen", "circumference of abdomen", "abdominal circumference", "waist circumference", "circunferencia da cintura", "circunferencia abdominal", "circunferencia do abdomen", "cintura"],
  // Nomes exatos do Lookin'Body (arquivo real de 16/09/2026), já sem o "62. " da
  // frente. O título completo vem primeiro: "smm" sozinho também casaria com
  // "SMM/WT" e com os limites "Lower Limit (SMM Normal Range)".
  inbodyScore: ["inbody score", "score inbody", "pontuacao inbody"],
  visceral: ["vfl visceral fat level", "visceral fat level", "vfl", "nivel de gordura visceral", "gordura visceral"],
  smm: ["smm skeletal muscle mass", "skeletal muscle mass", "smm", "massa muscular esqueletica", "mme"],
  bmr: ["bmr basal metabolic rate", "basal metabolic rate", "bmr", "taxa metabolica basal", "tmb"],
} as const;

export function normalizarTitulo(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+\s*[.)-]\s*/, "") // tira o "14. " que o aparelho põe na frente
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
      gorduraKg: acharColuna(titulos, TITULOS.gorduraKg),
      cintura: acharColuna(titulos, TITULOS.cintura),
      inbodyScore: acharColuna(titulos, TITULOS.inbodyScore),
      visceral: acharColuna(titulos, TITULOS.visceral),
      smm: acharColuna(titulos, TITULOS.smm),
      bmr: acharColuna(titulos, TITULOS.bmr),
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

  // Formato do próprio aparelho: "2022.12.08. 20:07:25" (ano primeiro, pontos,
  // e um ponto sobrando no fim). Era o que barrava o arquivo real (16/09/2026).
  const anoPrimeiro = texto.match(/^(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})/);
  if (anoPrimeiro) return `${anoPrimeiro[1]}-${anoPrimeiro[2].padStart(2, "0")}-${anoPrimeiro[3].padStart(2, "0")}`;

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

/**
 * Massa magra (massa livre de gordura) da linha.
 *
 * O aparelho da clínica só preenche a coluna FFM em 289 de 4.119 exames — nos
 * outros ela vem "-". Mas a massa de gordura (BFM) vem em TODOS, e massa magra
 * é, por definição, peso menos gordura. Conferido nas 289 linhas em que os dois
 * números existem: a diferença deu 0,000 kg em todas (16/09/2026). Então não é
 * estimativa, é a mesma conta que o aparelho faz.
 */
export function massaMagraDaLinha(pesoKg: number | null, ffmKg: number | null, gorduraKg: number | null): number | null {
  if (ffmKg !== null) return ffmKg;
  if (pesoKg === null || gorduraKg === null) return null;
  return Math.round((pesoKg - gorduraKg) * 100) / 100;
}

/** Descarta o que claramente não é medida de gente (o aparelho às vezes exporta linha de teste). */
function medidaPlausivel(medicao: MedicaoImportada) {
  if (medicao.pesoKg !== null && (medicao.pesoKg < 20 || medicao.pesoKg > 400)) return false;
  if (medicao.gorduraPct !== null && (medicao.gorduraPct < 1 || medicao.gorduraPct > 80)) return false;
  if (medicao.massaMagraKg !== null && (medicao.massaMagraKg < 10 || medicao.massaMagraKg > 200)) return false;
  if (medicao.cinturaCm !== null && (medicao.cinturaCm < 30 || medicao.cinturaCm > 250)) return false;
  if (medicao.inbodyScore !== null && (medicao.inbodyScore < 0 || medicao.inbodyScore > 100)) return false;
  if (medicao.gorduraVisceral !== null && (medicao.gorduraVisceral < 1 || medicao.gorduraVisceral > 30)) return false;
  if (medicao.massaMuscularKg !== null && (medicao.massaMuscularKg < 5 || medicao.massaMuscularKg > 100)) return false;
  if (medicao.tmbKcal !== null && (medicao.tmbKcal < 500 || medicao.tmbKcal > 5000)) return false;
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
      massaMagraKg: massaMagraDaLinha(
        numeroDaCelula(celulas[colunas.peso]),
        colunas.massaMagra >= 0 ? numeroDaCelula(celulas[colunas.massaMagra]) : null,
        colunas.gorduraKg >= 0 ? numeroDaCelula(celulas[colunas.gorduraKg]) : null,
      ),
      cinturaCm: colunas.cintura >= 0 ? numeroDaCelula(celulas[colunas.cintura]) : null,
      inbodyScore: colunas.inbodyScore >= 0 ? numeroDaCelula(celulas[colunas.inbodyScore]) : null,
      // "Level 10" → 10: numeroDaCelula já descarta as letras.
      gorduraVisceral: colunas.visceral >= 0 ? numeroDaCelula(celulas[colunas.visceral]) : null,
      massaMuscularKg: colunas.smm >= 0 ? numeroDaCelula(celulas[colunas.smm]) : null,
      tmbKcal: colunas.bmr >= 0 ? numeroDaCelula(celulas[colunas.bmr]) : null,
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

/**
 * Escolhe a aba certa do arquivo e lê dali.
 *
 * A exportação da InBody vem com duas abas — "InBody" e "Pressão Arterial" —,
 * com colunas diferentes. Lendo tudo junto, as 1.159 linhas de pressão eram
 * interpretadas com o cabeçalho da primeira aba e viravam 1.159 erros. Aqui
 * cada aba é lida por conta própria e fica a que rendeu mais medições; a que
 * não tiver nome, data e peso simplesmente não concorre.
 */
export function lerMedicoesDeAbas(abas: { nome: string; linhas: string[][] }[]): LeituraInBody & { aba: string } {
  let melhor: (LeituraInBody & { aba: string }) | null = null;
  for (const aba of abas) {
    if (!lerCabecalhoInBody(aba.linhas)) continue;
    const leitura = { ...lerMedicoesInBody(aba.linhas), aba: aba.nome };
    if (!melhor || leitura.medicoes.length > melhor.medicoes.length) melhor = leitura;
  }
  if (melhor) return melhor;
  return {
    aba: "",
    medicoes: [],
    problemas: [{ linha: 1, motivo: "Não achei, em nenhuma aba, as colunas de nome, data do teste e peso. Exporte de novo pelo Lookin'Body, sem tirar o cabeçalho." }],
  };
}

export type Contato = { id: string; name: string };

/**
 * O aparelho corta o nome em 30 caracteres.
 *
 * Medido no arquivo real da clínica: 155 dos 1.149 nomes têm exatamente 30
 * caracteres, contra ~42 em cada comprimento vizinho — o amontoado é a assinatura
 * do corte. Por isso "Marcos Antonio Santos Frederic" e "FERNANDO JOSE DOS
 * SANTOS PEREI" nunca casavam com a ficha completa.
 */
const LIMITE_DE_NOME_DO_APARELHO = 30;

/** Mesma escrita, ignorando acento, maiúscula e espaço repetido. */
function achatar(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de edição, mas só o suficiente para saber se passa de `teto`. */
function perto(a: string, b: string, teto: number) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > teto) return false;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
      if (atual[j] < menor) menor = atual[j];
    }
    if (menor > teto) return false;
    anterior = atual;
  }
  return anterior[b.length] <= teto;
}

/** Dois pedaços de nome iguais, ou com uma letra de diferença ("Goreti" × "Gorete"). */
function pedacoIgual(a: string, b: string) {
  return perto(a, b, a.length <= 4 || b.length <= 4 ? 0 : 1);
}

export type Sugestao = { contato: Contato; pedacosEmComum: number; primeiroNomeBate: boolean; forca: number };

/**
 * Quem, no CRM, se parece com este nome do aparelho.
 *
 * Serve para o caso real: a ficha diz "ERICA GORETI" e o aparelho, "ERICA
 * GORETE MOREIRA PESSETI" — uma letra de diferença, e a paciente ficava de fora
 * sem nada a fazer. Aqui ela vira uma sugestão que a enfermagem confirma; o app
 * nunca decide sozinho por semelhança.
 *
 * A régua é dura de propósito: **primeiro nome batendo E pelo menos mais um
 * pedaço do nome**. Com régua frouxa apareciam disparates como "FLAVIO PIRES DA
 * SILVA → Flávio Carneiro", e sugestão errada é pior do que nenhuma: leva a
 * enfermagem a pendurar o exame de um paciente na ficha de outro.
 */
export function sugestoesParaNome(nome: string, contatos: Contato[], limite = 6, pedacosPorContato?: Map<string, string[]>): Sugestao[] {
  const doArquivo = personNameTokens(nome);
  if (doArquivo.length < 2) return [];
  const notas: Sugestao[] = [];
  for (const contato of contatos) {
    const doCrm = pedacosPorContato?.get(contato.id) ?? personNameTokens(contato.name);
    if (doCrm.length < 2) continue;
    if (!pedacoIgual(doArquivo[0], doCrm[0])) continue;
    const comuns = doArquivo.filter((pedaco) => doCrm.some((outro) => pedacoIgual(pedaco, outro))).length;
    if (comuns < 2) continue;
    notas.push({ contato, pedacosEmComum: comuns, primeiroNomeBate: true, forca: comuns / Math.max(doArquivo.length, doCrm.length) });
  }
  return notas.sort((a, b) => b.pedacosEmComum - a.pedacosEmComum || b.forca - a.forca).slice(0, limite);
}

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
/**
 * O que a pessoa decidiu para os nomes que o app não resolveu sozinho:
 * nome do arquivo → ref do contato, ou "" para deixar de fora.
 */
export type EscolhasDeNome = Record<string, string>;

export function casarMedicoesComContatos(
  medicoes: MedicaoImportada[],
  contatos: Contato[],
  jaRegistradas: { contactRef: string; dia: string }[],
  escolhas: EscolhasDeNome = {},
): Casamento {
  const existentes = new Set(jaRegistradas.map((item) => `${item.contactRef}|${item.dia}`));
  const resultado: Casamento = { prontas: [], ambiguas: [], semDono: [], repetidas: [] };
  // Dentro do próprio arquivo, o mesmo paciente no mesmo dia também só entra uma vez.
  const vistas = new Set<string>();

  // O arquivo real tem 4.119 exames de 1.149 pessoas. Comparar cada exame com
  // cada contato do CRM travava a aba por segundos. Duas economias, sem mudar o
  // resultado: (1) `personNamesMatch` exige o MESMO primeiro nome, então só os
  // contatos daquele primeiro nome entram na comparação; (2) o mesmo nome
  // aparece dezenas de vezes no arquivo e é resolvido uma vez só.
  const porPrimeiroNome = new Map<string, Contato[]>();
  for (const contato of contatos) {
    const primeiro = personNameTokens(contato.name)[0];
    if (!primeiro) continue;
    const balde = porPrimeiroNome.get(primeiro);
    if (balde) balde.push(contato);
    else porPrimeiroNome.set(primeiro, [contato]);
  }
  const porRef = new Map(contatos.map((contato) => [contato.id, contato]));
  const resolvidos = new Map<string, Contato[]>();
  const candidatosDe = (nome: string) => {
    // Escolha da pessoa vence o casamento por nome — é ela que sabe se a "Karla
    // Roberta Alfieri" do aparelho é a ficha nova ou a antiga.
    const escolhido = escolhas[nome];
    if (escolhido !== undefined) {
      const contato = porRef.get(escolhido);
      return contato ? [contato] : [];
    }
    const guardado = resolvidos.get(nome);
    if (guardado) return guardado;
    const primeiro = personNameTokens(nome)[0];
    const balde = primeiro ? porPrimeiroNome.get(primeiro) ?? [] : [];
    let achados = balde.filter((contato) => personNamesMatch(contato.name, nome));
    // Nome cortado pelo aparelho: se o que veio é exatamente o começo do nome de
    // uma ficha (e de uma só), é a mesma pessoa. Com mais de uma ficha começando
    // igual, volta a ser escolha de gente — cai em "ambíguas".
    if (!achados.length && nome.length === LIMITE_DE_NOME_DO_APARELHO) {
      const inicio = achatar(nome);
      achados = balde.filter((contato) => achatar(contato.name).startsWith(inicio));
    }
    resolvidos.set(nome, achados);
    return achados;
  };

  for (const medicao of medicoes) {
    const candidatos = candidatosDe(medicao.nome);
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

export type NomePendente = {
  nome: string;
  quantas: number;
  /** AMBIGUO: mais de uma ficha com esse nome. PARECIDO: só uma ficha parecida. */
  motivo: "AMBIGUO" | "PARECIDO";
  candidatos: Contato[];
};

/**
 * Os nomes que valem uma decisão da enfermagem — e só eles.
 *
 * O arquivo tem mais de mil pessoas e o CRM tem trezentas: a maioria dos nomes
 * sem dono é gente que nunca entrou no programa, e pedir uma decisão sobre cada
 * um seria pior do que não pedir nada. Entram aqui apenas dois casos: o nome que
 * casou com mais de uma ficha (o app não pode escolher) e o nome que quase casou
 * com uma ficha só (uma letra de diferença, um sobrenome a mais).
 */
export function nomesParaResolver(casamento: Casamento, contatos: Contato[], limite = 40): NomePendente[] {
  const pendentes = new Map<string, NomePendente>();

  for (const item of casamento.ambiguas) {
    const atual = pendentes.get(item.medicao.nome);
    if (atual) atual.quantas += 1;
    else pendentes.set(item.medicao.nome, { nome: item.medicao.nome, quantas: 1, motivo: "AMBIGUO", candidatos: item.candidatos });
  }

  // Os pedaços de cada nome do CRM são calculados UMA vez: sem isso, mil nomes do
  // arquivo × trezentas fichas repetiam a mesma quebra 300 mil vezes.
  const pedacosPorContato = new Map(contatos.map((contato) => [contato.id, personNameTokens(contato.name)]));

  const semDonoPorNome = new Map<string, number>();
  for (const medicao of casamento.semDono) semDonoPorNome.set(medicao.nome, (semDonoPorNome.get(medicao.nome) ?? 0) + 1);
  for (const [nome, quantas] of semDonoPorNome) {
    if (pendentes.has(nome)) continue;
    const sugestoes = sugestoesParaNome(nome, contatos, 6, pedacosPorContato);
    if (!sugestoes.length) continue;
    pendentes.set(nome, { nome, quantas, motivo: "PARECIDO", candidatos: sugestoes.map((sugestao) => sugestao.contato) });
  }

  return [...pendentes.values()].sort((a, b) => b.quantas - a.quantas || a.nome.localeCompare(b.nome, "pt-BR")).slice(0, limite);
}

export type ResumoDePaciente = { contactRef: string; contatoNome: string; quantas: number; primeiroDia: string; ultimoDia: string };

/**
 * Agrupa por paciente para a conferência caber na tela.
 *
 * A primeira importação traz o histórico INTEIRO do aparelho: dezenas de pessoas
 * com várias datas cada uma. Listar medição por medição viraria uma rolagem sem
 * fim; por paciente, cada pessoa ocupa uma linha ("Ana Souza · 6 medições, de
 * 12/03 a 12/09"). Nas importações seguintes, que costumam ser de uma pessoa só,
 * a mesma lista mostra uma linha — e continua certa.
 */
export function resumoPorPaciente(prontas: Casamento["prontas"]): ResumoDePaciente[] {
  const porPaciente = new Map<string, ResumoDePaciente>();
  for (const item of prontas) {
    const atual = porPaciente.get(item.contactRef);
    if (!atual) {
      porPaciente.set(item.contactRef, { contactRef: item.contactRef, contatoNome: item.contatoNome, quantas: 1, primeiroDia: item.medicao.dia, ultimoDia: item.medicao.dia });
      continue;
    }
    atual.quantas += 1;
    if (item.medicao.dia < atual.primeiroDia) atual.primeiroDia = item.medicao.dia;
    if (item.medicao.dia > atual.ultimoDia) atual.ultimoDia = item.medicao.dia;
  }
  return [...porPaciente.values()].sort((a, b) => a.contatoNome.localeCompare(b.contatoNome, "pt-BR"));
}

/** Frase do resumo — número derivado nunca aparece sozinho. */
export function fraseDaImportacao(casamento: Casamento) {
  const partes = [`${casamento.prontas.length} ${casamento.prontas.length === 1 ? "medição pronta para salvar" : "medições prontas para salvar"}`];
  if (casamento.repetidas.length) partes.push(`${casamento.repetidas.length} que já estavam no app`);
  if (casamento.ambiguas.length) partes.push(`${casamento.ambiguas.length} com mais de um paciente do mesmo nome`);
  if (casamento.semDono.length) partes.push(`${casamento.semDono.length} sem paciente no CRM`);
  return partes.join(" · ");
}
