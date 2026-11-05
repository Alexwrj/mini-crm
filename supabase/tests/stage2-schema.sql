-- Run as the owner in the disposable cluster via scripts/check-schema.sh.
-- Synthetic UUID fixtures are inserted only into the minimal test auth.users stub.
-- Everything (fixtures and temporary test helpers) is rolled back.
begin;

create temporary table stage2_results (label text not null);

create function pg_temp.ok(condition boolean, label text) returns void
language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  insert into stage2_results values (label);
end;
$$;

create function pg_temp.expect_error(
  command text, expected_state text, label text, expected_constraint text default null
) returns void language plpgsql as $$
declare
  actual_state text;
  actual_constraint text;
begin
  begin
    execute command;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate,
      actual_constraint = constraint_name;
    if actual_state <> expected_state
       or (expected_constraint is not null and actual_constraint <> expected_constraint) then
      raise exception 'FAIL: %, expected % (%), got % (%)',
        label, expected_state, expected_constraint, actual_state, actual_constraint;
    end if;
    insert into stage2_results values (label);
    return;
  end;
  raise exception 'FAIL: %, command unexpectedly succeeded', label;
end;
$$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-000000000001', 'manager'),
  ('00000000-0000-0000-0000-000000000002', 'executor'),
  ('00000000-0000-0000-0000-000000000003', 'manager');
insert into public.objects (id, name, address) values
  ('10000000-0000-0000-0000-000000000001', 'Объект A', 'Адрес A'),
  ('10000000-0000-0000-0000-000000000002', 'Объект B', 'Адрес B');
insert into public.tasks (id, object_id, assignee_id, author_id, title) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Задача A1'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Задача A2'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Задача B1');
insert into public.task_status_history (task_id, actor_id, from_status, to_status) select
  id, '00000000-0000-0000-0000-000000000003', null, 'new' from public.tasks;

select pg_temp.ok((select count(*) = 4 from pg_tables where schemaname = 'public'
  and tablename in ('profiles', 'objects', 'tasks', 'task_status_history')), 'four tables created');
select pg_temp.ok((select count(*) = 3 from public.tasks where status = 'new'
  and created_at is not null and description is null), 'task defaults and nullable description');
select pg_temp.ok((select count(*) = 3 from public.task_status_history where id is not null
  and created_at is not null and from_status is null and comment is null), 'history defaults and nullable fields');
select pg_temp.ok((select bool_and(created_at is not null) from public.objects), 'object timestamps default');

select pg_temp.expect_error(
  'insert into public.profiles values (gen_random_uuid(), ''manager'')',
  '23503', 'profile must reference auth user', 'profiles_id_fkey');
select pg_temp.expect_error(
  'update public.tasks set object_id = gen_random_uuid()',
  '23503', 'task object FK', 'tasks_object_id_fkey');
select pg_temp.expect_error(
  'update public.tasks set assignee_id = gen_random_uuid()',
  '23503', 'task assignee FK', 'tasks_assignee_id_fkey');
select pg_temp.expect_error(
  'update public.tasks set author_id = gen_random_uuid()',
  '23503', 'task author FK', 'tasks_author_id_fkey');
select pg_temp.expect_error(
  'update public.task_status_history set task_id = gen_random_uuid()',
  '23503', 'history task FK', 'task_status_history_task_id_fkey');
select pg_temp.expect_error(
  'update public.task_status_history set actor_id = gen_random_uuid()',
  '23503', 'history actor FK', 'task_status_history_actor_id_fkey');

do $$
declare
  value text;
  field_name text;
  relation_name text;
begin
  foreach value in array array['admin', '', ' ', E'\t\n'] loop
    perform pg_temp.expect_error(format('update public.profiles set role = %L', value),
      '23514', format('reject role %L', value), 'profiles_role_check');
  end loop;
  foreach value in array array['invalid', '', ' ', E'\t\n'] loop
    perform pg_temp.expect_error(format('update public.tasks set status = %L', value),
      '23514', format('reject task status %L', value), 'tasks_status_check');
    foreach field_name in array array['from_status', 'to_status'] loop
      perform pg_temp.expect_error(format('update public.task_status_history set %I = %L', field_name, value),
        '23514', format('reject history %s %L', field_name, value),
        format('task_status_history_%s_check', field_name));
    end loop;
  end loop;
  foreach value in array array['new', 'in_progress', 'in_review', 'accepted', 'rework'] loop
    update public.tasks set status = value;
    update public.task_status_history set from_status = value, to_status = value;
    perform pg_temp.ok((select bool_and(status = value) from public.tasks), format('allow task status %s', value));
    perform pg_temp.ok((select bool_and(from_status = value and to_status = value)
      from public.task_status_history), format('allow both history statuses %s', value));
  end loop;
  foreach field_name in array array['name', 'address', 'title'] loop
    relation_name := case when field_name = 'title' then 'tasks' else 'objects' end;
    foreach value in array array['', ' ', E'\t\n'] loop
      perform pg_temp.expect_error(format('update public.%I set %I = %L', relation_name, field_name, value),
        '23514', format('reject blank %s.%s %L', relation_name, field_name, value),
        format('%s_%s_not_blank', relation_name, field_name));
    end loop;
  end loop;
end;
$$;

-- All mandatory columns reject NULL, including UUID references, roles and statuses.
do $$
declare
  column_info record;
begin
  for column_info in select table_name, column_name from information_schema.columns
    where table_schema = 'public' and is_nullable = 'NO'
      and table_name in ('profiles', 'objects', 'tasks', 'task_status_history')
  loop
    perform pg_temp.expect_error(format('update public.%I set %I = null',
      column_info.table_name, column_info.column_name), '23502',
      format('reject null %s.%s', column_info.table_name, column_info.column_name));
  end loop;
end;
$$;

-- No identities or audit rows may disappear by deleting a referenced profile/user.
select pg_temp.expect_error(
  'delete from auth.users where id = ''00000000-0000-0000-0000-000000000001''',
  '23503', 'author auth user deletion restricted', 'profiles_id_fkey');
select pg_temp.expect_error(
  'delete from auth.users where id = ''00000000-0000-0000-0000-000000000002''',
  '23503', 'assignee auth user deletion restricted', 'profiles_id_fkey');
select pg_temp.expect_error(
  'delete from auth.users where id = ''00000000-0000-0000-0000-000000000003''',
  '23503', 'actor auth user deletion restricted', 'profiles_id_fkey');
select pg_temp.expect_error(
  'delete from public.profiles where id = ''00000000-0000-0000-0000-000000000001''',
  '23503', 'author profile deletion restricted', 'tasks_author_id_fkey');
select pg_temp.expect_error(
  'delete from public.profiles where id = ''00000000-0000-0000-0000-000000000002''',
  '23503', 'assignee profile deletion restricted', 'tasks_assignee_id_fkey');
select pg_temp.expect_error(
  'delete from public.profiles where id = ''00000000-0000-0000-0000-000000000003''',
  '23503', 'actor profile deletion restricted', 'task_status_history_actor_id_fkey');
select pg_temp.ok((select count(*) = 3 from public.tasks)
  and (select count(*) = 3 from public.task_status_history)
  and (select count(*) = 3 from auth.users), 'user/profile deletion preserves business data');

delete from public.tasks where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) = 2 from public.tasks)
  and (select count(*) = 2 from public.task_status_history)
  and not exists (select from public.task_status_history where task_id = '20000000-0000-0000-0000-000000000001'),
  'delete task cascades only its history');
delete from public.objects where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) = 1 from public.tasks)
  and (select count(*) = 1 from public.task_status_history)
  and (select count(*) = 1 from public.objects)
  and exists (select from public.tasks where id = '20000000-0000-0000-0000-000000000003'),
  'delete object cascades tasks/history and preserves unrelated object');
select pg_temp.ok((select count(*) = 3 from public.profiles), 'cascade does not remove profiles');

select pg_temp.ok((select count(*) = 4 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('profiles', 'objects', 'tasks', 'task_status_history')
  and c.relrowsecurity), 'RLS enabled on all four tables');
select pg_temp.ok(not exists (select from pg_policies where schemaname = 'public'
  and tablename in ('profiles', 'objects', 'tasks', 'task_status_history')), 'no client policies (no policies at all)');

do $$
declare
  client_role text;
  relation_name text;
  privilege_name text;
  command text;
begin
  foreach client_role in array array['anon', 'authenticated'] loop
    foreach relation_name in array array['profiles', 'objects', 'tasks', 'task_status_history'] loop
      foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        perform pg_temp.ok(not has_table_privilege(client_role, 'public.' || relation_name, privilege_name),
          format('%s has no %s on %s', client_role, privilege_name, relation_name));
      end loop;
      -- Real SQL under each API role: grants, not UI or owner-side queries, deny access.
      foreach command in array array[
        format('select * from public.%I', relation_name),
        format('insert into public.%I default values', relation_name),
        format('update public.%I set id = id', relation_name),
        format('delete from public.%I', relation_name),
        format('truncate public.%I', relation_name)
      ] loop
        execute format('set local role %I', client_role);
        begin
          execute command;
        exception when insufficient_privilege then
          reset role;
          insert into stage2_results values (format('API denied: %s: %s', client_role, command));
          continue;
        end;
        reset role;
        raise exception 'FAIL: API access unexpectedly allowed: %: %', client_role, command;
      end loop;
    end loop;
  end loop;
end;
$$;

select pg_temp.ok(not exists (
  select from pg_constraint fk
  where fk.connamespace = 'public'::regnamespace and fk.contype = 'f'
    and not exists (
      select from pg_index i where i.indrelid = fk.conrelid and i.indisvalid
        and i.indkey[0] = fk.conkey[1] and i.indpred is null
    )
), 'every FK has a usable leading-column index');
select pg_temp.ok(not exists (select from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'), 'no public SQL functions or SECURITY DEFINER APIs');

select label as passed_check from stage2_results order by label;
select count(*) as passed_checks from stage2_results;
rollback;
