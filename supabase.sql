create table if not exists profiles (
  tg_id bigint primary key,
  first_name text, username text, lang text,
  created_at timestamptz default now(), last_seen timestamptz default now()
);
create table if not exists projects (
  id uuid primary key,
  tg_id bigint not null references profiles(tg_id) on delete cascade,
  name text not null,
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists projects_tg_idx on projects(tg_id, updated_at desc);
-- RLS включён без политик: доступ только через service_role с сервера (api/*)
alter table profiles enable row level security;
alter table projects enable row level security;
