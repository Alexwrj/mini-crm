-- Stage 2: schema only. No client access or workflow is introduced here.
begin;

create table public.profiles (
  id uuid primary key,
  role text not null,
  constraint profiles_id_fkey foreign key (id)
    references auth.users (id) on delete restrict,
  constraint profiles_role_check check (role in ('manager', 'executor'))
);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  created_at timestamptz not null default now(),
  constraint objects_name_not_blank check (name ~ '[^[:space:]]'),
  constraint objects_address_not_blank check (address ~ '[^[:space:]]')
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null,
  assignee_id uuid not null,
  author_id uuid not null,
  title text not null,
  description text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint tasks_object_id_fkey foreign key (object_id)
    references public.objects (id) on delete cascade,
  constraint tasks_assignee_id_fkey foreign key (assignee_id)
    references public.profiles (id) on delete restrict,
  constraint tasks_author_id_fkey foreign key (author_id)
    references public.profiles (id) on delete restrict,
  constraint tasks_title_not_blank check (title ~ '[^[:space:]]'),
  constraint tasks_status_check check (
    status in ('new', 'in_progress', 'in_review', 'accepted', 'rework')
  )
);

create table public.task_status_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  actor_id uuid not null,
  from_status text,
  to_status text not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint task_status_history_task_id_fkey foreign key (task_id)
    references public.tasks (id) on delete cascade,
  constraint task_status_history_actor_id_fkey foreign key (actor_id)
    references public.profiles (id) on delete restrict,
  constraint task_status_history_from_status_check check (
    from_status in ('new', 'in_progress', 'in_review', 'accepted', 'rework')
  ),
  constraint task_status_history_to_status_check check (
    to_status in ('new', 'in_progress', 'in_review', 'accepted', 'rework')
  )
);

-- Each FK is covered by a leading index column (profiles.id uses its PK).
create index objects_created_at_idx on public.objects (created_at desc, id);
create index tasks_object_id_created_at_idx
  on public.tasks (object_id, created_at desc, id);
create index tasks_assignee_id_created_at_idx
  on public.tasks (assignee_id, created_at desc, id);
create index tasks_author_id_idx on public.tasks (author_id);
create index task_status_history_task_id_created_at_idx
  on public.task_status_history (task_id, created_at, id);
create index task_status_history_actor_id_idx
  on public.task_status_history (actor_id);

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_status_history enable row level security;

-- Supabase installations may automatically grant privileges to API roles.
-- Explicitly remove them, including PUBLIC inheritance and TRUNCATE privileges.
revoke all privileges on table
  public.profiles, public.objects, public.tasks, public.task_status_history
  from public, anon, authenticated;

-- No policies, functions, triggers or API grants in Stage 2.
commit;
