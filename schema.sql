-- =========================
-- USERS TABLE
-- =========================
create table public.users (
  id uuid primary key default uuid_generate_v4(),
  student_id text not null unique,
  name text not null,
  major text not null,
  auth_uid uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

alter table public.users enable row level security;

create policy "Allow insert for authenticated users"
on public.users
for insert
using (auth.uid() = auth_uid);

create policy "Allow select own profile"
on public.users
for select
using (auth.uid() = auth_uid);

create policy "Allow update own profile"
on public.users
for update
using (auth.uid() = auth_uid);

-- =========================
-- FACE_IMAGES TABLE
-- =========================
create table public.face_images (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade,
  descriptor float8[] not null,
  created_at timestamp with time zone default now()
);

alter table public.face_images enable row level security;

create policy "Allow insert own face images"
on public.face_images
for insert
using (exists (
  select 1 from public.users u
  where u.id = new.user_id and u.auth_uid = auth.uid()
));

create policy "Allow select own face images"
on public.face_images
for select
using (exists (
  select 1 from public.users u
  where u.id = user_id and u.auth_uid = auth.uid()
));

-- =========================
-- ATTENDANCE TABLE
-- =========================
create table public.attendance (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade,
  timestamp timestamp with time zone default now(),
  unique(user_id, date(timestamp))
);

alter table public.attendance enable row level security;

create policy "Allow insert own attendance"
on public.attendance
for insert
using (exists (
  select 1 from public.users u
  where u.id = new.user_id and u.auth_uid = auth.uid()
));

create policy "Allow select own attendance"
on public.attendance
for select
using (exists (
  select 1 from public.users u
  where u.id = user_id and u.auth_uid = auth.uid()
));
