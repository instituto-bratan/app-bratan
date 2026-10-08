// CHECK-IN SEMANAL — a tabela do Estevão (21/09/2026)
//
// Lucas: *"eu preciso que você faça uma planilha, uma tabela, para o Estevão
// preencher no CRM... todos os pacientes que passaram, o que foi prescrito e o
// que ele pagou, porque tem uma diferença do que é prescrito e do que é pago."*
//
// A TELA NÃO PEDE O QUE O APP JÁ SABE. Quem passou e quanto pagou sai das
// comandas da semana; quem é novo sai da data da primeira compra. O Estevão
// digita uma coisa só — o valor PRESCRITO, que nasce no consultório e não passa
// por tela nenhuma — e corrige o resto quando estiver errado.
//
// Todo o resto é derivado (`checkinSemanal.ts`) e nada disso é gravado: número
// derivado que se grava congela e passa a mentir quando a régua muda.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
import { BlocoFolha, Botao, Cabecalho, FraseDoFluxo } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import { Aviso, Campo, Indicadores, Input, Label, TITULO_SECAO, classeDoChip } from "./comercialVisual";
import { contagem, maiuscula } from "./comercialFrases";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { moneyFin, parseFinAmount } from "@/features/financeiro/financeiroData";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { loadRemoteCrmCheckinSemana, saveRemoteCrmCheckinSemana } from "@/lib/remoteData";
import {
  linhasDasComandas,
  proximaSexta,
  quintaDaSemana,
  resumoDoCheckin,
  rotuloDaSemana,
  sextaDaSemana,
  textoDoCheckin,
  type LinhaDoCheckin,
} from "./checkinSemanal";

/** A meta base padrão, enquanto ninguém combinar outra para a semana. */
const META_PADRAO = 90909.09;

function semanaAnterior(sextaISO: string) {
  const ms = Date.parse(`${sextaISO}T00:00:00Z`) - 7 * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function CrmCheckinSemanalPage() {
  const { pessoa } = useAuth();
  const financeiro = useFinanceiro();
  const [sexta, setSexta] = useState(() => sextaDaSemana(todayISO()));
  const [linhas, setLinhas] = useState<LinhaDoCheckin[]>([]);
  const [metaBaseTexto, setMetaBaseTexto] = useState(String(META_PADRAO).replace(".", ","));
  const [saldoHerdado, setSaldoHerdado] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // As comandas da semana, para a tabela não começar em branco.
  const comandas = useMemo(
    () =>
      financeiro.sales
        .map((sale) => ({
          clientRef: sale.id,
          saleDate: sale.saleDate,
          crmContactRef: sale.crmContactRef ?? null,
          patientName: sale.patientName,
          total: (sale.items ?? []).reduce((soma, item) => soma + (item.amount || 0), 0),
        })),
    [financeiro.sales],
  );

  // A primeira compra de cada paciente decide quem é NOVO. Sai das próprias
  // comandas: quem nunca comprou antes desta semana está chegando agora.
  const primeiraCompraPorPaciente = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const comanda of comandas) {
      const ref = (comanda.crmContactRef || comanda.patientName || "").trim();
      if (!ref) continue;
      if (!mapa[ref] || comanda.saleDate < mapa[ref]) mapa[ref] = comanda.saleDate;
    }
    return mapa;
  }, [comandas]);

  const carregar = useCallback(
    async (sextaISO: string) => {
      setCarregando(true);
      try {
        const [dados, anterior] = await Promise.all([
          loadRemoteCrmCheckinSemana(sextaISO).catch(() => null),
          loadRemoteCrmCheckinSemana(semanaAnterior(sextaISO)).catch(() => null),
        ]);
        const digitadas = (dados?.linhas as LinhaDoCheckin[]) ?? [];
        setLinhas(linhasDasComandas({ sextaISO, comandas, primeiraCompraPorPaciente, jaDigitadas: digitadas }));
        const base = typeof dados?.metaBase === "number" ? dados.metaBase : META_PADRAO;
        setMetaBaseTexto(String(base).replace(".", ","));
        // O QUE FALTOU NA SEMANA PASSADA VEM JUNTO (regra do Lucas): a meta
        // desta semana é a base dela mais o que ficou para trás.
        if (anterior) {
          const resumoAnterior = resumoDoCheckin({
            inicio: semanaAnterior(sextaISO),
            fim: quintaDaSemana(semanaAnterior(sextaISO)),
            linhas: ((anterior.linhas as LinhaDoCheckin[]) ?? []),
            metaBase: typeof anterior.metaBase === "number" ? anterior.metaBase : META_PADRAO,
            saldoHerdado: typeof anterior.saldoHerdado === "number" ? anterior.saldoHerdado : 0,
          });
          setSaldoHerdado(resumoAnterior.faltou);
        } else {
          setSaldoHerdado(0);
        }
      } finally {
        setCarregando(false);
      }
    },
    [comandas, primeiraCompraPorPaciente],
  );

  useEffect(() => {
    void carregar(sexta);
  }, [sexta, carregar]);

  const semana = useMemo(
    () => ({
      inicio: sexta,
      fim: quintaDaSemana(sexta),
      linhas,
      metaBase: parseFinAmount(metaBaseTexto),
      saldoHerdado,
      hojeISO: todayISO(),
    }),
    [sexta, linhas, metaBaseTexto, saldoHerdado],
  );
  const resumo = useMemo(() => resumoDoCheckin(semana), [semana]);

  function alterarLinha(ref: string, mudanca: Partial<LinhaDoCheckin>) {
    setLinhas((atual) => atual.map((linha) => (linha.ref === ref ? { ...linha, ...mudanca, origem: "MANUAL" as const } : linha)));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await saveRemoteCrmCheckinSemana(sexta, { linhas, metaBase: parseFinAmount(metaBaseTexto), saldoHerdado }, pessoa?.id ?? null);
      toast("Check-in da semana salvo.", { tom: "ok" });
    } catch (falha) {
      toast(`Não consegui salvar: ${(falha as Error).message}`, { tom: "erro", duracaoMs: 8000 });
    } finally {
      setSalvando(false);
    }
  }

  const numero = (valor: number) => moneyFin(valor);

  // CABEÇALHO (08/10/2026, redesenho etapa 3): um cabeçalho só, com a semana numa
  // frase; a tabela do prescrito mora numa folha (é o que se digita) e os oito
  // números derivados viram a faixa "para saber", com a frase da meta junto.
  const fraseDoTopo = (
    <>
      <strong>{maiuscula(contagem(resumo.pacientesTotais, "paciente"))}</strong> {resumo.pacientesTotais === 1 ? "passou" : "passaram"} na
      semana de {rotuloDaSemana(sexta)}, somando {numero(resumo.faturamento)}.
      {saldoHerdado > 0 ? <span className="alerta"> A meta trouxe {numero(saldoHerdado)} da semana passada.</span> : null}
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 font-sans max-md:gap-4">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Comercial · Coordenação"
        titulo="Check-in semanal"
        frase={fraseDoTopo}
        rodape={
          <FraseDoFluxo>
            A semana vai de sexta a quinta. O app traz quem tem comanda e quanto pagou; você digita só o prescrito.{" "}
            <InfoTip title="Por que sexta a quinta">A contagem fecha na quinta à noite e a semana nova abre na sexta — é a régua que o Lucas usa, e não a semana do calendário.</InfoTip>
          </FraseDoFluxo>
        }
      />

      {/* A semana e a meta combinada */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Semana">
          <Botao tamanho="pq" className="w-8 px-0" aria-label="Semana anterior" onClick={() => setSexta(semanaAnterior(sexta))}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Botao>
          <span className="flex min-w-44 items-center justify-center gap-2 text-sm font-bold tabular-nums text-tinta">
            <CalendarRange className="h-4 w-4 text-oliva" aria-hidden="true" />
            {rotuloDaSemana(sexta)}
          </span>
          <Botao tamanho="pq" className="w-8 px-0" aria-label="Próxima semana" onClick={() => setSexta(proximaSexta(sexta))}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Botao>
          <Botao variante="fantasma" tamanho="pq" onClick={() => setSexta(sextaDaSemana(todayISO()))}>
            Semana de hoje
          </Botao>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="checkin-meta">Meta combinada da semana</Label>
            <Input id="checkin-meta" value={metaBaseTexto} onChange={(e) => setMetaBaseTexto(e.target.value)} className="w-40 tabular-nums" inputMode="decimal" />
          </div>
          <Botao variante="primario" carregando={salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Salvar"}
          </Botao>
        </div>
      </div>

      {saldoHerdado > 0 ? (
        <Aviso tom="atencao">
          A semana passada fechou {numero(saldoHerdado)} abaixo da meta, e isso veio junto: a régua desta semana é{" "}
          {numero(resumo.meta)}.
        </Aviso>
      ) : null}

      <BlocoFolha as="section" respiro aria-labelledby="checkin-quem-passou">
        <h2 id="checkin-quem-passou" className={TITULO_SECAO}>Quem passou nesta semana</h2>
        <p className="mt-1 text-sm font-medium leading-5 text-tinta-2">
          O app já trouxe quem tem comanda e quanto pagou. Falta o <strong className="font-bold text-tinta">prescrito</strong> — o que foi proposto no
          consultório, que não existe em nenhuma tela.
        </p>
        <div className="mt-4 grid">
          {carregando ? (
            <p className="py-6 text-center text-sm font-medium text-tinta-2">Carregando a semana…</p>
          ) : linhas.length ? (
            <>
              <div className="hidden gap-2 border-b border-fio-2 pb-2 text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2 sm:grid sm:grid-cols-[1fr_112px_140px_140px_32px]">
                <span>Paciente</span>
                <span>Novo?</span>
                <span className="text-right">Prescrito</span>
                <span className="text-right">Pago</span>
                <span />
              </div>
              {linhas.map((linha) => (
                <div key={linha.ref} className="grid items-center gap-2 border-b border-fio py-2 sm:grid-cols-[1fr_112px_140px_140px_32px]">
                  <Campo
                    pequeno
                    value={linha.paciente}
                    onChange={(e) => alterarLinha(linha.ref, { paciente: e.target.value })}
                    aria-label="Paciente"
                  />
                  <button
                    type="button"
                    className={cn(classeDoChip(linha.novo), "h-8 justify-center")}
                    aria-pressed={linha.novo}
                    onClick={() => alterarLinha(linha.ref, { novo: !linha.novo })}
                  >
                    {linha.novo ? "Novo" : "Recorrente"}
                  </button>
                  <Campo
                    pequeno
                    value={linha.prescrito ? String(linha.prescrito).replace(".", ",") : ""}
                    onChange={(e) => alterarLinha(linha.ref, { prescrito: parseFinAmount(e.target.value) })}
                    className="text-right tabular-nums"
                    inputMode="decimal"
                    placeholder="prescrito"
                    aria-label="Valor prescrito"
                  />
                  <Campo
                    pequeno
                    value={linha.pago ? String(linha.pago).replace(".", ",") : ""}
                    onChange={(e) => alterarLinha(linha.ref, { pago: parseFinAmount(e.target.value) })}
                    className="text-right tabular-nums"
                    inputMode="decimal"
                    placeholder="pago"
                    aria-label="Valor pago"
                  />
                  <button
                    type="button"
                    className="inline-grid h-8 w-8 place-items-center rounded-controle text-tinta-2 hover:bg-erro-claro hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                    aria-label={`Tirar ${linha.paciente} da semana`}
                    onClick={() => setLinhas((atual) => atual.filter((item) => item.ref !== linha.ref))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </>
          ) : (
            <p className="py-6 text-center text-sm font-medium text-tinta-2">
              Nenhuma comanda nesta semana ainda. Dá para adicionar quem passou e não pagou.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Botao
            tamanho="pq"
            icone={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() =>
              setLinhas((atual) => [
                ...atual,
                { ref: `manual-${Date.now().toString(36)}`, paciente: "", novo: false, prescrito: 0, pago: 0, origem: "MANUAL" },
              ])
            }
          >
            Adicionar quem passou e não pagou
          </Botao>
          <Botao variante="fantasma" tamanho="pq" icone={<RotateCcw className="h-4 w-4" aria-hidden="true" />} onClick={() => void carregar(sexta)}>
            Recarregar das comandas
          </Botao>
        </div>
      </BlocoFolha>

      <Indicadores
        rotulo="Os números da semana"
        titulo={
          <>
            <strong>Os números da semana.</strong> Tudo derivado da tabela acima — nada aqui é digitado.
          </>
        }
        colunas={4}
        itens={[
          { rotulo: "Pacientes totais", valor: String(resumo.pacientesTotais) },
          { rotulo: "Pacientes novos", valor: String(resumo.pacientesNovos) },
          { rotulo: "Faturamento", valor: numero(resumo.faturamento) },
          { rotulo: "Ticket médio", valor: numero(resumo.ticketMedio) },
          { rotulo: "Orçamento prescrito", valor: numero(resumo.prescrito) },
          { rotulo: "Orçamento realizado", valor: numero(resumo.realizado) },
          { rotulo: "Conversão", valor: resumo.conversao === null ? "—" : `${(resumo.conversao * 100).toFixed(1).replace(".", ",")}%` },
          { rotulo: resumo.encerrada ? "Meta da próxima" : "Meta da próxima (por ora)", valor: numero(resumo.metaDaProxima) },
        ]}
      >
        {/* SEMANA ABERTA NÃO É SEMANA PERDIDA (21/09/2026). Na segunda-feira
            a tela dizia "faltaram R$ 90 mil" e já dobrava a meta seguinte,
            com quatro dias pela frente. Mesma regra de nunca comparar mês
            parcial com mês fechado. */}
        <p className="mt-6 border-t border-fio pt-4 text-sm font-medium leading-6 text-tinta">
          {resumo.faltou <= 0
            ? `Meta de ${numero(resumo.meta)} batida. A próxima volta para a base, sem acúmulo.`
            : resumo.encerrada
              ? `Faltaram ${numero(resumo.faltou)} para a meta de ${numero(resumo.meta)} — e é isso que somou na meta da próxima.`
              : `Faltam ${numero(resumo.faltou)} para a meta de ${numero(resumo.meta)}. A semana ainda está aberta: só o que sobrar na quinta é que vai acumular.`}
        </p>
      </Indicadores>

      <section aria-labelledby="checkin-texto" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="checkin-texto" className={TITULO_SECAO}>O texto para o WhatsApp</h2>
          <Botao
            icone={<Copy className="h-4 w-4" aria-hidden="true" />}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(textoDoCheckin(semana))
                .then(() => toast("Check-in copiado — é só colar no WhatsApp.", { tom: "ok" }))
                .catch(() => toast("Não consegui copiar.", { tom: "erro" }));
            }}
          >
            Copiar o check-in
          </Botao>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-bloco border border-fio bg-folha p-4 font-sans text-[13px] font-medium leading-6 text-tinta">
          {textoDoCheckin(semana)}
        </pre>
      </section>
    </div>
  );
}
