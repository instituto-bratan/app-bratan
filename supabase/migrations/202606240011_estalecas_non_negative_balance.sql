create or replace function public.prevent_negative_estaleca_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _available_balance integer;
begin
  if new.status = 'approved' and new.amount < 0 then
    select coalesce(sum(t.amount), 0)::integer
      into _available_balance
    from public.estaleca_transactions t
    where t.user_id = new.user_id
      and t.status = 'approved'
      and (t.expires_at is null or t.expires_at > now())
      and t.id <> new.id;

    if _available_balance + new.amount < 0 then
      raise exception 'estaleca_balance_would_be_negative';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_negative_estaleca_balance on public.estaleca_transactions;
create trigger trg_prevent_negative_estaleca_balance
before insert or update of user_id, amount, status, expires_at
on public.estaleca_transactions
for each row
execute function public.prevent_negative_estaleca_balance();
