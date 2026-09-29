// LEITURA DO ICS DA AGENDA (29/09/2026): cada teste prova um defeito que fazia
// a ponte iClinic → Google → app perder ou duplicar consulta.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const ics = loadTs("supabase/functions/_shared/agendaIcs.ts");
const de = new Date("2026-09-27T00:00:00-03:00");
const ate = new Date("2027-01-27T23:59:59-03:00");

const arquivo = (...eventos) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...eventos.flat(), "END:VCALENDAR"].join("\r\n");
const evento = (linhas) => ["BEGIN:VEVENT", ...linhas, "END:VEVENT"];

test("consulta das 21h fica no dia de Brasília, não no dia UTC", () => {
  const lidos = ics.parseICS(arquivo(evento(["UID:a@google.com", "DTSTART;TZID=America/Sao_Paulo:20260929T210000", "DTEND;TZID=America/Sao_Paulo:20260929T220000", "SUMMARY:Paciente A"])), de, ate);
  assert.equal(lidos.length, 1);
  assert.equal(lidos[0].inicio.toISOString(), "2026-09-30T00:00:00.000Z");
  assert.equal(ics.diaEmBrasilia(lidos[0].inicio), "2026-09-29");
  const { linhas } = ics.linhasParaOEspelho([{ rotulo: "Dr. Daniel", eventos: lidos }], "2026-09-29T12:00:00.000Z");
  assert.equal(linhas[0].dia, "2026-09-29");
  assert.equal(linhas[0].minutos, 60);
});

test("dia inteiro (Dia bloqueado) não vira consulta; alarme não contamina o evento", () => {
  const lidos = ics.parseICS(
    arquivo(
      evento(["UID:b@google.com", "DTSTART;VALUE=DATE:20260930", "DTEND;VALUE=DATE:20261001", "SUMMARY:Dia bloqueado"]),
      evento(["UID:c@google.com", "DTSTART:20260930T130000Z", "DTEND:20260930T140000Z", "SUMMARY:Fulana de Tal\\; retorno", "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:This is an event reminder", "END:VALARM"]),
    ),
    de,
    ate,
  );
  assert.equal(lidos.length, 1);
  assert.equal(lidos[0].resumo, "Fulana de Tal; retorno", "\\; volta a ser ;");
  assert.equal(lidos[0].descricao, "", "a DESCRIPTION do alarme não é a do evento");
});

test("instância modificada substitui a original mesmo com UID @google.com (antes: dobro + lote recusado)", () => {
  const lidos = ics.parseICS(
    arquivo(
      evento(["UID:serie@google.com", "DTSTART;TZID=America/Sao_Paulo:20260929T090000", "DTEND;TZID=America/Sao_Paulo:20260929T100000", "RRULE:FREQ=WEEKLY;COUNT=3", "SUMMARY:Paciente B"]),
      evento(["UID:serie@google.com", "RECURRENCE-ID;TZID=America/Sao_Paulo:20261006T090000", "DTSTART;TZID=America/Sao_Paulo:20261006T150000", "DTEND;TZID=America/Sao_Paulo:20261006T160000", "SUMMARY:Paciente B"]),
      // movida para fora da janela: a original do dia 13 tem que sumir
      evento(["UID:serie@google.com", "RECURRENCE-ID;TZID=America/Sao_Paulo:20261013T090000", "DTSTART;TZID=America/Sao_Paulo:20270301T090000", "DTEND;TZID=America/Sao_Paulo:20270301T100000", "SUMMARY:Paciente B"]),
    ),
    de,
    ate,
  );
  const vistos = lidos.map((e) => [e.uid, e.inicio.toISOString()]).sort();
  assert.equal(
    JSON.stringify(vistos),
    JSON.stringify([
      ["serie@google.com@2026-09-29", "2026-09-29T12:00:00.000Z"],
      ["serie@google.com@2026-10-06", "2026-10-06T18:00:00.000Z"],
    ]),
  );
  const { linhas } = ics.linhasParaOEspelho([{ rotulo: "Juliana", eventos: lidos }], "x");
  assert.equal(new Set(linhas.map((l) => l.origem_id)).size, linhas.length, "nenhum origem_id repetido no lote");
});

test("série antiga (começou há 2 anos) ainda chega na janela; EXDATE tira a semana", () => {
  const lidos = ics.parseICS(
    arquivo(evento(["UID:velha@google.com", "DTSTART;TZID=America/Sao_Paulo:20240930T080000", "DTEND;TZID=America/Sao_Paulo:20240930T083000", "RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;TZID=America/Sao_Paulo:20261005T080000", "SUMMARY:compromisso dr daniel"])),
    new Date("2026-09-27T00:00:00-03:00"),
    new Date("2026-10-18T23:59:59-03:00"),
  );
  assert.equal(JSON.stringify(lidos.map((e) => ics.diaEmBrasilia(e.inicio))), JSON.stringify(["2026-09-28", "2026-10-12"]));
});

test("mesmo UID em dois calendários vira duas linhas; o primeiro calendário mantém o id de sempre", () => {
  const ev = ics.parseICS(arquivo(evento(["UID:dupla@google.com", "DTSTART:20260930T130000Z", "DTEND:20260930T140000Z", "SUMMARY:Paciente C"])), de, ate);
  const { linhas, repetidos } = ics.linhasParaOEspelho(
    [
      { rotulo: "Gessica", eventos: ev },
      { rotulo: "Juliana", eventos: ev },
      { rotulo: "Juliana", eventos: ev },
    ],
    "x",
  );
  assert.equal(JSON.stringify(linhas.map((l) => [l.origem_id, l.profissional])), JSON.stringify([["dupla@google.com", "Gessica"], ["dupla@google.com#Juliana", "Juliana"]]));
  assert.equal(repetidos, 1);
});

test("procedimento e cor: guardados quando o calendário traz; coluna cor só vai quando existe", () => {
  const lidos = ics.parseICS(
    arquivo(
      evento(["UID:p@google.com", "DTSTART:20260930T130000Z", "DTEND:20260930T140000Z", "SUMMARY:Paciente D", "DESCRIPTION:Procedimento: Primeira consulta\\nConvênio: particular", "COLOR:turquoise"]),
      evento(["UID:q@google.com", "DTSTART:20260930T150000Z", "DTEND:20260930T160000Z", "SUMMARY:Paciente E"]),
    ),
    de,
    ate,
  );
  const { linhas } = ics.linhasParaOEspelho([{ rotulo: "Dr. Daniel", eventos: lidos }], "x");
  assert.equal(linhas[0].tipo, "Primeira consulta");
  assert.equal(linhas[0].cor, "turquoise");
  assert.equal(linhas[1].tipo, null);
  assert.equal("cor" in linhas[1], false);
});

test("censo conta o que o arquivo traz sem expor conteúdo", () => {
  const censo = ics.censoDoCalendario(
    arquivo(
      evento(["UID:1", "DTSTART:20260930T130000Z", "SUMMARY:Paciente F"]),
      evento(["UID:2", "DTSTART;VALUE=DATE:20260930", "SUMMARY:Dia bloqueado"]),
      evento(["UID:3", "DTSTART:20260930T130000Z", "SUMMARY:Paciente G", "DESCRIPTION:Primeira consulta", "CATEGORIES:Consulta"]),
    ),
  );
  assert.equal(JSON.stringify(censo), JSON.stringify({ eventos: 3, diaInteiro: 1, recorrentes: 0, comDescricao: 1, comLocal: 0, comCategoria: 1, comCor: 0, comProcedimentoNoTexto: 1 }));
});

test("cancelado no calendário vira status cancelado", () => {
  const lidos = ics.parseICS(arquivo(evento(["UID:x@google.com", "DTSTART:20260930T130000Z", "DTEND:20260930T140000Z", "SUMMARY:Paciente H", "STATUS:CANCELLED"])), de, ate);
  assert.equal(ics.linhasParaOEspelho([{ rotulo: "Juliana", eventos: lidos }], "x").linhas[0].status, "cancelado");
});
