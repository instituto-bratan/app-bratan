import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CircleDollarSign, Gift, Megaphone, Share2, UserPlus } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan, isCoordenacao } from "@/lib/access";
import { cn } from "@/lib/utils";
import {
  REFERRAL_REWARD_VALUE,
  contactDisplayName,
  crmModuleRoutes,
  findOrCreateCrmContact,
  markReferralRewardPaid,
  moneyCrm,
  referralRewardStatusLabels,
  referralRewardTotals,
  referralRewards,
  salesChannelStats,
  setContactReferrer,
  type ReferralRewardStatus,
} from "./crmData";
import { CrmSyncBanner } from "./CrmSyncBanner";
import { useCrmState } from "./useCrmState";

const statusTones: Record<ReferralRewardStatus, string> = {
  AGUARDANDO: "border-slate-300 bg-slate-50 text-slate-700",
  A_PAGAR: "border-amber-300 bg-amber-50 text-amber-800",
  PAGO: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

export function CrmCanaisPage() {
  const { pessoa } = useAuth();
  const { state, persist, syncFailed, retrySync } = useCrmState();
  const canPay = isCoordenacao(pessoa?.cargo);
  const [feedback, setFeedback] = useState("");

  // Registro de indicação
  const [referrerQuery, setReferrerQuery] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [referredQuery, setReferredQuery] = useState("");
  const [referredId, setReferredId] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const stats = useMemo(() => salesChannelStats(state), [state]);
  const rewards = useMemo(() => referralRewards(state), [state]);
  const totals = useMemo(() => referralRewardTotals(rewards), [rewards]);
  const maxContacts = Math.max(1, ...stats.map((item) => item.contacts));

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
      setFeedback("Escolha QUEM indicou (busque o paciente na primeira caixa).");
      return;
    }
    if (!referredId && referredQuery.trim().length < 3) {
      setFeedback("Escolha quem FOI indicado, ou digite o nome completo da pessoa nova.");
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
            phone: newPhone.trim(),
            whatsapp: newPhone.trim(),
            contactType: "LEAD",
            lifecycleStage: "COLD_LEAD",
            sourceChannel: "Indicação",
          },
          pessoa?.id ?? "canais",
        );
        next = created.state;
        targetId = created.contact.id;
      }
      next = setContactReferrer(next, targetId, referrerId, pessoa?.id ?? "canais");
      const referrer = next.contacts.find((item) => item.id === referrerId);
      const referred = next.contacts.find((item) => item.id === targetId);
      setFeedback(
        `✅ Indicação registrada: ${contactDisplayName(referrer)} indicou ${contactDisplayName(referred)}. Quando fechar o plano, o prêmio de ${moneyCrm(REFERRAL_REWARD_VALUE)} aparece aqui como "A pagar".`,
      );
      return next;
    });
    setReferrerQuery("");
    setReferrerId("");
    setReferredQuery("");
    setReferredId("");
    setNewPhone("");
  }

  function handleMarkPaid(referredContactId: string, referredName: string) {
    if (!window.confirm(`Confirmar o pagamento de ${moneyCrm(REFERRAL_REWARD_VALUE)} pela indicação de ${referredName}?`)) return;
    persist((current) => markReferralRewardPaid(current, referredContactId, pessoa?.id ?? "coordenacao"));
    setFeedback(`Prêmio da indicação de ${referredName} marcado como pago.`);
  }

  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Canais de Venda">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <CrmSyncBanner failed={syncFailed} onRetry={retrySync} />
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="flex items-center gap-2">
            <Share2 className="h-6 w-6 text-brand-musgo" aria-hidden="true" />
            <h1 className="text-3xl text-brand-musgo">Canais de Venda</h1>
            <InfoTip title="Para que serve esta aba?">
              Mostra por onde cada paciente chega (indicação, Instagram, Google…) e quanto investimos em cada canal. Na
              indicação, quem indica ganha {moneyCrm(REFERRAL_REWARD_VALUE)} quando o indicado fecha o plano — registre aqui
              quem indicou quem e controle os prêmios a pagar.
            </InfoTip>
          </div>
          <p className="text-sm text-muted-foreground">
            De onde vêm nossos pacientes e quanto custa cada canal. Indicação: {moneyCrm(REFERRAL_REWARD_VALUE)} para quem
            indica, pagos quando o indicado fecha.
          </p>
        </motion.header>

        {feedback ? (
          <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/70 p-3 text-sm font-medium text-brand-tinta">{feedback}</div>
        ) : null}

        {/* Resumo do investimento em indicações */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <Gift className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-brand-musgo">Prêmios a pagar</p>
              <p className="text-2xl font-bold text-amber-700">{moneyCrm(totals.aPagar)}</p>
              <p className="text-xs text-muted-foreground">{totals.aPagar / REFERRAL_REWARD_VALUE} indicação(ões) fechou(aram) o plano</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <CircleDollarSign className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-brand-musgo">Já pago em indicações</p>
              <p className="text-2xl font-bold text-emerald-700">{moneyCrm(totals.pago)}</p>
              <p className="text-xs text-muted-foreground">investimento realizado no canal</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Megaphone className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-brand-musgo">Indicações aguardando</p>
              <p className="text-2xl font-bold text-brand-tinta">{totals.aguardando}</p>
              <p className="text-xs text-muted-foreground">indicados que ainda não fecharam</p>
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
              Quem indicou ganha {moneyCrm(REFERRAL_REWARD_VALUE)} quando o indicado fechar o plano de acompanhamento.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="grid gap-3 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Quem indicou (paciente da casa)</Label>
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
                <Label>WhatsApp (se for pessoa nova)</Label>
                <Input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="11999999999" />
                <LiquidButton type="submit" size="sm" className="mt-1 w-full">
                  Registrar indicação
                </LiquidButton>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Prêmios de indicação */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="h-5 w-5" aria-hidden="true" /> Indicações e prêmios ({rewards.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rewards.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma indicação registrada ainda — registre a primeira acima.</p>
            ) : (
              rewards.map((reward) => (
                <div
                  key={reward.referred.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-oliva/20 bg-white/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-musgo">
                      {reward.referrer ? contactDisplayName(reward.referrer) : "—"}
                      <span className="mx-1.5 text-muted-foreground">indicou</span>
                      <Link to={crmModuleRoutes.contact(reward.referred.id)} className="hover:underline">
                        {contactDisplayName(reward.referred)}
                      </Link>
                    </p>
                    {reward.soldTotal > 0 ? (
                      <p className="text-xs text-muted-foreground">Fechou {moneyCrm(reward.soldTotal)}</p>
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
                        Marcar pago
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Tabela por canal */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="h-5 w-5" aria-hidden="true" /> De onde vêm nossos pacientes
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Contatos, fechamentos, valor vendido e investimento por canal. Indicação = {moneyCrm(REFERRAL_REWARD_VALUE)} por
              indicado que fecha.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase text-brand-oliva">
                  <tr>
                    <th className="px-3 py-2">Canal</th>
                    <th className="px-3 py-2">Contatos</th>
                    <th className="px-3 py-2">Fecharam</th>
                    <th className="px-3 py-2 text-right">Valor vendido</th>
                    <th className="px-3 py-2 text-right">Investimento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-oliva/10">
                  {stats.map((item) => (
                    <tr key={item.channel}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {item.channel === "Indicação" ? <Badge variant="gold">★</Badge> : null}
                          <span className="font-semibold text-brand-tinta">{item.channel}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-brand-papel">
                          <div
                            className="h-full rounded-full bg-brand-oliva/60"
                            style={{ width: `${Math.max(4, Math.round((item.contacts / maxContacts) * 100))}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums">{item.contacts}</td>
                      <td className="px-3 py-2.5 tabular-nums">{item.won}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-brand-musgo">{moneyCrm(item.soldTotal)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{item.investment ? moneyCrm(item.investment) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
