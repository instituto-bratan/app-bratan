// AS FRASES DO TOPO DAS TELAS DE PACIENTES (08/10/2026, redesenho etapa 4).
//
// Regra do Lucas para o app inteiro: número nunca fica sozinho, vem numa frase
// em português direto ("Dez pacientes no plano, sete em dia. Dois com marco
// atrasado."). Aqui moram as frases do cabeçalho de Pacientes (Todos),
// Acompanhamento e NPS — puras, sem React, para os testes de node conferirem
// sem montar a tela (tests/etapa4-pacientes.test.mjs). Nada aqui decide regra
// de negócio: só conta o que a tela já calculava.
import { contagem, maiuscula, porExtenso } from "@/features/crm/comercialFrases";

/** A frase em três pedaços: o número em negrito, o resto e (se houver) o alerta em laranja. */
export type FraseDoTopo = { destaque: string; resto: string; alerta?: string };

// ---------------------------------------------------------------- Pacientes (Todos)

/**
 * A lista de contatos: quantos, quantos são pacientes e — só para quem pode ver
 * o CPF (permissão de Impostos & NFs) — quantos têm o CPF guardado. Paciente sem
 * CPF é o que trava a nota fiscal, por isso vira o alerta.
 */
export function fraseDaListaDePacientes(n: {
  contatos: number;
  pacientes: number;
  comCpf: number;
  pacientesSemCpf: number;
  sabeCpf: boolean;
  carregando?: boolean;
  semConta?: boolean;
}): FraseDoTopo {
  if (n.semConta) return { destaque: "Nenhum contato carregado.", resto: " A lista aparece quando você entra com a sua conta." };
  if (n.carregando) return { destaque: "Carregando a lista…", resto: "" };
  if (n.contatos === 0) return { destaque: "Nenhum contato na lista ainda.", resto: " Quem entra pelo Kanban aparece aqui." };
  const pacientes = n.pacientes === 0 ? "nenhum é paciente" : n.pacientes === n.contatos ? "todos pacientes" : `${contagem(n.pacientes, "paciente")}`;
  const cpf = n.sabeCpf ? ` ${maiuscula(contagem(n.comCpf, "contato"))} com CPF guardado.` : "";
  const alerta =
    n.sabeCpf && n.pacientesSemCpf > 0
      ? ` ${maiuscula(contagem(n.pacientesSemCpf, "paciente"))} ainda sem CPF — sem ele a nota não sai.`
      : undefined;
  return { destaque: maiuscula(contagem(n.contatos, "contato")), resto: `, ${pacientes}.${cpf}`, alerta };
}

// ---------------------------------------------------------------- Acompanhamento

/**
 * O plano de acompanhamento: quantos estão no plano, quantos em dia e o que pede
 * atenção (marco atrasado, semáforo vermelho de adesão).
 */
export function fraseDoAcompanhamento(n: { pacientes: number; emDia: number; atrasados: number; vermelhos: number }): FraseDoTopo {
  if (n.pacientes === 0) {
    return { destaque: "Ninguém no plano ainda.", resto: " Feche um negócio no Kanban ou adicione quem já está em acompanhamento." };
  }
  const emDia =
    n.emDia === n.pacientes ? (n.pacientes === 1 ? ", em dia" : ", todos em dia") : n.emDia === 0 ? ", nenhum em dia" : `, ${porExtenso(n.emDia)} em dia`;
  const alertas: string[] = [];
  if (n.atrasados > 0) alertas.push(`${maiuscula(contagem(n.atrasados, "paciente"))} com marco atrasado.`);
  if (n.vermelhos > 0) alertas.push(`${maiuscula(contagem(n.vermelhos, "paciente"))} no semáforo vermelho.`);
  return {
    destaque: maiuscula(contagem(n.pacientes, "paciente")),
    resto: ` no plano de acompanhamento${emDia}.`,
    alerta: alertas.length ? ` ${alertas.join(" ")}` : undefined,
  };
}

// ---------------------------------------------------------------- NPS da Concierge

/**
 * A fila do NPS: quem passou na clínica e ainda não recebeu o contato, e as
 * reclamações que esperam a resolução (o que fecha o ciclo).
 */
export function fraseDoNps(n: { fila: number; pendencias: number }): FraseDoTopo {
  const alerta =
    n.pendencias > 0
      ? ` ${maiuscula(contagem(n.pendencias, "reclamação espera", "reclamações esperam", "f"))} a resolução.`
      : undefined;
  if (n.fila === 0) return { destaque: "Fila em dia:", resto: " todo mundo que passou na clínica já recebeu o contato.", alerta };
  return {
    destaque: `${maiuscula(contagem(n.fila, "pessoa", "pessoas", "f"))} para contatar`,
    resto: n.fila === 1 ? ": passou na clínica e ainda não recebeu o contato." : ": passaram na clínica e ainda não receberam o contato.",
    alerta,
  };
}

/** "92%" com vírgula (o placar do NPS); null vira travessão. */
export function percentualBR(valor: number | null): string {
  return valor === null ? "—" : `${String(valor).replace(".", ",")}%`;
}
