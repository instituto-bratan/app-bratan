import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  MessageCircle,
  Plus,
  Search,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import {
  canUserAccessContact,
  contactDisplayName,
  createDealForContact,
  crmModuleRoutes,
  dealStageLabels,
  dealStages,
  findOrCreateCrmContact,
  moneyCrm,
  moveDealStage,
  whatsappUrl,
  type CrmDeal,
  type CrmDealStage,
  type CrmLeadTemperature,
  type CrmObjectionCategory,
  type CrmPersonaFit,
} from "./crmData";
import { useCrmState } from "./useCrmState";

const objectionOptions: CrmObjectionCategory[] = [
  "PRICE",
  "TRUST",
  "TIMING",
  "SPOUSE_OR_FAMILY",
  "PAYMENT_METHOD",
  "NEEDS_MORE_INFORMATION",
  "NO_PERCEIVED_VALUE",
  "NO_RESPONSE",
  "OTHER",
];

function stageProbability(stage: CrmDealStage) {
  if (stage === "FECHOU_COMPLETO" || stage === "FECHOU_PARCIAL") return 100;
  if (stage === "PERDIDO") return 0;
  if (stage === "EM_NEGOCIACAO" || stage === "PRESCRICAO_FEITA") return 70;
  if (stage === "CONSULTA_REALIZADA") return 55;
  if (stage === "CONSULTA_AGENDADA" || stage === "CONSULTA_CONFIRMADA") return 45;
  if (stage === "QUALIFICADO") return 35;
  return 20;
}

function DealCard({
  deal,
  contactName,
  contactPhone,
  canSeeValue,
  onSelect,
}: {
  deal: CrmDeal;
  contactName: string;
  contactPhone: string;
  canSeeValue: boolean;
  onSelect: () => void;
}) {
  return (
    <article className="rounded-lg border border-brand-oliva/14 bg-white/75 p-3 shadow-sm backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-brand-musgo">{contactName}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{deal.title}</p>
        </div>
        <Badge variant="muted">{deal.probability}%</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline">{deal.sourceChannel || "Manual"}</Badge>
        {deal.mainObjection ? <Badge className="bg-brand-creme text-brand-tinta">{deal.mainObjection}</Badge> : null}
      </div>
      <div className="mt-3 grid gap-2">
        {canSeeValue ? (
          <div className="rounded-md bg-brand-papel/70 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Potencial / vendido</p>
            <p className="font-semibold text-brand-musgo">{moneyCrm(deal.estimatedValue)} / {moneyCrm(deal.soldAmount)}</p>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to={crmModuleRoutes.contact(deal.contactId)}>Perfil</Link>
          </Button>
          {contactPhone ? (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`https://wa.me/55${contactPhone.replace(/^55/, "")}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
        <Button type="button" size="sm" onClick={onSelect}>
          Mover / registrar
        </Button>
      </div>
    </article>
  );
}

export function CrmKanbanPage() {
  const { pessoa } = useAuth();
  const { state, persist } = useCrmState();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [selectedDealId, setSelectedDealId] = useState("");
  const [targetStage, setTargetStage] = useState<CrmDealStage>("CONTATADO");
  const [prescribed, setPrescribed] = useState("");
  const [sold, setSold] = useState("");
  const [received, setReceived] = useState("");
  const [objection, setObjection] = useState("");
  const [objectionCategory, setObjectionCategory] = useState<CrmObjectionCategory>("OTHER");
  const [partialReason, setPartialReason] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newSource, setNewSource] = useState("Manual");
  const [newValue, setNewValue] = useState("18000");
  const [newTemp, setNewTemp] = useState<CrmLeadTemperature>("WARM");
  const [newFit, setNewFit] = useState<CrmPersonaFit>("UNKNOWN");
  const [feedback, setFeedback] = useState("");

  const canSeeValue = Boolean(pessoa?.cargo && ["dr_daniel", "ceo", "gestor", "gestor_financeiro", "marketing", "secretaria_executiva", "recepcionista"].includes(pessoa.cargo));
  const contactsById = useMemo(() => new Map(state.contacts.map((contact) => [contact.id, contact])), [state.contacts]);
  const visibleDeals = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.deals.filter((deal) => {
      const contact = contactsById.get(deal.contactId);
      if (pessoa && contact && !canUserAccessContact(pessoa, contact)) return false;
      if (status && deal.status !== status) return false;
      if (!normalized) return true;
      return `${deal.title} ${contactDisplayName(contact)} ${deal.sourceChannel} ${deal.mainObjection}`.toLowerCase().includes(normalized);
    });
  }, [contactsById, pessoa, query, state.deals, status]);

  const selectedDeal = state.deals.find((deal) => deal.id === selectedDealId) ?? null;

  function handleCreateLead(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!newName.trim() && !newPhone.trim()) {
      setFeedback("Informe pelo menos nome ou telefone.");
      return;
    }

    persist((current) => {
      const created = findOrCreateCrmContact(
        current,
        {
          fullName: newName.trim() || newPhone.trim(),
          phone: newPhone,
          whatsapp: newPhone,
          sourceChannel: newSource,
          leadTemperature: newTemp,
          personaFit: newFit,
          ownerUserId: pessoa?.id ?? "manual",
          commercialOwnerId: pessoa?.id ?? "manual",
        },
        pessoa?.id ?? "manual",
      );
      setFeedback(created.duplicateWarning || "Lead criado e oportunidade aberta sem duplicar cadastro.");
      const withDeal = createDealForContact(created.state, {
        contactId: created.contact.id,
        title: `Primeira consulta - ${contactDisplayName(created.contact)}`,
        ownerUserId: pessoa?.id ?? "manual",
        estimatedValue: Number(newValue) || 0,
        sourceChannel: newSource,
      });
      return withDeal;
    });

    setNewName("");
    setNewPhone("");
  }

  function handleMoveDeal(event: FormEvent) {
    event.preventDefault();
    if (!selectedDeal) return;
    setFeedback("");
    persist((current) => {
      const moved = moveDealStage(current, selectedDeal.id, {
        actorId: pessoa?.id ?? "preview",
        stage: targetStage,
        prescribedAmount: prescribed ? Number(prescribed) : undefined,
        soldAmount: sold ? Number(sold) : undefined,
        receivedAmount: received ? Number(received) : undefined,
        objection,
        objectionCategory,
        partialReason,
      });
      setFeedback(moved.message);
      return moved.state;
    });
  }

  function selectDeal(deal: CrmDeal) {
    setSelectedDealId(deal.id);
    setTargetStage(deal.stage);
    setPrescribed(deal.prescribedAmount ? String(deal.prescribedAmount) : "");
    setSold(deal.soldAmount ? String(deal.soldAmount) : "");
    setReceived(deal.receivedAmount ? String(deal.receivedAmount) : "");
    setObjection(deal.mainObjection);
    setObjectionCategory(deal.objectionCategory);
    setPartialReason("");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 sm:gap-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="gold">CRM Bratan</Badge>
            <h1 className="mt-3 text-4xl leading-tight text-brand-musgo sm:text-5xl">Kanban Comercial</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Uma movimentação cria tarefas para Médico, Concierge, Recepção, Administrativo, Enfermagem e Financeiro quando necessário.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to={crmModuleRoutes.tasks}>Minhas tarefas <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </motion.section>

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Novo lead sem retrabalho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreateLead}>
              <div>
                <Label>Nome</Label>
                <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome ou referência" />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="11999999999" />
              </div>
              <div>
                <Label>Origem</Label>
                <Input value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="Instagram, indicação..." />
              </div>
              <div>
                <Label>Valor potencial</Label>
                <Input value={newValue} onChange={(event) => setNewValue(event.target.value)} inputMode="decimal" />
              </div>
              <div>
                <Label>Temperatura</Label>
                <select value={newTemp} onChange={(event) => setNewTemp(event.target.value as CrmLeadTemperature)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  <option value="COLD">Frio</option>
                  <option value="WARM">Morno</option>
                  <option value="HOT">Quente</option>
                </select>
              </div>
              <div>
                <Label>Persona</Label>
                <select value={newFit} onChange={(event) => setNewFit(event.target.value as CrmPersonaFit)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  <option value="AAA">AAA</option>
                  <option value="HIGH_TICKET">High ticket</option>
                  <option value="MEDIUM">Médio</option>
                  <option value="LOW_FIT">Baixo fit</option>
                  <option value="UNKNOWN">A validar</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <LiquidButton type="submit" size="sm">
                  <Plus className="h-4 w-4" />
                  Criar contato e oportunidade
                </LiquidButton>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-brand-dourado/30">
          <CardHeader>
            <CardTitle>Mover card com automação operacional</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDeal ? (
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleMoveDeal}>
                <div className="sm:col-span-2 rounded-lg bg-brand-papel/70 p-3">
                  <p className="font-semibold text-brand-musgo">{selectedDeal.title}</p>
                  <p className="text-sm text-muted-foreground">Atual: {dealStageLabels[selectedDeal.stage]}</p>
                </div>
                <div>
                  <Label>Nova etapa</Label>
                  <select value={targetStage} onChange={(event) => setTargetStage(event.target.value as CrmDealStage)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                    {dealStages.map((stage) => <option key={stage} value={stage}>{dealStageLabels[stage]}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Valor prescrito</Label>
                  <Input value={prescribed} onChange={(event) => setPrescribed(event.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <Label>Valor vendido</Label>
                  <Input value={sold} onChange={(event) => setSold(event.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <Label>Valor recebido</Label>
                  <Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <Label>Categoria da objeção</Label>
                  <select value={objectionCategory} onChange={(event) => setObjectionCategory(event.target.value as CrmObjectionCategory)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                    {objectionOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Objeção / motivo</Label>
                  <Input value={objection} onChange={(event) => setObjection(event.target.value)} placeholder="Obrigatório se não fechou" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Motivo do parcial</Label>
                  <Input value={partialReason} onChange={(event) => setPartialReason(event.target.value)} placeholder="Obrigatório se fechou parcial" />
                </div>
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <Button type="submit">
                    Mover e gerar tarefas
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setSelectedDealId("")}>Limpar</Button>
                </div>
              </form>
            ) : (
              <div className="rounded-lg border border-dashed border-brand-oliva/30 bg-white/45 p-5 text-sm text-muted-foreground">
                Escolha um card do Kanban para movimentar. O app valida valor, objeção e cria tarefas automaticamente.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {feedback ? (
        <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/70 p-3 text-sm text-brand-tinta">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {feedback}
        </div>
      ) : null}

      <section className="rounded-lg border border-brand-oliva/15 bg-white/45 p-3 shadow-sm backdrop-blur-xl">
        <div className="grid gap-2 md:grid-cols-[1.4fr_0.7fr]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Buscar lead, paciente, origem ou objeção" />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-12 w-full rounded-md border border-input bg-white/72 px-3 text-sm shadow-sm backdrop-blur-xl">
            <option value="">Todos os status</option>
            <option value="OPEN">Abertos</option>
            <option value="WON_FULL">Ganhos completos</option>
            <option value="WON_PARTIAL">Ganhos parciais</option>
            <option value="LOST">Perdidos</option>
          </select>
        </div>
      </section>

      <div className="mobile-scrollbar-none overflow-x-auto pb-3">
        <div className="grid w-max grid-flow-col auto-cols-[minmax(232px,252px)] gap-3">
          {dealStages.map((stage) => {
            const stageDeals = visibleDeals.filter((deal) => deal.stage === stage);
            const total = stageDeals.reduce((sum, deal) => sum + (deal.soldAmount || deal.estimatedValue * (stageProbability(stage) / 100)), 0);

            return (
              <section key={stage} className="rounded-lg border border-brand-oliva/14 bg-white/40 p-2 backdrop-blur-xl">
                <div className="mb-2 rounded-md bg-brand-musgo px-3 py-2 text-brand-papel">
                  <p className="text-sm font-semibold">{dealStageLabels[stage]}</p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-brand-papel/75">
                    <span>{stageDeals.length} cards</span>
                    {canSeeValue ? <span>{moneyCrm(total)}</span> : null}
                  </div>
                </div>
                <div className="grid gap-2">
                  {stageDeals.length ? (
                    stageDeals.map((deal) => {
                      const contact = contactsById.get(deal.contactId);
                      const phone = contact ? (contact.whatsapp || contact.phone).replace(/\D/g, "") : "";
                      return (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          contactName={contactDisplayName(contact)}
                          contactPhone={phone}
                          canSeeValue={canSeeValue}
                          onSelect={() => selectDeal(deal)}
                        />
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-center text-xs text-muted-foreground">
                      Sem cards
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
          <CircleDollarSign className="h-5 w-5 text-brand-musgo" />
          <p className="mt-2 text-sm font-semibold text-brand-musgo">Vendidos pelo CRM</p>
          <p className="text-2xl font-bold text-brand-musgo">{canSeeValue ? moneyCrm(state.deals.reduce((sum, deal) => sum + deal.soldAmount, 0)) : "Restrito"}</p>
        </div>
        <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
          <MessageCircle className="h-5 w-5 text-brand-musgo" />
          <p className="mt-2 text-sm font-semibold text-brand-musgo">Sem próxima ação</p>
          <p className="text-2xl font-bold text-brand-musgo">
            {state.deals.filter((deal) => deal.status === "OPEN" && !state.tasks.some((task) => task.dealId === deal.id && !["DONE", "CANCELED", "SKIPPED"].includes(task.status))).length}
          </p>
        </div>
        <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
          <AlertTriangle className="h-5 w-5 text-brand-musgo" />
          <p className="mt-2 text-sm font-semibold text-brand-musgo">Validações ativas</p>
          <p className="text-sm leading-6 text-muted-foreground">Não fechou exige objeção. Fechou exige valor. Parcial exige motivo.</p>
        </div>
      </div>
    </div>
  );
}
