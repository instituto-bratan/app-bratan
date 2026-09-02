// LEITOR DE BOLETO / NOTA / PIX (02/09/2026 — "Lançar rápido").
//
// Lucas: "ficar um pouco confuso com os boletos". A ideia é colar o texto do
// boleto (ou do e-mail, ou o PDF) e o app preencher valor, vencimento e
// beneficiário sozinho. Sem inventar: cada campo lido diz de onde veio, e o que
// não foi lido fica em branco para a pessoa completar.
//
// Regras do boleto bancário (FEBRABAN), linha digitável de 47 dígitos:
//   campo 5 (últimos 14 dígitos) = FFFF VVVVVVVVVV — fator de vencimento (4) +
//   valor (10, em centavos). O fator conta dias desde uma data-base: 07/10/1997
//   até 21/02/2025; em 22/02/2025 ele voltou a 1000 (nova base). Como a mesma
//   sequência serve às duas bases, escolhe-se a que cai perto de hoje.
// Guias de arrecadação (48 dígitos, começam com 8): o valor está nos dígitos
// 5–15 do código de barras quando o 3º dígito é 6 ou 7 (valor efetivo em reais).

export type TipoDocumento = "BOLETO" | "GUIA" | "NOTA_FISCAL" | "PIX" | "DESCONHECIDO";

export type LeituraDocumento = {
  tipo: TipoDocumento;
  linhaDigitavel?: string;
  valor?: number;
  vencimento?: string;
  beneficiario?: string;
  cnpj?: string;
  numeroDocumento?: string;
  /** O que foi lido e de onde — para a pessoa conferir antes de lançar. */
  leituras: string[];
};

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

function somaDias(iso: string, dias: number) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function diasEntre(de: string, ate: string) {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export const BASE_FATOR_ANTIGA = "1997-10-07";
export const BASE_FATOR_NOVA = "2025-02-22";

/** Data de vencimento a partir do fator (4 dígitos), escolhendo a base que cai perto de `hoje`. */
export function vencimentoDoFator(fator: number, hoje: string): string | null {
  if (!Number.isFinite(fator) || fator < 1000) return null;
  const nova = somaDias(BASE_FATOR_NOVA, fator - 1000);
  const antiga = somaDias(BASE_FATOR_ANTIGA, fator);
  const distancia = (iso: string) => Math.abs(diasEntre(hoje, iso));
  // A base nova só vale para datas de 22/02/2025 em diante; entre as duas, a mais próxima de hoje.
  if (distancia(nova) <= distancia(antiga)) return nova;
  return antiga;
}

export function parseValorBR(texto: string) {
  const limpo = texto.replace(/[^\d,.-]/g, "");
  if (!limpo) return NaN;
  // "1.234,56" → 1234.56 · "1234.56" → 1234.56 · "1234,5" → 1234.5
  const normalizado = /,\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, "");
  return Number(normalizado);
}

function dataBRparaISO(texto: string) {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Só dígitos da linha digitável (47) ou da guia (48), se existir no texto. */
export function extrairLinhaDigitavel(texto: string): { digitos: string; tipo: "BOLETO" | "GUIA" } | null {
  // Junta blocos de dígitos separados por ponto/espaço/hífen e procura 47 ou 48 dígitos seguidos.
  const compacto = texto.replace(/(\d)[ .\- ](?=\d)/g, "$1");
  const boleto = compacto.match(/(?<!\d)(\d{47})(?!\d)/);
  if (boleto) return { digitos: boleto[1], tipo: "BOLETO" };
  const guia = compacto.match(/(?<!\d)(8\d{47})(?!\d)/);
  if (guia) return { digitos: guia[1], tipo: "GUIA" };
  return null;
}

/** Anda pelos campos TLV do BR Code (a partir do "000201") e devolve valor (54) e nome do recebedor (59). */
export function lerPixBRCode(texto: string): { valor?: number; nome?: string } {
  const inicio = texto.indexOf("000201");
  if (inicio < 0) return {};
  // Só quebras de linha/tabs saem: o nome do recebedor (tag 59) pode ter espaço.
  const codigo = texto.slice(inicio).replace(/[\r\n\t]+/g, "");
  const campos = new Map<string, string>();
  let i = 0;
  while (i + 4 <= codigo.length) {
    const id = codigo.slice(i, i + 2);
    const tamanho = Number(codigo.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isFinite(tamanho)) break;
    const valor = codigo.slice(i + 4, i + 4 + tamanho);
    campos.set(id, valor);
    i += 4 + tamanho;
    if (id === "63") break;
  }
  const valor = campos.has("54") ? Number(campos.get("54")) : undefined;
  return { valor: Number.isFinite(valor) && (valor ?? 0) > 0 ? valor : undefined, nome: campos.get("59")?.trim() || undefined };
}

export function lerDocumento(textoBruto: string, hoje: string): LeituraDocumento {
  const texto = (textoBruto || "").replace(/\r/g, "");
  const leituras: string[] = [];
  const resultado: LeituraDocumento = { tipo: "DESCONHECIDO", leituras };
  if (!texto.trim()) return resultado;

  // PIX copia-e-cola (BR Code EMV): campos "ID(2) tamanho(2) valor" em sequência.
  // Tag 54 = valor, 59 = nome do recebedor. Anda campo a campo — regex solta
  // pega "54" no meio de outro número.
  if (/br\.gov\.bcb\.pix/i.test(texto)) {
    resultado.tipo = "PIX";
    const pix = lerPixBRCode(texto);
    if (pix.valor) {
      resultado.valor = round2(pix.valor);
      leituras.push(`valor ${resultado.valor} lido do código PIX`);
    }
    if (pix.nome) {
      resultado.beneficiario = pix.nome;
      leituras.push(`recebedor "${pix.nome}" lido do código PIX`);
    }
  }

  const linha = extrairLinhaDigitavel(texto);
  if (linha) {
    resultado.linhaDigitavel = linha.digitos;
    if (linha.tipo === "BOLETO") {
      resultado.tipo = "BOLETO";
      const campo5 = linha.digitos.slice(-14);
      const fator = Number(campo5.slice(0, 4));
      const valor = Number(campo5.slice(4)) / 100;
      if (valor > 0) {
        resultado.valor = round2(valor);
        leituras.push(`valor ${resultado.valor} lido da linha digitável`);
      }
      const vencimento = vencimentoDoFator(fator, hoje);
      if (vencimento) {
        resultado.vencimento = vencimento;
        leituras.push(`vencimento ${vencimento.split("-").reverse().join("/")} lido do fator ${fator} da linha digitável`);
      }
    } else {
      resultado.tipo = "GUIA";
      // Código de barras da guia = 44 dígitos: 4 blocos de 11 (tirando o dígito verificador de cada bloco de 12).
      const barras = [0, 12, 24, 36].map((i) => linha.digitos.slice(i, i + 11)).join("");
      if (/[67]/.test(barras[2])) {
        const valor = Number(barras.slice(4, 15)) / 100;
        if (valor > 0) {
          resultado.valor = round2(valor);
          leituras.push(`valor ${resultado.valor} lido do código da guia`);
        }
      }
    }
  }

  // Texto por extenso — completa o que a linha não traz (e vale para a nota fiscal).
  if (!resultado.vencimento) {
    const venc = texto.match(/venc(?:imento|\.)?\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) || texto.match(/data\s+de\s+vencimento\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (venc) {
      resultado.vencimento = dataBRparaISO(venc[1]) ?? undefined;
      if (resultado.vencimento) leituras.push(`vencimento ${venc[1]} lido do texto`);
    }
  }
  if (!resultado.valor) {
    const valor =
      texto.match(/valor\s+(?:do\s+)?(?:documento|cobrado|total(?:\s+da\s+nota)?|a\s+pagar|l[ií]quido)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i) ||
      texto.match(/total\s+(?:a\s+pagar|geral|da\s+nota)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i) ||
      texto.match(/R\$\s*([\d.]+,\d{2})/);
    if (valor) {
      const numero = parseValorBR(valor[1]);
      if (Number.isFinite(numero) && numero > 0) {
        resultado.valor = round2(numero);
        leituras.push(`valor ${resultado.valor} lido do texto ("${valor[0].trim().slice(0, 40)}")`);
      }
    }
  }
  const cnpj = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (cnpj) {
    resultado.cnpj = cnpj[0];
    leituras.push(`CNPJ ${cnpj[0]}`);
  }
  if (!resultado.beneficiario) {
    const nome =
      texto.match(/benefici[aá]rio(?:\s+final)?\s*[:\-]?\s*([^\n\r]{3,80})/i) ||
      texto.match(/cedente\s*[:\-]?\s*([^\n\r]{3,80})/i) ||
      texto.match(/prestador(?:\s+de\s+servi[cç]os)?\s*[:\-]?\s*(?:raz[aã]o\s+social\s*[:\-]?\s*)?([^\n\r]{3,80})/i) ||
      texto.match(/raz[aã]o\s+social\s*[:\-]?\s*([^\n\r]{3,80})/i);
    if (nome) {
      resultado.beneficiario = nome[1].replace(/\s*(cnpj|cpf).*$/i, "").replace(/\s{2,}/g, " ").trim();
      leituras.push(`beneficiário "${resultado.beneficiario}" lido do texto`);
    }
  }
  const nota = texto.match(/(?:NFS-?e|nota\s+fiscal(?:\s+eletr[oô]nica)?|n[úu]mero\s+da\s+nota|n[º°o]\.?\s*da\s+nota)\s*[:\-]?\s*(?:n[º°o]\.?\s*)?(\d{1,12})/i);
  if (nota) {
    resultado.numeroDocumento = nota[1];
    leituras.push(`nº da nota ${nota[1]} lido do texto`);
  }
  if (resultado.tipo === "DESCONHECIDO" && (/NFS-?e|nota\s+fiscal|DANFE/i.test(texto) || resultado.numeroDocumento)) resultado.tipo = "NOTA_FISCAL";
  else if (resultado.tipo === "DESCONHECIDO" && (resultado.valor || resultado.vencimento)) resultado.tipo = "BOLETO";

  return resultado;
}
