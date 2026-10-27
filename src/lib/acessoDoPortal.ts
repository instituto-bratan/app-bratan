// QUEM MEXE NO "MOTIVO PARA ABRIR" DO PORTAL (27/10/2026) — espelho da RLS.
//
// Regra de negócio mora em 3 camadas: esta é a da TELA. As outras duas:
//   · banco: pode_recado_do_doutor (202610280401_recado_trancado.sql) e
//     pode_editar_semana_do_portal (202610280402_semana_do_portal.sql);
//   · função: portal-paciente só deixa o PACIENTE mexer no que é dele (o próprio
//     "porquê" e as respostas do check-in), pela sessão do portal.
// Mudou aqui, muda lá — tests/recado-trancado.test.mjs e
// tests/semana-do-portal.test.mjs conferem os dois lados.
//
// Fica fora de access.ts de propósito: três frentes mexem naquele arquivo agora.
import { isCoordenacao } from "@/lib/access";
import type { Cargo } from "@/types/database";

/** Gravar, ouvir e apagar o recado trancado do Dr.: médicos e coordenação. */
export function podeGravarRecadoDoDoutor(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo) || cargo === "dr_daniel";
}

/** Escrever o conteúdo de cada semana do portal: coordenação e enfermagem. */
export function podeEditarSemanasDoPortal(cargo: Cargo | null | undefined) {
  return isCoordenacao(cargo) || cargo === "enfermeira";
}
