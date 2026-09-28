-- PROPOSTA — NÃO APLICADA, NÃO É MIGRATION (28/09/2026)
-- Fica fora de supabase/migrations de propósito: "supabase db push" não pega.
-- Quando aprovada, vira supabase/migrations/<data>_portal_senha_bcrypt.sql
-- junto com a mudança na função portal-paciente (ver README.md, seção 6).
--
-- Hoje: senha_hash = sha256("<id do acesso>:<senha>") em hex, feito na Edge
-- Function. SHA-256 é rápido de propósito; com o hash e o id na mão (e até a
-- RLS nova, qualquer colaborador logado tinha os dois), uma senha de 8
-- caracteres cai por força bruta em pouco tempo numa placa de vídeo comum.
--
-- Proposta: bcrypt pelo pgcrypto (mesmo caminho de conferir_senha_gestor,
-- 202609100001), custo 10 (o padrão do gen_salt('bf') é 6). O hash nunca sai
-- do banco: a função confere e devolve só true/false. Quem ainda tem hash
-- antigo é conferido do jeito antigo UMA vez e regravado em bcrypt ali mesmo.
--
-- Os hashes de token do link e de sessão continuam SHA-256: são 256 bits
-- aleatórios, não dá para adivinhar, e bcrypt ali só custaria CPU.

-- Define login e senha de uma vez (criar_senha), já em bcrypt.
create or replace function public.portal_senha_definir(_acesso_id uuid, _login text, _senha text)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  if length(coalesce(_senha, '')) < 8 then
    raise exception 'A senha precisa de pelo menos 8 caracteres.';
  end if;
  -- bcrypt só usa os primeiros 72 bytes; acima disso a senha seria cortada em silêncio.
  if octet_length(_senha) > 72 then
    raise exception 'Senha longa demais para o bcrypt (máximo de 72 bytes).';
  end if;
  update public.paciente_acesso
     set login = _login,
         senha_hash = crypt(_senha, gen_salt('bf', 10)),
         senha_criada_em = now(),
         tentativas = 0,
         bloqueado_ate = null
   where id = _acesso_id
     and revogado_em is null;
  if not found then
    raise exception 'Acesso não encontrado ou revogado.';
  end if;
end;
$$;

-- Confere a senha (entrar_senha). Rehash no próximo login: hash antigo que
-- bate vira bcrypt na mesma transação.
create or replace function public.portal_senha_conferir(_acesso_id uuid, _senha text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  _hash text;
begin
  select senha_hash into _hash
    from public.paciente_acesso
   where id = _acesso_id
     and revogado_em is null
   for update;
  if _hash is null then
    return false;
  end if;

  if left(_hash, 2) = '$2' then
    return crypt(_senha, _hash) = _hash;
  end if;

  -- Legado: igual a hashDaSenha() da função portal-paciente até 28/09/2026.
  if encode(digest(_acesso_id::text || ':' || _senha, 'sha256'), 'hex') = _hash then
    update public.paciente_acesso
       set senha_hash = crypt(_senha, gen_salt('bf', 10))
     where id = _acesso_id;
    return true;
  end if;

  return false;
end;
$$;

-- Só a Edge Function (chave de serviço) chama. Nem a equipe, nem o anônimo.
revoke all on function public.portal_senha_definir(uuid, text, text) from public, anon, authenticated;
revoke all on function public.portal_senha_conferir(uuid, text) from public, anon, authenticated;
grant execute on function public.portal_senha_definir(uuid, text, text) to service_role;
grant execute on function public.portal_senha_conferir(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- PASSO FINAL, SEPARADO, ~90 dias depois (a sessão do portal dura 90 dias):
-- quem não entrou com senha nesse tempo ainda tem hash antigo. Zerar esses
-- hashes obriga a criar senha nova pelo link — o paciente não perde dado, só
-- a senha. Conferir antes quantos são (bloco 8 de conferir-producao.sql).
--
-- update public.paciente_acesso
--    set senha_hash = null
--  where senha_hash is not null
--    and left(senha_hash, 2) <> '$2';
