-- Ajustes sugeridos pelo verificador de desempenho do Supabase.
create index if not exists code_redemptions_user_id_idx on public.code_redemptions (user_id);
create index if not exists promo_codes_item_id_idx on public.promo_codes (item_id);
alter table public.redeem_fails add column if not exists id bigint generated always as identity primary key;
