create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null check (role in ('citizen', 'government')) default 'citizen',
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and coalesce(p.email, '') = '';

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Government can view citizen profiles"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  report_id text unique not null,
  user_id uuid references auth.users(id) on delete cascade,
  reporter_name text,
  reporter_email text,
  reporter_avatar text,
  title text,
  description text,
  issue_type text,
  status text not null default 'Pending review' check (status in ('Pending review','In Progress','Assigned','Resolved','Rejected')),
  rejection_reason text,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  latitude double precision,
  longitude double precision,
  location_name text,
  address text,
  image_url text,
  created_at timestamptz not null default now()
);

-- Bring an existing issues table up to the same shape as the definition above.
alter table public.issues add column if not exists report_id text;
alter table public.issues add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.issues add column if not exists reporter_name text;
alter table public.issues add column if not exists reporter_email text;
alter table public.issues add column if not exists reporter_avatar text;

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
alter table public.issues add column if not exists title text;
alter table public.issues add column if not exists description text;
alter table public.issues add column if not exists issue_type text;
alter table public.issues add column if not exists status text default 'Pending review';
alter table public.issues add column if not exists rejection_reason text;
alter table public.issues add column if not exists priority text default 'Medium';
alter table public.issues add column if not exists latitude double precision;
alter table public.issues add column if not exists longitude double precision;
alter table public.issues add column if not exists location_name text;
alter table public.issues add column if not exists address text;
alter table public.issues add column if not exists image_url text;
alter table public.issues add column if not exists created_at timestamptz default now();

alter table public.issues enable row level security;

create policy "Users can view own issues"
  on public.issues for select
  using (auth.uid() = user_id);

create policy "Users can insert own issues"
  on public.issues for insert
  with check (auth.uid() = user_id);

create policy "Users can update own issues"
  on public.issues for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Government can view all issues"
  on public.issues for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'government'
    )
  );

create policy "Government can update all issues"
  on public.issues for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'government'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'government'
    )
  );

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  report_id text unique not null,
  user_id uuid references auth.users(id) on delete cascade,
  reporter_name text,
  reporter_email text,
  title text,
  description text,
  issue_type text,
  status text not null default 'Pending review' check (status in ('Pending review','In Progress','Assigned','Resolved','Rejected')),
  rejection_reason text,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  latitude double precision,
  longitude double precision,
  location_name text,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.complaints enable row level security;
alter table public.complaints add column if not exists rejection_reason text;

create policy "Users can view own complaints"
  on public.complaints for select
  using (auth.uid() = user_id);

create policy "Users can insert own complaints"
  on public.complaints for insert
  with check (auth.uid() = user_id);

create policy "Users can update own complaints"
  on public.complaints for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Government can view all complaints"
  on public.complaints for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'government'
    )
  );

create policy "Government can update all complaints"
  on public.complaints for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'government'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'government'
    )
  );
