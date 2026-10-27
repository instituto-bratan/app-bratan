// CENTRAL BRATAN (28/10/2026) — a tela /central: gerir todas as frentes daqui.
//
// O Lucas decidiu transformar a empresa num ecossistema ("um banco, um login,
// várias frentes") e quer ver tudo de um lugar só. Versão 1, só leitura:
//  · no topo, as DECISÕES que esperam a pessoa — os mesmos números do contador
//    do Início, lidos uma vez só pela casca (useContadoresDaTela) — e a SAÚDE
//    DO SISTEMA (rotinas, chamadas, integrações, IA, arquivos);
//  · a grade das 8 frentes, cada uma com situação, uso de hoje e de 7 dias, o
//    número que importa com a frase, o que travou e o próximo passo;
//  · o disjuntor de 30 dias (só mostra; desligar fica para a versão 2);
//  · "Copiar resumo para o Claude": um texto curto com o estado de tudo.
// A porta é o módulo "central" de Acessos (Lucas, Dr. Daniel e CEO por padrão),
// na rota (AccessGate) e no banco (pode_central dentro de central_resumo).
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { BlocoFolha } from "@/components/ui/blocos";
import { Botao } from "@/components/ui/botao";
import { Cabecalho } from "@/components/ui/cabecalho";
import { useAuth } from "@/hooks/useAuth";
import { podeVerDestino, resolverRota } from "@/lib/navegacao";
import { carregarResumoDaCentral } from "@/lib/remote/central";
import { useContadoresDaTela } from "@/layouts/casca/contexto";
import { decisoesDaCentral, mensagemDoErroDaCentral, montarCentral, resumoDeExemplo, textoParaClaude } from "./central";
import { BlocoDaSaude, BlocoDasDecisoes, CartaoDaFrenteView, Rubrica, TabelaDoDisjuntor } from "./pecasDaCentral";

/** Função ainda não aplicada (PGRST202) ou acesso tirado (42501): tentar de novo não adianta. */
function valeTentarDeNovo(tentativas: number, erro: unknown) {
  const codigo = String((erro as { code?: unknown } | null)?.code ?? "");
  return tentativas < 1 && codigo !== "PGRST202" && codigo !== "42501";
}

export function CentralPage() {
  const { pessoa, session, isPreview } = useAuth();
  const remoto = Boolean(pessoa && session && !isPreview);
  const contadores = useContadoresDaTela();

  const consulta = useQuery({
    queryKey: ["central-resumo"],
    queryFn: carregarResumoDaCentral,
    enabled: remoto,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: valeTentarDeNovo,
  });

  // Prévia sem banco: um resumo FICTÍCIO no mesmo formato (a tela avisa).
  const [agoraDaPrevia] = useState(() => new Date().toISOString());
  const bruto = remoto ? consulta.data : resumoDeExemplo(agoraDaPrevia);
  const central = useMemo(() => (bruto ? montarCentral(bruto) : null), [bruto]);

  // As decisões: os MESMOS números do contador do Início (a casca já leu).
  const decisoes = useMemo(
    () => decisoesDaCentral(contadores.decisoes, contadores.veNotas ? contadores.notasSemCpf.length : 0),
    [contadores.decisoes, contadores.veNotas, contadores.notasSemCpf.length],
  );

  // Se o navegador não deixar copiar, o texto fica aberto para selecionar à mão.
  const [textoParaCopiar, setTextoParaCopiar] = useState<string | null>(null);
  function copiarResumo() {
    if (!central) return;
    const texto = textoParaClaude(central, { decisoes, exemplo: !remoto });
    const naoCopiou = () => {
      setTextoParaCopiar(texto);
      toast("Não consegui copiar sozinho. O resumo está aberto no fim da tela: selecione e copie.", { tom: "atencao", duracaoMs: 7000 });
    };
    try {
      if (!navigator.clipboard?.writeText) {
        naoCopiou();
        return;
      }
      navigator.clipboard.writeText(texto).then(() => {
        setTextoParaCopiar(null);
        toast("Resumo copiado. É só colar na conversa com o Claude.", { tom: "ok" });
      }, naoCopiou);
    } catch {
      naoCopiou();
    }
  }

  // O link do cartão só aparece se a pessoa abre aquela tela (a mesma regra do
  // menu): quem ganhou a Central por Acessos não é levado a uma porta trancada.
  const frentes = useMemo(
    () =>
      (central?.frentes ?? []).map((frente) => {
        const destino = frente.link ? resolverRota(frente.link.to)?.destino ?? null : null;
        return destino && podeVerDestino(pessoa, destino) ? frente : { ...frente, link: null };
      }),
    [central, pessoa],
  );

  const carregando = remoto && consulta.isLoading;
  const erro = remoto && consulta.error ? mensagemDoErroDaCentral(consulta.error) : null;

  let frase: ReactNode;
  if (carregando) frase = "Lendo o banco…";
  else if (!central) frase = erro ?? "Sem leitura do banco agora.";
  else
    frase = (
      <>
        <strong>{central.frase}</strong> {central.quando ? `Leitura de ${central.quando}.` : ""}
      </>
    );

  return (
    <div className="mx-auto w-full max-w-[1200px] font-sans text-tinta">
      <Cabecalho
        sobrancelha="Início · Central"
        titulo={
          <>
            Central <em>Bratan</em>
          </>
        }
        frase={frase}
        acoes={
          <>
            <Botao
              variante="fantasma"
              icone={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void consulta.refetch()}
              carregando={remoto && consulta.isFetching}
              disabled={!remoto}
            >
              Atualizar
            </Botao>
            <Botao variante="primario" icone={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={copiarResumo} disabled={!central}>
              Copiar resumo para o Claude
            </Botao>
          </>
        }
      />

      {!remoto ? (
        <p className="-mt-4 mb-6 text-[13px] font-medium leading-5 text-tinta-2">Prévia: números de exemplo, sem dado da clínica.</p>
      ) : null}

      {erro ? (
        <BlocoFolha as="div" respiro role="alert" className="mb-8 flex items-start gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-atencao" strokeWidth={2.25} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold leading-6 text-tinta">{erro}</p>
            {central ? (
              <p className="text-[13px] font-medium leading-5 text-tinta-2">Os números abaixo são da última leitura que deu certo.</p>
            ) : null}
          </div>
        </BlocoFolha>
      ) : null}

      <div className="grid items-start gap-8 max-md:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <BlocoDasDecisoes decisoes={decisoes} carregando={contadores.carregandoNotas} />
        <BlocoDaSaude saude={central?.saude ?? null} carregando={carregando} />
      </div>

      <section aria-labelledby="central-frentes" className="mt-10 max-md:mt-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Rubrica id="central-frentes">As 8 frentes</Rubrica>
          {central ? <p className="text-[13px] font-medium leading-5 text-tinta-2">{central.frase}</p> : null}
        </div>
        {central ? (
          <div className="grid gap-4 md:grid-cols-2">
            {frentes.map((frente) => (
              <CartaoDaFrenteView key={frente.id} frente={frente} />
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium leading-6 text-tinta-2">{carregando ? "Lendo as frentes…" : "Sem leitura das frentes agora."}</p>
        )}
      </section>

      {central ? (
        <div className="mt-10 max-md:mt-8">
          <TabelaDoDisjuntor linhas={central.disjuntor} />
        </div>
      ) : null}

      {textoParaCopiar ? (
        <section aria-labelledby="central-texto" className="mt-10 max-md:mt-8">
          <Rubrica id="central-texto" className="mb-3">
            Resumo para o Claude (selecione e copie)
          </Rubrica>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-bloco border border-fio bg-folha p-4 font-sans text-[13px] font-medium leading-6 text-tinta">
            {textoParaCopiar}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
