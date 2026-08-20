// INDICAÇÕES (19/08/2026, pedido do Lucas): "os canais de venda, que agora vai
// virar indicações... vão ser as pessoas que vão indicar pra gente, e essas
// pessoas vão ter vouchers... quinhentos reais por paciente que passar com o
// doutor". A tabela de canais (site, cadências...) foi zerada — esta tela é
// sobre PESSOAS: quem indica, quem foi indicado, e o voucher de cada um.
//
// O elo automático: o indicado registrado aqui JÁ nasce no CRM (mesmo cadastro,
// sem duplicar — telefone é a chave). Quando a consulta dele vira comanda no
// financeiro, o voucher libera sozinho — ninguém precisa avisar esta tela.
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, CircleDollarSign, Gift, UserPlus, Users } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan, isCoordenacao } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import {
  applyContactChannels,
  REFERRAL_REWARD_VALUE,
  contactDisplayName,
  crmModuleRoutes,
  findOrCreateCrmContact,
  indicadoresResumo,
  markReferralRewardPaid,
  moneyCrm,
  referralRewardStatusLabels,
  referralRewards,
  setContactReferrer,
  type ReferralRewardStatus,
} from "./crmData";
import { CrmSyncBanner } from "./CrmSyncBanner";
import { useCrmState } from "./useCrmState";
import { ContactChannelsFields } from "./ContactChannelsFields";
import {
  contactChannelsIssue,
  contactChannelsValues,
  emptyContactChannels,
  type ContactChannelsDraft,
} from "./contactChannels";

const statusTones: Record<ReferralRewardStatus, string> = {
  AGUARDANDO: "border-slate-300 bg-slate-50 text-slate-700",
  A_PAGAR: "border-amber-300 bg-amber-50 text-amber-800",
  PAGO: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

export function CrmCanaisPage() {
  const { pessoa } = useAuth();
  const { state, persist, syncFailed, syncErrorDetail, retrySync } = useCrmState();
  const financeiro = useFinanceiro(Number(todayISO().slice(0, 4)));
  const canPay = isCoordenacao(pessoa?.cargo);
  const [feedback, setFeedback] = useState("");
  const [indicadorAberto, setIndicadorAberto] = useState("");

  // Registro de indicação
  const [referrerQuery, setReferrerQuery] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [referredQuery, setReferredQuery] = useState("");
  const [referredId, setReferredId] = useState("");
  const [novoContato, setNovoContato] = useState<ContactChannelsDraft>(emptyContactChannels);

  // "Passou com o doutor" = a consulta virou comanda no financeiro. É a prova
  // em dinheiro — nem agenda, nem promessa. Item CONSULTA ou primeira consulta.
  const passouComDoutor = useMemo(() => {
    const passou = new Set<string>();
    for (const sale of financeiro.sales) {
      if (!sale.crmContactRef) continue;
      const temConsulta =
        sale.items.some((item) => item.itemType === "CONSULTA") || sale.tipoAtendimento === "PRIMEIRA_CONSULTA";
      if (temConsulta) passou.add(sale.crmContactRef);
    }
    return passou;
  }, [financeiro.sales]);

  const rewards = useMemo(() => referralRewards(state, passouComDoutor), [state, passouComDoutor]);
  const porIndicador = useMemo(() => indicadoresResumo(rewards), [rewards]);
  const totais = useMemo(
    () => ({
      indicadores: porIndicador.length,
      indicados: rewards.length,
      aReceber: rewards.filter((r) => r.status === "A_PAGAR").length * REFERRAL_REWARD_VALUE,
      pago: rewards.filter((r) => r.status === "PAGO").length * REFERRAL_REWARD_VALUE,
      aguardando: rewards.filter((r) => r.status === "AGUARDANDO").length,
    }),
    [rewards, porIndicador],
  );

  const activeContacts = useMemo(() => state.contacts.filter((contact) => !contact.archivedAt), [state.contacts]);
  function suggestions(query: string) {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    return activeContacts.filter((contact) => contactDisplayName(contact).toLowerCase().includes(term)).slice(0, 6);
  }
  const referrerSuggestions = useMemo(() => suggestions(referrerQuery), [referrerQuery, activeContacts]);
  const referredSuggestions = useMemo(() => suggestions(referredQuery), [referredQuery, activeContacts]);

  function handleRegister(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!referrerId) {
      setFeedback("Escolha QUEM indicou (busque a pessoa na primeira caixa).");
      return;
    }
    if (!referredId && referredQuery.trim().length < 3) {
      setFeedback("Escolha quem FOI indicado, ou digite o nome completo da pessoa nova.");
      return;
    }
    const problemaCanais = contactChannelsIssue(novoContato);
    if (problemaCanais) {
      setFeedback(problemaCanais);
      return;
    }
    persist((current) => {
      let next = current;
      let targetId = referredId;
      if (!targetId) {
        const created = findOrCreateCrmContact(
          next,
          {
            fullName: referredQuery.trim(),
            ...contactChannelsValues(novoContato),
            contactType: "LEAD",
            lifecycleStage: "COLD_LEAD",
            sourceChannel: "Indicação",
          },
          pessoa?.id ?? "indicacoes",
        );
        next = created.state;
        targetId = created.contact.id;
      }
      next = applyContactChannels(next, targetId, contactChannelsValues(novoContato), pessoa?.id ?? "indicacoes");
      next = setContactReferrer(next, targetId, referrerId, pessoa?.id ?? "indicacoes");
      const referrer = next.contacts.find((item) => item.id === referrerId);
      const referred = next.contacts.find((item) => item.id === targetId);
      setFeedback(
        `✅ ${contactDisplayName(referrer)} indicou ${contactDisplayName(referred)}. O indicado já está no CRM; quando a consulta dele virar comanda, o voucher de ${moneyCrm(REFERRAL_REWARD_VALUE)} libera sozinho aqui.`,
      );
      return next;
    });
    setReferrerQuery("");
    setReferrerId("");
    setReferredQuery("");
    setReferredId("");
    setNovoContato(emptyContactChannels);
  }

  function handleMarkPaid(referredContactId: string, referredName: string) {
    if (!window.confirm(`Confirmar a entrega do voucher de ${moneyCrm(REFERRAL_REWARD_VALUE)} pela indicação de ${referredName}?`)) return;
    persist((current) => markReferralRewardPaid(current, referredContactId, pessoa?.id ?? "coordenacao"));
    setFeedback(`Voucher da indicação de ${referredName} marcado como pago.`);
  }

  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Indicações" module="crm">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={retrySync} />
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="flex items-center gap-2">
            <Gift className="h-6 w-6 text-brand-musgo" aria-hidden="true" />
            <h1 className="text-3xl text-brand-musgo">Indicações</h1>
            <InfoTip title="Como funciona o voucher">
              Cada pessoa que indica tem os seus indicados listados aqui. Quando o indicado PASSA COM O DOUTOR (a
              consulta vira comanda no financeiro), o voucher de {moneyCrm(REFERRAL_REWARD_VALUE)} libera sozinho — a
              coordenação só marca quando entregar. Indicado registrado aqui já nasce no CRM, sem cadastro duplicado.
            </InfoTip>
          </div>
          <p className="text-sm text-muted-foreground">
            Quem indica, quem foi indicado e o voucher de {moneyCrm(REFERRAL_REWARD_VALUE)} por paciente que passar com o
            doutor.
          </p>
        </motion.header>

        {feedback ? (
          <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/70 p-3 text-sm font-medium text-brand-tinta">{feedback}</div>
        ) : null}

        {/* Placar */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <Users className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-brand-musgo">Pessoas que indicam</p>
              <p className="text-2xl font-bold text-brand-tinta">{totais.indicadores}</p>
              <p className="text-xs text-muted-foreground">{totais.indicados} indicado(s) no total</p>
            </CardContent>
          </Card>
          <Card className={cn(totais.aReceber > 0 && "border-amber-300 bg-amber-50/50")}>
            <CardContent className="p-4">
              <Gift className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-brand-musgo">Vouchers liberados</p>
              <p className="text-2xl font-bold text-amber-700">{moneyCrm(totais.aReceber)}</p>
              <p className="text-xs text-muted-foreground">indicados que já passaram com o Dr.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <CircleDollarSign className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-brand-musgo">Vouchers pagos</p>
              <p className="text-2xl font-bold text-emerald-700">{moneyCrm(totais.pago)}</p>
              <p className="text-xs text-muted-foreground">investimento no canal indicação</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <UserPlus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-brand-musgo">Aguardando consulta</p>
              <p className="text-2xl font-bold text-brand-tinta">{totais.aguardando}</p>
              <p className="text-xs text-muted-foreground">indicados que ainda não passaram</p>
            </CardContent>
          </Card>
        </div>

        {/* Registrar indicação */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" aria-hidden="true" /> Registrar indicação
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Paciente X indicou Y: busque o X, digite (ou busque) o Y — o Y já entra no CRM ligado ao X.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="grid gap-3 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Quem indicou</Label>
                <Input
                  value={referrerQuery}
                  onChange={(event) => {
                    setReferrerQuery(event.target.value);
                    setReferrerId("");
                  }}
                  placeholder="Busque pelo nome (2+ letras)"
                />
                {referrerSuggestions.length && !referrerId ? (
                  <div className="rounded-lg border border-brand-oliva/20 bg-white/80">
                    {referrerSuggestions.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => {
                          setReferrerId(contact.id);
                          setReferrerQuery(contactDisplayName(contact));
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-brand-creme/50"
                      >
                        {contactDisplayName(contact)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {referrerId ? <p className="text-xs font-semibold text-emerald-700">✓ selecionado</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label>Quem foi indicado (novo ou existente)</Label>
                <Input
                  value={referredQuery}
                  onChange={(event) => {
                    setReferredQuery(event.target.value);
                    setReferredId("");
                  }}
                  placeholder="Busque, ou digite o nome completo da pessoa nova"
                />
                {referredSuggestions.length && !referredId ? (
                  <div className="rounded-lg border border-brand-oliva/20 bg-white/80">
                    {referredSuggestions.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => {
                          setReferredId(contact.id);
                          setReferredQuery(contactDisplayName(contact));
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-brand-creme/50"
                      >
                        {contactDisplayName(contact)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {referredId ? <p className="text-xs font-semibold text-emerald-700">✓ selecionado</p> : null}
              </div>
              <div className="space-y-1.5">
                <ContactChannelsFields
                  value={novoContato}
                  onChange={setNovoContato}
                  idPrefix="indicacao"
                  bare
                  note="Contato de quem foi indicado (se for pessoa nova, ou se o cadastro estiver sem número)."
                />
                <LiquidButton type="submit" size="sm" className="mt-1 w-full">
                  Registrar indicação
                </LiquidButton>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Por pessoa: X indicou Y e Z */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" aria-hidden="true" /> Por pessoa ({porIndicador.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">Clique na pessoa para abrir os indicados dela.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {porIndicador.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma indicação ainda — registre a primeira acima.</p>
            ) : (
              porIndicador.map((grupo) => {
                const chave = grupo.indicador?.id ?? "?";
                const aberto = indicadorAberto === chave;
                return (
                  <div key={chave} className="rounded-xl border border-brand-oliva/20 bg-white/70">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left"
                      onClick={() => setIndicadorAberto((atual) => (atual === chave ? "" : chave))}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-musgo">
                        {aberto ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                        {grupo.indicador ? contactDisplayName(grupo.indicador) : "(indicador removido)"}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {grupo.indicacoes.length} indicado(s) · {grupo.passaram} passaram
                        </span>
                        {grupo.aReceber > 0 ? (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-bold text-amber-800">
                            {moneyCrm(grupo.aReceber)} a entregar
                          </span>
                        ) : null}
                        {grupo.vouchersPagos > 0 ? (
                          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                            {grupo.vouchersPagos} voucher(s) pago(s)
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {aberto ? (
                      <div className="space-y-1.5 border-t border-brand-oliva/10 px-3 py-2.5">
                        {grupo.indicacoes.map((reward) => (
                          <div key={reward.referred.id} className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 text-sm">
                              <Link to={crmModuleRoutes.contact(reward.referred.id)} className="font-semibold text-brand-tinta hover:underline">
                                {contactDisplayName(reward.referred)}
                              </Link>
                              {reward.soldTotal > 0 ? (
                                <span className="ml-2 text-xs text-muted-foreground">fechou {moneyCrm(reward.soldTotal)}</span>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", statusTones[reward.status])}>
                                {referralRewardStatusLabels[reward.status]}
                              </span>
                              {reward.status === "A_PAGAR" && canPay ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMarkPaid(reward.referred.id, contactDisplayName(reward.referred))}
                                >
                                  Voucher entregue
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
