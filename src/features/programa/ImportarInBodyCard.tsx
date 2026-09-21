// IMPORTAR A BIOIMPEDÂNCIA DA INBODY (16/09/2026).
//
// A enfermagem exporta os exames do aparelho (Lookin'Body, ou o pendrive do
// próprio InBody), arrasta o arquivo aqui e confere antes de salvar. O que o app
// não conseguir casar com um paciente do CRM fica visível — nada entra calado.
//
// DUAS SITUAÇÕES, A MESMA TELA (pedido do Lucas, 16/09): a PRIMEIRA importação
// traz o histórico inteiro — dezenas de pessoas, várias datas cada uma. As
// seguintes serão de uma pessoa só. Por isso a conferência é agrupada POR
// PACIENTE: com muita gente cabe na tela, com uma pessoa vira uma linha.
//
// O bloco fica fechado enquanto ninguém precisa dele, para não empurrar a tela
// de Acompanhamento para baixo.
//
// O motor é puro e mora em inbodyImport.ts; esta tela só mostra e confirma.
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Scale, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
import { cn } from "@/lib/utils";
import { lerAbasDeXlsx, lerLinhasDeCsv } from "@/lib/planilhaLeitor";
import { createRemotePacienteMedicoesEmLote, listRemotePacienteMedicoesDesde } from "@/lib/remoteData";
import { casarMedicoesComContatos, fraseDaImportacao, lerMedicoesDeAbas, nomesParaResolver, resumoPorPaciente, type Casamento, type Contato, type EscolhasDeNome, type MedicaoImportada } from "./inbodyImport";

/** Cinco anos para trás: a primeira importação traz o histórico inteiro do aparelho. */
function historicoTodo() {
  const data = new Date();
  data.setFullYear(data.getFullYear() - 5);
  return data.toISOString().slice(0, 10);
}

/** O Supabase recusa um insert gigante — o arquivo entra em blocos. */
const TAMANHO_DO_BLOCO = 200;

/** Nomes sem repetir e sem virar um parágrafo de mil linhas (o histórico do
 *  aparelho tem mais de mil pessoas, e a maioria não está no CRM). */
function nomesResumidos(nomes: string[], limite = 40) {
  const unicos = [...new Set(nomes)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (unicos.length <= limite) return `${unicos.join(", ")}.`;
  return `${unicos.slice(0, limite).join(", ")} e mais ${unicos.length - limite}.`;
}

const diaBR = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(2, 4)}`;

export function ImportarInBodyCard({ contatos, pessoaId, ativo }: { contatos: Contato[]; pessoaId: string | null; ativo: boolean }) {
  const queryClient = useQueryClient();
  const entradaRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [arquivoNome, setArquivoNome] = useState("");
  const [abaLida, setAbaLida] = useState("");
  const [medicoes, setMedicoes] = useState<MedicaoImportada[] | null>(null);
  const [jaRegistradas, setJaRegistradas] = useState<{ contactRef: string; dia: string }[]>([]);
  const [problemas, setProblemas] = useState<{ linha: number; motivo: string }[]>([]);
  // O que a enfermagem decidiu para os nomes que o app não resolveu sozinho.
  const [escolhas, setEscolhas] = useState<EscolhasDeNome>({});

  // A conferência é recalculada a cada escolha — é o mesmo motor puro, e com o
  // arquivo inteiro (4 mil exames) leva milésimos.
  const casamento: Casamento | null = useMemo(
    () => (medicoes ? casarMedicoesComContatos(medicoes, contatos, jaRegistradas, escolhas) : null),
    [medicoes, contatos, jaRegistradas, escolhas],
  );
  const pendentes = useMemo(() => (casamento ? nomesParaResolver(casamento, contatos) : []), [casamento, contatos]);

  // O histórico serve para saber o que JÁ está no app — é ele que faz reimportar o
  // mesmo arquivo não duplicar nada. Fica pré-carregado ao abrir o bloco, mas quem
  // manda é o `fetchQuery` na hora de ler: se a lista ainda não tiver chegado, a
  // leitura espera, em vez de passar batido e gravar em dobro.
  const chaveDoHistorico = ["paciente-medicoes-historico"];
  useQuery({
    queryKey: chaveDoHistorico,
    queryFn: () => listRemotePacienteMedicoesDesde(historicoTodo()),
    enabled: ativo && aberto,
    staleTime: 60_000,
  });

  const salvar = useMutation({
    mutationFn: async (prontas: Casamento["prontas"]) => {
      const entradas = prontas.map((item) => ({
        contactRef: item.contactRef,
        dia: item.medicao.dia,
        pesoKg: item.medicao.pesoKg,
        gorduraPct: item.medicao.gorduraPct,
        massaMagraKg: item.medicao.massaMagraKg,
        cinturaCm: item.medicao.cinturaCm,
        inbodyScore: item.medicao.inbodyScore,
        gorduraVisceral: item.medicao.gorduraVisceral,
        massaMuscularKg: item.medicao.massaMuscularKg,
        tmbKcal: item.medicao.tmbKcal,
        observacao: `InBody · ${arquivoNome}`,
      }));
      let salvas = 0;
      for (let i = 0; i < entradas.length; i += TAMANHO_DO_BLOCO) {
        salvas += await createRemotePacienteMedicoesEmLote(entradas.slice(i, i + TAMANHO_DO_BLOCO), pessoaId);
      }
      return salvas;
    },
    onSuccess: (quantas) => {
      toast(`${quantas} ${quantas === 1 ? "medição entrou" : "medições entraram"} na ficha dos pacientes.`, { tom: "ok" });
      limpar();
      void queryClient.invalidateQueries({ queryKey: chaveDoHistorico });
      void queryClient.invalidateQueries({ queryKey: ["pesagens-desde"] });
      void queryClient.invalidateQueries({ queryKey: ["portal-medicoes"] });
    },
    onError: (erro: unknown) => toast(`Não deu para salvar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`, { tom: "erro", duracaoMs: 7000 }),
  });

  function limpar() {
    setMedicoes(null);
    setJaRegistradas([]);
    setEscolhas({});
    setProblemas([]);
    setArquivoNome("");
    setAbaLida("");
  }

  async function lerArquivo(arquivo: File) {
    setLendo(true);
    try {
      const ehXlsx = /\.xlsx$/i.test(arquivo.name);
      const abas = ehXlsx ? await lerAbasDeXlsx(await arquivo.arrayBuffer()) : [{ nome: arquivo.name, linhas: lerLinhasDeCsv(await arquivo.text()) }];
      const leitura = lerMedicoesDeAbas(abas);

      // Só depois de ler o arquivo é que vale a pena buscar o histórico — e ele é
      // obrigatório: sem saber o que já está no app, salvar duplicaria tudo.
      let jaDoApp: { contactRef: string; dia: string }[];
      try {
        const historico = await queryClient.fetchQuery({
          queryKey: chaveDoHistorico,
          queryFn: () => listRemotePacienteMedicoesDesde(historicoTodo()),
          staleTime: 60_000,
        });
        jaDoApp = historico.map((registro) => ({ contactRef: registro.contactRef, dia: registro.dia }));
      } catch {
        toast("Li o arquivo, mas não consegui conferir o que já está no app. Tente de novo em instantes — sem essa conferência, salvar poderia duplicar medições.", { tom: "erro", duracaoMs: 9000 });
        return;
      }

      setArquivoNome(arquivo.name);
      setAbaLida(leitura.aba);
      setProblemas(leitura.problemas);
      setEscolhas({});
      setJaRegistradas(jaDoApp);
      setMedicoes(leitura.medicoes);
    } catch (erro) {
      toast(`Não consegui ler o arquivo: ${erro instanceof Error ? erro.message : "formato não reconhecido"}`, { tom: "erro", duracaoMs: 7000 });
    } finally {
      setLendo(false);
    }
  }

  const porPaciente = casamento ? resumoPorPaciente(casamento.prontas) : [];

  return (
    <section className="rounded-lg border border-brand-oliva/20 bg-white/60 backdrop-blur-xl">
      {/* O InfoTip é um <button>: não pode ficar DENTRO do botão que abre o bloco
          (HTML inválido, e o clique na dúvida acabava abrindo/fechando a seção).
          Por isso a faixa é uma div, e quem abre é o botão do título. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <span className="flex flex-wrap items-center gap-2">
          <Scale className="h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
          <button type="button" onClick={() => setAberto((atual) => !atual)} className="text-left text-sm font-bold text-brand-musgo hover:underline">
            Bioimpedância da InBody
          </button>
          <span className="text-xs text-muted-foreground">
            {casamento ? fraseDaImportacao(casamento) : "Suba a planilha do aparelho — de um paciente ou de todos de uma vez."}
          </span>
          <InfoTip title="De onde vem o arquivo">
            No computador da enfermagem, o Lookin'Body exporta os exames em Excel. No aparelho, dá para gravar o mesmo arquivo em um pendrive. Qualquer um dos dois serve — e reimportar não duplica nada, porque a chave é paciente + dia.
          </InfoTip>
        </span>
        <button
          type="button"
          onClick={() => setAberto((atual) => !atual)}
          aria-label={aberto ? "Esconder a importação da bioimpedância" : "Abrir a importação da bioimpedância"}
          className="ios-pressable rounded-md p-0.5 text-brand-oliva transition hover:bg-brand-creme/60"
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
        </button>
      </div>

      {aberto ? (
        <div className="space-y-3 border-t border-brand-oliva/15 p-4 pt-3">
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
              "flex flex-wrap items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm transition-colors",
              arrastando ? "border-brand-musgo bg-brand-creme/50" : "border-brand-oliva/30 bg-white/60",
            )}
          >
            <Upload className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
            <span className="text-brand-tinta">{lendo ? "Lendo o arquivo — o histórico inteiro leva alguns segundos…" : arquivoNome || "Solte aqui o .xlsx ou .csv da InBody"}</span>
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
            {!ativo ? <span className="text-xs text-muted-foreground">Entre com a sua conta para importar.</span> : null}
          </div>

          {casamento ? (
            <div className="space-y-3 rounded-lg border border-brand-oliva/20 bg-brand-papel/40 p-3 text-sm">
              <p className="font-semibold text-brand-musgo">{fraseDaImportacao(casamento)}</p>
              {abaLida ? <p className="-mt-2 text-xs text-muted-foreground">Li a aba <strong>{abaLida}</strong> do arquivo.</p> : null}

              {porPaciente.length ? (
                <ul className="max-h-60 space-y-1 overflow-y-auto pr-1">
                  {porPaciente.map((paciente) => (
                    <li key={paciente.contactRef} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md bg-white/70 px-2.5 py-1.5">
                      <strong className="text-brand-tinta">{paciente.contatoNome}</strong>
                      <span className="text-xs text-muted-foreground">
                        {paciente.quantas === 1
                          ? `1 medição em ${diaBR(paciente.primeiroDia)}`
                          : `${paciente.quantas} medições, de ${diaBR(paciente.primeiroDia)} a ${diaBR(paciente.ultimoDia)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {pendentes.length ? (
                <div className="rounded-md border border-brand-dourado/40 bg-brand-creme/40 p-2.5">
                  <p className="font-semibold text-brand-musgo">
                    {pendentes.length === 1 ? "1 nome precisa de você" : `${pendentes.length} nomes precisam de você`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    O aparelho corta o nome em 30 letras e cada pessoa digita de um jeito. Diga de quem é cada um — ou deixe em branco para não importar.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {pendentes.map((pendente) => (
                      <li key={pendente.nome} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 px-2.5 py-1.5">
                        <span className="min-w-0">
                          <strong className="text-brand-tinta">{pendente.nome}</strong>
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {pendente.quantas === 1 ? "1 medição" : `${pendente.quantas} medições`}
                            {pendente.motivo === "AMBIGUO" ? " · mais de uma ficha com esse nome" : " · ficha parecida no CRM"}
                          </span>
                        </span>
                        <select
                          className="h-8 max-w-full rounded-md border border-brand-oliva/25 bg-white px-2 text-xs text-brand-tinta"
                          value={escolhas[pendente.nome] ?? ""}
                          aria-label={`Paciente de ${pendente.nome}`}
                          onChange={(evento) =>
                            setEscolhas((atual) => {
                              const proximo = { ...atual };
                              if (evento.target.value === "") delete proximo[pendente.nome];
                              else proximo[pendente.nome] = evento.target.value;
                              return proximo;
                            })
                          }
                        >
                          <option value="">não importar</option>
                          {pendente.candidatos.map((candidato) => (
                            <option key={candidato.id} value={candidato.id}>
                              {candidato.name}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {casamento.semDono.length ? (
                <details>
                  <summary className="cursor-pointer font-semibold text-amber-800">
                    {casamento.semDono.length} {casamento.semDono.length === 1 ? "nome sem paciente no CRM" : "nomes sem paciente no CRM"}
                  </summary>
                  <p className="mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground">
                    Cadastre a pessoa (ou confira o nome no aparelho) e importe de novo — nada se perde, o arquivo pode ser subido quantas vezes precisar: {nomesResumidos(casamento.semDono.map((medicao) => medicao.nome))}
                  </p>
                </details>
              ) : null}

              {casamento.ambiguas.length ? (
                <details>
                  <summary className="cursor-pointer font-semibold text-amber-800">
                    {casamento.ambiguas.length} {casamento.ambiguas.length === 1 ? "medição com mais de um paciente do mesmo nome" : "medições com mais de um paciente do mesmo nome"}
                  </summary>
                  <p className="mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground">
                    Estas precisam ser lançadas na ficha do paciente certo, uma por uma: {nomesResumidos(casamento.ambiguas.map((item) => item.medicao.nome))}
                  </p>
                </details>
              ) : null}

              {problemas.length ? (
                <details>
                  <summary className="cursor-pointer font-semibold text-red-800">
                    {problemas.length} {problemas.length === 1 ? "linha que não deu para ler" : "linhas que não deram para ler"}
                  </summary>
                  <ul className="mt-1 max-h-24 overflow-y-auto text-xs text-muted-foreground">
                    {problemas.slice(0, 20).map((problema) => (
                      <li key={problema.linha}>Linha {problema.linha}: {problema.motivo}</li>
                    ))}
                    {problemas.length > 20 ? <li>e mais {problemas.length - 20}.</li> : null}
                  </ul>
                </details>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={!casamento.prontas.length || salvar.isPending} onClick={() => void salvar.mutateAsync(casamento.prontas)}>
                  {salvar.isPending
                    ? "Salvando…"
                    : `Salvar ${casamento.prontas.length} ${casamento.prontas.length === 1 ? "medição" : "medições"}`}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={limpar}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
