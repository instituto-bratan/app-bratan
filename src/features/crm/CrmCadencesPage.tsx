import { AccessGate } from "@/components/access/AccessGate";
import { AvisoSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { canCrmBratan } from "@/lib/access";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ClipboardCopy,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { BlocoSaber, Botao, Cabecalho, FraseDoFluxo } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import {
  Button,
  CAMPO,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Etiqueta,
  GrupoDeLeituras,
  Input,
  Label,
  Leitura,
  NOME_LINK,
  TITULO_SECAO,
} from "./comercialVisual";
import { contagem, maiuscula } from "./comercialFrases";
import { useAuth } from "@/hooks/useAuth";
import {
  RETURN_CYCLE_CADENCE_ID,
  cadenceOwnerSlug,
  dealsScheduledWithoutConfirmation,
  scheduleConsultation,
  applyContactChannels,
  applyMessageTemplate,
  canUserAccessCadence,
  canUserAccessContact,
  cadenceNeedsEventDate,
  cadenceTypeLabels,
  contactDisplayName,
  crmModuleRoutes,
  crmRoleLabels,
  dealStageLabels,
  enrollContactInCadence,
  inscreverNaCadencia,
  enrollmentStatusLabels,
  isCrmManagement,
  findOrCreateCrmContact,
  generateCadenceTasks,
  moneyCrm,
  taskTypeLabels,
  type CrmCadence,
  type CrmCadenceStatus,
  cargoToCrmRole,
  roleRuleExplainers,
} from "./crmData";
import { todayISO } from "@/lib/localStore";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { cadenciaDaFaixa, faixaLabels, radarDeResgate, radarPorFaixa, type FaixaDeResgate } from "./resgateData";
import { CrmSyncBanner } from "./CrmSyncBanner";
import { useCrmState } from "./useCrmState";
import { ContactChannelsFields } from "./ContactChannelsFields";
import {
  contactChannelsIssue,
  contactChannelsValues,
  emptyContactChannels,
  type ContactChannelsDraft,
} from "./contactChannels";

function statusTone(status: CrmCadenceStatus) {
  if (status === "ACTIVE") return "bg-ok-claro text-ok";
  if (status === "PAUSED") return "bg-folha text-tinta-2";
  if (status === "CANCELED") return "bg-erro-claro text-erro";
  return "bg-musgo-claro text-musgo";
}

function CrmCadencesPageConteudo() {
  const { pessoa } = useAuth();
  // "Só vê" (29/09/2026, auditoria B9): sem EDITAR no CRM, nada grava e os botões de inscrever ficam desligados.
  const { state, persist, syncFailed, syncErrorDetail, retrySync } = useCrmState({ modulo: "crm" });
  const telaCrm = useNivelDaTela("crm");
  const semEdicao = !telaCrm.podeEditar;
  // Sem default fixo: a régua abre na do PRÓPRIO papel (concierge → Concierge D+1),
  // para ninguém inscrever sem querer na cadência comercial (bug "coloco no D1 e
  // não vai" — a Comercial se chamava 'D1' e era o default).
  const [cadenceId, setCadenceId] = useState("");
  const [contactId, setContactId] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [dealId, setDealId] = useState("");
  const [novoContato, setNovoContato] = useState<ContactChannelsDraft>(emptyContactChannels);
  const [eventDate, setEventDate] = useState("");
  const [feedback, setFeedback] = useState("");

  const isManagement = isCrmManagement(pessoa?.cargo);
  const myRole = cargoToCrmRole(pessoa?.cargo);
  const [onlyMine, setOnlyMine] = useState(true);
  // TRÊS TRABALHOS, UMA TELA (20/08/2026, pedido do Lucas: "são muitas abas e a
  // gente acaba se confundindo"): Agir (inscrever alguém), Radar de resgate
  // (quem sumiu — 60d/6m/1a) e Aprender (a aula + o catálogo). Pílulas em vez
  // de rolagem infinita.
  const [secao, setSecao] = useState<"AGIR" | "RADAR" | "APRENDER">("AGIR");
  const financeiro = useFinanceiro(Number(todayISO().slice(0, 4)));
  const radar = useMemo(() => radarDeResgate(state, financeiro.sales, todayISO()), [state, financeiro.sales]);
  const radarFaixas = useMemo(() => radarPorFaixa(radar), [radar]);

  function inscreverNoResgate(contactId: string, faixa: Exclude<FaixaDeResgate, "CHEGANDO">) {
    const valores = {
      cadenceId: cadenciaDaFaixa[faixa],
      contactId,
      dealId: "",
      triggerSource: "radar de resgate",
      triggerDate: todayISO(),
      ownerUserId: cadenceOwnerSlug("CONCIERGE"),
      ownerRole: "CONCIERGE" as const,
    };
    const contato = state.contacts.find((item) => item.id === contactId);
    // Confere no retrato da tela ANTES de anunciar (29/09/2026, auditoria B8c):
    // com outra régua ativa a inscrição não nasce, e a tela dizia "inscrito".
    const previa = inscreverNaCadencia(state, valores);
    if (!previa.nasceu) {
      setFeedback(`${contactDisplayName(contato)} NÃO foi inscrito(a) no ${faixaLabels[faixa]}: ${previa.motivo}.`);
      return;
    }
    persist((current) => enrollContactInCadence(current, valores));
    setFeedback(`${contactDisplayName(contato)} inscrito(a) no ${faixaLabels[faixa]} — a 1ª das 5 tentativas da Aline já virou tarefa (as outras nascem uma de cada vez).`);
  }
  const cadenceInvolvesMyRole = (cadenceId: string, ownerRole: string) =>
    myRole === ownerRole || state.cadenceSteps.some((step) => step.cadenceId === cadenceId && step.assignedToRole === myRole);
  const accessibleCadences = state.cadences.filter((cadence) => !pessoa || canUserAccessCadence(pessoa, cadence));
  const visibleCadences =
    isManagement && onlyMine
      ? accessibleCadences.filter((cadence) => cadenceInvolvesMyRole(cadence.id, cadence.defaultOwnerRole))
      : accessibleCadences;

  // Abre (e mantém) o seletor na régua do próprio papel; se a selecionada sumir
  // da lista visível, cai para a primeira disponível.
  useEffect(() => {
    if (!accessibleCadences.length) return;
    if (cadenceId && accessibleCadences.some((cadence) => cadence.id === cadenceId)) return;
    const mine = accessibleCadences.find((cadence) => cadence.defaultOwnerRole === myRole);
    setCadenceId((mine ?? accessibleCadences[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessibleCadences.length, myRole]);
  const visibleContacts = state.contacts.filter((contact) => !pessoa || canUserAccessContact(pessoa, contact));
  const contactSuggestions = useMemo(() => {
    const term = contactQuery.trim().toLowerCase();
    if (term.length < 2) return [];
    return visibleContacts
      .filter((contact) => contactDisplayName(contact).toLowerCase().includes(term))
      .slice(0, 8);
  }, [visibleContacts, contactQuery]);
  const stepsByCadence = useMemo(() => {
    return new Map(
      state.cadences.map((cadence) => [
        cadence.id,
        state.cadenceSteps.filter((step) => step.cadenceId === cadence.id).sort((a, b) => a.stepOrder - b.stepOrder),
      ]),
    );
  }, [state.cadenceSteps, state.cadences]);
  const templatesById = useMemo(() => new Map(state.messageTemplates.map((template) => [template.id, template])), [state.messageTemplates]);
  const dealsForContact = state.deals.filter((deal) => deal.contactId === contactId);
  const needsEventDate = cadenceNeedsEventDate(state, cadenceId);
  const selectedContact = state.contacts.find((contact) => contact.id === contactId);

  async function enrollContact(
    contactIdToEnroll: string,
    displayName: string,
    createValues?: { fullName: string; channels: ContactChannelsDraft },
  ) {
    const cadence = state.cadences.find((item) => item.id === cadenceId);
    if (!cadence) return;
    const alreadyEnrolled = state.cadenceEnrollments.some(
      (enrollment) => enrollment.contactId === contactIdToEnroll && enrollment.cadenceId === cadenceId && enrollment.status === "ACTIVE",
    );
    if (alreadyEnrolled && !createValues) {
      setFeedback("Este contato já está inscrito nesta cadência.");
      return;
    }

    setFeedback("Inscrevendo…");
    let createdName = "";
    // O motor descarta a inscrição EM SILÊNCIO quando o paciente já tem outra
    // cadência ativa (regra nº 5) — e a tela dizia "✅ inscrito" mesmo assim.
    // Foi assim que paciente agendado ficou fora do 3·1 (01/08/2026). Agora a
    // gente confere se a inscrição realmente nasceu e fala a verdade.
    let enrolledOk = false;
    let blockedBy = "";
    const saved = await persist((current) => {
      let next = current;
      let targetId = contactIdToEnroll;
      if (createValues) {
        // Pessoa nova direto da cadência: cria o contato (com deduplicação) e
        // inscreve na sequência — antes não existia caminho para gente nova aqui.
        const result = findOrCreateCrmContact(
          next,
          {
            fullName: createValues.fullName,
            ...contactChannelsValues(createValues.channels),
            contactType: "LEAD",
            lifecycleStage: "COLD_LEAD",
            sourceChannel: "Cadência (inscrição manual)",
          },
          pessoa?.id ?? "sistema",
        );
        next = result.state;
        targetId = result.contact.id;
        // Casou com quem já existia sem número: completa o cadastro.
        next = applyContactChannels(next, targetId, contactChannelsValues(createValues.channels), pessoa?.id ?? "sistema");
        createdName = contactDisplayName(result.contact);
      }
      // O Ciclo de retorno passa pelo caminho oficial do agendamento: remarca,
      // cancela tarefas antigas e substitui a régua ativa com motivo.
      if (cadenceId === RETURN_CYCLE_CADENCE_ID) {
        const agendado = scheduleConsultation(next, {
          contactId: targetId,
          dealId,
          eventDate: needsEventDate ? eventDate : todayISO(),
          actorId: pessoa?.id ?? "sistema",
          source: "inscricao manual (cadências)",
        });
        enrolledOk = agendado.changed || agendado.message.includes("já está");
        blockedBy = enrolledOk ? "" : agendado.message;
        return agendado.state;
      }
      const before = next.cadenceEnrollments.filter((item) => item.status === "ACTIVE" && item.contactId === targetId);
      const enrolled = enrollContactInCadence(next, {
        cadenceId,
        contactId: targetId,
        dealId,
        triggerSource: "inscricao manual",
        triggerDate: needsEventDate ? eventDate : todayISO(),
        ownerUserId: pessoa?.id ?? cadence.defaultOwnerRole.toLowerCase(),
        ownerRole: cadence.defaultOwnerRole,
      });
      enrolledOk = enrolled.cadenceEnrollments.some(
        (item) => item.status === "ACTIVE" && item.contactId === targetId && item.cadenceId === cadenceId,
      );
      if (!enrolledOk) {
        const ativa = before[0];
        const nomeAtiva = ativa ? state.cadences.find((item) => item.id === ativa.cadenceId)?.name ?? ativa.cadenceId : "";
        blockedBy = ativa
          ? `${nomeAtiva}`
          : "regra de 1 cadência ativa por paciente";
      }
      return enrolled;
    });

    const who = createdName || displayName;
    if (!enrolledOk) {
      setFeedback(
        `⚠️ ${who} NÃO entrou em "${cadence.name}": já existe a cadência ativa "${blockedBy}" (regra: 1 por paciente). ` +
          `Encerre/cancele a ativa no cartão dela abaixo e inscreva de novo — nada foi criado agora.`,
      );
      return;
    }
    if (saved) {
      // Se a régua não estiver na vista "Só as minhas", abre a visão completa
      // para a inscrição recém-criada aparecer (antes ela "sumia" da tela).
      if (isManagement && onlyMine && !cadenceInvolvesMyRole(cadence.id, cadence.defaultOwnerRole)) {
        setOnlyMine(false);
      }
      const responsavel = crmRoleLabels[cadence.defaultOwnerRole];
      setFeedback(
        `✅ ${who} foi inscrito(a) em "${cadence.name}". A negociação aparece no Kanban Comercial e a 1ª tarefa foi para Minhas Tarefas de ${responsavel} (veja na aba "Próximos 7 dias" se o toque é amanhã). Role a página para ver a inscrição no cartão da régua.`,
      );
      setContactQuery("");
      setContactId("");
      setDealId("");
      setNovoContato(emptyContactChannels);
    } else {
      setFeedback(
        `${who} foi inscrito(a) neste aparelho, mas NÃO sincronizou com o Supabase. Confira a internet e toque em "Tentar sincronizar" no aviso acima antes de sair desta tela.`,
      );
    }
  }

  // Radar do 3·1: agendados/confirmados SEM Ciclo de retorno ativo — é o furo
  // exato que causou o erro de agenda (01/08/2026).
  const forasDo31 = useMemo(() => dealsScheduledWithoutConfirmation(state), [state]);
  const [radarDatas, setRadarDatas] = useState<Record<string, string>>({});

  function corrigirFora31(dealIdAlvo: string, contactIdAlvo: string) {
    const data = radarDatas[dealIdAlvo];
    if (!data) {
      setFeedback("Informe a DATA da consulta para colocar o paciente no 3·1.");
      return;
    }
    void persist((current) =>
      scheduleConsultation(current, {
        contactId: contactIdAlvo,
        dealId: dealIdAlvo,
        eventDate: data,
        actorId: pessoa?.id ?? "sistema",
        source: "radar 3·1 (correção)",
      }).state,
    );
    const nome = contactDisplayName(state.contacts.find((item) => item.id === contactIdAlvo));
    setFeedback(`✅ ${nome} entrou no 3·1 da consulta de ${data.split("-").reverse().join("/")} — confirmação −3 e lembrete −1 na fila da recepção.`);
  }

  function handleEnroll(event: FormEvent) {
    event.preventDefault();
    if (!cadenceId) return;
    if (needsEventDate && !eventDate) {
      setFeedback("Informe a data da consulta de retorno: os lembretes desta cadência contam para trás dela.");
      return;
    }
    const problemaCanais = contactChannelsIssue(novoContato);
    if (problemaCanais) {
      setFeedback(problemaCanais);
      return;
    }
    if (selectedContact) {
      void enrollContact(selectedContact.id, contactDisplayName(selectedContact));
      return;
    }
    const typedName = contactQuery.trim();
    if (typedName.length < 3) {
      setFeedback("Busque um contato existente ou digite o nome completo da pessoa nova.");
      return;
    }
    void enrollContact("", typedName, { fullName: typedName, channels: novoContato });
  }

  function updateEnrollment(id: string, status: CrmCadenceStatus) {
    persist((current) => ({
      ...current,
      cadenceEnrollments: current.cadenceEnrollments.map((enrollment) =>
        enrollment.id === id
          ? {
              ...enrollment,
              status,
              updatedAt: new Date().toISOString(),
              completedAt: status === "COMPLETED" ? new Date().toISOString() : enrollment.completedAt,
            }
          : enrollment,
      ),
    }));
  }

  function copyTemplate(cadence: CrmCadence) {
    const step = stepsByCadence.get(cadence.id)?.[0];
    const template = step ? templatesById.get(step.messageTemplateId) : undefined;
    const contact = selectedContact ?? visibleContacts[0];
    if (!template || !contact) return;
    void navigator.clipboard?.writeText(applyMessageTemplate(template, contact));
    setFeedback("Mensagem modelo copiada.");
  }



  // CABEÇALHO (08/10/2026, redesenho etapa 3): um cabeçalho só, com o número
  // explicado em frase; as três seções (Inscrever · Radar · Como funciona) viram
  // leituras logo abaixo, e o recado do papel vira um bloco "para saber".
  const inscricoesAtivas = state.cadenceEnrollments.filter((enrollment) => enrollment.status === "ACTIVE").length;
  const sumidos = radar.filter((pessoa) => pessoa.faixa !== "CHEGANDO").length;
  const roleExplainer = roleRuleExplainers[cargoToCrmRole(pessoa?.cargo) ?? "ADMINISTRATIVO"];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 font-sans max-md:gap-4">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Comercial"
        titulo="Cadências por função"
        frase={
          <>
            <strong>{maiuscula(contagem(inscricoesAtivas, "inscrição ativa", "inscrições ativas", "f"))}</strong> nas réguas.{" "}
            {sumidos ? (
              <span className="alerta">
                {maiuscula(contagem(sumidos, "paciente"))} {sumidos === 1 ? "sumiu" : "sumiram"} sem ninguém cuidando.
              </span>
            ) : (
              "Ninguém sumido fora de cuidado."
            )}
          </>
        }
        acoes={
          <>
            <Button asChild variant="outline">
              <Link to={crmModuleRoutes.tasks}>
                Minhas tarefas <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Botao
              variante="secundario"
              icone={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              disabled={semEdicao}
              onClick={() => persist((current) => generateCadenceTasks(current))}
            >
              Gerar tarefas
            </Botao>
          </>
        }
        rodape={
          <FraseDoFluxo>
            As réguas geram as tarefas sozinhas para a pessoa certa, na hora certa. Mensagens sugeridas e antifadiga: nada é enviado
            automaticamente — você aprova e envia.{" "}
            <InfoTip title="O que são cadências?">
              São as réguas de relacionamento do Instituto em ação: sequências de toques (D+1 do concierge, enfermeira a cada
              14 dias, resgates D1·D5·D7·D60) que geram tarefas automaticamente para a pessoa certa, na hora certa. Você
              aprova e envia a mensagem — o app nunca dispara sozinho.
            </InfoTip>
          </FraseDoFluxo>
        }
      />

      {roleExplainer ? (
        <BlocoSaber className="py-4">
          <p className="text-sm font-bold leading-5 text-tinta">{roleExplainer.title}</p>
          <p className="mt-1 text-sm font-medium leading-6 text-tinta-2">{roleExplainer.rule}</p>
        </BlocoSaber>
      ) : null}

      {/* As três seções: cada trabalho no seu lugar. */}
      <GrupoDeLeituras rotulo="Seção">
        {(
          [
            ["AGIR", "Inscrever alguém", undefined],
            ["RADAR", "Radar de resgate", sumidos || undefined],
            ["APRENDER", "Como funciona + catálogo", undefined],
          ] as const
        ).map(([chave, rotulo, numero]) => (
          <Leitura key={chave} ativa={secao === chave} numero={numero} tom={chave === "RADAR" && numero ? "atencao" : undefined} onClick={() => setSecao(chave)}>
            {rotulo}
          </Leitura>
        ))}
      </GrupoDeLeituras>

      {/* A AULA (pedido do Lucas, 22/07): cada esteira explicada + o que cada
          pessoa vê. Conteúdo espelha gatesForPhase/nextPhaseFor — se o motor
          mudar, atualizar aqui junto. */}
      {secao === "APRENDER" ? (
      <BlocoSaber as="section" className="grid gap-4">
        <div>
          <h2 className={TITULO_SECAO}>Como funcionam as esteiras (a aula)</h2>
          <p className="mt-1 text-sm font-medium leading-6 text-tinta-2">
            Tudo começa quando o <strong>Estevão registra o fechamento</strong> no Kanban. O que o paciente fechou define a
            esteira — e cada pessoa recebe SÓ as tarefas dela, na hora certa. Ninguém move card: concluir a tarefa move.
          </p>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-2 lg:grid-cols-2">
            <div className="rounded-bloco bg-folha p-4">
              <p className="text-sm font-bold leading-5 text-tinta">1 · Plano de Acompanhamento (a jornada completa)</p>
              <ol className="mt-1.5 grid gap-1 text-xs leading-5 text-tinta">
                <li><strong>Acabou de aderir (D0):</strong> Estevão salvou o cadastro — o card nasce e já passa sozinho para o D+1.</li>
                <li><strong>Boas-vindas (D+1) — o portão:</strong> no dia seguinte, <span className="font-semibold text-atencao">Concierge</span> (como foi? + avaliação Google), <span className="font-semibold text-ok">Recepção</span> (mensagem para fechar toda a agenda) e <span className="font-semibold text-tinta">Enfermeira</span> (como está com a medicação). O card SÓ avança quando as TRÊS marcarem "enviada".</li>
                <li><strong>Agendamento:</strong> paciente respondeu → Recepção fecha todas as datas → avança sozinho.</li>
                <li><strong>1º atendimento:</strong> Enfermeira faz a 1ª aplicação/bioimpedância → avança sozinho.</li>
                <li><strong>Em acompanhamento (6–9 meses):</strong> Enfermeira no D+1 de cada aplicação e a cada 14 dias (relógio individual do paciente). No fim: renovar, manter ou alta.</li>
              </ol>
            </div>
            <div className="grid gap-2">
              <div className="rounded-bloco bg-folha p-4">
                <p className="text-sm font-bold leading-5 text-tinta">2 · Consulta Black (ex-Clube Bratan)</p>
                <p className="mt-1 text-xs leading-5 text-tinta">
                  D+1 com <span className="font-semibold text-atencao">Concierge</span> (boas-vindas) + <span className="font-semibold text-ok">Recepção</span> (agendar a próxima consulta, ~3 meses). Agenda confirmada = Clube ativo. Sem enfermeira nesta esteira.
                </p>
              </div>
              <div className="rounded-bloco bg-folha p-4">
                <p className="text-sm font-bold leading-5 text-tinta">3 · Somente Tratamento</p>
                <p className="mt-1 text-xs leading-5 text-tinta">
                  D+1 com <span className="font-semibold text-atencao">Concierge</span> + <span className="font-semibold text-tinta">Enfermeira</span> (agendar as medicações). Depois vai DIRETO para o 1º atendimento — não passa pela Recepção.
                </p>
              </div>
              <div className="rounded-bloco bg-folha p-4">
                <p className="text-sm font-bold leading-5 text-tinta">4 · Consulta avulsa</p>
                <p className="mt-1 text-xs leading-5 text-tinta">Sem esteira — segue a agenda normal. Se marcar retorno, entra o ciclo de retorno da Recepção (abaixo).</p>
              </div>
              <div className="rounded-bloco bg-folha p-4">
                <p className="text-sm font-bold leading-5 text-tinta">5 · Não fechou</p>
                <p className="mt-1 text-xs leading-5 text-tinta">
                  <span className="font-semibold text-atencao">Concierge</span> acolhe no D+1 e segue D2–D5, um passo por vez — qualquer resposta encerra na hora. Sem resposta no D5 → <span className="font-semibold text-tinta">Estevão</span> (5 ligações) → encerrado → resgates de 60 dias, 6 meses e 1 ano.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-bloco bg-folha p-4">
            <p className="text-sm font-bold leading-5 text-tinta">O que CADA pessoa vê (e só isso)</p>
            <div className="mt-1.5 grid gap-1.5 text-xs leading-5 text-tinta sm:grid-cols-2">
              <p><span className="font-semibold text-tinta">Enfermeira:</span> apresentação D+1 (Programa/Só Tratamento), 1º atendimento, pós-aplicação D+1 e os 14 dias — o relógio é DE CADA paciente: quem passou dia 10 recebe dia 24, quem passou dia 11 recebe dia 25. Por isso quase todo dia tem mensagem de 14 dias de alguém.</p>
              <p><span className="font-semibold text-ok">Recepção:</span> mensagem de agenda no D+1 (Programa/Clube), fechar todas as datas, e o ciclo de retorno: exames 15 dias antes, 1 semana antes, confirmar 3 dias antes, lembrete 1 dia antes da consulta.</p>
              <p><span className="font-semibold text-atencao">Concierge:</span> boas-vindas do D+1 de TODOS os canais + avaliação Google, a régua do não-fechou (D1–D5) e os resgates de 60 dias/6 meses/1 ano (5 tentativas cada, parando na 1ª resposta).</p>
              <p><span className="font-semibold text-tinta">Estevão (gestor):</span> registra os fechamentos (a porta de entrada), assume o que escala no D5 sem resposta (5 ligações em dias e horários alternados) e tem o 3·1·3·1 para negociação parada: 3 dias, 1 semana, 3 semanas e 1 mês após o último contato.</p>
            </div>
            <p className="mt-2 text-xs leading-4 text-tinta-2">
              Em "Minhas Tarefas" cada pessoa abre já na visão do próprio papel — e quem não é coordenação só enxerga as suas.
              Regras de ouro: 1 paciente = 1 card · 1 tarefa por pessoa por paciente (a próxima espera a atual) · 1 cadência
              ativa por paciente · resposta do paciente encerra a régua na hora.
            </p>
          </div>
        </div>
      </BlocoSaber>
      ) : null}

      <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={retrySync} />
      <AvisoSoVe soVe={telaCrm.soVe} />

      {forasDo31.length ? (
        <Card className="border-erro/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-erro">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              {forasDo31.length} paciente(s) com consulta marcada FORA do 3·1
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5">
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              Estão em "Consulta agendada/confirmada" no Kanban mas sem o Ciclo de retorno ativo — ou seja, ninguém vai
              receber a tarefa de confirmar (−3) nem o lembrete (−1). Foi exatamente isso que gerou o erro de agenda.
              Informe a data e corrija em um toque.
            </p>
            {forasDo31.map((deal) => {
              const contato = state.contacts.find((item) => item.id === deal.contactId);
              return (
                <div key={deal.id} className="flex flex-wrap items-center gap-2 border-t border-fio pt-3">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-tinta">
                    {contactDisplayName(contato)}
                    <span className="ml-2 text-[13px] font-medium text-tinta-2">{dealStageLabels[deal.stage]}</span>
                  </span>
                  <Input
                    type="date"
                    value={radarDatas[deal.id] ?? ""}
                    onChange={(event) => setRadarDatas((current) => ({ ...current, [deal.id]: event.target.value }))}
                    className="h-9 w-40"
                    aria-label={`Data da consulta de ${contactDisplayName(contato)}`}
                  />
                  <Button type="button" size="sm" variant="subtle" disabled={semEdicao} onClick={() => corrigirFora31(deal.id, deal.contactId)}>
                    Colocar no 3·1
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      {isManagement && secao === "APRENDER" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Leitura ativa={onlyMine} onClick={() => setOnlyMine(true)}>
            Só as minhas réguas
          </Leitura>
          <Leitura ativa={!onlyMine} onClick={() => setOnlyMine(false)}>
            Todas as réguas
          </Leitura>
          <span className="text-[13px] font-medium leading-5 text-tinta-2">
            {onlyMine
              ? "Mostrando só as cadências em que o seu papel atua."
              : "Visão de coordenação: todas as cadências e inscrições do Instituto."}
          </span>
        </div>
      ) : null}

      {secao === "AGIR" ? (
      <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
        <Card>
          <CardHeader>
            <CardTitle>Inscrever contato</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={handleEnroll}>
              <div className="relative">
                <Label>Contato</Label>
                <Input
                  value={contactQuery}
                  onChange={(event) => {
                    setContactQuery(event.target.value);
                    setContactId("");
                    setDealId("");
                  }}
                  placeholder="Digite o nome para buscar (a partir de 2 letras)"
                  autoComplete="off"
                  className="mt-1"
                />
                {contactSuggestions.length && !contactId ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-bloco border border-fio bg-folha p-1 shadow-flutua">
                    {contactSuggestions.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        className="block w-full rounded-controle px-3 py-2 text-left text-sm font-semibold text-tinta hover:bg-saber"
                        onClick={() => {
                          setContactQuery(contactDisplayName(contact));
                          setContactId(contact.id);
                          setDealId("");
                        }}
                      >
                        {contactDisplayName(contact)}
                        <span className="ml-2 text-xs font-medium text-tinta-2">{contact.lifecycleStage}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {contactQuery.trim().length >= 3 && !contactId && !contactSuggestions.length ? (
                  <div className="mt-2 rounded-bloco bg-saber p-4">
                    <p className="text-[13px] font-bold leading-5 text-tinta">
                      Pessoa nova! Ao inscrever, o contato é criado, entra no Kanban Comercial e as tarefas nascem sozinhas.
                    </p>
                    <ContactChannelsFields
                      value={novoContato}
                      onChange={setNovoContato}
                      idPrefix="cadencia-novo"
                      bare
                      className="mt-2"
                      note="Telefone e e-mail da pessoa — é por aqui que a cadência liga e escreve. Também é o que evita cadastro duplicado."
                    />
                  </div>
                ) : null}
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  Negociação vinculada
                  <InfoTip title="De onde vêm as negociações?">
                    As negociações nascem no Kanban de Vendas — pelo botão "Novo lead" ou direto no card do lead. Aqui você só
                    vincula a cadência a uma negociação já existente, para o histórico ficar amarrado no lugar certo.
                  </InfoTip>
                </Label>
                <select value={dealId} onChange={(event) => setDealId(event.target.value)} className={cn(CAMPO, "cursor-pointer")}>
                  <option value="">Sem negociação específica</option>
                  {dealsForContact.map((deal) => {
                    const dealValue = deal.soldAmount || deal.estimatedValue;
                    return (
                      <option key={deal.id} value={deal.id}>
                        {deal.title} · {dealStageLabels[deal.stage]}{dealValue ? ` · ${moneyCrm(dealValue)}` : ""}
                      </option>
                    );
                  })}
                </select>
                {selectedContact && !dealsForContact.length ? (
                  <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
                    Este contato ainda não tem negociação — sem problema: ao inscrever, uma negociação nova é criada em
                    "Lead novo" no{" "}
                    <Link to={crmModuleRoutes.deals} className="font-bold text-musgo underline underline-offset-[3px]">
                      Kanban de Vendas
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Cadência</Label>
                <select value={cadenceId} onChange={(event) => setCadenceId(event.target.value)} className={cn(CAMPO, "cursor-pointer")}>
                  {visibleCadences.map((cadence) => (
                    <option key={cadence.id} value={cadence.id}>
                      {cadence.name} · {crmRoleLabels[cadence.defaultOwnerRole]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
                  Responsável pela régua: <span className="font-bold text-tinta">{crmRoleLabels[state.cadences.find((c) => c.id === cadenceId)?.defaultOwnerRole ?? myRole ?? "CONCIERGE"]}</span>. O primeiro toque cai em Minhas Tarefas de quem cuida deste passo.
                </p>
              </div>
              {needsEventDate ? (
                <div>
                  <Label className="flex items-center gap-1">
                    Data da consulta de retorno
                    <InfoTip title="Por que pedir a data?">
                      Esta cadência conta PARA TRÁS da consulta: exames 15 e 7 dias antes, confirmação 3 dias antes e
                      lembrete na véspera. Sem a data certa, os lembretes nasceriam atrasados.
                    </InfoTip>
                  </Label>
                  <Input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="mt-1" required />
                </div>
              ) : null}
              <Button type="submit" disabled={semEdicao} className="justify-self-start">
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
                {!contactId && contactQuery.trim().length >= 3 && !contactSuggestions.length
                  ? "Criar contato e inscrever"
                  : "Inscrever e criar tarefas"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <BlocoSaber as="section">
          <div>
            <h2 className={cn(TITULO_SECAO, "flex items-center gap-2")}>
              <ShieldAlert className="h-5 w-5 text-oliva" aria-hidden="true" />
              Governança premium
            </h2>
          </div>
          <dl className="mt-4 grid gap-4">
            <div className="border-t border-fio pt-3">
              <dt className="text-sm font-bold leading-5 text-tinta">Sem envio automático</dt>
              <dd className="mt-1 text-sm font-medium leading-5 text-tinta-2">O app sugere, copia e abre WhatsApp. Humano aprova.</dd>
            </div>
            <div className="border-t border-fio pt-3">
              <dt className="text-sm font-bold leading-5 text-tinta">Antifadiga</dt>
              <dd className="mt-1 text-sm font-medium leading-5 text-tinta-2">Muitos toques em curto período aparecem no Perfil 360.</dd>
            </div>
            <div className="border-t border-fio pt-3">
              <dt className="text-sm font-bold leading-5 text-tinta">Fonte única</dt>
              <dd className="mt-1 text-sm font-medium leading-5 text-tinta-2">Cadência gera tarefa; tarefa gera histórico; 360 consolida.</dd>
            </div>
          </dl>
        </BlocoSaber>
      </div>
      ) : null}

      {secao === "RADAR" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">Radar de resgate — quem sumiu e há quanto tempo</CardTitle>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              A última comanda diz quando o paciente veio pela última vez. Só aparece quem NINGUÉM está cuidando (sem
              negociação aberta, sem jornada, sem cadência ativa). Um toque inscreve no resgate certo — as 5 tentativas
              da Aline viram tarefas na hora.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            {radar.length === 0 ? (
              <p className="rounded-bloco bg-ok-claro px-4 py-6 text-center text-sm font-semibold text-ok">
                Ninguém sumido fora de cuidado.
              </p>
            ) : (
              (["D60", "CHEGANDO", "M6", "A1"] as const).map((faixa) => {
                const pessoas = radarFaixas.get(faixa) ?? [];
                if (!pessoas.length) return null;
                return (
                  <div key={faixa}>
                    <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
                      {faixaLabels[faixa]}
                      <Etiqueta tom={faixa === "D60" ? "atencao" : "neutro"}>{pessoas.length}</Etiqueta>
                      {faixa === "CHEGANDO" ? <span className="font-medium normal-case tracking-normal text-tinta-2">— ainda dá para trazer de volta ANTES de virar resgate</span> : null}
                    </p>
                    <div className="grid">
                      {pessoas.map((pessoa) => (
                        <div key={pessoa.contact.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-fio py-2.5">
                          <div className="min-w-0 text-sm">
                            <Link to={crmModuleRoutes.contact(pessoa.contact.id)} className={NOME_LINK}>
                              {contactDisplayName(pessoa.contact)}
                            </Link>
                            <span className="ml-2 text-[13px] font-medium tabular-nums text-tinta-2">
                              última visita {pessoa.ultimaVisita.split("-").reverse().join("/")} · {pessoa.diasSemVir} dias
                            </span>
                          </div>
                          {faixa !== "CHEGANDO" ? (
                            <Button type="button" size="sm" variant="outline" disabled={semEdicao} onClick={() => inscreverNoResgate(pessoa.contact.id, faixa)}>
                              Inscrever no resgate
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : null}

      {feedback ? (
        <div role="status" className="rounded-bloco bg-saber px-4 py-3 text-sm font-semibold leading-5 text-tinta">{feedback}</div>
      ) : null}

      {secao === "APRENDER" ? (
      <div className="grid gap-4 xl:grid-cols-2">
        {visibleCadences.map((cadence) => {
          const steps = stepsByCadence.get(cadence.id) ?? [];
          const enrollments = state.cadenceEnrollments.filter((enrollment) => enrollment.cadenceId === cadence.id);
          return (
            <Card key={cadence.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{cadence.name}</CardTitle>
                    <p className="mt-1 text-sm font-medium leading-5 text-tinta-2">{cadence.description}</p>
                  </div>
                  <Etiqueta>{crmRoleLabels[cadence.defaultOwnerRole]}</Etiqueta>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-wrap gap-2">
                  <Etiqueta tom="musgo">{cadenceTypeLabels[cadence.cadenceType]}</Etiqueta>
                  <Button type="button" variant="outline" size="sm" onClick={() => copyTemplate(cadence)}>
                    <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
                    Copiar 1ª mensagem
                  </Button>
                </div>

                <div className="grid gap-2">
                  {steps.map((step) => {
                    const template = templatesById.get(step.messageTemplateId);
                    return (
                      <div key={step.id} className="border-t border-fio pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold leading-5 text-tinta"><span className="tabular-nums">{step.stepOrder}.</span> {step.name}</p>
                          <Etiqueta>{taskTypeLabels[step.taskType]}</Etiqueta>
                        </div>
                        <p className="mt-1 text-sm font-medium leading-5 text-tinta-2">{template?.body}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-fio pt-4">
                  <p className="mb-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Inscrições ativas</p>
                  <div className="grid gap-2">
                    {enrollments.length ? enrollments.map((enrollment) => {
                      const contact = state.contacts.find((item) => item.id === enrollment.contactId);
                      return (
                        <div key={enrollment.id} className="rounded-bloco bg-saber p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Link to={crmModuleRoutes.contact(enrollment.contactId)} className={NOME_LINK}>
                              {contactDisplayName(contact)}
                            </Link>
                            <Etiqueta className={statusTone(enrollment.status)}>{enrollmentStatusLabels[enrollment.status]}</Etiqueta>
                          </div>
                          <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">Gatilho: {enrollment.triggerDate} · {enrollment.triggerSource}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={semEdicao} onClick={() => updateEnrollment(enrollment.id, "PAUSED")}>
                              <PauseCircle className="h-4 w-4" aria-hidden="true" />
                              Pausar
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={semEdicao} onClick={() => updateEnrollment(enrollment.id, "ACTIVE")}>
                              <PlayCircle className="h-4 w-4" aria-hidden="true" />
                              Ativar
                            </Button>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="rounded-bloco bg-saber p-3 text-sm font-medium text-tinta-2">
                        Nenhum contato inscrito nesta cadência.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      ) : null}
    </div>
  );
}

// A tela inteira passa pelo controle de Administração → Acessos, igual às outras
// do CRM: sem isto, quem tivesse o CRM ocultado ainda entrava pelo endereço.
export function CrmCadencesPage() {
  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Cadências" module="crm">
      <CrmCadencesPageConteudo />
    </AccessGate>
  );
}
