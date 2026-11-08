-- Imita Aí! — contas, moedas, níveis, itens, códigos, punições e registros de acesso.
--
-- Regras de segurança:
--  * O app só usa a chave pública (publishable). Toda tabela tem RLS.
--  * O jogador só LÊ os próprios dados; a única coluna que ele altera direto é a roupa (look).
--  * Moedas, XP, itens, códigos e punições só mudam por funções no servidor (security definer),
--    que validam tudo e deixam extrato (coin_ledger / xp_ledger / admin_audit).
--  * Registros de acesso (IP, aparelho, data) ficam 6 meses, mesmo se a conta for excluída
--    (segurança e Marco Civil da Internet, art. 15). Punições também continuam valendo.

create extension if not exists pgcrypto with schema extensions;

-- ======================================================================== tabelas

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  username_lower text not null unique,
  birthdate date not null,
  guardian_name text,
  guardian_email text,
  guardian_consent_at timestamptz,
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  role text not null default 'player' check (role in ('player', 'admin')),
  coins integer not null default 60 check (coins >= 0),
  level integer not null default 1,
  look jsonb,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table public.player_xp (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('imitacao', 'karaoke', 'cartas', 'social')),
  xp integer not null default 0 check (xp >= 0),
  primary key (user_id, category)
);

create table public.daily_xp (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  category text not null,
  xp integer not null default 0,
  first_win boolean not null default false,
  primary key (user_id, day, category)
);

create table public.xp_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  amount integer not null,
  reason text not null,
  event_key text,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create table public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null,
  balance integer not null,
  reason text not null,
  event_key text,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

-- Catálogo da loja (cópia dos preços do app; o servidor é quem vale na hora de comprar).
create table public.shop_items (
  id text primary key,
  price integer not null default 0 check (price >= 0),
  exclusive text check (exclusive in ('title', 'code')),
  min_level integer check (min_level between 1 and 50),
  active boolean not null default true
);

create table public.owned_items (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null,
  source text not null default 'loja',
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{4,20}$'),
  coins integer not null default 0 check (coins between 0 and 100000),
  xp jsonb not null default '{}'::jsonb,
  item_id text references public.shop_items (id),
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.code_redemptions (
  code_id uuid not null references public.promo_codes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code_id, user_id)
);

create table public.redeem_fails (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index on public.redeem_fails (user_id, at);

-- Sem chave estrangeira de propósito: a punição e o registro continuam se a conta for excluída.
create table public.punishments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  username text,
  devices text[] not null default '{}',
  ip inet,
  kind text not null check (kind in ('warning', 'suspension', 'ban', 'ip_block')),
  reason text not null check (length(reason) between 3 and 500),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  seen_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid
);
create index on public.punishments (user_id);

create table public.access_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  ip inet,
  device_id text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on public.access_logs (user_id, created_at desc);
create index on public.access_logs (device_id);
create index on public.access_logs (ip);
create index on public.access_logs (created_at);

create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid,
  admin_name text,
  action text not null,
  target_user uuid,
  target_name text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ======================================================================== RLS

alter table public.profiles enable row level security;
alter table public.player_xp enable row level security;
alter table public.daily_xp enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.shop_items enable row level security;
alter table public.owned_items enable row level security;
alter table public.promo_codes enable row level security;
alter table public.code_redemptions enable row level security;
alter table public.redeem_fails enable row level security;
alter table public.punishments enable row level security;
alter table public.access_logs enable row level security;
alter table public.admin_audit enable row level security;

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant update (look) on public.profiles to authenticated;

create policy "ler o próprio perfil" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "trocar a própria roupa" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "ler o próprio XP" on public.player_xp for select to authenticated using (user_id = (select auth.uid()));
create policy "ler o próprio XP do dia" on public.daily_xp for select to authenticated using (user_id = (select auth.uid()));
create policy "ler o próprio extrato de XP" on public.xp_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy "ler o próprio extrato" on public.coin_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy "ler os próprios itens" on public.owned_items for select to authenticated using (user_id = (select auth.uid()));
create policy "catálogo é público" on public.shop_items for select to anon, authenticated using (true);
-- promo_codes, code_redemptions, redeem_fails, punishments, access_logs, admin_audit: sem política = ninguém lê direto.

-- ======================================================================== utilidades

-- Nível pela curva XP(L) = k·L·(L−1). Categoria: k = 50 (nível 50 = 122.500 XP). Geral: k = 120.
create or replace function public.level_for(p_xp bigint, p_k integer)
returns integer language sql immutable set search_path = '' as $$
  select least(50, greatest(1, floor((1 + sqrt(1 + 4.0 * greatest(p_xp, 0) / p_k)) / 2)::integer))
$$;

create or replace function public.title_for(p_level integer)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_level >= 50 then 'Mito' when p_level >= 41 then 'Lenda' when p_level >= 31 then 'Estrela'
    when p_level >= 21 then 'Profissa' when p_level >= 16 then 'Talento' when p_level >= 11 then 'Amador'
    when p_level >= 6 then 'Aprendiz' else 'Noob' end
$$;

create or replace function public._err(p_msg text)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception 'IMITA:%', p_msg using errcode = 'P0001';
end $$;

create or replace function public.client_ip()
returns inet language plpgsql stable set search_path = '' as $$
declare
  h json;
  v text;
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  if h is null then return null; end if;
  v := trim(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', split_part(h ->> 'x-forwarded-for', ',', 1)));
  begin
    return v::inet;
  exception when others then
    return null;
  end;
end $$;

create or replace function public._is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;

create or replace function public._assert_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then perform public._err('Só o admin pode fazer isso.'); end if;
end $$;

-- Punição que está valendo para esta conta, aparelho ou IP (a mais grave primeiro).
create or replace function public._active_block(p_user uuid, p_device text, p_ip inet)
returns public.punishments language sql stable security definer set search_path = '' as $$
  select p.* from public.punishments p
  where p.revoked_at is null and p.starts_at <= now() and (p.ends_at is null or p.ends_at > now())
    and (
      (p.kind in ('suspension', 'ban') and (p.user_id = p_user or (p_device is not null and p_device = any (p.devices))))
      or (p.kind = 'ip_block' and p_ip is not null and p.ip = p_ip)
    )
  order by (p.ends_at is null) desc, p.ends_at desc
  limit 1
$$;

create or replace function public._assert_active()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  b public.punishments;
begin
  if uid is null then perform public._err('Faça login primeiro.'); end if;
  if not exists (select 1 from public.profiles where id = uid) then perform public._err('Conta não encontrada.'); end if;
  b := public._active_block(uid, null, public.client_ip());
  if b.id is not null then
    perform public._err(case when b.kind = 'ban' then 'Conta banida: ' else 'Conta suspensa: ' end || b.reason);
  end if;
  return uid;
end $$;

-- Moedas: soma/subtrai sem deixar negativo; event_key evita contar duas vezes o mesmo evento.
create or replace function public._add_coins(p_user uuid, p_delta integer, p_reason text, p_key text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  bal integer;
  d integer := p_delta;
begin
  if p_key is not null and exists (select 1 from public.coin_ledger where user_id = p_user and event_key = p_key) then
    select coins into bal from public.profiles where id = p_user;
    return bal;
  end if;
  select coins into bal from public.profiles where id = p_user for update;
  if bal is null then perform public._err('Conta não encontrada.'); end if;
  if bal + d < 0 then d := -bal; end if;
  update public.profiles set coins = coins + d where id = p_user returning coins into bal;
  if d <> 0 then
    insert into public.coin_ledger (user_id, delta, balance, reason, event_key) values (p_user, d, bal, left(p_reason, 120), p_key);
  end if;
  return bal;
end $$;

-- XP: soma na categoria, recalcula o nível geral e paga o bônus de subir de nível.
create or replace function public._add_xp(p_user uuid, p_category text, p_amount integer, p_reason text, p_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  old_level integer;
  new_level integer;
  total bigint;
  bonus integer := 0;
  l integer;
  ups jsonb := '[]'::jsonb;
begin
  if p_category not in ('imitacao', 'karaoke', 'cartas', 'social') then perform public._err('Categoria de XP inválida.'); end if;
  if p_key is not null and exists (select 1 from public.xp_ledger where user_id = p_user and event_key = p_key) then
    return jsonb_build_object('duplicate', true);
  end if;
  if p_amount <= 0 then return jsonb_build_object('added', 0); end if;
  select level into old_level from public.profiles where id = p_user for update;
  insert into public.player_xp (user_id, category, xp) values (p_user, p_category, p_amount)
    on conflict (user_id, category) do update set xp = public.player_xp.xp + excluded.xp;
  insert into public.xp_ledger (user_id, category, amount, reason, event_key) values (p_user, p_category, p_amount, left(p_reason, 120), p_key);
  select coalesce(sum(xp), 0) into total from public.player_xp where user_id = p_user;
  new_level := public.level_for(total, 120);
  if new_level > old_level then
    for l in old_level + 1 .. new_level loop
      bonus := bonus + 10 * l + case when l in (6, 11, 16, 21, 31, 41, 50) then 100 else 0 end;
      ups := ups || jsonb_build_object('level', l, 'title', public.title_for(l));
    end loop;
    update public.profiles set level = new_level where id = p_user;
    perform public._add_coins(p_user, bonus, 'subiu para o nível ' || new_level);
  end if;
  return jsonb_build_object('added', p_amount, 'level', new_level, 'levelups', ups, 'bonus_coins', bonus);
end $$;

create or replace function public._audit(p_action text, p_target uuid, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_audit (admin_id, admin_name, action, target_user, target_name, details)
  values ((select auth.uid()), (select username from public.profiles where id = (select auth.uid())), p_action, p_target,
          (select username from public.profiles where id = p_target), coalesce(p_details, '{}'::jsonb));
end $$;

-- ======================================================================== cadastro

-- Cria o perfil quando alguém se cadastra. Os dados vêm de signUp({ options: { data } }).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  u text := trim(coalesce(m ->> 'username', ''));
  b date;
  yrs integer;
  minor boolean;
begin
  if u !~ '^[A-Za-z0-9_.]{3,16}$' then perform public._err('Nome de usuário inválido (3 a 16 letras, números, _ ou .).'); end if;
  if exists (select 1 from public.profiles where username_lower = lower(u)) then perform public._err('Esse nome já está em uso.'); end if;
  begin
    b := (m ->> 'birthdate')::date;
  exception when others then
    b := null;
  end;
  if b is null or b > current_date then perform public._err('Data de nascimento inválida.'); end if;
  yrs := extract(year from age(current_date, b))::integer;
  if yrs < 12 then perform public._err('É preciso ter pelo menos 12 anos para criar conta.'); end if;
  if yrs > 120 then perform public._err('Data de nascimento inválida.'); end if;
  minor := yrs < 18;
  if minor and (
    length(trim(coalesce(m ->> 'guardian_name', ''))) < 3
    or coalesce(m ->> 'guardian_email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    or coalesce((m ->> 'guardian_consent')::boolean, false) is not true
  ) then
    perform public._err('Menores de 18 anos precisam da autorização de um responsável.');
  end if;
  if coalesce(m ->> 'terms_version', '') = '' then perform public._err('É preciso aceitar os Termos de Uso.'); end if;

  insert into public.profiles (id, username, username_lower, birthdate, guardian_name, guardian_email, guardian_consent_at, terms_version)
  values (new.id, u, lower(u), b,
          case when minor then left(trim(m ->> 'guardian_name'), 80) end,
          case when minor then left(lower(trim(m ->> 'guardian_email')), 120) end,
          case when minor then now() end,
          left(m ->> 'terms_version', 20));
  insert into public.player_xp (user_id, category)
    select new.id, c from unnest(array['imitacao', 'karaoke', 'cartas', 'social']) as c;
  insert into public.coin_ledger (user_id, delta, balance, reason) values (new.id, 60, 60, 'boas-vindas');
  -- Tira do token os dados pessoais que só o perfil precisa guardar.
  update auth.users set raw_user_meta_data = jsonb_build_object('username', u) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Só deixa vestir item pago/exclusivo que a pessoa tem.
create or replace function public.check_look()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  if new.look is not null and new.look is distinct from old.look then
    for v in select value from jsonb_each_text(new.look) loop
      if exists (select 1 from public.shop_items s where s.id = v and (s.price > 0 or s.exclusive is not null))
         and not exists (select 1 from public.owned_items o where o.user_id = new.id and o.item_id = v) then
        perform public._err('Você ainda não tem esse item.');
      end if;
    end loop;
  end if;
  return new;
end $$;

create trigger profiles_check_look before update of look on public.profiles
  for each row execute function public.check_look();

create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select trim(p_username) ~ '^[A-Za-z0-9_.]{3,16}$'
     and not exists (select 1 from public.profiles where username_lower = lower(trim(p_username)))
$$;

-- ======================================================================== funções do jogador

-- Chamado logo depois do login (e ao abrir o app): registra o acesso e diz se há punição.
create or replace function public.register_access(p_device text, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  ip inet := public.client_ip();
  b public.punishments;
  warns jsonb;
begin
  if uid is null then perform public._err('Faça login primeiro.'); end if;
  insert into public.access_logs (user_id, ip, device_id, user_agent) values (uid, ip, left(p_device, 64), left(p_user_agent, 300));
  delete from public.access_logs where created_at < now() - interval '6 months';
  update public.profiles set last_seen_at = now() where id = uid;
  b := public._active_block(uid, left(p_device, 64), ip);
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'reason', reason, 'at', created_at) order by created_at), '[]'::jsonb) into warns
    from public.punishments where user_id = uid and kind = 'warning' and seen_at is null and revoked_at is null;
  return jsonb_build_object(
    'blocked', b.id is not null,
    'block', case when b.id is null then null else jsonb_build_object('kind', b.kind, 'reason', b.reason, 'ends_at', b.ends_at) end,
    'warnings', warns);
end $$;

create or replace function public.ack_warning(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.punishments set seen_at = now() where id = p_id and user_id = (select auth.uid()) and kind = 'warning'
$$;

-- Tudo que a tela precisa sobre mim de uma vez.
create or replace function public.me()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  p public.profiles;
  total bigint;
begin
  select * into p from public.profiles where id = uid;
  if p.id is null then return null; end if;
  select coalesce(sum(xp), 0) into total from public.player_xp where user_id = uid;
  return jsonb_build_object(
    'id', p.id, 'username', p.username, 'role', p.role, 'coins', p.coins, 'look', p.look,
    'level', p.level, 'title', public.title_for(p.level), 'total_xp', total,
    'minor', extract(year from age(current_date, p.birthdate)) < 18, 'created_at', p.created_at,
    'xp', (select coalesce(jsonb_object_agg(category, jsonb_build_object('xp', xp, 'level', public.level_for(xp, 50), 'title', public.title_for(public.level_for(xp, 50)))), '{}'::jsonb)
           from public.player_xp where user_id = uid),
    'items', (select coalesce(jsonb_agg(item_id), '[]'::jsonb) from public.owned_items where user_id = uid));
end $$;

create or replace function public.buy_item(p_item text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._assert_active();
  it public.shop_items;
  lvl integer;
  bal integer;
begin
  select * into it from public.shop_items where id = p_item and active;
  if it.id is null then perform public._err('Item não encontrado.'); end if;
  if it.exclusive = 'code' then perform public._err('Esse item só sai por código promocional.'); end if;
  select level into lvl from public.profiles where id = uid;
  if it.min_level is not null and lvl < it.min_level then perform public._err('Precisa chegar ao nível ' || it.min_level || '.'); end if;
  if exists (select 1 from public.owned_items where user_id = uid and item_id = p_item) then perform public._err('Você já tem esse item.'); end if;
  update public.profiles set coins = coins - it.price where id = uid and coins >= it.price returning coins into bal;
  if bal is null then perform public._err('Moedas insuficientes.'); end if;
  insert into public.owned_items (user_id, item_id, source) values (uid, p_item, 'loja');
  if it.price > 0 then
    insert into public.coin_ledger (user_id, delta, balance, reason) values (uid, -it.price, bal, 'loja: ' || p_item);
  end if;
  return jsonb_build_object('coins', bal, 'item', p_item);
end $$;

-- Moedas das mesas (apostas, prêmios). Limites por evento e por dia contra trapaça.
create or replace function public.game_coins(p_delta integer, p_reason text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._assert_active();
  won_today integer;
  d integer := greatest(-1000, least(1000, coalesce(p_delta, 0)));
  bal integer;
begin
  if p_key is null or length(p_key) < 6 then perform public._err('Evento sem identificação.'); end if;
  if d > 0 then
    select coalesce(sum(delta), 0) into won_today from public.coin_ledger
      where user_id = uid and delta > 0 and reason like 'jogo:%' and created_at > date_trunc('day', now());
    d := least(d, greatest(0, 5000 - won_today));
  end if;
  bal := public._add_coins(uid, d, 'jogo: ' || left(coalesce(p_reason, ''), 100), 'g:' || p_key);
  return jsonb_build_object('coins', bal, 'applied', d);
end $$;

-- XP de fim de partida. Até 200 por partida e 1500 por dia em cada categoria; +50 na 1ª vitória do dia.
create or replace function public.grant_xp(p_category text, p_amount integer, p_won boolean, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._assert_active();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  dx public.daily_xp;
  amt integer := greatest(0, least(200, coalesce(p_amount, 0)));
  first boolean := false;
  res jsonb;
begin
  if p_key is null or length(p_key) < 6 then perform public._err('Partida sem identificação.'); end if;
  if exists (select 1 from public.xp_ledger where user_id = uid and event_key = 'x:' || p_key) then
    return jsonb_build_object('duplicate', true);
  end if;
  insert into public.daily_xp (user_id, day, category) values (uid, today, p_category) on conflict do nothing;
  select * into dx from public.daily_xp where user_id = uid and day = today and category = p_category for update;
  if coalesce(p_won, false) and not dx.first_win then first := true; amt := amt + 50; end if;
  amt := least(amt, greatest(0, 1500 - dx.xp));
  update public.daily_xp set xp = xp + amt, first_win = first_win or first where user_id = uid and day = today and category = p_category;
  res := public._add_xp(uid, p_category, amt, case when first then 'partida (1ª vitória do dia)' else 'partida' end, 'x:' || p_key);
  return res || jsonb_build_object('first_win', first, 'capped', amt < least(200, coalesce(p_amount, 0)));
end $$;

create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._assert_active();
  c public.promo_codes;
  k text;
  v text;
  norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  bal integer;
begin
  if (select count(*) from public.redeem_fails where user_id = uid and at > now() - interval '1 hour') >= 10 then
    perform public._err('Muitas tentativas. Tente de novo daqui a pouco.');
  end if;
  select * into c from public.promo_codes where code = norm for update;
  if c.id is null or not c.active or (c.expires_at is not null and c.expires_at < now()) or (c.max_uses is not null and c.uses >= c.max_uses) then
    -- Devolve o erro em vez de lançar exceção: assim a tentativa errada fica gravada (limite de 10 por hora).
    insert into public.redeem_fails (user_id) values (uid);
    delete from public.redeem_fails where at < now() - interval '1 day';
    return jsonb_build_object('error', case when c.id is null then 'Código não existe.' when not c.active then 'Esse código foi desativado.'
                             when c.expires_at is not null and c.expires_at < now() then 'Esse código expirou.' else 'Esse código já se esgotou.' end);
  end if;
  if exists (select 1 from public.code_redemptions where code_id = c.id and user_id = uid) then perform public._err('Você já usou esse código.'); end if;
  insert into public.code_redemptions (code_id, user_id) values (c.id, uid);
  update public.promo_codes set uses = uses + 1 where id = c.id;
  if c.coins > 0 then bal := public._add_coins(uid, c.coins, 'código ' || c.code); end if;
  for k, v in select key, value from jsonb_each_text(c.xp) loop
    perform public._add_xp(uid, k, v::integer, 'código ' || c.code);
  end loop;
  if c.item_id is not null then
    insert into public.owned_items (user_id, item_id, source) values (uid, c.item_id, 'código') on conflict do nothing;
  end if;
  return jsonb_build_object('coins', c.coins, 'xp', c.xp, 'item', c.item_id, 'balance', (select coins from public.profiles where id = uid));
end $$;

-- LGPD, art. 18: excluir a conta apaga perfil, moedas, XP, itens e extratos.
-- Ficam só os registros de acesso (até 6 meses) e as punições, pela segurança do jogo.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then perform public._err('Faça login primeiro.'); end if;
  update public.punishments set username = coalesce(username, (select username from public.profiles where id = uid)) where user_id = uid;
  delete from auth.users where id = uid;
end $$;

-- ======================================================================== admin

create or replace function public.admin_find_users(p_query text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
      select p.id, p.username, p.role, p.level, public.title_for(p.level) as title, p.coins, p.last_seen_at, p.created_at,
             extract(year from age(current_date, p.birthdate)) < 18 as minor,
             (select b.kind from public.punishments b where b.user_id = p.id and b.revoked_at is null and b.kind in ('suspension', 'ban')
                and b.starts_at <= now() and (b.ends_at is null or b.ends_at > now()) limit 1) as blocked
      from public.profiles p
      where coalesce(p_query, '') = '' or p.username_lower like '%' || lower(trim(p_query)) || '%'
      order by p.last_seen_at desc nulls last
      limit 100) t);
end $$;

create or replace function public.admin_user(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  perform public._assert_admin();
  select * into p from public.profiles where id = p_user;
  if p.id is null then perform public._err('Jogador não encontrado.'); end if;
  return jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'username', p.username, 'role', p.role, 'coins', p.coins, 'level', p.level,
      'title', public.title_for(p.level), 'birthdate', p.birthdate, 'guardian_name', p.guardian_name, 'guardian_email', p.guardian_email,
      'created_at', p.created_at, 'last_seen_at', p.last_seen_at, 'look', p.look),
    'xp', (select coalesce(jsonb_object_agg(category, xp), '{}'::jsonb) from public.player_xp where user_id = p_user),
    'items', (select coalesce(jsonb_agg(item_id order by acquired_at), '[]'::jsonb) from public.owned_items where user_id = p_user),
    'access', (select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb) from (
      select host(ip) as ip, device_id, user_agent, created_at from public.access_logs where user_id = p_user order by created_at desc limit 50) a),
    'ips', (select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb) from (
      select host(ip) as ip, count(*) as times, max(created_at) as last from public.access_logs where user_id = p_user and ip is not null group by ip order by max(created_at) desc limit 30) a),
    'same_device', (select coalesce(jsonb_agg(distinct pr.username), '[]'::jsonb) from public.access_logs l
      join public.access_logs o on o.device_id = l.device_id and o.user_id <> l.user_id
      join public.profiles pr on pr.id = o.user_id where l.user_id = p_user),
    'punishments', (select coalesce(jsonb_agg(row_to_json(b) order by b.created_at desc), '[]'::jsonb) from (
      select id, kind, reason, starts_at, ends_at, seen_at, revoked_at, host(ip) as ip, created_at from public.punishments where user_id = p_user) b),
    'ledger', (select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb) from (
      select delta, balance, reason, created_at from public.coin_ledger where user_id = p_user order by created_at desc limit 30) c));
end $$;

-- Dar (ou tirar) moedas, XP e itens de um jogador.
create or replace function public.admin_grant(p_user uuid, p_coins integer, p_category text, p_xp integer, p_item text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  res jsonb := '{}'::jsonb;
begin
  perform public._assert_admin();
  if length(trim(coalesce(p_reason, ''))) < 3 then perform public._err('Escreva o motivo.'); end if;
  if not exists (select 1 from public.profiles where id = p_user) then perform public._err('Jogador não encontrado.'); end if;
  if coalesce(p_coins, 0) <> 0 then
    res := res || jsonb_build_object('coins', public._add_coins(p_user, greatest(-1000000, least(1000000, p_coins)), 'admin: ' || p_reason));
  end if;
  if coalesce(p_xp, 0) > 0 then
    res := res || jsonb_build_object('xp', public._add_xp(p_user, p_category, least(p_xp, 1000000), 'admin: ' || p_reason));
  end if;
  if p_item is not null and p_item <> '' then
    if not exists (select 1 from public.shop_items where id = p_item) then perform public._err('Item não existe no catálogo.'); end if;
    insert into public.owned_items (user_id, item_id, source) values (p_user, p_item, 'admin') on conflict do nothing;
    res := res || jsonb_build_object('item', p_item);
  end if;
  perform public._audit('dar', p_user, jsonb_build_object('coins', p_coins, 'category', p_category, 'xp', p_xp, 'item', p_item, 'reason', p_reason));
  return res;
end $$;

create or replace function public.admin_create_code(p_code text, p_coins integer, p_xp jsonb, p_item text,
  p_max_uses integer, p_expires_at timestamptz, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  k text;
  v text;
  row public.promo_codes;
begin
  perform public._assert_admin();
  if c = '' then
    c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  if c !~ '^[A-Z0-9]{4,20}$' then perform public._err('O código precisa ter de 4 a 20 letras ou números.'); end if;
  if exists (select 1 from public.promo_codes where code = c) then perform public._err('Esse código já existe.'); end if;
  for k, v in select key, value from jsonb_each_text(coalesce(p_xp, '{}'::jsonb)) loop
    if k not in ('imitacao', 'karaoke', 'cartas', 'social') or v !~ '^\d+$' then perform public._err('XP inválido no código.'); end if;
  end loop;
  if coalesce(p_coins, 0) = 0 and coalesce(p_xp, '{}'::jsonb) = '{}'::jsonb and coalesce(p_item, '') = '' then
    perform public._err('O código precisa dar alguma coisa.');
  end if;
  insert into public.promo_codes (code, coins, xp, item_id, max_uses, expires_at, note, created_by)
  values (c, coalesce(p_coins, 0), coalesce(p_xp, '{}'::jsonb), nullif(p_item, ''), p_max_uses, p_expires_at, left(p_note, 200), (select auth.uid()))
  returning * into row;
  perform public._audit('criar código', null, to_jsonb(row));
  return to_jsonb(row);
end $$;

create or replace function public.admin_codes()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from public.promo_codes c);
end $$;

create or replace function public.admin_set_code_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  update public.promo_codes set active = p_active where id = p_id;
  perform public._audit(case when p_active then 'ativar código' else 'desativar código' end, null,
    jsonb_build_object('code', (select code from public.promo_codes where id = p_id)));
end $$;

-- Advertência, suspensão (com prazo) ou banimento. Suspensão e banimento pegam a conta e os aparelhos dela.
-- O bloqueio de IP é separado, sempre com prazo (no Brasil muita gente divide o mesmo IP).
create or replace function public.admin_punish(p_user uuid, p_kind text, p_reason text, p_minutes integer default null, p_ip text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.profiles;
  devs text[];
  row public.punishments;
begin
  perform public._assert_admin();
  if p_kind not in ('warning', 'suspension', 'ban', 'ip_block') then perform public._err('Tipo de punição inválido.'); end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then perform public._err('Escreva o motivo.'); end if;
  if p_kind = 'ip_block' then
    if p_ip is null or coalesce(p_minutes, 0) <= 0 or p_minutes > 43200 then perform public._err('Bloqueio de IP precisa de um IP e de um prazo de até 30 dias.'); end if;
    insert into public.punishments (user_id, username, ip, kind, reason, ends_at, created_by)
    values (p_user, (select username from public.profiles where id = p_user), p_ip::inet, 'ip_block', p_reason, now() + make_interval(mins => p_minutes), (select auth.uid()))
    returning * into row;
  else
    select * into target from public.profiles where id = p_user;
    if target.id is null then perform public._err('Jogador não encontrado.'); end if;
    if target.role = 'admin' then perform public._err('Não dá para punir um admin.'); end if;
    if p_kind = 'suspension' and coalesce(p_minutes, 0) <= 0 then perform public._err('Suspensão precisa de prazo.'); end if;
    select coalesce(array_agg(distinct device_id), '{}') into devs from public.access_logs where user_id = p_user and device_id is not null;
    insert into public.punishments (user_id, username, devices, kind, reason, ends_at, created_by)
    values (p_user, target.username, case when p_kind in ('suspension', 'ban') then devs else '{}' end, p_kind, p_reason,
            case when p_kind = 'suspension' then now() + make_interval(mins => p_minutes) end, (select auth.uid()))
    returning * into row;
  end if;
  perform public._audit('punir: ' || p_kind, p_user, jsonb_build_object('reason', p_reason, 'minutes', p_minutes, 'ip', p_ip));
  return to_jsonb(row);
end $$;

create or replace function public.admin_revoke(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t uuid;
begin
  perform public._assert_admin();
  update public.punishments set revoked_at = now(), revoked_by = (select auth.uid()) where id = p_id and revoked_at is null returning user_id into t;
  perform public._audit('desfazer punição', t, jsonb_build_object('punishment', p_id));
end $$;

create or replace function public.admin_audit_log(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return (select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb) from (
    select admin_name, action, target_name, details, created_at from public.admin_audit order by created_at desc limit least(p_limit, 500)) a);
end $$;

-- "Esqueci a senha": o admin define uma senha nova para o jogador (o jogo não manda e-mail).
create or replace function public.admin_reset_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  if length(coalesce(p_password, '')) < 8 then perform public._err('A senha precisa ter pelo menos 8 caracteres.'); end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')) where id = p_user;
  if not found then perform public._err('Jogador não encontrado.'); end if;
  perform public._audit('nova senha', p_user, '{}'::jsonb);
end $$;

-- ======================================================================== permissões das funções

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.level_for(bigint, integer), public.title_for(integer), public.username_available(text) to anon, authenticated;
grant execute on function
  public.register_access(text, text), public.ack_warning(uuid), public.me(), public.buy_item(text),
  public.game_coins(integer, text, text), public.grant_xp(text, integer, boolean, text), public.redeem_code(text),
  public.delete_my_account(),
  public.admin_find_users(text), public.admin_user(uuid), public.admin_grant(uuid, integer, text, integer, text, text),
  public.admin_create_code(text, integer, jsonb, text, integer, timestamptz, text), public.admin_codes(),
  public.admin_set_code_active(uuid, boolean), public.admin_punish(uuid, text, text, integer, text), public.admin_revoke(uuid),
  public.admin_audit_log(integer), public.admin_reset_password(uuid, text)
to authenticated;

-- ======================================================================== dados iniciais

-- Os códigos que já existiam no app (uma vez por conta).
insert into public.promo_codes (code, coins, note) values
  ('BEMVINDO', 150, 'boas-vindas (já existia no app)'),
  ('IMITAAI', 100, 'código do jogo (já existia no app)');
