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
import { Check, ChevronDown, ChevronRight, UserPlus } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { AvisoSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { InfoTip } from "@/components/ui/info-tip";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, FraseDoFluxo } from "@/components/ui/fundacao";
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
import { confirmar } from "@/components/ui/avisos";
import { Aviso, Etiqueta, Indicadores, Input, Label, NOME_LINK, TITULO_SECAO, type TomEtiqueta } from "./comercialVisual";
import { contagem, maiuscula } from "./comercialFrases";

// A palavra vai junto da cor: aguardando (neutro) · a pagar (atenção) · pago (ok).
const statusTones: Record<ReferralRewardStatus, TomEtiqueta> = {
  AGUARDANDO: "neutro",
  A_PAGAR: "atencao",
  PAGO: "ok",
};

export function CrmCanaisPage() {
  const { pessoa } = useAuth();
  // "Só vê" (29/09/2026, auditoria B9): sem EDITAR no CRM, não registra indicação nem marca voucher.
  const { state, persist, syncFailed, syncErrorDetail, retrySync } = useCrmState({ modulo: "crm" });
  const telaCrm = useNivelDaTela("crm");
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

  const [formError, setFormError] = useState("");

  function handleRegister(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    setFormError("");
    if (!referrerId && referrerQuery.trim().length < 3) {
      setFormError("Diga QUEM indicou: busque a pessoa, ou digite o nome completo se ela ainda não tem cadastro.");
      return;
    }
    if (!referredId && referredQuery.trim().length < 3) {
      setFormError("Escolha quem FOI indicado, ou digite o nome completo da pessoa nova.");
      return;
    }
    const problemaCanais = contactChannelsIssue(novoContato);
    if (problemaCanais) {
      setFormError(problemaCanais);
      return;
    }
    persist((current) => {
      let next = current;
      // Quem indica também pode ser gente nova (não precisa ser paciente):
      // digitou o nome completo e não selecionou, o cadastro nasce aqui.
      let referrerFinalId = referrerId;
      if (!referrerFinalId) {
        const criadoIndicador = findOrCreateCrmContact(
          next,
          {
            fullName: referrerQuery.trim(),
            contactType: "LEAD",
            lifecycleStage: "COLD_LEAD",
            sourceChannel: "Indicação (indicador)",
          },
          pessoa?.id ?? "indicacoes",
        );
        next = criadoIndicador.state;
        referrerFinalId = criadoIndicador.contact.id;
      }
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
      next = setContactReferrer(next, targetId, referrerFinalId, pessoa?.id ?? "indicacoes");
      const referrer = next.contacts.find((item) => item.id === referrerFinalId);
      const referred = next.contacts.find((item) => item.id === targetId);
      setFeedback(
        `${contactDisplayName(referrer)} indicou ${contactDisplayName(referred)}. O indicado já está no CRM; quando a consulta dele virar comanda, o voucher de ${moneyCrm(REFERRAL_REWARD_VALUE)} libera sozinho aqui.`,
      );
      return next;
    });
    setReferrerQuery("");
    setReferrerId("");
    setReferredQuery("");
    setReferredId("");
    setNovoContato(emptyContactChannels);
    setFormError("");
  }

  async function handleMarkPaid(referredContactId: string, referredName: string) {
    if (!(await confirmar(`Confirmar a entrega do voucher de ${moneyCrm(REFERRAL_REWARD_VALUE)}?`, { corpo: `Pela indicação de ${referredName}. Fica registrado quem confirmou.`, confirmar: "Entregue" }))) return;
    persist((current) => markReferralRewardPaid(current, referredContactId, pessoa?.id ?? "coordenacao"));
    setFeedback(`Voucher da indicação de ${referredName} marcado como pago.`);
  }

  // CABEÇALHO (08/10/2026, redesenho etapa 3): um cabeçalho só, com o número em
  // frase ("Três pessoas indicam…"); o placar vira a faixa "para saber"; o
  // registro e a lista por pessoa moram em folhas (é onde se decide e se age).
  const fraseDoTopo =
    totais.indicadores === 0 ? (
      <>
        <strong>Nenhuma indicação ainda.</strong> Registre a primeira abaixo.
      </>
    ) : (
      <>
        <strong>{maiuscula(contagem(totais.indicadores, "pessoa", "pessoas", "f"))}</strong>{" "}
        {totais.indicadores === 1 ? "indica" : "indicam"}, com {contagem(totais.indicados, "indicado")} no total.
        {totais.aReceber > 0 ? <span className="alerta"> {moneyCrm(totais.aReceber)} em vouchers para entregar.</span> : null}
      </>
    );

  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Indicações" module="crm">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 font-sans max-md:gap-4">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Comercial"
          titulo="Indicações"
          frase={fraseDoTopo}
          rodape={
            <FraseDoFluxo>
              Quem indica, quem foi indicado e o voucher de {moneyCrm(REFERRAL_REWARD_VALUE)} por paciente que passar com o
              doutor.{" "}
              <InfoTip title="Como funciona o voucher">
                Cada pessoa que indica tem os seus indicados listados aqui. Quando o indicado PASSA COM O DOUTOR (a
                consulta vira comanda no financeiro), o voucher de {moneyCrm(REFERRAL_REWARD_VALUE)} libera sozinho — a
                coordenação só marca quando entregar. Indicado registrado aqui já nasce no CRM, sem cadastro duplicado.
              </InfoTip>
            </FraseDoFluxo>
          }
        />
        <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={retrySync} />
        <AvisoSoVe soVe={telaCrm.soVe} />

        {feedback ? (
          <Aviso tom="ok" icone={<Check aria-hidden="true" />}>
            {feedback}
          </Aviso>
        ) : null}

        {/* Placar */}
        <Indicadores
          rotulo="Placar das indicações"
          itens={[
            { rotulo: "Pessoas que indicam", valor: totais.indicadores, frase: `${contagem(totais.indicados, "indicado")} no total` },
            {
              rotulo: "Vouchers liberados",
              valor: moneyCrm(totais.aReceber),
              frase: "indicados que já passaram com o Dr.",
              tom: totais.aReceber > 0 ? "atencao" : undefined,
            },
            { rotulo: "Vouchers pagos", valor: moneyCrm(totais.pago), frase: "investimento no canal indicação" },
            { rotulo: "Aguardando consulta", valor: totais.aguardando, frase: "indicados que ainda não passaram" },
          ]}
        />

        {/* Registrar indicação */}
        <BlocoFolha as="section" respiro aria-labelledby="registrar-indicacao">
          <h2 id="registrar-indicacao" className={cn(TITULO_SECAO, "flex items-center gap-2")}>
            <UserPlus className="h-4 w-4 text-oliva" aria-hidden="true" /> Registrar indicação
          </h2>
          <p className="mt-1 text-sm font-medium leading-5 text-tinta-2">
            X indicou Y: busque ou DIGITE o nome completo dos dois — quem não tiver cadastro nasce aqui na hora, já ligado.
          </p>
          <form onSubmit={handleRegister} className="mt-5 grid gap-x-6 gap-y-4 lg:grid-cols-3">
              <div className="min-w-0">
                <Label htmlFor="indicacao-quem-indicou">Quem indicou</Label>
                <Input
                  id="indicacao-quem-indicou"
                  value={referrerQuery}
                  onChange={(event) => {
                    setReferrerQuery(event.target.value);
                    setReferrerId("");
                  }}
                  placeholder="Busque pelo nome (2+ letras)"
                />
                {referrerSuggestions.length && !referrerId ? (
                  <div className="mt-1 overflow-hidden rounded-bloco border border-fio bg-folha shadow-flutua">
                    {referrerSuggestions.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => {
                          setReferrerId(contact.id);
                          setReferrerQuery(contactDisplayName(contact));
                        }}
                        className="block w-full px-3 py-2 text-left text-sm font-medium text-tinta hover:bg-saber focus-visible:bg-saber focus-visible:outline-none [&+&]:border-t [&+&]:border-fio"
                      >
                        {contactDisplayName(contact)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {referrerId ? <p className="mt-1 text-xs font-bold text-ok">✓ selecionado</p> : null}
              </div>
              <div className="min-w-0">
                <Label htmlFor="indicacao-quem-foi-indicado">Quem foi indicado (novo ou existente)</Label>
                <Input
                  id="indicacao-quem-foi-indicado"
                  value={referredQuery}
                  onChange={(event) => {
                    setReferredQuery(event.target.value);
                    setReferredId("");
                  }}
                  placeholder="Busque, ou digite o nome completo da pessoa nova"
                />
                {referredSuggestions.length && !referredId ? (
                  <div className="mt-1 overflow-hidden rounded-bloco border border-fio bg-folha shadow-flutua">
                    {referredSuggestions.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => {
                          setReferredId(contact.id);
                          setReferredQuery(contactDisplayName(contact));
                        }}
                        className="block w-full px-3 py-2 text-left text-sm font-medium text-tinta hover:bg-saber focus-visible:bg-saber focus-visible:outline-none [&+&]:border-t [&+&]:border-fio"
                      >
                        {contactDisplayName(contact)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {referredId ? <p className="mt-1 text-xs font-bold text-ok">✓ selecionado</p> : null}
              </div>
              <div className="grid min-w-0 gap-3">
                <ContactChannelsFields
                  value={novoContato}
                  onChange={setNovoContato}
                  idPrefix="indicacao"
                  bare
                  note="Contato de quem foi indicado (se for pessoa nova, ou se o cadastro estiver sem número)."
                />
                <Botao variante="primario" type="submit" className="w-full" disabled={!telaCrm.podeEditar}>
                  Registrar indicação
                </Botao>
                {formError ? (
                  <p role="alert" className="rounded-controle bg-erro-claro px-3 py-2 text-xs font-bold leading-5 text-erro">
                    {formError}
                  </p>
                ) : null}
              </div>
          </form>
        </BlocoFolha>

        {/* Por pessoa: X indicou Y e Z */}
        <section aria-labelledby="indicacoes-por-pessoa" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="indicacoes-por-pessoa" className={TITULO_SECAO}>
              Por pessoa <span className="font-semibold tabular-nums text-tinta-2">· {porIndicador.length}</span>
            </h2>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">Clique na pessoa para abrir os indicados dela.</p>
          </div>
          {porIndicador.length === 0 ? (
            <BlocoSaber className="py-4">
              <p className="text-sm font-medium text-tinta-2">Nenhuma indicação ainda — registre a primeira acima.</p>
            </BlocoSaber>
          ) : (
            <BlocoFolha>
              {porIndicador.map((grupo) => {
                const chave = grupo.indicador?.id ?? "?";
                const aberto = indicadorAberto === chave;
                return (
                  <div key={chave} className="[&+&]:border-t [&+&]:border-fio">
                    <button
                      type="button"
                      aria-expanded={aberto}
                      className="flex min-h-14 w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 text-left hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco max-md:px-4"
                      onClick={() => setIndicadorAberto((atual) => (atual === chave ? "" : chave))}
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-tinta">
                        {aberto ? <ChevronDown className="h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />}
                        <span className="min-w-0 truncate">{grupo.indicador ? contactDisplayName(grupo.indicador) : "(indicador removido)"}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="font-medium tabular-nums text-tinta-2">
                          {grupo.indicacoes.length} indicado(s) · {grupo.passaram} passaram
                        </span>
                        {grupo.aReceber > 0 ? <Etiqueta tom="atencao">{moneyCrm(grupo.aReceber)} a entregar</Etiqueta> : null}
                        {grupo.vouchersPagos > 0 ? <Etiqueta tom="ok">{grupo.vouchersPagos} voucher(s) pago(s)</Etiqueta> : null}
                      </span>
                    </button>
                    {aberto ? (
                      <ul className="border-t border-fio bg-papel">
                        {grupo.indicacoes.map((reward) => (
                          <li key={reward.referred.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 pl-11 pr-5 max-md:pl-10 max-md:pr-4 [&+&]:border-t [&+&]:border-fio">
                            <div className="min-w-0 text-sm">
                              <Link to={crmModuleRoutes.contact(reward.referred.id)} className={NOME_LINK}>
                                {contactDisplayName(reward.referred)}
                              </Link>
                              {reward.soldTotal > 0 ? (
                                <span className="ml-2 text-[13px] font-medium tabular-nums text-tinta-2">fechou {moneyCrm(reward.soldTotal)}</span>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Etiqueta tom={statusTones[reward.status]}>{referralRewardStatusLabels[reward.status]}</Etiqueta>
                              {reward.status === "A_PAGAR" && canPay ? (
                                <Botao
                                  variante="suave"
                                  tamanho="pq"
                                  disabled={!telaCrm.podeEditar}
                                  onClick={() => handleMarkPaid(reward.referred.id, contactDisplayName(reward.referred))}
                                >
                                  Voucher entregue
                                </Botao>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </BlocoFolha>
          )}
        </section>
      </div>
    </AccessGate>
  );
}
