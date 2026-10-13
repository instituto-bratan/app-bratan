// SEGURANÇA — redesenho Papel & Musgo, etapa 4 (08/10/2026).
//
// Visão operacional dos acessos: quem está ativo, com e sem login, desligados,
// os sinais de segurança e os eventos sensíveis da auditoria. Mudou só a forma:
// um cabeçalho com a frase dos pontos de atenção, os quatro números numa faixa
// de leitura (saber), os sinais e os cadastros para revisar em folhas com lista,
// e os eventos sensíveis ao lado. Os sinais (buildSecuritySignals) não mudaram:
// e-mail próprio continua sendo INFORMAÇÃO, nunca vermelho (25/08/2026).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, MailWarning, ShieldCheck } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Cabecalho, LinkSeta } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao, cargoLabels, isCoordenacao, seededColaboradores } from "@/lib/access";
import { readLocalValue } from "@/lib/localStore";
import { listRemoteAuditEvents, listRemoteColaboradores } from "@/lib/remoteData";
import type { Colaborador } from "@/types/database";
import { auditActionLabel, auditEntityLabel } from "./auditoriaData";
import { colaboradoresStorageKey } from "./colaboradoresData";
import { contagem, etiquetaDoSinal } from "./frasesAjustes";
import { CabecaDaFolha, Etiqueta, FaixaDeNumeros, IconeDaSituacao, NumeroComFrase, Recado, TituloDoSaber, Vazio } from "./pecasAjustes";

type RiskLevel = "ok" | "attention" | "critical";

type SecuritySignal = {
  title: string;
  description: string;
  level: RiskLevel;
};

function isInstitutionalEmail(email: string) {
  return email.toLowerCase().endsWith("@institutobratan.com.br");
}

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function buildSecuritySignals(colaboradores: Colaborador[], hasRemoteAudit: boolean): SecuritySignal[] {
  const ativos = colaboradores.filter((colaborador) => colaborador.ativo);
  const coordenacaoAtiva = ativos.filter((colaborador) => isCoordenacao(colaborador.cargo));
  const semLogin = ativos.filter((colaborador) => !colaborador.auth_id);
  const emailsExternos = colaboradores.filter((colaborador) => !isInstitutionalEmail(colaborador.email));
  const desligadosComLogin = colaboradores.filter((colaborador) => !colaborador.ativo && colaborador.auth_id);

  const signals: SecuritySignal[] = [
    {
      title: "Coordenação ativa",
      description:
        coordenacaoAtiva.length >= 2
          ? `${coordenacaoAtiva.length} perfis de coordenação ativos.`
          : "Mantenha ao menos dois perfis de coordenação ativos para contingência.",
      level: coordenacaoAtiva.length >= 2 ? "ok" : "critical",
    },
    {
      title: "Colaboradores sem login",
      description:
        semLogin.length === 0
          ? "Todos os colaboradores ativos têm login criado."
          : `${semLogin.length} colaborador(es) ativo(s) ainda sem login.`,
      level: semLogin.length === 0 ? "ok" : "attention",
    },
    {
      // E-MAIL PRÓPRIO É PERMITIDO (25/08/2026): a nutricionista não tem e-mail
      // da casa, e barrar isso deixava gente da equipe sem acesso. Então isto
      // deixou de ser FALHA e virou INFORMAÇÃO — antes ficava vermelho para
      // sempre, e alarme que nunca apaga ninguém mais olha.
      title: "E-mails institucionais",
      description:
        emailsExternos.length === 0
          ? "Todos os cadastros usam e-mail institucional."
          : `${emailsExternos.length} pessoa(s) usam e-mail próprio (permitido). A caixa não é nossa: para tirar o acesso, desative o colaborador aqui no app.`,
      level: "ok",
    },
    {
      title: "Desligados sem acesso",
      description:
        desligadosComLogin.length === 0
          ? "Nenhum colaborador desligado mantém vínculo de login."
          : `${desligadosComLogin.length} desligado(s) ainda com auth_id vinculado.`,
      level: desligadosComLogin.length === 0 ? "ok" : "critical",
    },
    {
      title: "Auditoria operacional",
      description: hasRemoteAudit ? "Eventos sensíveis estão sendo registrados." : "Sem eventos remotos carregados nesta sessão.",
      level: hasRemoteAudit ? "ok" : "attention",
    },
  ];

  return signals;
}

export function SegurancaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const localColaboradores = useMemo(() => readLocalValue(colaboradoresStorageKey, seededColaboradores), []);
  const colaboradoresQuery = useQuery({
    queryKey: ["colaboradores"],
    queryFn: listRemoteColaboradores,
    enabled: useRemote,
  });
  const auditQuery = useQuery({
    queryKey: ["audit-events"],
    queryFn: listRemoteAuditEvents,
    enabled: useRemote,
  });

  const colaboradores = useRemote ? colaboradoresQuery.data ?? [] : localColaboradores;
  const eventos = auditQuery.data ?? [];
  const ativos = colaboradores.filter((colaborador) => colaborador.ativo);
  const comLogin = ativos.filter((colaborador) => Boolean(colaborador.auth_id));
  const semLogin = ativos.filter((colaborador) => !colaborador.auth_id);
  const desligados = colaboradores.filter((colaborador) => !colaborador.ativo);
  const coordenacaoAtiva = ativos.filter((colaborador) => isCoordenacao(colaborador.cargo));
  const signals = buildSecuritySignals(colaboradores, useRemote && eventos.length > 0);
  const sensitiveEvents = eventos.filter((event) =>
    ["auth.", "colaborador."].some((prefix) => event.action.startsWith(prefix)),
  );
  const attentionCount = signals.filter((signal) => signal.level !== "ok").length;

  const fraseDoTopo = (
    <>
      {attentionCount ? (
        <span className="alerta">{contagem(attentionCount, "ponto pede atenção", "pontos pedem atenção")}.</span>
      ) : (
        <strong>Nenhum ponto pede atenção.</strong>
      )}{" "}
      {contagem(ativos.length, "pessoa ativa", "pessoas ativas")}, {comLogin.length} com login. Revise a lista sempre que alguém mudar de função ou sair da equipe.
    </>
  );

  return (
    <AccessGate allowed={canAdministracao} label="Segurança">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho className="mb-0 max-md:mb-0" sobrancelha="Ajustes" titulo="Segurança" frase={fraseDoTopo} />

        <FaixaDeNumeros rotulo="Acessos em números">
          <NumeroComFrase rotulo="Ativos" numero={ativos.length} frase={`${coordenacaoAtiva.length} em coordenação`} />
          <NumeroComFrase rotulo="Com login" numero={comLogin.length} frase="Acessos vinculados ao login" />
          <NumeroComFrase rotulo="Sem login" numero={semLogin.length} tom={semLogin.length ? "atencao" : undefined} frase="Ativos aguardando criação de acesso" />
          <NumeroComFrase rotulo="Desligados" numero={desligados.length} frase="Histórico preservado, fora da operação" />
        </FaixaDeNumeros>

        {(colaboradoresQuery.isError || auditQuery.isError) ? (
          <Recado tom="erro">Não foi possível carregar todos os dados de segurança. Confira migrations, RLS e permissões da conta.</Recado>
        ) : null}

        <div className="grid items-start gap-8 max-md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          <div className="grid min-w-0 gap-8 max-md:gap-6">
            <BlocoFolha as="section" aria-labelledby="sinais-seguranca" className="min-w-0 overflow-hidden">
              <CabecaDaFolha
                id="sinais-seguranca"
                icone={<ShieldCheck />}
                titulo="Sinais de segurança"
                resumo={attentionCount ? `${attentionCount} de ${signals.length} pedem atenção` : `${signals.length} em ordem`}
              />
              <ul>
                {signals.map((signal) => {
                  const etiqueta = etiquetaDoSinal(signal.level);
                  return (
                    <li key={signal.title} className="flex items-start gap-3 border-t border-fio px-6 py-4 max-md:px-4">
                      <IconeDaSituacao ok={signal.level === "ok"} tom={signal.level === "critical" ? "erro" : "atencao"} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold leading-6 text-tinta">{signal.title}</p>
                        <p className="mt-0.5 text-sm font-medium leading-[22px] text-tinta-2">{signal.description}</p>
                      </div>
                      <Etiqueta tom={etiqueta.tom}>{etiqueta.palavra}</Etiqueta>
                    </li>
                  );
                })}
              </ul>
            </BlocoFolha>

            <BlocoFolha as="section" aria-labelledby="cadastros-revisar" className="min-w-0 overflow-hidden">
              <CabecaDaFolha
                id="cadastros-revisar"
                icone={<MailWarning />}
                titulo="Cadastros para revisar"
                resumo={semLogin.length ? `${semLogin.length} sem login${semLogin.length > 8 ? " · os 8 primeiros" : ""}` : undefined}
                acoes={<LinkSeta to="/administracao/colaboradores">Abrir colaboradores</LinkSeta>}
              />
              <ul>
                {/* Só quem está SEM LOGIN é pendência de verdade. E-mail próprio
                    é permitido desde 25/08/2026 — se entrasse nesta lista, a
                    nutricionista ficaria "para revisar" para sempre. O selo
                    continua aparecendo como contexto de quem cair aqui. */}
                {semLogin.slice(0, 8).map((colaborador) => (
                  <li key={`${colaborador.id}-${colaborador.email}`} className="flex flex-col gap-2 border-t border-fio px-6 py-3.5 max-md:px-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold leading-5 text-tinta">{colaborador.nome}</p>
                      <p className="truncate text-[13px] font-medium leading-5 text-tinta-2">{colaborador.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Etiqueta>{cargoLabels[colaborador.cargo]}</Etiqueta>
                      {!colaborador.auth_id ? <Etiqueta tom="atencao">sem login</Etiqueta> : null}
                      {!isInstitutionalEmail(colaborador.email) ? <Etiqueta>e-mail externo</Etiqueta> : null}
                    </div>
                  </li>
                ))}
              </ul>
              {semLogin.length === 0 ? (
                <Vazio icone={<ShieldCheck />} titulo="Nenhum cadastro pendente nesta lista." className="border-t border-fio">
                  Todo colaborador ativo já tem login criado.
                </Vazio>
              ) : null}
            </BlocoFolha>
          </div>

          <BlocoSaber as="aside" aria-labelledby="eventos-sensiveis" className="grid min-w-0 gap-4 lg:sticky lg:top-24">
            <TituloDoSaber id="eventos-sensiveis" className="mb-0" resumo={sensitiveEvents.length ? `${Math.min(6, sensitiveEvents.length)} mais recentes` : undefined}>
              <span className="inline-flex items-center gap-2">
                <History className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                Eventos sensíveis
              </span>
            </TituloDoSaber>
            {sensitiveEvents.length ? (
              <ul className="grid">
                {sensitiveEvents.slice(0, 6).map((event) => (
                  <li key={event.id} className="grid gap-1 border-t border-fio py-3 first:border-t-0 first:pt-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Etiqueta tom="musgo">{auditEntityLabel(event.entity)}</Etiqueta>
                      <span className="text-xs font-bold leading-4 tabular-nums text-tinta-2">{formatDateTime(event.createdAt)}</span>
                    </p>
                    <p className="text-sm font-bold leading-5 text-tinta">{auditActionLabel(event.action)}</p>
                    <p className="truncate text-[13px] font-medium leading-5 text-tinta-2">{event.actorName}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-medium leading-6 text-tinta-2">Nenhum evento sensível carregado nesta sessão.</p>
            )}
            <div className="border-t border-fio pt-4">
              <p className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Próximo controle</p>
              <p className="mt-2 text-sm font-medium leading-6 text-tinta-2">
                Revisar a lista de colaboradores ativos sempre que alguém mudar de função ou sair da equipe.
              </p>
            </div>
          </BlocoSaber>
        </div>
      </div>
    </AccessGate>
  );
}
