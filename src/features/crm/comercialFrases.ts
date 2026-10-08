// AS FRASES E O SELETOR DO KANBAN (08/10/2026, redesenho etapa 3 — imagem 04).
//
// No Papel & Musgo o número nunca fica sozinho: o cabeçalho de cada quadro diz
// "Dez pacientes estão na régua, somando R$ 96.191. Cinco toques são para hoje."
// em vez de três pílulas soltas (10 · 5 hoje · 1 atrasado). E o seletor "Trocar
// quadro" lista os quadros por urgência: os fixos, as cadências com toque hoje,
// as que têm gente e as vazias. Tudo aqui é derivado do que a tela já calculava
// (resumoDasCadencias, buildKanbanCadencia, os deals do quadro) — nada novo é
// gravado. Fica num .ts puro para os testes de node conferirem
// (tests/etapa3-comercial.test.mjs).

// ---------------------------------------------------------------- números por extenso

const POR_EXTENSO = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove", "vinte",
];

/** 0–20 por extenso ("dez", "duas"); acima disso, o número ("37"). */
export function porExtenso(n: number, genero: "m" | "f" = "m"): string {
  if (!Number.isInteger(n) || n < 0 || n > 20) return Math.round(n).toLocaleString("pt-BR");
  if (genero === "f" && n === 1) return "uma";
  if (genero === "f" && n === 2) return "duas";
  return POR_EXTENSO[n];
}

/** "dez pacientes", "um toque", "duas cadências". */
export function contagem(n: number, singular: string, plural = `${singular}s`, genero: "m" | "f" = "m"): string {
  return `${porExtenso(n, genero)} ${n === 1 ? singular : plural}`;
}

export function maiuscula(texto: string): string {
  return texto ? texto[0].toLocaleUpperCase("pt-BR") + texto.slice(1) : texto;
}

/** "R$ 96.191" (sem centavos, como no quadro). */
export function reaisInteiros(valor: number): string {
  return `R$ ${Math.round(valor).toLocaleString("pt-BR")}`;
}

// ---------------------------------------------------------------- frase do cabeçalho

/** A frase em três pedaços: o número em destaque, o resto e (se houver) o alerta em laranja. */
export type FraseDoQuadro = { destaque: string; resto: string; alerta?: string };

/** Quadro de uma cadência: quantos na régua (e quanto somam, para quem vê valores), toques de hoje e atrasados. */
export function fraseDaCadencia(dados: { ativos: number; hoje: number; atrasados: number; soma?: number; mostrarValor?: boolean }): FraseDoQuadro {
  const { ativos, hoje, atrasados, soma = 0, mostrarValor = false } = dados;
  if (ativos === 0) return { destaque: "Ninguém na régua agora.", resto: " Quem entrar aparece no primeiro passo." };
  const valor = mostrarValor && soma > 0 ? `, somando ${reaisInteiros(soma)}` : "";
  const verbo = ativos === 1 ? "está" : "estão";
  const toques =
    hoje === 0 ? " Nenhum toque é para hoje." : ` ${maiuscula(contagem(hoje, "toque"))} ${hoje === 1 ? "é" : "são"} para hoje.`;
  return {
    destaque: maiuscula(contagem(ativos, "paciente")),
    resto: ` ${verbo} na régua${valor}.${toques}`,
    alerta: atrasados > 0 ? ` ${maiuscula(contagem(atrasados, "toque"))} ${atrasados === 1 ? "atrasou" : "atrasaram"}.` : undefined,
  };
}

/** Plano de Acompanhamento: quantos na jornada, parados além do prazo e (para quem vê valores) o vendido. */
export function fraseDoPlano(dados: { pacientes: number; parados: number; semAcao: number; vendido?: number; mostrarValor?: boolean }): FraseDoQuadro {
  const { pacientes, parados, semAcao, vendido = 0, mostrarValor = false } = dados;
  const valor = mostrarValor && vendido > 0 ? ` O CRM registra ${reaisInteiros(vendido)} vendidos.` : "";
  const alertas: string[] = [];
  if (parados > 0) alertas.push(`${maiuscula(contagem(parados, "paciente"))} ${parados === 1 ? "passou" : "passaram"} do prazo da fase.`);
  if (semAcao > 0) alertas.push(`${maiuscula(contagem(semAcao, "negociação aberta", "negociações abertas", "f"))} sem próxima ação.`);
  return {
    destaque: pacientes === 0 ? "Ninguém" : maiuscula(contagem(pacientes, "paciente")),
    resto: ` no Plano de Acompanhamento.${valor}`,
    alerta: alertas.length ? ` ${alertas.join(" ")}` : undefined,
  };
}

/** Em aberto: quem ainda não tem fechamento registrado (e quantos leads esperam a primeira resposta). */
export function fraseEmAberto(dados: { abertos: number; semResposta: number }): FraseDoQuadro {
  const { abertos, semResposta } = dados;
  if (abertos === 0) return { destaque: "Ninguém em aberto:", resto: " todo mundo já tem fechamento registrado." };
  return {
    destaque: maiuscula(contagem(abertos, "paciente")),
    resto: ` ainda ${abertos === 1 ? "decide" : "decidem"}: sem fechamento registrado.`,
    alerta: semResposta > 0 ? ` ${maiuscula(contagem(semResposta, "lead"))} sem nenhuma resposta.` : undefined,
  };
}

/** Repescagens: quantos em andamento (isca e ligação) e quantos podem ser repescados. */
export function fraseDaRepescagem(dados: { isca: number; ligar: number; candidatos: number }): FraseDoQuadro {
  const { isca, ligar, candidatos } = dados;
  const andamento = isca + ligar;
  const quem = candidatos > 0 ? ` ${maiuscula(contagem(candidatos, "paciente"))} ${candidatos === 1 ? "pode" : "podem"} ser repescados.` : " Ninguém novo para repescar.";
  if (andamento === 0) return { destaque: "Nenhuma repescagem em andamento.", resto: quem };
  return {
    destaque: maiuscula(contagem(andamento, "repescagem", "repescagens", "f")),
    resto: ` em andamento: ${porExtenso(isca, "f")} ${isca === 1 ? "espera" : "esperam"} a isca e ${porExtenso(ligar, "f")} a ligação.${quem}`,
  };
}

// ---------------------------------------------------------------- seletor de quadro

/** O resumo de uma cadência que o seletor precisa (o ResumoCadencia da tela, sem o objeto inteiro). */
export type ResumoParaSeletor = { id: string; rotulo: string; nome: string; ativos: number; hoje: number; atrasados: number };

export type OpcaoDoSeletor = {
  chave: string;
  rotulo: string;
  nomeCompleto?: string;
  numero?: string;
  destaque?: number;
  atrasados?: number;
};
export type SecaoDoSeletorDeQuadro = { titulo: string; resumo?: string; opcoes: OpcaoDoSeletor[] };

/**
 * As seções do "Trocar quadro", por urgência. Os quadros fixos vêm primeiro
 * (sempre os mesmos três), depois as cadências com toque para hoje (ou
 * atrasado), as que têm gente na régua e as vazias. A atual nunca some.
 */
export function secoesDoSeletor(dados: {
  fixos: OpcaoDoSeletor[];
  cadencias: ResumoParaSeletor[];
}): SecaoDoSeletorDeQuadro[] {
  const chave = (id: string) => `cadencia:${id}`;
  const pendentes = (c: ResumoParaSeletor) => c.hoje + c.atrasados;
  const comToque = dados.cadencias.filter((c) => pendentes(c) > 0).sort((a, b) => pendentes(b) - pendentes(a) || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  const comGente = dados.cadencias.filter((c) => pendentes(c) === 0 && c.ativos > 0).sort((a, b) => b.ativos - a.ativos || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  const vazias = dados.cadencias.filter((c) => pendentes(c) === 0 && c.ativos === 0).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  const toquesHoje = comToque.reduce((total, c) => total + pendentes(c), 0);
  const secoes: SecaoDoSeletorDeQuadro[] = [{ titulo: "Quadros", opcoes: dados.fixos }];
  if (comToque.length) {
    secoes.push({
      titulo: "Com toque hoje",
      resumo: `${toquesHoje} ${toquesHoje === 1 ? "toque" : "toques"}`,
      opcoes: comToque.map((c) => ({
        chave: chave(c.id),
        rotulo: c.rotulo,
        nomeCompleto: c.nome,
        destaque: c.hoje || undefined,
        numero: c.hoje ? "hoje" : undefined,
        atrasados: c.atrasados || undefined,
      })),
    });
  }
  if (comGente.length) {
    secoes.push({
      titulo: "Com gente na régua",
      resumo: `${comGente.length} ${comGente.length === 1 ? "cadência" : "cadências"}`,
      opcoes: comGente.map((c) => ({ chave: chave(c.id), rotulo: c.rotulo, nomeCompleto: c.nome, numero: `${c.ativos} ${c.ativos === 1 ? "ativo" : "ativos"}` })),
    });
  }
  if (vazias.length) {
    secoes.push({
      titulo: "Sem ninguém agora",
      resumo: `${vazias.length} ${vazias.length === 1 ? "cadência" : "cadências"}`,
      opcoes: vazias.map((c) => ({ chave: chave(c.id), rotulo: c.rotulo, nomeCompleto: c.nome, numero: "vazia" })),
    });
  }
  return secoes;
}

/** "Mais 7 toques hoje em outras 4 cadências": o que está pendente fora do quadro aberto. */
export function toquesEmOutrasCadencias(cadencias: ResumoParaSeletor[], atual: string | null): { toques: number; cadencias: number } {
  const outras = cadencias.filter((c) => c.id !== atual && c.hoje + c.atrasados > 0);
  return { toques: outras.reduce((total, c) => total + c.hoje + c.atrasados, 0), cadencias: outras.length };
}

// ---------------------------------------------------------------- leituras do quadro da cadência

export type CartaoParaLeitura = { venceHoje: boolean; atrasoDias: number; responsavel: string };

/** Os números das leituras (Todos · Para hoje · Atrasado · uma por responsável), na ordem de quem tem mais. */
export function leiturasDaCadencia(cartoes: CartaoParaLeitura[]) {
  const porResponsavel = new Map<string, number>();
  for (const cartao of cartoes) {
    if (!cartao.responsavel) continue;
    porResponsavel.set(cartao.responsavel, (porResponsavel.get(cartao.responsavel) ?? 0) + 1);
  }
  return {
    todos: cartoes.length,
    hoje: cartoes.filter((c) => c.venceHoje).length,
    atrasado: cartoes.filter((c) => c.atrasoDias > 0).length,
    responsaveis: [...porResponsavel.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
      .map(([nome, total]) => ({ nome, total })),
  };
}
