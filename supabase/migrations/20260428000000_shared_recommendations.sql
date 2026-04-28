-- ============================================================================
-- Food Discovery — shared_recommendations table
-- Phase 4 Wave D: Public read-only share link feature.
-- Service-role INSERT only; RLS denies anon + authenticated.
-- ============================================================================

create table if not exists public.shared_recommendations (
  short_id text primary key,
  owner_key text not null,
  message_id uuid not null references public.messages(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists shared_recommendations_owner_key_idx
  on public.shared_recommendations (owner_key, created_at desc);

create index if not exists shared_recommendations_created_at_idx
  on public.shared_recommendations (created_at desc);

alter table public.shared_recommendations enable row level security;

-- Deny all from anon; service-role bypasses RLS automatically.
drop policy if exists deny_all_anon on public.shared_recommendations;
create policy deny_all_anon on public.shared_recommendations
  for all
  to anon
  using (false)
  with check (false);

-- Deny all from authenticated users (shares are server-managed only).
drop policy if exists deny_all_authenticated on public.shared_recommendations;
create policy deny_all_authenticated on public.shared_recommendations
  for all
  to authenticated
  using (false)
  with check (false);
