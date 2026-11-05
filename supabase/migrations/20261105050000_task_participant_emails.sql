begin;

-- Return author/assignee emails only for a task accessible to the caller.
create function public.read_task(p_task_id uuid)
returns table (
  id uuid, object_id uuid, assignee_id uuid, author_id uuid,
  title text, description text, status text, created_at timestamptz,
  author_email text, assignee_email text
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.object_id, t.assignee_id, t.author_id,
    t.title, t.description, t.status, t.created_at,
    author_user.email::text, assignee_user.email::text
  from public.tasks t
  join public.profiles caller on caller.id = auth.uid()
  left join auth.users author_user on author_user.id = t.author_id
  left join auth.users assignee_user on assignee_user.id = t.assignee_id
  where t.id = p_task_id
    and (caller.role = 'manager'
      or (caller.role = 'executor' and t.assignee_id = caller.id));
$$;

alter function public.read_task(uuid) owner to postgres;
revoke all on function public.read_task(uuid) from public, anon, authenticated;
grant execute on function public.read_task(uuid) to authenticated;

commit;
