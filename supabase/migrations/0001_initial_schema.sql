-- ============================================================================
-- BLACKBOX QUIZ — Initial schema
-- Every table is prefixed with blackboxquiz_ so they are unmistakable
-- inside the Supabase project.
-- Implements spec §64 (schema), §65 (constraints), §111 (indexes).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  status      text not null default 'ACTIVE'
              check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace trigger trg_blackboxquiz_organizations_updated_at
  before update on public.blackboxquiz_organizations
  for each row execute function public.blackboxquiz_set_updated_at();

-- ----------------------------------------------------------------------------
-- profiles (extends auth.users)
-- role holds the GLOBAL role; SUPER_ADMIN is only ever set here.
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  avatar_url  text,
  role        text not null default 'VIEWER'
              check (role in ('SUPER_ADMIN', 'ORGANIZATION_ADMIN',
                              'COMPETITION_ADMIN', 'COMPETITION_OPERATOR',
                              'VIEWER')),
  status      text not null default 'ACTIVE'
              check (status in ('ACTIVE', 'DISABLED')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace trigger trg_blackboxquiz_profiles_updated_at
  before update on public.blackboxquiz_profiles
  for each row execute function public.blackboxquiz_set_updated_at();

-- Auto-create a profile whenever an auth user is created (spec §67).
create or replace function public.blackboxquiz_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.blackboxquiz_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Supabase projects frequently ship with a template trigger literally named
-- `on_auth_user_created`; drop any such trigger so our own (uniquely named)
-- trigger can own signup handling without a name collision or double-firing.
drop trigger if exists on_auth_user_created on auth.users;

drop trigger if exists trg_blackboxquiz_on_auth_user_created on auth.users;
create trigger trg_blackboxquiz_on_auth_user_created
  after insert on auth.users
  for each row execute function public.blackboxquiz_handle_new_user();

-- ----------------------------------------------------------------------------
-- organization_members
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.blackboxquiz_organizations (id) on delete cascade,
  user_id         uuid not null references public.blackboxquiz_profiles (id) on delete cascade,
  role            text not null default 'VIEWER'
                  check (role in ('ORGANIZATION_ADMIN', 'COMPETITION_ADMIN',
                                  'COMPETITION_OPERATOR', 'VIEWER')),
  status          text not null default 'ACTIVE'
                  check (status in ('ACTIVE', 'INVITED', 'DISABLED')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_blackboxquiz_org_members_org
  on public.blackboxquiz_organization_members (organization_id);
create index if not exists idx_blackboxquiz_org_members_user
  on public.blackboxquiz_organization_members (user_id);

create or replace trigger trg_blackboxquiz_org_members_updated_at
  before update on public.blackboxquiz_organization_members
  for each row execute function public.blackboxquiz_set_updated_at();

-- ----------------------------------------------------------------------------
-- competitions
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_competitions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.blackboxquiz_organizations (id) on delete cascade,
  name                text not null,
  slug                text not null unique,
  description         text,
  status              text not null default 'DRAFT'
                      check (status in ('DRAFT', 'SETUP', 'READY', 'DOWNLOADING',
                                        'DOWNLOADED', 'LIVE', 'PAUSED',
                                        'COMPLETED', 'ARCHIVED', 'LOCKED')),
  scheduled_at        timestamptz,
  timezone            text not null default 'UTC',
  default_time_limit  integer not null default 30 check (default_time_limit > 0),
  current_team_id     uuid,
  current_question_id uuid,
  settings            jsonb not null default '{}'::jsonb,
  created_by          uuid references public.blackboxquiz_profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists idx_blackboxquiz_competitions_org
  on public.blackboxquiz_competitions (organization_id);
create index if not exists idx_blackboxquiz_competitions_status
  on public.blackboxquiz_competitions (status);
create index if not exists idx_blackboxquiz_competitions_scheduled
  on public.blackboxquiz_competitions (scheduled_at);

create or replace trigger trg_blackboxquiz_competitions_updated_at
  before update on public.blackboxquiz_competitions
  for each row execute function public.blackboxquiz_set_updated_at();

-- ----------------------------------------------------------------------------
-- teams — exactly two per competition (spec §13, §65)
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_teams (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  short_name      text,
  logo_url        text,
  color           text not null default '#2563EB',
  starting_score  integer not null default 0,
  current_score   integer not null default 0,
  display_order   integer not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (competition_id, display_order)
);

create index if not exists idx_blackboxquiz_teams_competition
  on public.blackboxquiz_teams (competition_id);

-- No competition may ever hold more than two teams.
create or replace function public.blackboxquiz_enforce_team_limit()
returns trigger
language plpgsql
as $$
declare
  team_count integer;
begin
  select count(*) into team_count
  from public.blackboxquiz_teams
  where competition_id = new.competition_id;
  if team_count >= 2 then
    raise exception 'A competition must have exactly two teams';
  end if;
  return new;
end;
$$;

create or replace trigger trg_blackboxquiz_team_limit
  before insert on public.blackboxquiz_teams
  for each row execute function public.blackboxquiz_enforce_team_limit();

-- Deleting below two teams is only allowed before the competition goes LIVE;
-- enforced by start-validation RPC, so a plain delete guard is not added here.
create or replace trigger trg_blackboxquiz_teams_updated_at
  before update on public.blackboxquiz_teams
  for each row execute function public.blackboxquiz_set_updated_at();

-- FK from competitions to the "current" pointers (added after teams/questions).
do $$ begin
  alter table public.blackboxquiz_competitions
    add constraint fk_blackboxquiz_competitions_current_team
    foreign key (current_team_id) references public.blackboxquiz_teams (id)
    on delete set null;
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- point_values — configurable, never hard-coded (spec §15)
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_point_values (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  points          integer not null check (points > 0),
  color           text not null,
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (competition_id, points)
);

create index if not exists idx_blackboxquiz_point_values_competition
  on public.blackboxquiz_point_values (competition_id);

-- ----------------------------------------------------------------------------
-- questions (spec §14, §16)
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_questions (
  id                uuid primary key default gen_random_uuid(),
  competition_id    uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  question_number   integer not null check (question_number > 0),
  question_text     text not null check (length(trim(question_text)) > 0),
  category          text,
  difficulty        text,
  points            integer not null check (points > 0),
  point_color       text not null default '#2563EB',
  time_limit        integer not null default 30 check (time_limit > 0),
  correct_option_id uuid,
  explanation       text,
  image_url         text,
  audio_url         text,
  video_url         text,
  status            text not null default 'AVAILABLE'
                    check (status in ('AVAILABLE', 'SELECTED', 'ANSWERING', 'FAILED',
                                      'BONUS_AVAILABLE', 'BONUS_ANSWERING',
                                      'ANSWERED', 'COMPLETED')),
  display_order     integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (competition_id, question_number)
);

create index if not exists idx_blackboxquiz_questions_competition
  on public.blackboxquiz_questions (competition_id);
create index if not exists idx_blackboxquiz_questions_status
  on public.blackboxquiz_questions (competition_id, status);
create index if not exists idx_blackboxquiz_questions_points
  on public.blackboxquiz_questions (competition_id, points);

create or replace trigger trg_blackboxquiz_questions_updated_at
  before update on public.blackboxquiz_questions
  for each row execute function public.blackboxquiz_set_updated_at();

-- ----------------------------------------------------------------------------
-- question_options
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_question_options (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null references public.blackboxquiz_questions (id) on delete cascade,
  option_key    text not null check (length(trim(option_key)) > 0),
  option_text   text not null check (length(trim(option_text)) > 0),
  image_url     text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (question_id, option_key)
);

create index if not exists idx_blackboxquiz_options_question
  on public.blackboxquiz_question_options (question_id);

-- Circular FK: question -> its correct option (deferred for bulk inserts).
do $$ begin
  alter table public.blackboxquiz_questions
    add constraint fk_blackboxquiz_questions_correct_option
    foreign key (correct_option_id) references public.blackboxquiz_question_options (id)
    on delete set null deferrable initially deferred;
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- question_attempts
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_question_attempts (
  id                uuid primary key default gen_random_uuid(),
  competition_id    uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  question_id       uuid not null references public.blackboxquiz_questions (id) on delete cascade,
  team_id           uuid not null references public.blackboxquiz_teams (id) on delete cascade,
  attempt_type      text not null check (attempt_type in ('PRIMARY', 'BONUS')),
  selected_option_id uuid references public.blackboxquiz_question_options (id),
  result            text check (result in ('CORRECT', 'WRONG', 'TIMEOUT')),
  points_awarded    integer not null default 0 check (points_awarded >= 0),
  started_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_blackboxquiz_attempts_competition
  on public.blackboxquiz_question_attempts (competition_id);
create index if not exists idx_blackboxquiz_attempts_question
  on public.blackboxquiz_question_attempts (question_id);
create index if not exists idx_blackboxquiz_attempts_team
  on public.blackboxquiz_question_attempts (team_id);

-- ----------------------------------------------------------------------------
-- competition_events — immutable event log, source of truth (spec §35, §108)
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_competition_events (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  device_id       uuid,
  sequence_number bigint not null,
  event_type      text not null,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (competition_id, device_id, sequence_number),
  unique (id)
);

create index if not exists idx_blackboxquiz_events_competition_seq
  on public.blackboxquiz_competition_events (competition_id, sequence_number);
create index if not exists idx_blackboxquiz_events_type
  on public.blackboxquiz_competition_events (competition_id, event_type);
create index if not exists idx_blackboxquiz_events_created
  on public.blackboxquiz_competition_events (created_at);

-- Event log is append-only (spec §86 immutability).
create or replace function public.blackboxquiz_deny_mutable_events()
returns trigger
language plpgsql
as $$
begin
  raise exception 'blackboxquiz_competition_events is append-only';
end;
$$;

create or replace trigger trg_blackboxquiz_events_no_update
  before update or delete on public.blackboxquiz_competition_events
  for each row execute function public.blackboxquiz_deny_mutable_events();

-- ----------------------------------------------------------------------------
-- competition_devices
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_competition_devices (
  id                uuid primary key default gen_random_uuid(),
  competition_id    uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  device_identifier text not null,
  device_name       text,
  status            text not null default 'PENDING'
                    check (status in ('PENDING', 'AUTHORIZED', 'REVOKED')),
  authorized_by     uuid references public.blackboxquiz_profiles (id),
  authorized_at     timestamptz,
  last_seen_at      timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (competition_id, device_identifier)
);

create index if not exists idx_blackboxquiz_devices_competition
  on public.blackboxquiz_competition_devices (competition_id);

-- ----------------------------------------------------------------------------
-- access_codes — only hashed codes are stored (spec §9, §100)
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_access_codes (
  id            uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  code_hash     text not null unique,
  code_prefix   text not null, -- first block e.g. 'BX-7K29' for display only
  permissions   jsonb not null default '[]'::jsonb,
  expires_at    timestamptz,
  max_uses      integer check (max_uses is null or max_uses > 0),
  usage_count   integer not null default 0 check (usage_count >= 0),
  status        text not null default 'ACTIVE'
                check (status in ('ACTIVE', 'EXHAUSTED', 'REVOKED', 'EXPIRED')),
  created_by    uuid references public.blackboxquiz_profiles (id),
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

create index if not exists idx_blackboxquiz_access_codes_competition
  on public.blackboxquiz_access_codes (competition_id);
create index if not exists idx_blackboxquiz_access_codes_status
  on public.blackboxquiz_access_codes (status);

-- ----------------------------------------------------------------------------
-- sync_records
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_sync_records (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  device_id       uuid,
  event_id        uuid not null references public.blackboxquiz_competition_events (id) on delete cascade,
  sequence_number bigint not null,
  status          text not null default 'PENDING'
                  check (status in ('PENDING', 'SYNCED', 'FAILED', 'CONFLICT')),
  error           text,
  synced_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (event_id)
);

create index if not exists idx_blackboxquiz_sync_competition
  on public.blackboxquiz_sync_records (competition_id, status);
create index if not exists idx_blackboxquiz_sync_device_seq
  on public.blackboxquiz_sync_records (competition_id, device_id, sequence_number);

-- ----------------------------------------------------------------------------
-- score_adjustments (spec §56)
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_score_adjustments (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  team_id         uuid not null references public.blackboxquiz_teams (id) on delete cascade,
  previous_score  integer not null,
  adjustment      integer not null,
  new_score       integer not null check (new_score >= 0),
  reason          text not null check (length(trim(reason)) > 0),
  created_by      uuid references public.blackboxquiz_profiles (id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_blackboxquiz_score_adj_competition
  on public.blackboxquiz_score_adjustments (competition_id);
create index if not exists idx_blackboxquiz_score_adj_team
  on public.blackboxquiz_score_adjustments (team_id);

-- ----------------------------------------------------------------------------
-- audit_logs — immutable (spec §57, §89)
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  competition_id  uuid,
  user_id         uuid,
  device_id       uuid,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  old_value       jsonb,
  new_value       jsonb,
  reason          text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_blackboxquiz_audit_org
  on public.blackboxquiz_audit_logs (organization_id, created_at);
create index if not exists idx_blackboxquiz_audit_competition
  on public.blackboxquiz_audit_logs (competition_id, created_at);
create index if not exists idx_blackboxquiz_audit_user
  on public.blackboxquiz_audit_logs (user_id, created_at);
create index if not exists idx_blackboxquiz_audit_action
  on public.blackboxquiz_audit_logs (action);
create index if not exists idx_blackboxquiz_audit_entity
  on public.blackboxquiz_audit_logs (entity_type, entity_id);

create or replace trigger trg_blackboxquiz_audit_no_update
  before update or delete on public.blackboxquiz_audit_logs
  for each row execute function public.blackboxquiz_deny_mutable_events();

-- ----------------------------------------------------------------------------
-- competition_locks (spec §54)
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_competition_locks (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.blackboxquiz_competitions (id) on delete cascade,
  locked          boolean not null default true,
  reason          text,
  locked_by       uuid references public.blackboxquiz_profiles (id),
  created_at      timestamptz not null default now(),
  released_at     timestamptz
);

create index if not exists idx_blackboxquiz_locks_competition
  on public.blackboxquiz_competition_locks (competition_id, locked);

-- ----------------------------------------------------------------------------
-- Realtime: monitored tables (spec §69 — monitoring only, never gameplay)
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'blackboxquiz_competitions',
    'blackboxquiz_competition_events',
    'blackboxquiz_competition_locks',
    'blackboxquiz_sync_records'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = t
    ) then
      execute 'alter publication supabase_realtime add table public.' || t;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Row Level Security: enabled everywhere; policies land in the next migration.
-- Default posture is deny-all until then.
-- ----------------------------------------------------------------------------
alter table public.blackboxquiz_organizations enable row level security;
alter table public.blackboxquiz_profiles enable row level security;
alter table public.blackboxquiz_organization_members enable row level security;
alter table public.blackboxquiz_competitions enable row level security;
alter table public.blackboxquiz_teams enable row level security;
alter table public.blackboxquiz_point_values enable row level security;
alter table public.blackboxquiz_questions enable row level security;
alter table public.blackboxquiz_question_options enable row level security;
alter table public.blackboxquiz_question_attempts enable row level security;
alter table public.blackboxquiz_competition_events enable row level security;
alter table public.blackboxquiz_competition_devices enable row level security;
alter table public.blackboxquiz_access_codes enable row level security;
alter table public.blackboxquiz_sync_records enable row level security;
alter table public.blackboxquiz_score_adjustments enable row level security;
alter table public.blackboxquiz_audit_logs enable row level security;
alter table public.blackboxquiz_competition_locks enable row level security;
