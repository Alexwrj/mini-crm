begin;

alter table public.task_status_history enable row level security;
revoke all privileges on public.task_status_history from public, anon, authenticated;
grant select on public.task_status_history to authenticated;
create policy history_select_visible_task on public.task_status_history
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

-- Preserve creation validation; add only the initial audit row in the same transaction.
create or replace function public.create_task(
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
  perform 1 from public.profiles p where p.id = p_assignee_id and p.role = 'executor' for share;
  if not found then
    raise exception using errcode = '23514', message = 'Исполнителем должен быть пользователь с ролью executor.';
  end if;
  insert into public.tasks (object_id, assignee_id, author_id, title, description, status)
    values (p_object_id, p_assignee_id, caller, p_title, p_description, 'new')
    returning * into result;
  insert into public.task_status_history (task_id, actor_id, from_status, to_status, created_at)
    values (result.id, caller, null, 'new', pg_catalog.clock_timestamp());
  return result;
end;
$$;

create function public.transition_task(
  p_task_id uuid, p_target_status text, p_comment text default null
) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  current_task public.tasks;
  previous_status text;
begin
  select p.role into caller_role from public.profiles p where p.id = caller;
  if caller is null or caller_role is null then
    raise exception using errcode = '42501', message = 'Требуется пользователь с профилем.';
  end if;
  select t.* into current_task from public.tasks t where t.id = p_task_id for update;
  if not found or (caller_role = 'executor' and current_task.assignee_id <> caller) then
    raise exception using errcode = '42501', message = 'Задача недоступна.';
  end if;
  if not (
    (caller_role = 'executor' and current_task.assignee_id = caller and (
      (current_task.status in ('new', 'rework') and p_target_status = 'in_progress')
      or (current_task.status = 'in_progress' and p_target_status = 'in_review')
    ))
    or (caller_role = 'manager' and current_task.status = 'in_review'
      and p_target_status in ('accepted', 'rework'))
  ) or p_target_status is null then
    raise exception using errcode = '40001', message = 'Переход недоступен в текущем состоянии задачи. Обновите данные.';
  end if;
  if p_target_status = 'rework' and (p_comment is null or p_comment !~ '[^[:space:]]') then
    raise exception using errcode = '22023', message = 'Укажите непустой комментарий для доработки.';
  end if;
  previous_status := current_task.status;
  update public.tasks set status = p_target_status where id = p_task_id returning * into current_task;
  insert into public.task_status_history (task_id, actor_id, from_status, to_status, comment, created_at)
    values (p_task_id, caller, previous_status, p_target_status, p_comment, pg_catalog.clock_timestamp());
  return current_task;
end;
$$;

create function public.reassign_task(p_task_id uuid, p_assignee_id uuid)
returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_task public.tasks;
begin
  if caller is null or not exists (
    select 1 from public.profiles p where p.id = caller and p.role = 'manager'
  ) then
    raise exception using errcode = '42501', message = 'Переназначать задачи может только постановщик.';
  end if;
  select t.* into current_task from public.tasks t where t.id = p_task_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Задача недоступна.';
  end if;
  perform 1 from public.profiles p where p.id = p_assignee_id and p.role = 'executor' for share;
  if not found then
    raise exception using errcode = '23514', message = 'Исполнителем должен быть пользователь с ролью executor.';
  end if;
  -- Genuine no-op: no UPDATE, timestamp change or extra audit event.
  if current_task.assignee_id = p_assignee_id then return current_task; end if;
  update public.tasks set assignee_id = p_assignee_id where id = p_task_id returning * into current_task;
  return current_task;
end;
$$;

-- Explicit owner: the standard Supabase migration/admin role, never an API role.
alter function public.create_task(uuid, uuid, text, text) owner to postgres;
alter function public.transition_task(uuid, text, text) owner to postgres;
alter function public.reassign_task(uuid, uuid) owner to postgres;
revoke all on function public.create_task(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.transition_task(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reassign_task(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_task(uuid, uuid, text, text) to authenticated;
grant execute on function public.transition_task(uuid, text, text) to authenticated;
grant execute on function public.reassign_task(uuid, uuid) to authenticated;

-- Existing status/assignee column restrictions and business policies are unchanged.
-- No historical backfill, direct audit writes or new history of assignments.
commit;
