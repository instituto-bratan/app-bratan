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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
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

  return (
    <div className="grid gap-4">
      <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
            Check-in semanal
            <InfoTip title="Por que sexta a quinta">A contagem fecha na quinta à noite e a semana nova abre na sexta — é a régua que o Lucas usa, e não a semana do calendário.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSexta(semanaAnterior(sexta))}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-44 text-center text-sm font-semibold text-brand-tinta">{rotuloDaSemana(sexta)}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setSexta(proximaSexta(sexta))}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSexta(sextaDaSemana(todayISO()))}>
            Semana de hoje
          </Button>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <Label className="text-xs">Meta combinada da semana</Label>
              <Input value={metaBaseTexto} onChange={(e) => setMetaBaseTexto(e.target.value)} className="h-9 w-36" inputMode="decimal" />
            </div>
            <Button type="button" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {saldoHerdado > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900">
          A semana passada fechou {numero(saldoHerdado)} abaixo da meta, e isso veio junto: a régua desta semana é{" "}
          {numero(resumo.meta)}.
        </div>
      ) : null}

      <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quem passou nesta semana</CardTitle>
          <p className="text-xs text-muted-foreground">
            O app já trouxe quem tem comanda e quanto pagou. Falta o <strong>prescrito</strong> — o que foi proposto no
            consultório, que não existe em nenhuma tela.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2">
          {carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando a semana…</p>
          ) : linhas.length ? (
            <>
              <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_92px_130px_130px_36px]">
                <span>Paciente</span>
                <span>Novo?</span>
                <span>Prescrito</span>
                <span>Pago</span>
                <span />
              </div>
              {linhas.map((linha) => (
                <div key={linha.ref} className="grid items-center gap-2 rounded-lg border border-brand-oliva/15 bg-white/70 p-2 sm:grid-cols-[1fr_92px_130px_130px_36px]">
                  <Input
                    value={linha.paciente}
                    onChange={(e) => alterarLinha(linha.ref, { paciente: e.target.value })}
                    className="h-9"
                    aria-label="Paciente"
                  />
                  <Button
                    type="button"
                    variant={linha.novo ? "default" : "outline"}
                    size="sm"
                    className="h-9"
                    aria-pressed={linha.novo}
                    onClick={() => alterarLinha(linha.ref, { novo: !linha.novo })}
                  >
                    {linha.novo ? "Novo" : "Recorrente"}
                  </Button>
                  <Input
                    value={linha.prescrito ? String(linha.prescrito).replace(".", ",") : ""}
                    onChange={(e) => alterarLinha(linha.ref, { prescrito: parseFinAmount(e.target.value) })}
                    className="h-9"
                    inputMode="decimal"
                    placeholder="prescrito"
                    aria-label="Valor prescrito"
                  />
                  <Input
                    value={linha.pago ? String(linha.pago).replace(".", ",") : ""}
                    onChange={(e) => alterarLinha(linha.ref, { pago: parseFinAmount(e.target.value) })}
                    className="h-9"
                    inputMode="decimal"
                    placeholder="pago"
                    aria-label="Valor pago"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 text-brand-grave"
                    aria-label={`Tirar ${linha.paciente} da semana`}
                    onClick={() => setLinhas((atual) => atual.filter((item) => item.ref !== linha.ref))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma comanda nesta semana ainda. Dá para adicionar quem passou e não pagou.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLinhas((atual) => [
                  ...atual,
                  { ref: `manual-${Date.now().toString(36)}`, paciente: "", novo: false, prescrito: 0, pago: 0, origem: "MANUAL" },
                ])
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Adicionar quem passou e não pagou
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void carregar(sexta)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Recarregar das comandas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Os números da semana</CardTitle>
          <p className="text-xs text-muted-foreground">Tudo derivado da tabela acima — nada aqui é digitado.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Pacientes totais", String(resumo.pacientesTotais)],
              ["Pacientes novos", String(resumo.pacientesNovos)],
              ["Faturamento", numero(resumo.faturamento)],
              ["Ticket médio", numero(resumo.ticketMedio)],
              ["Orçamento prescrito", numero(resumo.prescrito)],
              ["Orçamento realizado", numero(resumo.realizado)],
              ["Conversão", resumo.conversao === null ? "—" : `${(resumo.conversao * 100).toFixed(1).replace(".", ",")}%`],
              [resumo.encerrada ? "Meta da próxima" : "Meta da próxima (por ora)", numero(resumo.metaDaProxima)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg border border-brand-oliva/15 bg-brand-creme/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{rotulo}</p>
                <p className="mt-1 text-lg font-semibold text-brand-tinta">{valor}</p>
              </div>
            ))}
          </div>
          {/* SEMANA ABERTA NÃO É SEMANA PERDIDA (21/09/2026). Na segunda-feira
              a tela dizia "faltaram R$ 90 mil" e já dobrava a meta seguinte,
              com quatro dias pela frente. Mesma regra de nunca comparar mês
              parcial com mês fechado. */}
          <p className="text-sm text-muted-foreground">
            {resumo.faltou <= 0
              ? `Meta de ${numero(resumo.meta)} batida. A próxima volta para a base, sem acúmulo.`
              : resumo.encerrada
                ? `Faltaram ${numero(resumo.faltou)} para a meta de ${numero(resumo.meta)} — e é isso que somou na meta da próxima.`
                : `Faltam ${numero(resumo.faltou)} para a meta de ${numero(resumo.meta)}. A semana ainda está aberta: só o que sobrar na quinta é que vai acumular.`}
          </p>
          <div>
            <Button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(textoDoCheckin(semana))
                  .then(() => toast("Check-in copiado — é só colar no WhatsApp.", { tom: "ok" }))
                  .catch(() => toast("Não consegui copiar.", { tom: "erro" }));
              }}
            >
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" /> Copiar o check-in
            </Button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-brand-oliva/15 bg-brand-creme/30 p-3 font-sans text-xs leading-relaxed text-brand-tinta">
            {textoDoCheckin(semana)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
