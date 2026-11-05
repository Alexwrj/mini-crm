begin;

-- Only expose participant emails within history accessible to the caller.
create function public.read_task_history(p_task_id uuid)
returns table (
  id uuid, task_id uuid, actor_id uuid, from_status text, to_status text,
  comment text, created_at timestamptz, actor_email text
)
language sql stable security definer set search_path = '' as $$
  select h.id, h.task_id, h.actor_id, h.from_status, h.to_status,
    h.comment, h.created_at, u.email::text
  from public.task_status_history h
  join public.tasks t on t.id = h.task_id
  join public.profiles caller on caller.id = auth.uid()
  left join auth.users u on u.id = h.actor_id
  where h.task_id = p_task_id
    and (caller.role = 'manager'
      or (caller.role = 'executor' and t.assignee_id = caller.id))
  order by h.created_at, h.id;
$$;

alter function public.read_task_history(uuid) owner to postgres;
revoke all on function public.read_task_history(uuid) from public, anon, authenticated;
grant execute on function public.read_task_history(uuid) to authenticated;

commit;
