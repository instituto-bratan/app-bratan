create unique index if not exists uq_estaleca_reversal_original_transaction
on public.estaleca_transactions ((metadata ->> 'originalTransactionId'))
where type = 'reversal'
  and metadata ? 'originalTransactionId';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estaleca_reversal_amount_negative'
      and conrelid = 'public.estaleca_transactions'::regclass
  ) then
    alter table public.estaleca_transactions
      add constraint estaleca_reversal_amount_negative
      check (type <> 'reversal' or amount < 0);
  end if;
end
$$;
