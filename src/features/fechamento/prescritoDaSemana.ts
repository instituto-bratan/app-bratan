// O PRESCRITO DA SEMANA, DOS PROTOCOLOS (28/10/2026).
//
// No check-in semanal o Estevão digitava o prescrito de cada paciente lendo as
// imagens do WhatsApp — o prescrito "não existia em tela nenhuma". Agora existe:
// é o total dos protocolos que o doutor enviou na semana (sexta a quinta, como
// o check-in), no valor à vista no Pix (a régua do Lucas). O campo digitado
// continua lá como alternativa; esta conta mostra a soma real ao lado e diz,
// paciente a paciente, quanto foi prescrito.
//
// Casar protocolo com a linha da semana: pela ficha do CRM quando o protocolo
// já está ligado a ela; senão pela regra de nomes do app (primeiro nome igual
// e sobrenomes compatíveis), e só quando UMA linha casa — na dúvida, o
// protocolo fica de fora das linhas (aparece em "sem linha"), nunca no paciente
// errado.
import { dentroDaSemana, type LinhaDoCheckin } from "@/features/crm/checkinSemanal";
import { personNamesMatch } from "@/features/crm/nameMatch";
import { prescritoEm, type Protocolo } from "./protocolo";

export type ProtocoloDaSemana = Pick<Protocolo, "id" | "pacienteNome" | "contactRef" | "total" | "status" | "criadoEm" | "criadoNoAparelhoEm">;

export type PrescritoDaSemana = {
  /** Soma do prescrito (Pix) dos protocolos da semana, cancelados fora. */
  total: number;
  quantos: number;
  /** Por linha do check-in (ref da linha → valor). */
  porLinha: Record<string, { valor: number; quantos: number }>;
  /** Protocolos de quem ainda não tem linha na semana (prescreveu e não pagou). */
  semLinha: { ref: string; paciente: string; valor: number; quantos: number }[];
};

const centavos = (valor: number) => Math.round((valor || 0) * 100) / 100;

/** O dia (em Brasília) em que o doutor prescreveu. */
export function diaDaPrescricao(p: Pick<Protocolo, "criadoEm" | "criadoNoAparelhoEm">) {
  const t = Date.parse(prescritoEm(p));
  if (!Number.isFinite(t)) return "";
  return new Date(t - 3 * 3600_000).toISOString().slice(0, 10);
}

export function protocolosDaSemana<P extends ProtocoloDaSemana>(protocolos: P[], sextaISO: string): P[] {
  return protocolos.filter((p) => p.status !== "CANCELADO" && diaDaPrescricao(p) && dentroDaSemana(diaDaPrescricao(p), sextaISO));
}

export function prescritoDaSemana(entrada: { sextaISO: string; protocolos: ProtocoloDaSemana[]; linhas: Pick<LinhaDoCheckin, "ref" | "paciente">[] }): PrescritoDaSemana {
  const daSemana = protocolosDaSemana(entrada.protocolos, entrada.sextaISO);
  const porLinha: PrescritoDaSemana["porLinha"] = {};
  const semLinha = new Map<string, { ref: string; paciente: string; valor: number; quantos: number }>();
  for (const p of daSemana) {
    const pelaFicha = p.contactRef ? entrada.linhas.find((linha) => linha.ref === p.contactRef) : undefined;
    const peloNome = pelaFicha ? [] : entrada.linhas.filter((linha) => linha.paciente.trim() && personNamesMatch(p.pacienteNome, linha.paciente));
    const linha = pelaFicha ?? (peloNome.length === 1 ? peloNome[0] : undefined);
    if (linha) {
      const atual = porLinha[linha.ref] ?? { valor: 0, quantos: 0 };
      porLinha[linha.ref] = { valor: centavos(atual.valor + p.total), quantos: atual.quantos + 1 };
      continue;
    }
    // Sem linha: a chave é a ficha (quando tem) ou o nome — o mesmo jeito que o
    // check-in chaveia as comandas, para a comanda que chegar depois cair aqui.
    const ref = p.contactRef || p.pacienteNome.trim();
    const atual = semLinha.get(ref) ?? { ref, paciente: p.pacienteNome.trim(), valor: 0, quantos: 0 };
    semLinha.set(ref, { ...atual, valor: centavos(atual.valor + p.total), quantos: atual.quantos + 1 });
  }
  return {
    total: centavos(daSemana.reduce((soma, p) => soma + p.total, 0)),
    quantos: daSemana.length,
    porLinha,
    semLinha: [...semLinha.values()].sort((a, b) => a.paciente.localeCompare(b.paciente, "pt-BR")),
  };
}

/**
 * "Trazer dos protocolos": preenche o prescrito de quem está ZERADO (o que o
 * Estevão digitou manda) e acrescenta quem foi prescrito e ainda não pagou.
 */
export function linhasComOsProtocolos(linhas: LinhaDoCheckin[], prescrito: PrescritoDaSemana): LinhaDoCheckin[] {
  const preenchidas = linhas.map((linha) => {
    const doProtocolo = prescrito.porLinha[linha.ref];
    return doProtocolo && !(linha.prescrito > 0) ? { ...linha, prescrito: doProtocolo.valor, origem: "MANUAL" as const } : linha;
  });
  const jaTem = new Set(preenchidas.map((linha) => linha.ref));
  const novas = prescrito.semLinha
    .filter((item) => !jaTem.has(item.ref))
    .map((item) => ({ ref: item.ref, paciente: item.paciente, novo: false, prescrito: item.valor, pago: 0, origem: "MANUAL" as const }));
  return [...preenchidas, ...novas].sort((a, b) => a.paciente.localeCompare(b.paciente, "pt-BR"));
}
