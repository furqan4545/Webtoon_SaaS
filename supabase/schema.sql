-- Run this SQL in Supabase SQL editor to set up tables and policies

-- Enable UUID extension (for gen_random_uuid)
create extension if not exists pgcrypto;

-- PROFILES: per-user plan and monthly usage
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free', -- 'free' | 'pro'
  month_start date not null default date_trunc('month', now())::date,
  images_generated int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles_self_access" on public.profiles;
create policy "profiles_self_access"
  on public.profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- PROJECTS
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'draft',
  story text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists projects_user_id_idx on public.projects(user_id);
alter table public.projects enable row level security;
drop policy if exists "projects_self_access" on public.projects;
create policy "projects_self_access"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- CHARACTERS
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  description text,
  image_path text, -- Supabase Storage path
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists characters_project_id_idx on public.characters(project_id);
alter table public.characters enable row level security;
drop policy if exists "characters_self_access" on public.characters;
create policy "characters_self_access"
  on public.characters for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- SCENES
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx int not null,
  description text,
  story_text text,
  image_path text, -- Supabase Storage path
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, idx)
);
create index if not exists scenes_project_id_idx on public.scenes(project_id);
alter table public.scenes enable row level security;
drop policy if exists "scenes_self_access" on public.scenes;
create policy "scenes_self_access"
  on public.scenes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- STORAGE: Create a bucket named 'webtoon' in Storage settings.
-- Recommended: private bucket, use signed URLs for access.


