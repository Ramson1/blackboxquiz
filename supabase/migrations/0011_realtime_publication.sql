-- 0011: Enable Supabase Realtime for the admin live monitor (spec §28, §797).
-- The append-only event log is the source of truth; publishing INSERTs lets
-- managers observe a competition in real time. This is observation only — the
-- scoreboard itself is driven by local engine state and never depends on it.

-- Add the events table to the realtime publication (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'blackboxquiz_competition_events'
  ) then
    alter publication supabase_realtime
      add table public.blackboxquiz_competition_events;
  end if;
end
$$;
