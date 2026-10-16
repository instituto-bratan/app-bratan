// LEITOR DO "TTO" DO DOUTOR (14/10/2026).
//
// Além da receita, o Dr. Daniel faz no iClinicRx um documento com o que o
// paciente vai usar: cada protocolo numerado, os medicamentos com dose, a
// posologia, o número de sessões e o CID. O contrato de medicação copia isso à
// mão. Aqui o texto do PDF (pdf.js, linha a linha) vira protocolos prontos para
// o contrato. A recepção confere tudo na tela antes de gerar: o leitor sugere,
// não decide. Só importa relativo (os testes carregam direto).

export type ItemDoProtocolo = { nome: string; dose: string };

export type ProtocoloLido = {
  titulo: string;
  via: string;
  sessoes: number;
  posologia: string;
  /** Meses de tratamento quando a posologia diz ("02 MESES"). */
  meses: number | null;
  itens: ItemDoProtocolo[];
  cids: string[];
};

export type EnderecoLido = { logradouro: string; numero: string; bairro: string; municipio: string; uf: string; cep: string };

export type TtoLido = {
  paciente: string;
  cpf: string;
  endereco: EnderecoLido | null;
  enderecoBruto: string;
  emitidoEm: string | null;
  protocolos: ProtocoloLido[];
};

const DOSE = /(\d[\d.,]*\s*(?:MG|MCG|G|ML|UI|%|MEQ|UNIDADES?)(?:\s*\/\s*\d*[\d.,]*\s*(?:ML|G|MG|L|AMPOLA))?)\s*\.?$/i;
const VERBO_DE_POSOLOGIA = /^(APLICAR|DILUIR|TOMAR|ADMINISTRAR|INFUNDIR|CORRER|USAR|INJETAR|IMPLANTAR|INSERIR|FAZER|REALIZAR|ASPIRAR|APLICA[ÇC][ÃA]O)\b/i;
// Rodapé: da Prescrição Digital ("Médico(a):", "ID da Receita") e do Receituário ("Dr. Daniel…", "CRM …", endereço da clínica).
const FIM_DO_CORPO = /^(M[ÉE]DICO\(A\)|PRESCRI[ÇC][ÃA]O DIGITAL|ID DA RECEITA|DISPENSA[ÇC][ÃA]O|N[ÃA]O ASSINADA|DR\.\s?[A-ZÀ-Ú]|CRM\b|INSTITUTO BRATAN\s*-)/i;

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function limpa(linha: string) {
  return linha.replace(/[-–—_.]{3,}/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * "Rua X, 1240. Tatuapé. São Paulo - SP. 03313-000" (Prescrição Digital) ou
 * "Rua X, 202, São Paulo, SP." (Receituário do iClinic, 16/10/2026).
 */
export function lerEndereco(bruto: string): EnderecoLido | null {
  const texto = bruto.trim().replace(/\.$/, "");
  if (!texto) return null;
  // Receituário: tudo separado por vírgula e a UF no fim.
  const virgulas = texto.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
  if (!/\.\s/.test(texto) && virgulas.length >= 3 && /^[A-Z]{2}$/.test(virgulas[virgulas.length - 1])) {
    const cepNoMeio = virgulas.find((p) => /^\d{5}-?\d{3}$/.test(p)) ?? "";
    const resto = virgulas.filter((p) => p !== cepNoMeio);
    const uf = resto[resto.length - 1];
    const municipio = resto[resto.length - 2] ?? "";
    const meio = resto.slice(1, -2);
    const numero = meio.find((p) => /^\d+[A-Z]?$/i.test(p)) ?? "";
    const bairro = meio.filter((p) => p !== numero).join(" ");
    return { logradouro: resto[0], numero, bairro, municipio, uf, cep: cepNoMeio };
  }
  const cep = texto.match(/(\d{5}-?\d{1,3})\s*$/)?.[1] ?? "";
  const semCep = cep ? texto.slice(0, texto.lastIndexOf(cep)).replace(/[.,\s]+$/, "") : texto;
  const partes = semCep.split(/\.\s+/).map((p) => p.trim()).filter(Boolean);
  const primeira = partes[0] ?? "";
  const [logradouro, numero = ""] = primeira.split(/,\s*/);
  let municipio = "";
  let uf = "";
  let bairro = "";
  const cidadeUf = partes.findIndex((p) => /\s-\s*[A-Z]{2}$/.test(p));
  if (cidadeUf >= 0) {
    const m = partes[cidadeUf].match(/^(.*?)\s*-\s*([A-Z]{2})$/);
    municipio = m?.[1] ?? "";
    uf = m?.[2] ?? "";
    bairro = partes.slice(1, cidadeUf).join(" ");
  } else {
    bairro = partes.slice(1).join(" ");
  }
  return { logradouro: logradouro.trim(), numero: numero.trim(), bairro, municipio, uf, cep };
}

export function viaDaPosologia(texto: string): string {
  const t = semAcento(texto.toUpperCase());
  if (/INTRAMUSCULAR|\bIM\b/.test(t)) return "INTRAMUSCULAR";
  if (/ENDOVENOS|INTRAVENOS|\bEV\b|\bSF\s?0|SORO|CORRER EM/.test(t)) return "ENDOVENOSO";
  if (/SUBCUT|\bSC\b/.test(t)) return "SUBCUTÂNEO";
  if (/IMPLANTE|PELLET/.test(t)) return "IMPLANTE";
  if (/VIA ORAL|\bORAL\b|CAPSULA|COMPRIMIDO/.test(t)) return "ORAL";
  if (/TOPIC|PELE/.test(t)) return "TÓPICO";
  return "";
}

/** "UNDECILATO DE TESTOSTERONA 1.000MG." → { nome, dose } */
export function separarDose(linha: string): ItemDoProtocolo {
  const texto = limpa(linha).replace(/\.$/, "");
  const m = texto.match(DOSE);
  if (!m || m.index === undefined || m.index === 0) return { nome: texto, dose: "" };
  return { nome: texto.slice(0, m.index).trim().replace(/[,-]$/, "").trim(), dose: m[1].replace(/\s+/g, "").toUpperCase() };
}

export function lerTto(texto: string): TtoLido {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const resultado: TtoLido = { paciente: "", cpf: "", endereco: null, enderecoBruto: "", emitidoEm: null, protocolos: [] };
  let atual: ProtocoloLido | null = null;

  for (const linhaOriginal of linhas) {
    const linha = linhaOriginal.replace(/\s{2,}/g, " ");
    const emissao = linha.match(/Emiss[ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (emissao) resultado.emitidoEm = `${emissao[3]}-${emissao[2]}-${emissao[1]}`;

    // "Nome do Paciente:" (Prescrição Digital) ou "Paciente:" (Receituário do iClinic).
    const nome = linha.match(/^(?:Nome do )?Paciente:\s*(.+)$/i);
    if (nome && !resultado.paciente) { resultado.paciente = nome[1].trim(); continue; }
    const cpf = linha.match(/^CPF:\s*([\d.\-\s]+)/i);
    if (cpf) { resultado.cpf = cpf[1].replace(/\D/g, ""); continue; }
    const end = linha.match(/^Endere[çc]o(?: do paciente)?:\s*(.+)$/i);
    if (end && !atual) { resultado.enderecoBruto = end[1].trim(); resultado.endereco = lerEndereco(end[1]); continue; }

    // Rodapé do iClinicRx (médico, ID da receita…): o pdf.js às vezes entrega
    // ANTES do corpo, então ele só fecha o protocolo aberto, não para a leitura.
    if (FIM_DO_CORPO.test(linha) || /^C[óo]digo do Paciente/i.test(linha)) { atual = null; continue; }

    // "02 SESSÕES." vem antes do teste de protocolo novo (também começa com número).
    const sessoes = linha.match(/^(\d{1,3})\s*SESS(?:[ÕO]ES|[ÃA]O)\b/i);
    if (sessoes) { if (atual) atual.sessoes = Number(sessoes[1]); continue; }

    // "1 PROTOCOLO ...": começa um protocolo novo.
    const novo = linha.match(/^(\d{1,2})[\s.)-]+([A-ZÀ-Ú].*)$/);
    if (novo && /[A-ZÀ-Ú]{3,}/.test(novo[2]) && !DOSE.test(novo[2])) {
      atual = { titulo: limpa(novo[2]).replace(/[.:]+$/, ""), via: "", sessoes: 0, posologia: "", meses: null, itens: [], cids: [] };
      resultado.protocolos.push(atual);
      continue;
    }
    if (!atual) continue;

    // "CID10: D50." e o "CID1O" (letra O) que aparece no iClinic.
    const cid = linha.match(/^CID\s*1[0O]\s*[:-]?\s*([A-Z]\d{2}(?:\.\d)?)/i);
    if (cid) { atual.cids.push(cid[1].toUpperCase()); continue; }

    if (VERBO_DE_POSOLOGIA.test(linha) || /\bX\s*\/\s*(M[ÊE]S|SEMANA|DIA)\b|DOSE [ÚU]NICA/i.test(linha)) {
      const pos = limpa(linha);
      atual.posologia = atual.posologia ? `${atual.posologia} ${pos}` : pos;
      if (!atual.via) atual.via = viaDaPosologia(pos);
      const meses = pos.match(/(\d{1,2})\s*MES(?:ES)?\b/i);
      if (meses) atual.meses = Number(meses[1]);
      continue;
    }

    // Medicamento: termina em dose, ou é todo em maiúsculas ("EV ( ÁCIDO ALFA LIPÓICO + GLUTATIONA )" também).
    if (DOSE.test(limpa(linha).replace(/\.$/, "")) || /^[A-ZÀ-Ú0-9 ()\-/.,%+]+$/.test(linha)) {
      atual.itens.push(separarDose(linha));
    }
  }

  for (const p of resultado.protocolos) {
    if (!p.via) p.via = viaDaPosologia(p.titulo);
    if (!p.sessoes) {
      const porMes = p.posologia.match(/(\d{1,2})\s*X\s*\/\s*M[ÊE]S/i);
      // 16/10/2026: aplicação semanal (tirzepatida): "1X/SEMANA - 04 SEMANAS" ou "1X/SEMANA - 02 MESES".
      const porSemana = p.posologia.match(/(\d{1,2})\s*X\s*\/\s*SEMANA/i);
      // As semanas às vezes estão no título ("TRATAMENTO INJETÁVEL EMAGRECIMENTO - 08 SEMANAS").
      const semanas = p.posologia.match(/(\d{1,2})\s*SEMANAS\b/i) ?? p.titulo.match(/(\d{1,2})\s*SEMANAS\b/i);
      if (porMes && p.meses) p.sessoes = Number(porMes[1]) * p.meses;
      else if (porSemana && semanas) p.sessoes = Number(porSemana[1]) * Number(semanas[1]);
      else if (porSemana && p.meses) p.sessoes = Number(porSemana[1]) * p.meses * 4;
      else p.sessoes = 1;
    }
  }
  return resultado;
}
