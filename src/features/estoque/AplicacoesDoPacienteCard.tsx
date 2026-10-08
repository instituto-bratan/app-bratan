// BLOCO "APLICAÇÕES" NA FICHA DO PACIENTE NO CRM (29/09/2026).
//
// O histórico do que a enfermagem aplicou nesta pessoa: data, produto, lote,
// dose e quem aplicou. Só aparece para quem a ficha de aplicação libera
// (enfermeira e gestão) — a ficha do CRM é vista pela equipe inteira, a
// recepção inclusive, e aplicação é dado clínico.
//
// 08/10/2026 (redesenho Papel & Musgo): o mesmo bloco numa folha da fundação —
// título curto, a frase com o número, as linhas da LinhaDaAplicacao numa lista
// e o "Registrar aplicação" como link com seta (abre a ficha com o paciente).
import { useNavigate } from "react-router-dom";
import { Syringe } from "lucide-react";
import { BlocoFolha, LinkSeta } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canRegistrarAplicacao, canSeeModule } from "@/lib/access";
import { LinhaDaAplicacao } from "./LinhaDaAplicacao";
import { aplicacoesDoPaciente } from "./aplicacaoData";
import { useAplicacoes } from "./useAplicacoes";

export function AplicacoesDoPacienteCard({ contactRef, nomePaciente }: { contactRef: string; nomePaciente: string }) {
  const { pessoa } = useAuth();
  const podeVer = canSeeModule(pessoa, "aplicacoes");
  const podeRegistrar = canEditModule(pessoa, "aplicacoes") && canRegistrarAplicacao(pessoa);
  const ficha = useAplicacoes({ contactRef, ativo: podeVer });
  if (!podeVer) return null;

  const lista = aplicacoesDoPaciente(ficha.aplicacoes, contactRef);
  const valendo = lista.filter((aplicacao) => !aplicacao.estornadoEm);

  return (
    <BlocoFolha as="section" aria-labelledby={`aplicacoes-${contactRef}`} className="font-sans">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-2 pt-4">
        <h2 id={`aplicacoes-${contactRef}`} className="flex flex-wrap items-center gap-2 text-base font-bold leading-6 text-tinta">
          <Syringe className="h-5 w-5 text-oliva" aria-hidden="true" /> Aplicações
          <InfoTip title="De onde vem">
            Da ficha de aplicação da enfermagem (Estoque → Aplicações). Cada linha diz o lote aplicado — é o rastreio se
            um lote tiver problema. Aplicação estornada continua aqui, riscada.
          </InfoTip>
        </h2>
        {podeRegistrar ? (
          // A ficha manda o paciente pelo estado da navegação (não pela URL: ficha clínica não vai para histórico).
          <LinkSetaComEstado contactRef={contactRef} nomePaciente={nomePaciente} />
        ) : null}
      </div>
      {ficha.erroAoCarregar ? (
        <p className="mx-4 mb-3 rounded-bloco bg-erro-claro px-3 py-2 text-sm font-bold text-erro" role="alert">
          Não consegui ler as aplicações deste paciente: {ficha.erroAoCarregar}
        </p>
      ) : null}
      {ficha.carregando ? <p className="px-4 pb-3 text-sm font-medium text-tinta-2">Carregando…</p> : null}
      {!ficha.carregando && !ficha.erroAoCarregar ? (
        <p className="px-4 pb-3 text-[13px] font-medium leading-5 text-tinta-2">
          {valendo.length
            ? `${valendo.length} ${valendo.length === 1 ? "aplicação registrada" : "aplicações registradas"} nesta pessoa${lista.length > valendo.length ? `, fora ${lista.length - valendo.length} estornada(s)` : ""}.`
            : lista.length
              ? `Nenhuma aplicação valendo nesta pessoa — ${lista.length === 1 ? "a única registrada foi estornada" : `as ${lista.length} registradas foram estornadas`}.`
              : "Nenhuma aplicação registrada nesta pessoa ainda."}
        </p>
      ) : null}
      {lista.length ? (
        <ul>
          {lista.map((aplicacao) => (
            <LinhaDaAplicacao key={aplicacao.id} aplicacao={aplicacao} podeEstornar={false} mostrarPaciente={false} />
          ))}
        </ul>
      ) : null}
    </BlocoFolha>
  );
}

/** "Registrar aplicação →" levando o paciente no estado da navegação. */
function LinkSetaComEstado({ contactRef, nomePaciente }: { contactRef: string; nomePaciente: string }) {
  const navegar = useNavigate();
  return (
    <LinkSeta
      to="/estoque/aplicacoes"
      onClick={(evento) => {
        evento.preventDefault();
        navegar("/estoque/aplicacoes", { state: { paciente: { ref: contactRef, name: nomePaciente } } });
      }}
    >
      Registrar aplicação
    </LinkSeta>
  );
}
