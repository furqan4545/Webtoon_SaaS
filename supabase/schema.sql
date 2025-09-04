-- Run this SQL in Supabase SQL editor to set up tables and policies

-- Enable UUID extension (for gen_random_uuid)
create extension if not exists pgcrypto;

-- PROFILES: per-user plan and monthly usage
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free', -- 'free' | 'pro'
  month_start date not null default date_trunc('month', now())::date,
  images_generated int not null default 0,
  email text,
  full_name text,
  avatar_url text,
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
  art_style text,
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
  art_style text,
  image_path text, -- Supabase Storage path
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists characters_project_id_idx on public.characters(project_id);
create unique index if not exists characters_project_name_key on public.characters(project_id, name);
alter table public.characters enable row level security;
drop policy if exists "characters_self_access" on public.characters;
create policy "characters_self_access"
  on public.characters for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

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

-- ART STYLES (per project)
create table if not exists public.art_styles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id)
);
create index if not exists art_styles_project_id_idx on public.art_styles(project_id);
alter table public.art_styles enable row level security;
drop policy if exists "art_styles_self_access" on public.art_styles;
create policy "art_styles_self_access"
  on public.art_styles for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

-- GENERATED SCENES (per project; one row per scene)
create table if not exists public.generated_scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scene_no int not null,
  story_text text,
  scene_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, scene_no)
);
create index if not exists generated_scenes_project_id_idx on public.generated_scenes(project_id);
alter table public.generated_scenes enable row level security;
drop policy if exists "generated_scenes_self_access" on public.generated_scenes;
create policy "generated_scenes_self_access"
  on public.generated_scenes for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

-- GENERATED SCENE IMAGES (per generated scene)
create table if not exists public.generated_scene_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scene_id uuid not null references public.generated_scenes(id) on delete cascade,
  scene_no int not null,
  image_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, scene_no)
);
create index if not exists generated_scene_images_scene_id_idx on public.generated_scene_images(scene_id);
alter table public.generated_scene_images enable row level security;
drop policy if exists "generated_scene_images_self_access" on public.generated_scene_images;
create policy "generated_scene_images_self_access"
  on public.generated_scene_images for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

-- STORAGE: Create a bucket named 'webtoon' in Storage settings.
-- Recommended: private bucket, use signed URLs for access.

-- Safe alters if table already exists
alter table if exists public.profiles add column if not exists email text;
alter table if exists public.profiles add column if not exists full_name text;
alter table if exists public.profiles add column if not exists avatar_url text;
alter table if exists public.projects add column if not exists art_style text;
alter table if exists public.characters add column if not exists art_style text;

-- Storage RLS policies for bucket 'webtoon'
-- Allow authenticated users to manage files under users/{uid}/...
drop policy if exists "webtoon_select" on storage.objects;
create policy "webtoon_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'webtoon' and (name like ('users/' || auth.uid() || '/%')));

drop policy if exists "webtoon_insert" on storage.objects;
create policy "webtoon_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'webtoon' and (name like ('users/' || auth.uid() || '/%')));

drop policy if exists "webtoon_update" on storage.objects;
create policy "webtoon_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'webtoon' and (name like ('users/' || auth.uid() || '/%')))
  with check (bucket_id = 'webtoon' and (name like ('users/' || auth.uid() || '/%')));

drop policy if exists "webtoon_delete" on storage.objects;
create policy "webtoon_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'webtoon' and (name like ('users/' || auth.uid() || '/%')));


