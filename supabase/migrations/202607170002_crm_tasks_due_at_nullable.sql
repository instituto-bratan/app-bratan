-- Permite tarefa SEM prazo (due_at NULL): item "parado" que só entra na fila do
-- dia quando houver movimentação. Ex.: leads importados do LinkedIn que ficam
-- em espera — sem data de validade, nunca aparecem como "atrasados".
alter table public.crm_tasks alter column due_at drop not null;
