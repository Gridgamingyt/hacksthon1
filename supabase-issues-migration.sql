-- Run this once in the Supabase SQL Editor for an existing public.issues table.
alter table public.issues
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.issues
  add column if not exists reporter_name text;
alter table public.issues
  add column if not exists reporter_email text;

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
