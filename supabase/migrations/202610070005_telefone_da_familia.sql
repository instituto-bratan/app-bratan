-- O TELEFONE DA FAMÍLIA (07/10/2026)
--
-- O Lucas não achava a Simone Aparecida Paulo de Lima na aba Pacientes. Ela e o
-- filho (Murilo de Paula) usam o mesmo telefone, e o banco tinha um índice
-- único — criado à mão, fora das migrações — que proibia duas fichas com o
-- mesmo número. O fechamento dela (15/09) caiu na ficha do filho: comanda,
-- comprovante, negócio do Kanban e o CPF da nota iriam para a pessoa errada.
-- O mesmo aconteceu com Eliane × Noaldo (casal).
--
-- Agora o único é TELEFONE + PRIMEIRO NOME: a mesma pessoa continua barrada
-- (o que o índice antigo queria evitar — duplicata por recarga/aparelho), e
-- mãe, filho e marido com o mesmo número têm cada um a sua ficha. O app
-- também passou a comparar o nome antes de casar por telefone ou e-mail.
-- Idempotente.

drop index if exists public.crm_contacts_phone_unique;

create unique index if not exists crm_contacts_telefone_e_nome_unique
  on public.crm_contacts (
    regexp_replace(coalesce(nullif(whatsapp, ''), phone, ''), '\D', '', 'g'),
    lower(split_part(btrim(full_name), ' ', 1))
  )
  where archived_at is null
    and coalesce(regexp_replace(coalesce(nullif(whatsapp, ''), phone, ''), '\D', '', 'g'), '') <> '';
