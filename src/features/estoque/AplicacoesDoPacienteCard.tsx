// BLOCO "APLICAÇÕES" NA FICHA DO PACIENTE NO CRM (29/09/2026).
//
// O histórico do que a enfermagem aplicou nesta pessoa: data, produto, lote,
// dose e quem aplicou. Só aparece para quem a ficha de aplicação libera
// (enfermeira e gestão) — a ficha do CRM é vista pela equipe inteira, a
// recepção inclusive, e aplicação é dado clínico.
import { Link } from "react-router-dom";
import { Plus, Syringe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Syringe className="h-5 w-5" aria-hidden="true" /> Aplicações
          <InfoTip title="De onde vem">
            Da ficha de aplicação da enfermagem (Estoque → Aplicações). Cada linha diz o lote aplicado — é o rastreio se
            um lote tiver problema. Aplicação estornada continua aqui, riscada.
          </InfoTip>
          {podeRegistrar ? (
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link to="/estoque/aplicacoes" state={{ paciente: { ref: contactRef, name: nomePaciente } }}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Registrar aplicação
              </Link>
            </Button>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {ficha.erroAoCarregar ? (
          <p className="rounded-lg border border-rose-300 bg-rose-50/80 px-3 py-2 text-sm font-semibold text-red-800" role="alert">
            Não consegui ler as aplicações deste paciente: {ficha.erroAoCarregar}
          </p>
        ) : null}
        {ficha.carregando ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        {!ficha.carregando && !ficha.erroAoCarregar ? (
          <p className="text-sm text-muted-foreground">
            {valendo.length
              ? `${valendo.length} ${valendo.length === 1 ? "aplicação registrada" : "aplicações registradas"} nesta pessoa${lista.length > valendo.length ? `, fora ${lista.length - valendo.length} estornada(s)` : ""}.`
              : lista.length
                ? `Nenhuma aplicação valendo nesta pessoa — ${lista.length === 1 ? "a única registrada foi estornada" : `as ${lista.length} registradas foram estornadas`}.`
                : "Nenhuma aplicação registrada nesta pessoa ainda."}
          </p>
        ) : null}
        {lista.map((aplicacao) => (
          <LinhaDaAplicacao key={aplicacao.id} aplicacao={aplicacao} podeEstornar={false} mostrarPaciente={false} />
        ))}
      </CardContent>
    </Card>
  );
}
