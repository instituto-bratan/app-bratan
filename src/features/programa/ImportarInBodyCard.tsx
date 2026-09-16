// IMPORTAR A BIOIMPEDÂNCIA DA INBODY (16/09/2026).
//
// A enfermagem exporta os exames do aparelho (Lookin'Body, ou o pendrive do
// próprio InBody), arrasta o arquivo aqui e confere antes de salvar. O que o app
// não conseguir casar com um paciente do CRM fica visível — nada entra calado.
//
// O motor é puro e mora em inbodyImport.ts; esta tela só mostra e confirma.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
import { cn } from "@/lib/utils";
import { lerLinhasDeCsv, lerLinhasDeXlsx } from "@/lib/planilhaLeitor";
import { createRemotePacienteMedicoesEmLote, listRemotePacienteMedicoesDesde } from "@/lib/remoteData";
import { casarMedicoesComContatos, fraseDaImportacao, lerMedicoesInBody, type Casamento, type Contato } from "./inbodyImport";

/** Um ano para trás: é o que o aparelho costuma guardar e o que a curva usa. */
function umAnoAtras() {
  const data = new Date();
  data.setFullYear(data.getFullYear() - 1);
  return data.toISOString().slice(0, 10);
}

export function ImportarInBodyCard({ contatos, pessoaId, ativo }: { contatos: Contato[]; pessoaId: string | null; ativo: boolean }) {
  const queryClient = useQueryClient();
  const entradaRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [arquivoNome, setArquivoNome] = useState("");
  const [casamento, setCasamento] = useState<Casamento | null>(null);
  const [problemas, setProblemas] = useState<{ linha: number; motivo: string }[]>([]);

  const medicoesQuery = useQuery({
    queryKey: ["paciente-medicoes-ano"],
    queryFn: () => listRemotePacienteMedicoesDesde(umAnoAtras()),
    enabled: ativo,
    staleTime: 60_000,
  });

  const salvar = useMutation({
    mutationFn: async (prontas: NonNullable<Casamento>["prontas"]) =>
      createRemotePacienteMedicoesEmLote(
        prontas.map((item) => ({
          contactRef: item.contactRef,
          dia: item.medicao.dia,
          pesoKg: item.medicao.pesoKg,
          gorduraPct: item.medicao.gorduraPct,
          massaMagraKg: item.medicao.massaMagraKg,
          cinturaCm: item.medicao.cinturaCm,
          observacao: `InBody · ${arquivoNome}`,
        })),
        pessoaId,
      ),
    onSuccess: (quantas) => {
      toast(`${quantas} ${quantas === 1 ? "medição entrou" : "medições entraram"} na ficha dos pacientes.`, { tom: "ok" });
      setCasamento(null);
      setProblemas([]);
      setArquivoNome("");
      void queryClient.invalidateQueries({ queryKey: ["paciente-medicoes-ano"] });
      void queryClient.invalidateQueries({ queryKey: ["portal-medicoes"] });
    },
    onError: (erro: unknown) => toast(`Não deu para salvar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`, { tom: "erro", duracaoMs: 7000 }),
  });

  async function lerArquivo(arquivo: File) {
    setLendo(true);
    try {
      const ehXlsx = /\.xlsx$/i.test(arquivo.name);
      const linhas = ehXlsx ? await lerLinhasDeXlsx(await arquivo.arrayBuffer()) : lerLinhasDeCsv(await arquivo.text());
      const leitura = lerMedicoesInBody(linhas);
      const jaRegistradas = (medicoesQuery.data ?? []).map((registro) => ({ contactRef: registro.contactRef, dia: registro.dia }));
      setArquivoNome(arquivo.name);
      setProblemas(leitura.problemas);
      setCasamento(casarMedicoesComContatos(leitura.medicoes, contatos, jaRegistradas));
    } catch (erro) {
      toast(`Não consegui ler o arquivo: ${erro instanceof Error ? erro.message : "formato não reconhecido"}`, { tom: "erro", duracaoMs: 7000 });
    } finally {
      setLendo(false);
    }
  }

  return (
    <Card className="border-brand-oliva/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Scale className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
          Bioimpedância da InBody
          <InfoTip title="De onde vem o arquivo">
            No computador da enfermagem, o Lookin'Body exporta os exames em Excel. No aparelho, dá para gravar o mesmo arquivo em um pendrive. Qualquer um dos dois serve — e reimportar o mesmo arquivo não duplica nada.
          </InfoTip>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Arraste a planilha exportada do aparelho. O app lê peso, gordura, massa magra e cintura, casa com o paciente pelo nome e mostra tudo antes de salvar.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          onDragOver={(evento) => {
            evento.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(evento) => {
            evento.preventDefault();
            setArrastando(false);
            const arquivo = evento.dataTransfer.files?.[0];
            if (arquivo) void lerArquivo(arquivo);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors",
            arrastando ? "border-brand-musgo bg-brand-creme/50" : "border-brand-oliva/30 bg-white/60",
          )}
        >
          <Upload className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
          <p className="text-brand-tinta">{lendo ? "Lendo o arquivo…" : arquivoNome || "Solte aqui o .xlsx ou .csv da InBody"}</p>
          <input
            ref={entradaRef}
            type="file"
            accept=".xlsx,.csv,.txt"
            className="hidden"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) void lerArquivo(arquivo);
              evento.target.value = "";
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={lendo || !ativo} onClick={() => entradaRef.current?.click()}>
            Escolher arquivo
          </Button>
          {!ativo ? <p className="text-xs text-muted-foreground">Entre com a sua conta para importar.</p> : null}
        </div>

        {casamento ? (
          <div className="space-y-3 rounded-lg border border-brand-oliva/20 bg-brand-papel/40 p-3 text-sm">
            <p className="font-semibold text-brand-musgo">{fraseDaImportacao(casamento)}</p>

            {casamento.prontas.length ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {casamento.prontas.map((item) => (
                  <li key={`${item.contactRef}-${item.medicao.dia}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-white/70 px-2.5 py-1.5">
                    <span className="text-brand-tinta">
                      <strong>{item.contatoNome}</strong> · {item.medicao.dia.slice(8, 10)}/{item.medicao.dia.slice(5, 7)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.medicao.pesoKg !== null ? `${item.medicao.pesoKg} kg` : "sem peso"}
                      {item.medicao.gorduraPct !== null ? ` · ${item.medicao.gorduraPct}% de gordura` : ""}
                      {item.medicao.massaMagraKg !== null ? ` · ${item.medicao.massaMagraKg} kg de massa magra` : ""}
                      {item.medicao.cinturaCm !== null ? ` · cintura ${item.medicao.cinturaCm} cm` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {casamento.semDono.length ? (
              <div>
                <p className="font-semibold text-amber-800">Sem paciente no CRM</p>
                <p className="text-xs text-muted-foreground">
                  Cadastre a pessoa (ou confira o nome no aparelho) e importe de novo: {casamento.semDono.map((medicao) => medicao.nome).join(", ")}.
                </p>
              </div>
            ) : null}

            {casamento.ambiguas.length ? (
              <div>
                <p className="font-semibold text-amber-800">Mais de um paciente com o mesmo nome</p>
                <p className="text-xs text-muted-foreground">
                  Estes precisam ser lançados na ficha do paciente certo, um por um: {casamento.ambiguas.map((item) => item.medicao.nome).join(", ")}.
                </p>
              </div>
            ) : null}

            {problemas.length ? (
              <div>
                <p className="font-semibold text-red-800">Linhas que não deu para ler</p>
                <ul className="text-xs text-muted-foreground">
                  {problemas.slice(0, 5).map((problema) => (
                    <li key={problema.linha}>Linha {problema.linha}: {problema.motivo}</li>
                  ))}
                  {problemas.length > 5 ? <li>e mais {problemas.length - 5}.</li> : null}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!casamento.prontas.length || salvar.isPending}
                onClick={() => void salvar.mutateAsync(casamento.prontas)}
              >
                {salvar.isPending ? "Salvando…" : `Salvar ${casamento.prontas.length} ${casamento.prontas.length === 1 ? "medição" : "medições"}`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCasamento(null);
                  setProblemas([]);
                  setArquivoNome("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
