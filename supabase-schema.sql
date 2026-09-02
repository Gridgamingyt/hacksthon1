create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('citizen', 'government')) default 'citizen',
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

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
  title text,
  description text,
  issue_type text,
  status text not null default 'Pending review' check (status in ('Pending review','In Progress','Assigned','Resolved','Rejected')),
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  latitude double precision,
  longitude double precision,
  location_name text,
  image_url text,
  created_at timestamptz not null default now()
);

-- Bring an existing issues table up to the same shape as the definition above.
alter table public.issues add column if not exists report_id text;
alter table public.issues add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.issues add column if not exists reporter_name text;
alter table public.issues add column if not exists reporter_email text;
alter table public.issues add column if not exists title text;
alter table public.issues add column if not exists description text;
alter table public.issues add column if not exists issue_type text;
alter table public.issues add column if not exists status text default 'Pending review';
alter table public.issues add column if not exists priority text default 'Medium';
alter table public.issues add column if not exists latitude double precision;
alter table public.issues add column if not exists longitude double precision;
alter table public.issues add column if not exists location_name text;
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
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  latitude double precision,
  longitude double precision,
  location_name text,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.complaints enable row level security;

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
