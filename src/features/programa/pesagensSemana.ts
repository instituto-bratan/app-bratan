// PESAGENS DA SEMANA (16/09/2026).
//
// O portal do paciente pede uma pesagem por semana. Faltavam as duas pontas do
// outro lado: a enfermagem não tinha onde ver o que chegou, e a pesagem não
// mexia no semáforo de adesão (o motor já aceitava `ultimaPesagem`, mas ninguém
// passava o dado). Este motor é puro e resolve as duas com a mesma leitura.
//
// A régua: a semana começa na segunda. "Mandou" é ter pelo menos uma pesagem
// com peso na semana corrente; "atrasado" é passar de 10 dias sem pesar (a
// cobrança da enfermagem começa no 8º dia, mas só vira atraso com folga, para
// não perseguir quem pesa na terça em vez de na segunda).
export type MedicaoLinha = {
  contactRef: string;
  dia: string; // ISO (YYYY-MM-DD)
  pesoKg: number | null;
  origem: "ENFERMAGEM" | "PACIENTE" | "IMPORTACAO";
};

export type PesagemDoPaciente = {
  contactId: string;
  nome: string;
  /** Pesagem mais recente com peso, de qualquer origem. */
  ultimaEm: string | null;
  ultimoPeso: number | null;
  /** Quem registrou a última: o próprio paciente ou a enfermagem. */
  ultimaOrigem: MedicaoLinha["origem"] | null;
  /** Peso da pesagem anterior, para a variação. */
  pesoAnterior: number | null;
  /** Diferença em kg entre as duas últimas (negativo = perdeu peso). */
  variacaoKg: number | null;
  diasSemPesar: number | null;
  mandouNaSemana: boolean;
  /** Frase pronta para a tela, no lugar do número solto. */
  frase: string;
};

export type PesagensDaSemana = {
  /** Segunda-feira da semana corrente (ISO). */
  inicioDaSemana: string;
  mandaram: PesagemDoPaciente[];
  faltando: PesagemDoPaciente[];
  /** Nunca pesou desde que entrou no plano. */
  semNenhuma: PesagemDoPaciente[];
  /** Última pesagem de cada paciente, para alimentar o semáforo de adesão. */
  ultimaPorContato: Map<string, string>;
  frase: string;
};

const DIA = 86_400_000;

function utc(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, (m || 1) - 1, d || 1);
}

export function diasEntre(deISO: string, ateISO: string) {
  return Math.round((utc(ateISO) - utc(deISO)) / DIA);
}

/** Segunda-feira da semana de `hoje` (a semana da clínica começa na segunda). */
export function inicioDaSemana(hoje: string) {
  const base = new Date(utc(hoje));
  const diaDaSemana = base.getUTCDay(); // 0 = domingo
  const recuo = (diaDaSemana + 6) % 7;
  return new Date(utc(hoje) - recuo * DIA).toISOString().slice(0, 10);
}

function umaCasa(v: number) {
  return Math.round(v * 10) / 10;
}

/** Como a variação aparece na tela: "−1,2 kg desde 02/09". */
function fraseDaVariacao(atual: number, anterior: number, quando: string) {
  const dif = umaCasa(atual - anterior);
  const [, mes, dia] = quando.slice(0, 10).split("-");
  if (dif === 0) return `manteve o peso desde ${dia}/${mes}`;
  const sinal = dif < 0 ? "−" : "+";
  return `${sinal}${Math.abs(dif).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg desde ${dia}/${mes}`;
}

export type EntradaPesagens = {
  /** Um por paciente do plano ativo. */
  pacientes: { contactId: string; nome: string; desde?: string | null }[];
  medicoes: MedicaoLinha[];
  hoje: string;
};

export function pesagensDaSemana(entrada: EntradaPesagens): PesagensDaSemana {
  const { pacientes, hoje } = entrada;
  const segunda = inicioDaSemana(hoje);
  const comPeso = entrada.medicoes
    .filter((m) => m.pesoKg !== null && m.pesoKg > 0 && m.dia)
    .sort((a, b) => b.dia.localeCompare(a.dia));
  const porContato = new Map<string, MedicaoLinha[]>();
  for (const m of comPeso) {
    const lista = porContato.get(m.contactRef);
    if (lista) lista.push(m);
    else porContato.set(m.contactRef, [m]);
  }

  const mandaram: PesagemDoPaciente[] = [];
  const faltando: PesagemDoPaciente[] = [];
  const semNenhuma: PesagemDoPaciente[] = [];
  const ultimaPorContato = new Map<string, string>();

  for (const paciente of pacientes) {
    const lista = porContato.get(paciente.contactId) ?? [];
    const ultima = lista[0] ?? null;
    const anterior = lista[1] ?? null;
    if (ultima) ultimaPorContato.set(paciente.contactId, ultima.dia);
    const diasSemPesar = ultima ? Math.max(0, diasEntre(ultima.dia, hoje)) : null;
    const mandouNaSemana = Boolean(ultima && ultima.dia >= segunda);
    const variacaoKg = ultima?.pesoKg != null && anterior?.pesoKg != null ? umaCasa(ultima.pesoKg - anterior.pesoKg) : null;

    let frase: string;
    if (!ultima) {
      const espera = paciente.desde ? Math.max(0, diasEntre(paciente.desde, hoje)) : null;
      frase = espera === null ? "ainda não mandou nenhuma pesagem" : `ainda não mandou nenhuma pesagem (está no plano há ${espera} ${espera === 1 ? "dia" : "dias"})`;
    } else if (anterior?.pesoKg != null && ultima.pesoKg != null) {
      frase = `${ultima.pesoKg.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg · ${fraseDaVariacao(ultima.pesoKg, anterior.pesoKg, anterior.dia)}`;
    } else {
      frase = `${(ultima.pesoKg ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg · primeira pesagem`;
    }
    if (!mandouNaSemana && ultima && diasSemPesar !== null) {
      frase += ` · ${diasSemPesar === 0 ? "pesou hoje" : `${diasSemPesar} ${diasSemPesar === 1 ? "dia" : "dias"} sem pesar`}`;
    }

    const linha: PesagemDoPaciente = {
      contactId: paciente.contactId,
      nome: paciente.nome,
      ultimaEm: ultima?.dia ?? null,
      ultimoPeso: ultima?.pesoKg ?? null,
      ultimaOrigem: ultima?.origem ?? null,
      pesoAnterior: anterior?.pesoKg ?? null,
      variacaoKg,
      diasSemPesar,
      mandouNaSemana,
      frase,
    };
    if (mandouNaSemana) mandaram.push(linha);
    else if (!ultima) semNenhuma.push(linha);
    else faltando.push(linha);
  }

  mandaram.sort((a, b) => (b.ultimaEm ?? "").localeCompare(a.ultimaEm ?? "") || a.nome.localeCompare(b.nome));
  faltando.sort((a, b) => (b.diasSemPesar ?? 0) - (a.diasSemPesar ?? 0) || a.nome.localeCompare(b.nome));
  semNenhuma.sort((a, b) => a.nome.localeCompare(b.nome));

  const total = pacientes.length;
  const frase = total === 0
    ? "Nenhum paciente em plano ativo nesta semana."
    : `${mandaram.length} de ${total} ${mandaram.length === 1 ? "paciente mandou" : "pacientes mandaram"} a pesagem desta semana.${faltando.length || semNenhuma.length ? ` Falta cobrar ${faltando.length + semNenhuma.length}.` : ""}`;

  return { inicioDaSemana: segunda, mandaram, faltando, semNenhuma, ultimaPorContato, frase };
}

/** Texto para a enfermagem copiar e cobrar quem não pesou (uma linha por paciente). */
export function listaParaCobrar(resumo: PesagensDaSemana) {
  const linhas = [...resumo.faltando, ...resumo.semNenhuma].map((p) => `• ${p.nome} — ${p.frase}`);
  return linhas.length ? `Pesagem da semana — quem falta (${linhas.length}):\n${linhas.join("\n")}` : "Todo mundo mandou a pesagem desta semana.";
}
