// A FILA DO VENDEDOR (28/10/2026): os protocolos que o doutor enviou e que
// ainda estão na mesa — prescritos e em negociação —, do mais novo para o mais
// antigo. Embaixo, o que foi resolvido nos últimos 7 dias.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, RefreshCw } from "lucide-react";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, FraseDoFluxo } from "@/components/ui/fundacao";
import { Aviso, Etiqueta, TITULO_SECAO, type TomEtiqueta } from "@/features/crm/comercialVisual";
import { moneyFin } from "@/features/financeiro/financeiroData";
import { abertosDoMaisNovo, fraseDaLista, haQuantoTempo, prescritoEm, resumoDosItens, statusLabels, type Protocolo, type StatusDoProtocolo } from "./protocolo";
import { useProtocolosAbertos, useProtocolosResolvidos } from "./dadosDoFechamento";

export const TOM_DO_STATUS: Record<StatusDoProtocolo, TomEtiqueta> = {
  PRESCRITO: "ouro",
  EM_NEGOCIACAO: "musgo",
  FECHADO: "ok",
  NAO_FECHOU: "atencao",
  CANCELADO: "neutro",
};

/** Relógio que anda de minuto em minuto, para o "há 5 min" não congelar. */
export function useAgora(intervaloMs = 60_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => window.clearInterval(id);
  }, [intervaloMs]);
  return agora;
}

function LinhaDoProtocolo({ protocolo, agora }: { protocolo: Protocolo; agora: number }) {
  return (
    <li>
      <Link
        to={`/fechamento/${protocolo.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 hover:bg-saber focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco"
      >
        <span className="text-[15px] font-bold leading-6 text-tinta [overflow-wrap:anywhere]">{protocolo.pacienteNome}</span>
        <ChevronRight className="row-span-2 h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />
        <span className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
          <strong className="text-[15px] font-bold text-tinta">{moneyFin(protocolo.total)}</strong> no Pix · ou {protocolo.opcoes.parcelas}x de{" "}
          {moneyFin(protocolo.opcoes.parcela)}
        </span>
        <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Etiqueta tom={TOM_DO_STATUS[protocolo.status]}>{statusLabels[protocolo.status]}</Etiqueta>
          <span className="text-[13px] font-medium leading-5 text-tinta-2">
            {protocolo.medicoNome || "Doutor"} · {haQuantoTempo(prescritoEm(protocolo), agora)}
          </span>
        </span>
        <span className="col-span-2 min-w-0 truncate text-[13px] font-medium leading-5 text-tinta-2">{resumoDosItens(protocolo.itens)}</span>
      </Link>
    </li>
  );
}

export function ListaDeProtocolos() {
  const abertos = useProtocolosAbertos();
  const resolvidos = useProtocolosResolvidos(7);
  const agora = useAgora();
  const lista = abertosDoMaisNovo(abertos.data?.lista ?? []);
  const feitos = (resolvidos.data?.lista ?? []).slice(0, 12);
  const tabelaPronta = abertos.data?.tabelaPronta !== false;

  return (
    <div className="grid gap-5">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Comercial · Fechamento"
        titulo={
          <>
            Protocolos <em>do doutor</em>
          </>
        }
        frase={abertos.isLoading ? "Carregando os protocolos…" : fraseDaLista(lista)}
        acoes={
          <Botao
            tamanho="toque"
            icone={<RefreshCw className={abertos.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />}
            onClick={() => {
              void abertos.refetch();
              void resolvidos.refetch();
            }}
          >
            Atualizar
          </Botao>
        }
        rodape={<FraseDoFluxo>O doutor envia pelo app dele; o valor que conta como prescrito é o à vista no Pix.</FraseDoFluxo>}
      />

      {!tabelaPronta ? (
        <Aviso tom="atencao">O banco ainda não tem a tabela de protocolos (a migração desta entrega não foi aplicada). Nada para mostrar por enquanto.</Aviso>
      ) : null}
      {abertos.error ? <Aviso tom="erro">Não consegui ler os protocolos: {(abertos.error as Error).message}</Aviso> : null}

      {lista.length ? (
        <BlocoFolha as="section" aria-label="Protocolos esperando">
          <ul className="divide-y divide-fio">
            {lista.map((protocolo) => (
              <LinhaDoProtocolo key={protocolo.id} protocolo={protocolo} agora={agora} />
            ))}
          </ul>
        </BlocoFolha>
      ) : !abertos.isLoading && tabelaPronta ? (
        <BlocoSaber className="text-sm font-medium leading-6 text-tinta-2">
          Nenhum protocolo esperando. Quando o doutor tocar em <strong className="text-tinta">Enviar ao sistema</strong> no app dele, o protocolo aparece aqui.
        </BlocoSaber>
      ) : null}

      {feitos.length ? (
        <section aria-labelledby="fechamento-resolvidos" className="grid gap-2">
          <h2 id="fechamento-resolvidos" className={TITULO_SECAO}>
            Resolvidos nos últimos 7 dias
          </h2>
          <BlocoFolha>
            <ul className="divide-y divide-fio">
              {feitos.map((protocolo) => (
                <LinhaDoProtocolo key={protocolo.id} protocolo={protocolo} agora={agora} />
              ))}
            </ul>
          </BlocoFolha>
        </section>
      ) : null}
    </div>
  );
}
