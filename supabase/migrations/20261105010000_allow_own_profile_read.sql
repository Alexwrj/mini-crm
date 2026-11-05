begin;

alter table public.profiles enable row level security;
revoke all privileges on table public.profiles from public, anon, authenticated;
grant select (id, role) on table public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- Business tables remain closed exactly as in Stage 2.
commit;
