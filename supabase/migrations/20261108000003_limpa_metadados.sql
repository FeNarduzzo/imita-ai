-- O Auth do Supabase regrava os metadados do cadastro logo depois de criar o usuário,
-- desfazendo a limpeza feita em handle_new_user. Esta regra tira de vez a data de nascimento
-- e os dados do responsável do token (eles ficam só em public.profiles).
create or replace function public.strip_user_meta()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
    - 'birthdate' - 'guardian_name' - 'guardian_email' - 'guardian_consent' - 'terms_version';
  return new;
end $$;

revoke execute on function public.strip_user_meta() from public, anon, authenticated;

create trigger strip_user_meta before update on auth.users
  for each row
  when (new.raw_user_meta_data ?| array['birthdate', 'guardian_name', 'guardian_email', 'guardian_consent', 'terms_version'])
  execute function public.strip_user_meta();

-- Limpa quem já se cadastrou.
update auth.users set raw_user_meta_data = raw_user_meta_data
where raw_user_meta_data ?| array['birthdate', 'guardian_name', 'guardian_email', 'guardian_consent', 'terms_version'];
