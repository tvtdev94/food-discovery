-- ============================================================================
-- Food Discovery — initial schema
-- Phase 1 bootstrap. Covers conversations, messages, recommendations,
-- favorites, preferences, places_cache, RLS, indexes.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: owner_key resolver (auth.uid OR x-device-id header for guest mode).
-- ---------------------------------------------------------------------------
create or replace function public.current_owner_key()
returns text
language sql
stable
as $$
  select coalesce(
    auth.uid()::text,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-device-id', '')
  )
$$;

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  title text,
  active_location jsonb,        -- { lat, lng, label, source }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_conversations_owner_created
  on public.conversations (owner_key, created_at desc);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_key text not null,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text,
  tool_calls jsonb,
  usage jsonb,                  -- { input_tokens, output_tokens }
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- recommendations
-- ---------------------------------------------------------------------------
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  owner_key text not null,
  rank smallint not null,
  place_id text not null,
  snapshot jsonb not null,      -- { name, address, rating, reviews, priceLevel, mapsUri, types, lat, lng }
  why_fits text,
  created_at timestamptz not null default now()
);
create index if not exists idx_recommendations_message_rank
  on public.recommendations (message_id, rank);

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  place_id text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (owner_key, place_id)
);
create index if not exists idx_favorites_owner_created
  on public.favorites (owner_key, created_at desc);

-- ---------------------------------------------------------------------------
-- preferences (user_context blob)
-- ---------------------------------------------------------------------------
create table if not exists public.preferences (
  owner_key text primary key,
  context jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- places_cache (optional persistent cache; Upstash is primary)
-- ---------------------------------------------------------------------------
create table if not exists public.places_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_places_cache_expires on public.places_cache (expires_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.recommendations enable row level security;
alter table public.favorites enable row level security;
alter table public.preferences enable row level security;
alter table public.places_cache enable row level security;

-- Drop-in-create pattern so migration is re-runnable.
drop policy if exists conversations_owner_all on public.conversations;
create policy conversations_owner_all on public.conversations
  for all
  using (owner_key = public.current_owner_key())
  with check (owner_key = public.current_owner_key());

drop policy if exists messages_owner_all on public.messages;
create policy messages_owner_all on public.messages
  for all
  using (owner_key = public.current_owner_key())
  with check (owner_key = public.current_owner_key());

drop policy if exists recommendations_owner_all on public.recommendations;
create policy recommendations_owner_all on public.recommendations
  for all
  using (owner_key = public.current_owner_key())
  with check (owner_key = public.current_owner_key());

drop policy if exists favorites_owner_all on public.favorites;
create policy favorites_owner_all on public.favorites
  for all
  using (owner_key = public.current_owner_key())
  with check (owner_key = public.current_owner_key());

drop policy if exists preferences_owner_all on public.preferences;
create policy preferences_owner_all on public.preferences
  for all
  using (owner_key = public.current_owner_key())
  with check (owner_key = public.current_owner_key());

-- places_cache: server-only (service role). Deny anon entirely.
drop policy if exists places_cache_deny_all on public.places_cache;
create policy places_cache_deny_all on public.places_cache
  for all
  using (false)
  with check (false);

-- updated_at trigger for conversations + preferences.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists trg_preferences_updated_at on public.preferences;
create trigger trg_preferences_updated_at
before update on public.preferences
for each row execute function public.set_updated_at();
