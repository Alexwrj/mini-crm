begin;

alter table public.objects enable row level security;
alter table public.tasks enable row level security;
revoke all privileges on table public.objects, public.tasks from public, anon, authenticated;
grant select, delete on public.objects, public.tasks to authenticated;
grant insert (name, address), update (name, address) on public.objects to authenticated;
grant update (title, description) on public.tasks to authenticated;

-- Acyclic: profiles -> no business tables; tasks -> profiles;
-- objects -> profiles/tasks. No task policy queries objects.
create policy tasks_select_visible on public.tasks for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and (p.role = 'manager' or (p.role = 'executor' and assignee_id = p.id)))
);
create policy tasks_update_manager on public.tasks for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'manager'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'manager'));
create policy tasks_delete_manager on public.tasks for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'manager'));

create policy objects_select_visible on public.objects for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'manager')
  or exists (select 1 from public.tasks t where t.object_id = objects.id and t.assignee_id = (select auth.uid()))
);
create policy objects_insert_manager on public.objects for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'manager'));
create policy objects_update_manager on public.objects for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'manager'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'manager'));
create policy objects_delete_manager on public.objects for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'manager'));

-- Critical creation has no browser-supplied author/status/ID/time parameters.
create function public.create_task(
  p_object_id uuid, p_assignee_id uuid, p_title text, p_description text default null
) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  result public.tasks;
begin
  if caller is null or not exists (
    select 1 from public.profiles p where p.id = caller and p.role = 'manager'
  ) then
    raise exception using errcode = '42501', message = 'Создавать задачи может только постановщик.';
  end if;
  -- Hold the assignee role stable for the duration of this transaction.
  perform 1 from public.profiles p where p.id = p_assignee_id and p.role = 'executor' for share;
  if not found then
    raise exception using errcode = '23514', message = 'Исполнителем должен быть пользователь с ролью executor.';
  end if;
  insert into public.tasks (object_id, assignee_id, author_id, title, description, status)
    values (p_object_id, p_assignee_id, caller, p_title, p_description, 'new')
    returning * into result;
  return result;
end;
$$;

-- Do not widen profiles RLS or expose an unrestricted Auth-user directory.
create function public.list_executors() returns table (id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager'
  ) then
    raise exception using errcode = '42501', message = 'Список исполнителей доступен только постановщику.';
  end if;
  return query select p.id, u.email::text from public.profiles p
    join auth.users u on u.id = p.id where p.role = 'executor' order by u.email;
end;
$$;

revoke all on function public.create_task(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.list_executors() from public, anon, authenticated;
grant execute on function public.create_task(uuid, uuid, text, text) to authenticated;
grant execute on function public.list_executors() to authenticated;

-- No grants/policies for history and no status-transition RPCs.
commit;
