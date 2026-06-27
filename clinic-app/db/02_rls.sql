-- =====================================================================
-- M0 · 02_rls.sql
-- Row-Level Security. This is the real gatekeeper (spec §2, §3).
-- The frontend hides controls for UX; these policies decide access.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions.
-- SECURITY DEFINER so they read `profiles` WITHOUT triggering RLS on
-- profiles — this avoids the classic infinite-recursion problem where a
-- profiles policy calls a function that re-queries profiles.
-- ---------------------------------------------------------------------
create or replace function public.is_active_staff()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

-- ---- Enable RLS (default-deny once enabled) --------------------------
alter table public.profiles          enable row level security;
alter table public.patients          enable row level security;
alter table public.appointment_types enable row level security;
alter table public.appointments      enable row level security;
alter table public.clinical_notes    enable row level security;
alter table public.audit_log         enable row level security;

-- =====================================================================
-- profiles
--   read:  any active user (needed to pick a practitioner) + own row
--   write: admin only (user management lives here)
-- =====================================================================
create policy profiles_select on public.profiles
  for select using (is_active_staff() or id = auth.uid());

create policy profiles_insert on public.profiles
  for insert with check (is_admin());

create policy profiles_update on public.profiles
  for update using (is_admin()) with check (is_admin());

create policy profiles_delete on public.profiles
  for delete using (is_admin());

-- =====================================================================
-- patients
--   read / create / edit / archive-restore: any active staff or admin
--   hard delete: admin only (logged via trigger)
-- =====================================================================
create policy patients_select on public.patients
  for select using (is_active_staff());

create policy patients_insert on public.patients
  for insert with check (is_active_staff());

create policy patients_update on public.patients
  for update using (is_active_staff()) with check (is_active_staff());

create policy patients_delete on public.patients
  for delete using (is_admin());

-- =====================================================================
-- appointment_types  (clinic settings — admin manages)
-- =====================================================================
create policy appt_types_select on public.appointment_types
  for select using (is_active_staff());

create policy appt_types_write on public.appointment_types
  for all using (is_admin()) with check (is_admin());

-- =====================================================================
-- appointments
--   read / create / reschedule / cancel: any active staff or admin
--   created_by is pinned to the caller to prevent spoofing
-- =====================================================================
create policy appointments_select on public.appointments
  for select using (is_active_staff());

create policy appointments_insert on public.appointments
  for insert with check (is_active_staff() and created_by = auth.uid());

create policy appointments_update on public.appointments
  for update using (is_active_staff()) with check (is_active_staff());

create policy appointments_delete on public.appointments
  for delete using (is_active_staff());

-- =====================================================================
-- clinical_notes
--   read:   any active staff or admin (no front-desk/clinical split in v1)
--   create: any active staff, author pinned to caller
--   edit:   own notes only, or admin
--   delete: admin only
-- =====================================================================
create policy notes_select on public.clinical_notes
  for select using (is_active_staff());

create policy notes_insert on public.clinical_notes
  for insert with check (is_active_staff() and author_id = auth.uid());

create policy notes_update on public.clinical_notes
  for update using (is_admin() or author_id = auth.uid())
  with check (is_admin() or author_id = auth.uid());

create policy notes_delete on public.clinical_notes
  for delete using (is_admin());

-- =====================================================================
-- audit_log
--   read:  admin only
--   write: NO row-level write policy — inserts happen only through
--          SECURITY DEFINER triggers/rpc, which bypass RLS. This makes
--          the log append-only and tamper-resistant from the client.
-- =====================================================================
create policy audit_select on public.audit_log
  for select using (is_admin());
