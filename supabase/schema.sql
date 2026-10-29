-- FitCpu: esquema de base de datos para Supabase.
-- Pégalo completo en Supabase > SQL Editor > New query > Run.
-- Cada tabla tiene Row Level Security: cada usuario solo ve y escribe lo suyo.

create table if not exists public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  meals      jsonb not null default '{}'::jsonb,
  water_ml   integer not null default 0 check (water_ml >= 0 and water_ml <= 20000),
  note       text not null default '' check (char_length(note) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.weights (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  kg         numeric(5,1) not null check (kg > 20 and kg < 400),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.foods (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.profiles enable row level security;
alter table public.days     enable row level security;
alter table public.weights  enable row level security;
alter table public.foods    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles','days','weights','foods'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
