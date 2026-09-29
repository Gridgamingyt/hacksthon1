-- Run this once in the Supabase SQL Editor for an existing public.issues table.
alter table public.profiles
  add column if not exists email text;
alter table public.profiles
  add column if not exists avatar_url text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and coalesce(p.email, '') = '';

drop policy if exists "Government can view citizen profiles" on public.profiles;
create policy "Government can view citizen profiles"
  on public.profiles for select
  using (auth.uid() is not null);
alter table public.issues
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.issues
  add column if not exists reporter_name text;
alter table public.issues
  add column if not exists reporter_email text;
alter table public.issues
  add column if not exists reporter_avatar text;
alter table public.issues
  add column if not exists address text;
alter table public.issues
  add column if not exists report_id text;
alter table public.issues
  add column if not exists title text;
alter table public.issues
  add column if not exists description text;
alter table public.issues
  add column if not exists issue_type text;
alter table public.issues
  add column if not exists status text default 'Pending review';
alter table public.issues
  add column if not exists rejection_reason text;
alter table public.issues
  add column if not exists priority text default 'Medium';
alter table public.issues
  add column if not exists latitude double precision;
alter table public.issues
  add column if not exists longitude double precision;
alter table public.issues
  add column if not exists location_name text;
alter table public.issues
  add column if not exists image_url text;
alter table public.issues
  add column if not exists created_at timestamptz default now();

-- Normalize older projects where rejection_reason was accidentally created as text[].
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'issues'
      and column_name = 'rejection_reason'
      and udt_name = '_text'
  ) then
    alter table public.issues
      alter column rejection_reason type text
      using array_to_string(rejection_reason, ', ');
  end if;
end $$;

-- Keep issue_type and title populated for older rows that used either name.
update public.issues
set title = issue_type
where coalesce(title, '') = ''
  and coalesce(issue_type, '') <> '';

update public.issues
set issue_type = title
where coalesce(issue_type, '') = ''
  and coalesce(title, '') <> '';

-- Recover the owner for older reports that stored the reporter email but not user_id.
update public.issues i
set user_id = u.id
from auth.users u
where i.user_id is null
  and nullif(trim(i.reporter_email), '') is not null
  and lower(trim(i.reporter_email)) = lower(trim(u.email));

-- Backfill existing reports from the owning auth/profile records.
update public.issues i
set reporter_name = coalesce(nullif(i.reporter_name, ''), p.full_name, u.raw_user_meta_data->>'full_name'),
    reporter_email = coalesce(nullif(i.reporter_email, ''), p.email, u.email),
    reporter_avatar = coalesce(nullif(i.reporter_avatar, ''), p.avatar_url)
from auth.users u
left join public.profiles p on p.id = u.id
where i.user_id = u.id
  and (coalesce(i.reporter_name, '') = ''
    or coalesce(i.reporter_email, '') = ''
    or coalesce(i.reporter_avatar, '') = '');

alter table public.issues enable row level security;

drop policy if exists "Users can view own issues" on public.issues;
create policy "Users can view own issues"
  on public.issues for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own issues" on public.issues;
create policy "Users can insert own issues"
  on public.issues for insert
  with check (auth.uid() = user_id);

drop policy if exists "Government can view all issues" on public.issues;
create policy "Government can view all issues"
  on public.issues for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'government'
    )
  );

drop policy if exists "Government can update all issues" on public.issues;
create policy "Government can update all issues"
  on public.issues for update
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'government'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'government'
    )
  );

-- Existing rows cannot be safely assigned to a citizen automatically.
-- Review them before setting user_id manually.
