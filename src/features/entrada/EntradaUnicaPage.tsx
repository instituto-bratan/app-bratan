// ENTRADA ÚNICA — "escrevo uma vez e vai para todos os lugares"
//
// Reunião de 14/08/2026. A CEO: "O que não dá é eu escrever no CRM, anexar nos
// comprovantes e depois escrever na ficha diária. Isso acaba com o meu dia e de
// qualquer um." E: "Uma pessoa preenche e distribui esses caminhos — o próprio
// app já vai distribuir isso pro melhor caminho."
//
// Esta tela é esse lugar único. Um formulário, um botão, e o app alimenta:
// cadastro no CRM · comanda do dia · fechamento diário · comprovante (com o
// arquivo indo para o SharePoint) · nota fiscal · e a régua certa do Kanban.
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ClipboardCopy, Loader2, Paperclip, Send, Sparkles } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { cargoToCrmRole } from "@/features/crm/crmData";
import { canComprovantes } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { registrarEntradaUnica, uploadRemoteComprovante } from "@/lib/remoteData";
import {
  createFinId,
  moneyFin,
  parseFinAmount,
  paymentMethodLabels,
  salePaymentMethods,
  type FinPaymentMethod,
  type FinSale,
} from "@/features/financeiro/financeiroData";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { useCrmState } from "@/features/crm/useCrmState";
import { findOrCreateCrmContact, scheduleConsultation } from "@/features/crm/crmData";
import {
  avisoRecepcao,
  cadenciaDaEntrada,
  destinosDaEntrada,
  entradaVazia,
  leituraDaResponsabilidade,
  planoOuAvulsaLabels,
  problemasDaEntrada,
  quandoNotaLabels,
  setorLabels,
  setorResponsavelPor,
  textoParaOGrupo,
  tipoAtendimentoLabels,
  type EntradaUnica,
  type PlanoOuAvulsa,
  type QuandoNota,
  type SetorLancamento,
  type TipoAtendimento,
} from "./entradaUnicaData";

/** Tradução entre o vocabulário da comanda e o do comprovante. */
function formaParaComprovante(forma: FinPaymentMethod) {
  if (forma === "PIX") return "pix" as const;
  if (forma === "CARTAO_CREDITO") return "cartao_credito" as const;
  if (forma === "CARTAO_DEBITO") return "cartao_debito" as const;
  if (forma === "DINHEIRO") return "dinheiro" as const;
  if (forma === "TRANSFERENCIA") return "transferencia" as const;
  return "outro" as const;
}

/** O setor de quem está logado (a reunião concentrou em vendas e agendamento). */
function setorDoCargo(cargo: string | null | undefined): SetorLancamento {
  const papel = cargoToCrmRole(cargo as never);
  if (papel === "CONCIERGE") return "AGENDAMENTO";
  if (papel === "RECEPCAO") return "RECEPCAO";
  return "VENDAS";
}

export function EntradaUnicaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const queryClient = useQueryClient();
  const financeiro = useFinanceiro(Number(todayISO().slice(0, 4)));
  const { state: crmState, persist: persistCrm } = useCrmState();
  const setorPadrao = setorDoCargo(pessoa?.cargo);

  const [entrada, setEntrada] = useState<EntradaUnica>(() => entradaVazia(setorPadrao));
  const [valorTexto, setValorTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [vendedorPresente, setVendedorPresente] = useState(true);
  const [resultado, setResultado] = useState<{ destinos: string[]; comanda: string } | null>(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const atual: EntradaUnica = useMemo(
    () => ({ ...entrada, valor: parseFinAmount(valorTexto), temComprovante: Boolean(arquivo) }),
    [entrada, valorTexto, arquivo],
  );
  const problemas = useMemo(() => problemasDaEntrada(atual), [atual]);
  const destinos = useMemo(() => destinosDaEntrada(atual), [atual]);
  const responsavel = setorResponsavelPor(atual.formaPagamento, vendedorPresente);
  const set = <K extends keyof EntradaUnica>(campo: K, valor: EntradaUnica[K]) =>
    setEntrada((current) => ({ ...current, [campo]: valor }));

  const lancar = useMutation({
    mutationFn: async () => {
      const actorId = pessoa?.id ?? "sistema";
      const nome = atual.pacienteNome.trim();

      // 1. CADASTRO NO CRM — cria ou liga, sem duplicar (id determinístico).
      let contactRef = atual.crmContactRef;
      if (!contactRef && nome) {
        const values = {
          fullName: nome,
          phone: atual.telefone.trim(),
          whatsapp: atual.telefone.trim(),
          email: atual.email.trim(),
          contactType: "PATIENT" as const,
          lifecycleStage: (atual.tipo === "RETORNO" ? "ACTIVE_PATIENT" : "QUALIFIED_LEAD") as never,
          sourceChannel: atual.origem.trim() || "Entrada Única",
          ownerUserId: actorId,
        };
        const preview = findOrCreateCrmContact(crmState, values, actorId);
        contactRef = preview.contact.id;
        persistCrm((current) => findOrCreateCrmContact(current, { ...values, id: preview.contact.id }, actorId).state);
      }

      // 2. COMANDA DO DIA (que alimenta o fechamento diário sozinha).
      const saleId = createFinId("fsale");
      let saleRef: string | null = null;
      if (atual.valor > 0) {
        const sale: FinSale = {
          id: saleId,
          saleDate: todayISO(),
          patientName: nome,
          crmContactRef: contactRef ?? "",
          notes: [atual.origem.trim(), atual.observacao.trim()].filter(Boolean).join(" · "),
          adhesion: atual.planoOuAvulsa === "PLANO" ? "SIM" : "ABERTO",
          createdAt: new Date().toISOString(),
          items: [
            {
              id: createFinId("fitem"),
              itemType: atual.tipo === "TRATAMENTO" ? "TRATAMENTO" : atual.tipo === "SINAL_CONSULTA" ? "SINAL" : "CONSULTA",
              amount: atual.valor,
              description: tipoAtendimentoLabels[atual.tipo],
            },
          ],
          payments: [
            {
              id: createFinId("fpay"),
              method: atual.formaPagamento,
              amount: atual.valor,
              installments: Math.max(1, atual.parcelas),
              cardMachine: atual.formaPagamento === "CARTAO_CREDITO" || atual.formaPagamento === "CARTAO_DEBITO" ? "ITAU" : null,
              // O comprovante nasce amarrado: com arquivo já é ANEXADO.
              comprovanteStatus: arquivo ? "ANEXADO" : atual.formaPagamento === "DINHEIRO" ? "NAO_SE_APLICA" : "AGUARDANDO",
            },
          ],
          tipoAtendimento: atual.tipo,
          planoOuAvulsa: atual.planoOuAvulsa,
          origemIndicacao: atual.origem.trim(),
          notaInstrucao: atual.notaInstrucao.trim(),
          notaQuando: atual.quandoNota,
          consultaAgendadaEm: atual.consultaEm || null,
          lancadoPorSetor: atual.setor,
          aguardandoExplicacao: atual.naoSeiDoQueSeTrata,
        };
        financeiro.addSale(sale);
        saleRef = saleId;
      }

      // 3. COMPROVANTE — sobe para o SharePoint já ligado à comanda.
      let comprovanteId: string | null = null;
      if (arquivo && useRemote && pessoa) {
        const enviado = await uploadRemoteComprovante({
          pessoa: pessoa as never,
          file: arquivo,
          pacienteReferencia: nome,
          crmContactRef: contactRef ?? undefined,
          valor: atual.valor,
          // O comprovante usa o enum do banco (minúsculo), a comanda usa o do
          // financeiro — traduz aqui em vez de espalhar dois vocabulários.
          formaPagamento: formaParaComprovante(atual.formaPagamento),
          observacao: [tipoAtendimentoLabels[atual.tipo], atual.notaInstrucao.trim()].filter(Boolean).join(" · "),
          saleRef: saleRef ?? undefined,
          alimentarRecebiveis360: false,
        });
        comprovanteId = enviado;
      }

      // 4. A RÉGUA CERTA. Consulta marcada → 3·1·3·1 pelo caminho único
      //    (scheduleConsultation), que já trata remarcação e não duplica.
      const { cadenciaId } = cadenciaDaEntrada(atual);
      if (cadenciaId === "cad-return-cycle" && contactRef && atual.consultaEm) {
        persistCrm((current) => scheduleConsultation(current, {
          contactId: contactRef!,
          eventDate: atual.consultaEm,
          actorId,
          source: "Entrada Única",
        }).state);
      }

      // 5. REGISTRO DA DISTRIBUIÇÃO (prova + idempotência).
      const nomesDosDestinos = destinos.map((item) => item.titulo);
      if (useRemote) {
        await registrarEntradaUnica({
          clientRef: `entrada-${saleId}`,
          saleRef,
          crmContactRef: contactRef ?? null,
          crmDealRef: null,
          comprovanteId,
          cadenciaId: cadenciaId ?? null,
          payload: { ...atual, arquivo: arquivo?.name ?? null },
          destinos: nomesDosDestinos,
          lancadoPor: pessoa?.id ?? null,
          setor: atual.setor,
        });
      }
      return { destinos: nomesDosDestinos, comanda: saleRef ?? "" };
    },
    onSuccess: (dados) => {
      setResultado(dados);
      setEntrada(entradaVazia(setorPadrao));
      setValorTexto("");
      setArquivo(null);
      void queryClient.invalidateQueries({ queryKey: ["fin-sales"] });
      void queryClient.invalidateQueries({ queryKey: ["comprovantes"] });
    },
    onError: (falha: Error) => setErro(falha.message),
  });

  const aviso = avisoRecepcao(atual.setor);

  return (
    <AccessGate allowed={(cargo) => canComprovantes(cargo) || Boolean(cargoToCrmRole(cargo as never))} label="Entrada Única" module="entrada-unica">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Escreva uma vez</Badge>
            <Badge variant="muted">{setorLabels[atual.setor]}</Badge>
          </div>
          <h1 className="mt-3 flex flex-wrap items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
            <Sparkles className="h-7 w-7" aria-hidden="true" />
            Recebi um pagamento
            <InfoTip title="Por que esta tela existe">
              Decisão da reunião de 14/08: quem RECEBE lança, uma vez só, e o app distribui. Antes o comprovante passava
              por três mãos até chegar na recepção, e o fechamento saía errado. Aqui um preenchimento alimenta o cadastro
              do paciente, a comanda do dia, o fechamento diário, os comprovantes, a nota fiscal e a régua certa do
              Kanban.
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {leituraDaResponsabilidade(atual.formaPagamento, vendedorPresente)}{" "}
            {responsavel !== atual.setor ? (
              <strong className="text-brand-tinta">Por essa regra, quem lança é {setorLabels[responsavel].toLowerCase()}.</strong>
            ) : null}
          </p>
          {aviso ? <p className="mt-2 rounded-md border border-amber-300 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">{aviso}</p> : null}
        </motion.section>

        {resultado ? (
          <Card className="border-emerald-300 bg-emerald-50/70">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg text-emerald-900">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Pronto — foi para {resultado.destinos.length} lugares
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 text-sm text-emerald-900">
              {resultado.destinos.map((destino) => (
                <span key={destino} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {destino}
                </span>
              ))}
              <Button type="button" variant="outline" className="mt-2 w-fit" onClick={() => setResultado(null)}>
                Lançar outro
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setErro("");
            if (problemas.length) return;
            lancar.mutate();
          }}
        >
          {/* PACIENTE */}
          <Card className="border-brand-oliva/20 bg-white/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1. Quem pagou</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 sm:col-span-3">
                <Label>Nome do paciente</Label>
                <Input value={entrada.pacienteNome} onChange={(event) => set("pacienteNome", event.target.value)} placeholder="Nome completo" />
              </label>
              <label className="grid gap-1">
                <Label>Telefone / WhatsApp</Label>
                <Input value={entrada.telefone} onChange={(event) => set("telefone", event.target.value)} placeholder="(11) 99999-9999" inputMode="tel" />
              </label>
              <label className="grid gap-1">
                <Label>E-mail</Label>
                <Input value={entrada.email} onChange={(event) => set("email", event.target.value)} placeholder="opcional" inputMode="email" />
              </label>
              <label className="grid gap-1">
                <Label>Origem</Label>
                <Input value={entrada.origem} onChange={(event) => set("origem", event.target.value)} placeholder="indicação do bispo · fidelizada · Instagram" />
              </label>
            </CardContent>
          </Card>

          {/* DO QUE SE TRATA */}
          <Card className="border-brand-oliva/20 bg-white/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                2. Do que se trata
                <InfoTip title="Por que isso importa">
                  É o que decide a régua. A CEO foi enfática: errar entre plano de acompanhamento e consulta avulsa erra
                  o Kanban do paciente.
                </InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(tipoAtendimentoLabels) as TipoAtendimento[]).map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => set("tipo", tipo)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      entrada.tipo === tipo ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-oliva/30 bg-white/70 text-brand-tinta hover:border-brand-musgo/50",
                    )}
                  >
                    {tipoAtendimentoLabels[tipo]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(planoOuAvulsaLabels) as PlanoOuAvulsa[]).map((opcao) => (
                  <button
                    key={opcao}
                    type="button"
                    onClick={() => set("planoOuAvulsa", opcao)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      entrada.planoOuAvulsa === opcao ? "border-brand-dourado bg-brand-creme text-brand-tinta" : "border-brand-oliva/30 bg-white/70 text-brand-tinta hover:border-brand-dourado",
                    )}
                  >
                    {planoOuAvulsaLabels[opcao]}
                  </button>
                ))}
              </div>
              <label className="grid gap-1 sm:max-w-xs">
                <Label>Consulta agendada para</Label>
                <Input type="date" value={entrada.consultaEm} onChange={(event) => set("consultaEm", event.target.value)} />
                <span className="text-[11px] text-muted-foreground">É esta data que dispara o 3·1·3·1.</span>
              </label>
            </CardContent>
          </Card>

          {/* PAGAMENTO */}
          <Card className="border-brand-oliva/20 bg-white/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3. Quanto e como</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1">
                <Label>Valor recebido</Label>
                <Input value={valorTexto} onChange={(event) => setValorTexto(event.target.value)} placeholder="0,00" inputMode="decimal" />
              </label>
              <label className="grid gap-1">
                <Label>Forma</Label>
                <select
                  value={entrada.formaPagamento}
                  onChange={(event) => set("formaPagamento", event.target.value as FinPaymentMethod)}
                  className="h-10 rounded-md border border-input bg-white/72 px-3 text-sm"
                >
                  {salePaymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabels[method]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <Label>Parcelas</Label>
                <Input
                  value={String(entrada.parcelas)}
                  onChange={(event) => set("parcelas", Math.max(1, Number(event.target.value) || 1))}
                  inputMode="numeric"
                  disabled={entrada.formaPagamento !== "CARTAO_CREDITO"}
                />
              </label>
              {entrada.formaPagamento === "CARTAO_CREDITO" || entrada.formaPagamento === "CARTAO_DEBITO" ? (
                <label className="flex items-center gap-2 sm:col-span-3">
                  <input type="checkbox" checked={vendedorPresente} onChange={(event) => setVendedorPresente(event.target.checked)} />
                  <span className="text-sm text-brand-tinta">O vendedor estava presente na venda</span>
                </label>
              ) : null}
            </CardContent>
          </Card>

          {/* COMPROVANTE E NOTA */}
          <Card className="border-brand-oliva/20 bg-white/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">4. Comprovante e nota fiscal</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={inputArquivo}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(event) => setArquivo(event.target.files?.[0] ?? null)}
                />
                <Button type="button" variant="outline" className="gap-2" onClick={() => inputArquivo.current?.click()}>
                  <Paperclip className="h-4 w-4" aria-hidden="true" /> {arquivo ? "Trocar arquivo" : "Anexar comprovante"}
                </Button>
                {arquivo ? (
                  <span className="text-sm font-semibold text-brand-musgo">{arquivo.name}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">Sem arquivo, fica marcado como aguardando — ninguém precisa lembrar de cobrar.</span>
                )}
              </div>
              <label className="grid gap-1">
                <Label>Do que se trata a nota e como emitir</Label>
                <Input
                  value={entrada.notaInstrucao}
                  onChange={(event) => set("notaInstrucao", event.target.value)}
                  placeholder="Ex.: sinal de consulta da Andrea Ribeiro, paciente fidelizada — emitir junto com a consulta"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(quandoNotaLabels) as QuandoNota[]).map((quando) => (
                  <button
                    key={quando}
                    type="button"
                    onClick={() => set("quandoNota", quando)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      entrada.quandoNota === quando ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-oliva/30 bg-white/70 text-brand-tinta hover:border-brand-musgo/50",
                    )}
                  >
                    {quandoNotaLabels[quando]}
                  </button>
                ))}
              </div>
              <label className="mt-1 flex items-start gap-2 rounded-md border border-brand-dourado/40 bg-brand-creme/30 px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={entrada.naoSeiDoQueSeTrata}
                  onChange={(event) => set("naoSeiDoQueSeTrata", event.target.checked)}
                />
                <span className="text-sm text-brand-tinta">
                  <strong>Não sei do que se trata</strong> — recebi o comprovante mas quem vendeu foi outra pessoa. Registro
                  agora para o paciente não ser esquecido e cobro a explicação no grupo de fechamento.
                </span>
              </label>
              {entrada.naoSeiDoQueSeTrata ? (
                <div className="rounded-md border border-brand-oliva/20 bg-white/80 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-oliva">Texto para o grupo de fechamento</p>
                  <pre className="mt-1 whitespace-pre-wrap text-xs text-brand-tinta">{textoParaOGrupo(atual)}</pre>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 gap-1.5"
                    onClick={() => {
                      void navigator.clipboard?.writeText(textoParaOGrupo(atual));
                      setCopiado(true);
                      window.setTimeout(() => setCopiado(false), 2000);
                    }}
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" /> {copiado ? "Copiado!" : "Copiar"}
                  </Button>
                </div>
              ) : null}
              <label className="grid gap-1">
                <Label>Observação (opcional)</Label>
                <Input value={entrada.observacao} onChange={(event) => set("observacao", event.target.value)} placeholder="Qualquer detalhe que ajude quem for conferir" />
              </label>
            </CardContent>
          </Card>

          {/* PARA ONDE VAI */}
          <Card className="border-brand-musgo/30 bg-brand-creme/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Para onde isso vai ({destinos.length})</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 text-sm">
              {destinos.map((destino) => (
                <span key={destino.chave} className="flex flex-wrap items-baseline gap-1.5">
                  <strong className="text-brand-musgo">{destino.titulo}</strong>
                  <span className="text-muted-foreground">— {destino.detalhe}</span>
                </span>
              ))}
              {cadenciaDaEntrada(atual).cadenciaId === null ? (
                <span className="text-xs text-muted-foreground">{cadenciaDaEntrada(atual).motivo}</span>
              ) : null}
            </CardContent>
          </Card>

          {problemas.length ? (
            <div className="rounded-md border border-amber-300 bg-amber-50/80 p-3 text-sm text-amber-900">
              <p className="font-semibold">Falta preencher:</p>
              <ul className="mt-1 list-inside list-disc">
                {problemas.map((problema) => (
                  <li key={problema}>{problema}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {erro ? <p className="text-sm font-semibold text-red-700">{erro}</p> : null}

          <Button type="submit" size="lg" className="gap-2" disabled={problemas.length > 0 || lancar.isPending}>
            {lancar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Lançar e distribuir {atual.valor > 0 ? `· ${moneyFin(atual.valor)}` : ""}
          </Button>
        </form>
      </div>
    </AccessGate>
  );
}
