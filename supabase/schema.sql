-- PyQuest Supabase 資料庫定義
-- 使用方式:Supabase Dashboard → SQL Editor → 貼上全部 → Run

-- ── 使用者資料 ────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

-- 註冊時自動建立 profile
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 老師判定(security definer 避免 RLS 遞迴)
create function public.is_teacher()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

-- ── 關卡進度 ─────────────────────────────────
create table public.progress (
  user_id uuid not null references auth.users on delete cascade,
  level_id text not null,
  stars int not null default 0 check (stars between 0 and 3),
  xp int not null default 0,
  completed_at timestamptz not null default now(),
  primary key (user_id, level_id)
);

-- ── 老師自訂題目 ──────────────────────────────
create table public.custom_levels (
  id uuid primary key default gen_random_uuid(),
  chapter_num int not null,
  position int not null default 999,
  data jsonb not null,
  published boolean not null default true,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- ── Row Level Security ───────────────────────
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.custom_levels enable row level security;

-- profiles:自己可讀改自己的;老師可讀全部(role 欄位不可自改)
create policy "read own or teacher reads all" on public.profiles
  for select using (id = auth.uid() or public.is_teacher());
create policy "update own name" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- progress:自己可讀寫自己的;老師可讀全部
create policy "read own progress or teacher" on public.progress
  for select using (user_id = auth.uid() or public.is_teacher());
create policy "insert own progress" on public.progress
  for insert with check (user_id = auth.uid());
create policy "update own progress" on public.progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- custom_levels:已發布的所有人可讀;老師全權管理
create policy "read published or teacher" on public.custom_levels
  for select using (published or public.is_teacher());
create policy "teacher insert" on public.custom_levels
  for insert with check (public.is_teacher());
create policy "teacher update" on public.custom_levels
  for update using (public.is_teacher());
create policy "teacher delete" on public.custom_levels
  for delete using (public.is_teacher());

-- ── 完成後手動執行:把你自己升級為老師 ──────────
-- (把 email 換成你註冊時用的信箱)
-- update public.profiles set role = 'teacher'
-- where id = (select id from auth.users where email = '你的信箱@example.com');
