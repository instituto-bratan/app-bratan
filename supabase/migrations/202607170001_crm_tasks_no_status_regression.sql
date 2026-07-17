-- Impede que uma tarefa CONCLUÍDA volte a "pendente" por sync de visão parcial.
--
-- A RLS de crm_tasks (202606240016) esconde as tarefas de outros papéis, mas
-- crm_cadence_enrollments e crm_deals são visíveis a qualquer leitor do CRM. Um
-- cliente de visão parcial (recepção/concierge/enfermagem) roda o motor de
-- cadências às cegas: não enxerga a tarefa DONE de um colega, regenera essa
-- mesma tarefa como PENDING (id determinístico idêntico) e o upsert do sync
-- reverteria a conclusão no banco — a origem real do "concluo a tarefa e ela
-- volta para atrasada" entre papéis.
--
-- Guarda no banco: quem NÃO é coordenação (can_crm_manage) não pode tirar uma
-- tarefa de um estado terminal (DONE/SKIPPED/CANCELED) de volta para um estado
-- aberto (PENDING/IN_PROGRESS). A distinção é por AÇÃO (regressão de status),
-- não por papel/visibilidade: criar uma tarefa nova (insert) e concluir a
-- própria tarefa continuam funcionando; só a reversão às cegas é neutralizada,
-- mantendo a linha como estava. A coordenação continua podendo reabrir.

create or replace function public.crm_tasks_prevent_status_regression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE'
     and OLD.status in ('DONE', 'SKIPPED', 'CANCELED')
     and NEW.status not in ('DONE', 'SKIPPED', 'CANCELED')
     and not public.can_crm_manage(auth.uid())
  then
    -- Mantém a conclusão intacta: descarta a tentativa de reversão.
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_crm_tasks_no_status_regression on public.crm_tasks;
create trigger trg_crm_tasks_no_status_regression
  before update on public.crm_tasks
  for each row execute function public.crm_tasks_prevent_status_regression();
