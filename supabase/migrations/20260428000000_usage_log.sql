create table if not exists public.usage_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  owner_key text,
  conversation_id uuid,
  model text,
  input_tokens int default 0,
  output_tokens int default 0,
  tool_calls_count int default 0,
  places_calls int default 0,
  cache_hits int default 0,
  duration_ms int default 0,
  error_code text
);

create index if not exists idx_usage_log_ts on public.usage_log (ts desc);
create index if not exists idx_usage_log_owner on public.usage_log (owner_key, ts desc);

alter table public.usage_log enable row level security;

-- Service role only; no policy for anon/auth.
create policy usage_log_deny_all on public.usage_log
  for all
  using (false)
  with check (false);
