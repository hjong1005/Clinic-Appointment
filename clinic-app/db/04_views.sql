-- =====================================================================
-- M1 · m1-views.sql
-- A read view to power the patient list's "last visit" column (spec §5.3)
-- without an N+1 query from the client.
--
-- security_invoker = true is REQUIRED: without it a Postgres view runs
-- with the view owner's privileges and would BYPASS RLS. With it, the
-- view runs as the calling user, so the §3 policies on patients and
-- appointments still apply through the view. (Postgres 15+ / Supabase.)
-- =====================================================================

create or replace view public.patient_summary
with (security_invoker = true) as
select
  p.*,
  (select max(a.start_time) from public.appointments a
     where a.patient_id = p.id and a.start_time <  now()) as last_visit,
  (select min(a.start_time) from public.appointments a
     where a.patient_id = p.id and a.start_time >= now()) as next_appointment
from public.patients p;

grant select on public.patient_summary to authenticated;

-- =====================================================================
-- search_patients(): list + search as a single parameterized call.
-- The term is a bound function argument, so punctuation (commas, parens)
-- can't break the query and there's no PostgREST filter-string injection.
-- LIKE metacharacters (% _ \) in the term are escaped so they match
-- literally. SECURITY INVOKER (the default) means RLS on the underlying
-- tables still applies through the call.
-- =====================================================================
create or replace function public.search_patients(
  p_term     text    default '',
  p_archived boolean default false
)
returns setof public.patient_summary
language sql
stable
set search_path = public
as $$
  with q as (
    select '%' ||
      replace(replace(replace(coalesce(p_term,''), '\','\\'), '%','\%'), '_','\_')
      || '%' as pat
  )
  select s.*
  from public.patient_summary s, q
  where s.is_archived = p_archived
    and (
      coalesce(p_term,'') = ''
      or s.full_name        ilike q.pat escape '\'
      or coalesce(s.phone,'') ilike q.pat escape '\'
      or coalesce(s.email,'') ilike q.pat escape '\'
    )
  order by s.full_name;
$$;

grant execute on function public.search_patients(text, boolean) to authenticated;
